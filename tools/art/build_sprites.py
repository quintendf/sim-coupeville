"""Turn keyed art (out/*.png) into game sprites + manifest.

For each sprite we need:
  anchor: image pixel that sits on the footprint center at ground level. The ground pad in the art is a
          parallelogram; its left and right extreme points are opposite corners, so their midpoint is the
          pad center whatever the camera rotation was.
  ppm:    pixels per meter along the iso ground axes. The pad diamond spans (w + h) * ppm / f pixels,
          where f is the fraction of the pad width the building walls occupy (the rest is lawn, dock,
          plaza). f is eyeballed per sprite and then tuned against the footprint outline in the game.
Usage: python3 build_sprites.py  (run from the art/ folder; writes ../app/public/sprites/)
"""
import json, os, numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'sprites')
MAX_W = 768  # sprites never need more than ~10 px/m on screen (PPM 2 * zoom 5)

# file -> osm id, wall fraction f, extra anchor nudge in source px (dx, dy), optional forced anchor y
SPRITES = {
    '01-haller-house.png':                 dict(id=270277275, f=0.78, name='Haller House', span=30),  # OSM polygon is only part of the house; force walls to span 30 m (w+h)
    '02-tobys-tavern.png':                 dict(id=270277279, f=0.90, name="Toby's Tavern", sign=True),
    '03-coupeville-methodist-church.png':  dict(id=452151625, f=0.75, name='Coupeville United Methodist Church'),
    '04-island-county-courthouse.png':     dict(id=611258856, f=0.80, name='Island County Courthouse (Administration Building)'),
    '05-coupeville-library.png':           dict(id=270768567, f=0.85, name='Coupeville Library', anchor_y_from='left'),
    '06-whidbeyhealth-medical-center.png': dict(id=270276422, f=0.85, name='WhidbeyHealth Medical Center'),
}

def measure(m):
    H, W = m.shape
    bottom = int(np.where(m.any(axis=1))[0].max())
    lower = m[int(H * 0.5):]
    cols = np.where(lower.any(axis=0))[0]
    L, R = int(cols.min()), int(cols.max())
    yl = int(np.median(np.where(m[:, L])[0])); yr = int(np.median(np.where(m[:, R])[0]))
    front_x = int(np.mean(np.where(m[bottom])[0]))
    return dict(W=W, H=H, L=L, R=R, dw=R - L, bottom=bottom, yl=yl, yr=yr, front_x=front_x)

def main(town_path):
    import gzip
    town = json.load(gzip.open(town_path))
    by_id = {b['id']: b for b in town['buildings']}
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for f, spec in SPRITES.items():
        im = Image.open(os.path.join('out', f)).convert('RGBA')
        a = np.asarray(im); m = a[..., 3] > 40
        g = measure(m)
        b = by_id[spec['id']]
        ax = (g['L'] + g['R']) / 2
        ay = (g['yl'] + g['yr']) / 2 if spec.get('anchor_y_from') != 'left' else g['yl']
        ax += spec.get('dx', 0); ay += spec.get('dy', 0)
        ppm = g['dw'] * spec['f'] / spec.get('span', b['w'] + b['h'])
        s = min(1.0, MAX_W / g['W'])
        out = im.resize((round(g['W'] * s), round(g['H'] * s)), Image.LANCZOS) if s < 1 else im
        name = f'b-{spec["id"]}.png'
        out.save(os.path.join(OUT, name), optimize=True)
        # ground pad extents in meters: left side of the pad diamond runs east (x), right side runs north (y)
        pad = [round((g['front_x'] - g['L']) / ppm, 1), round((g['R'] - g['front_x']) / ppm, 1)]
        manifest[str(spec['id'])] = dict(file=name, anchor=[round(ax * s, 1), round(ay * s, 1)], ppm=round(ppm * s, 3), pad=pad, src=f, note=spec['name'])
        print(f"{spec['name']:52s} {name} {out.size} anchor {manifest[str(spec['id'])]['anchor']} ppm {manifest[str(spec['id'])]['ppm']}  footprint {b['w']:.1f}x{b['h']:.1f} pad ratio {(g['bottom']-g['yl'])/(g['dw']):.2f}")
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=1)

if __name__ == '__main__':
    import sys
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'town.json.gz'))
