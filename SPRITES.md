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

Fields: `file`, `anchor [x, y]`, `ppm`, optional `sign [x, y, w, h]`, optional `night`.

## Generic house library

Buildings without a manifest entry get a placeholder box sized from the footprint's oriented bounding box (`w`, `h`, angle `a`). Later they will pick from a small library by footprint size and type: `house-s`, `house-m`, `house-l`, `shed`, `barn`, `commercial`, `church`, `school`. Same PNG rules; the game rotates between the 0° and 90° variants to match the footprint's long axis, so draw each library piece in both orientations (`-a` and `-b`).

## Checklist before handing a sprite over

1. Footprint id matches a building in `town.json`.
2. Base rhombus matches the footprint's `w` × `h` at the stated `ppm` (within 10%).
3. Anchor lands on the base center.
4. Light from upper left.
5. Sign band blank.
