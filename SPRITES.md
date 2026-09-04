# Sprite contract

How to drop real art into the Coupeville app. No code changes needed: put files in `public/sprites/`, list them in `public/sprites/manifest.json`, redeploy.

## Projection

2:1 dimetric. World axes: x east, y north, meters. Screen: `sx = (x + y) * PPM`, `sy = (x - y) * PPM / 2`, so east is down-right, north is up-right, south is down-left, west is up-left. One meter of height is `PPM` pixels straight up. `PPM = 2` at camera zoom 1; the camera zooms from 0.35 to 5.

The light in the placeholder art comes from the upper left. Keep that in the real art so shadows agree across the town.

## One building = one PNG

- Name: `b-<osm id>.png`. The id is the OpenStreetMap way id in `data/town.json` (`buildings[].id`); the survey viewer and the in-game card both show it.
- Transparent background. No ground apron beyond a meter or so of shadow.
- Draw at a known scale, `ppm` pixels per meter of ground distance along the iso axes. 12 to 16 px/m is plenty: a 20 m storefront becomes a 240 to 320 px wide sprite, and the game scales it down.
- Anchor: the pixel where the footprint center sits at ground level. For a box on flat ground this is the center of the base rhombus. Buildings on the wharf (`pier: 1`) sit 2.2 m above the water; anchor them at deck level and the game handles the rest.
- Sign band: optional rectangle in image pixels where the business name may be drawn over the sprite. Leave the band blank in the art; the game draws the name so spelling stays right and names can change.
- Night variant: optional second PNG (same size and anchor) with lit windows; the game cross-fades it in after sunset.

## manifest.json

```json
{
  "59492886": { "file": "b-59492886.png", "anchor": [220, 268], "ppm": 14, "sign": [80, 120, 260, 30], "night": "b-59492886-night.png" }
}
```

Fields: `file`, `anchor [x, y]`, `ppm`, optional `pad [x m, y m]`, optional `sign [x, y, w, h]`, optional `night`.

`pad` is the ground apron the art includes (lawn, dock, plaza) in meters along east and north. Unnamed OSM buildings whose center falls under the pad are not drawn; the art already shows that ground.

## Art v1 (September 2026): what the six example renders taught us

Source renders are 1536×1024 on a near-black background, Caesar 3 lineage, one building plus its own ground apron. `art/process.py` keys the background (flood fill from the border, luminance ≤ 22), crops, and measures the base parallelogram. `art/build_sprites.py` turns the measurements into `public/sprites/` files and the manifest. Rules that came out of it:

- The apron is part of the sprite. The left and right extreme points of the apron are opposite corners of the ground parallelogram, so their midpoint is the anchor no matter how the camera was rotated.
- Scale comes from the footprint: `ppm = apron width in px × wall fraction / (w + h)`. The wall fraction (how much of the apron the walls cover) is eyeballed per sprite, 0.75 to 0.9, then checked in game with the footprint outline (press F, or `?outlines=1`). `?b=<id>&z=<zoom>` aims the camera at a building.
- Generated art drifts off a true 2:1 camera: the measured ground slopes were 0.30 to 0.45 instead of 0.5, and the two visible faces did not always share the same foreshortening. Placing them at real scale still reads fine because the game only trusts the anchor and width. For the next batch, ask for "true isometric 2:1, 45° rotation, camera 30° above horizon, light from upper left" and keep the apron tight (walls should cover ~85% of the apron width).
- The art is drawn on the iso grid; footprints along Front Street sit about 20° off it. That is accepted (Caesar does the same). Do not rotate sprites.
- Some OSM polygons are only part of a building (Haller House is 13.7×5.9 m in OSM, the real house is much larger). `span` in `build_sprites.py` overrides the target width in meters for those.
- Sprites are downscaled to 768 px wide; the camera never needs more than 10 px/m. PNG for now (about 0.6 to 0.8 MB each); switch to WebP once there are dozens.
- Camera-facing side is the left (south) face, so a shopfront on Front Street belongs on the left face with water behind it (Toby's is the reference).

## Generic house library

Buildings without a manifest entry get a placeholder box sized from the footprint's oriented bounding box (`w`, `h`, angle `a`). Later they will pick from a small library by footprint size and type: `house-s`, `house-m`, `house-l`, `shed`, `barn`, `commercial`, `church`, `school`. Same PNG rules; the game rotates between the 0° and 90° variants to match the footprint's long axis, so draw each library piece in both orientations (`-a` and `-b`).

## Checklist before handing a sprite over

1. Footprint id matches a building in `town.json`.
2. Base rhombus matches the footprint's `w` × `h` at the stated `ppm` (within 10%).
3. Anchor lands on the base center.
4. Light from upper left.
5. Sign band blank.
