import Phaser from 'phaser';
import { Building, Town, P2, PPM, toScreen, depthOf, buildingHeight } from './town';

/** Sprite contract for real art. public/sprites/manifest.json maps OSM id -> entry. */
export interface SpriteEntry {
  file: string;            // relative to /sprites/
  anchor: [number, number]; // pixel in the image that sits on the footprint center at ground level
  ppm: number;             // pixels per meter the sprite was drawn at (horizontal ground scale, iso)
  sign?: [number, number, number, number]; // sign band rect in image pixels, for name overlay
  night?: string;          // optional lit-windows variant
}
export type Manifest = Record<string, SpriteEntry>;

const FILL = { top: '#b9b3a6', left: '#8e887c', right: '#a29c8f', heroTop: '#c9b39a', heroLeft: '#9a8470', heroRight: '#b39a84', edge: 'rgba(40,36,30,0.55)', pierTop: '#8b6a45' };

/** Corners of the oriented footprint rectangle in world meters. */
export function footprintCorners(b: Building): P2[] {
  const c = Math.cos(b.a), s = Math.sin(b.a), hw = b.w / 2, hh = b.h / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([px, py]) => [b.x + px * c - py * s, b.y + px * s + py * c] as P2);
}

/** Draws an iso box for a footprint into a canvas; returns canvas + anchor (footprint center at ground). */
export function placeholderCanvas(b: Building, zoomScale = 1): { canvas: HTMLCanvasElement; ax: number; ay: number } {
  const H = buildingHeight(b);
  const base = b.pier ? 2.2 : 0;
  const corners = footprintCorners(b);
  const scr = corners.map(([x, y]) => toScreen(x, y, base));
  const top = corners.map(([x, y]) => toScreen(x, y, base + H));
  const [cx, cy] = toScreen(b.x, b.y, 0);
  const all = [...scr, ...top, [cx, cy] as P2];
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of all) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  const pad = 2, sc = zoomScale;
  const W = Math.ceil((maxx - minx) * sc) + pad * 2, Hh = Math.ceil((maxy - miny) * sc) + pad * 2;
  const canvas = document.createElement('canvas'); canvas.width = Math.max(4, W); canvas.height = Math.max(4, Hh);
  const g = canvas.getContext('2d')!;
  const T = ([x, y]: P2) => [(x - minx) * sc + pad, (y - miny) * sc + pad] as P2;
  // visible side faces: edges whose midpoint is "below" the footprint center on screen (facing camera)
  const faces: { pts: P2[]; shade: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const a = scr[i], c = scr[(i + 1) % 4], ta = top[i], tc = top[(i + 1) % 4];
    const my = (a[1] + c[1]) / 2;
    if (my <= cy + 0.01) continue; // back faces
    const mx = (a[0] + c[0]) / 2;
    const left = mx < cx;
    faces.push({ pts: [a, c, tc, ta], shade: b.hero ? (left ? FILL.heroLeft : FILL.heroRight) : (left ? FILL.left : FILL.right) });
  }
  const fill = (pts: P2[], color: string) => { g.beginPath(); pts.map(T).forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = color; g.fill(); g.strokeStyle = FILL.edge; g.lineWidth = 1; g.stroke(); };
  if (b.pier) { // deck pad under pier buildings
    fill(corners.map(([x, y]) => toScreen(x, y, 0)), FILL.pierTop);
    for (let i = 0; i < 4; i++) { const a = toScreen(...corners[i], 0), c = toScreen(...corners[(i + 1) % 4], 0); if ((a[1] + c[1]) / 2 > cy) fill([a, c, scr[(i + 1) % 4], scr[i]], '#5a4630'); }
  }
  for (const f of faces) fill(f.pts, f.shade);
  fill(top, b.hero ? FILL.heroTop : FILL.top);
  if (b.hero) { // roof accent line so heroes read at a glance
    g.strokeStyle = '#7a4e3a'; g.lineWidth = 1.5; g.beginPath(); const [x0, y0] = T(top[0]), [x2, y2] = T(top[2]); g.moveTo(x0, y0); g.lineTo(x2, y2); g.stroke();
  }
  const [ax, ay] = T([cx, cy]);
  return { canvas, ax, ay };
}

export class Buildings {
  sprites = new Map<number, Phaser.GameObjects.Image>();
  byId = new Map<number, Building>();
  constructor(public scene: Phaser.Scene, public town: Town, public manifest: Manifest, public onPick: (b: Building) => void) {
    for (const b of town.buildings) this.byId.set(b.id, b);
  }
  /** Create all building images. Real sprites (from the manifest) replace placeholders. */
  build() {
    const tex = this.scene.textures;
    for (const b of this.town.buildings) {
      const entry = this.manifest[String(b.id)];
      const [sx, sy] = toScreen(b.x, b.y, 0);
      let img: Phaser.GameObjects.Image;
      if (entry && tex.exists('b-' + b.id)) {
        img = this.scene.add.image(sx, sy, 'b-' + b.id);
        const src = tex.get('b-' + b.id).getSourceImage() as HTMLImageElement;
        img.setOrigin(entry.anchor[0] / src.width, entry.anchor[1] / src.height);
        img.setScale(PPM / entry.ppm);
      } else {
        const key = 'ph-' + b.id;
        if (!tex.exists(key)) { const { canvas, ax, ay } = placeholderCanvas(b, 2); tex.addCanvas(key, canvas); (b as any)._anchor = [ax / canvas.width, ay / canvas.height]; }
        img = this.scene.add.image(sx, sy, key);
        const an = (b as any)._anchor || [0.5, 0.8]; img.setOrigin(an[0], an[1]); img.setScale(0.5);
      }
      img.setDepth(depthOf(b.x, b.y) + 0.001 * b.id % 1);
      img.setInteractive({ useHandCursor: true });
      img.on('pointerup', (p: Phaser.Input.Pointer) => { if (p.getDistance() < 6) this.onPick(b); });
      this.sprites.set(b.id, img);
    }
  }
}
