import Phaser from 'phaser';
import { Town, P2, PPM, toScreen, Buckets, bbox } from './town';

const C = 128; // chunk size in meters (u,v space)
export const PAL = {
  waterDeep: 0x4a7f9c, water: 0x5891ae, sand: 0xd8c79f, grass: 0x97ad74, grassLo: 0x87a068, grassHi: 0xa6ba82,
  farm: 0xd6c58a, farmAlt: 0xcdbb80, wood: 0x6b8d5c, scrub: 0xa5b384, res: 0x9fa97e, com: 0xb5a897, ind: 0xa9a3ad, wet: 0x9db7ae,
  road: 0x6e6b66, roadEdge: 0x5b5955, walk: 0xc4b28c, pier: 0x8b6a45, coast: 0x3f6f88,
};
const ROAD_W: Record<number, number> = { 1: 9, 2: 8, 3: 6, 4: 3.5, 5: 2.5, 6: 1.6 };
type Seg = { a: P2; b: P2; c: number };

export class Ground {
  chunks = new Map<string, Phaser.GameObjects.RenderTexture>();
  order: string[] = [];
  lu = new Buckets<{ c: string; p: P2[] }>(C);
  roads = new Buckets<Seg>(C);
  piers = new Buckets<{ p: P2[]; area: boolean }>(C);
  coast = new Buckets<Seg>(C);
  constructor(public scene: Phaser.Scene, public town: Town) {
    for (const l of town.landuse) { const b = bbox(l.p); this.lu.add(l, b.minx, -b.maxy, b.maxx, -b.miny); }
    const { nodes, edges } = town.roads;
    for (const [a, b, c] of edges) {
      const seg = { a: nodes[a], b: nodes[b], c };
      const w = ROAD_W[c] || 3;
      this.roads.add(seg, Math.min(seg.a[0], seg.b[0]) - w, -Math.max(seg.a[1], seg.b[1]) - w, Math.max(seg.a[0], seg.b[0]) + w, -Math.min(seg.a[1], seg.b[1]) + w);
    }
    for (const p of town.piers) { const b = bbox(p.p); this.piers.add(p, b.minx - 3, -b.maxy - 3, b.maxx + 3, -b.miny + 3); }
    for (const line of town.coast) for (let i = 1; i < line.length; i++) {
      const seg = { a: line[i - 1], b: line[i], c: 0 };
      this.coast.add(seg, Math.min(seg.a[0], seg.b[0]) - 2, -Math.max(seg.a[1], seg.b[1]) - 2, Math.max(seg.a[0], seg.b[0]) + 2, -Math.min(seg.a[1], seg.b[1]) + 2);
    }
  }

  /** Height in meters at world (x, y), nearest cell. */
  heightAt(x: number, y: number): number {
    const m = this.town.meta, hg = m.height;
    const col = Math.floor((x + m.halfW) / hg.step), row = Math.floor((m.halfH - y) / hg.step);
    if (row < 0 || col < 0 || row >= hg.rows || col >= hg.cols) return 0;
    return this.town.height[row][col] * hg.unit;
  }

  /** Make sure chunks covering the camera view exist; drop far ones. */
  update(cam: Phaser.Cameras.Scene2D.Camera, budget = 3) {
    const tier = cam.zoom > 2.2 ? 2 : 1;
    const v = cam.worldView;
    const corners: P2[] = [[v.x, v.y], [v.right, v.y], [v.x, v.bottom], [v.right, v.bottom]];
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const [sx, sy] of corners) {
      const u = sy / PPM + sx / (2 * PPM), vv = sy / PPM - sx / (2 * PPM);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, vv); v1 = Math.max(v1, vv);
    }
    const m = this.town.meta;
    const i0 = Math.max(Math.floor(-m.halfW / C), Math.floor(u0 / C) - 1), i1 = Math.min(Math.floor(m.halfW / C), Math.floor(u1 / C) + 1);
    const j0 = Math.max(Math.floor(-m.halfH / C), Math.floor(v0 / C) - 1), j1 = Math.min(Math.floor(m.halfH / C), Math.floor(v1 / C) + 1);
    let made = 0;
    const wanted = new Set<string>();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i + ',' + j + '@' + tier; wanted.add(k);
      if (!this.chunks.has(k) && made < budget) { this.makeChunk(i, j, tier); made++; }
    }
    // drop chunks of the other resolution tier once the wanted ones exist
    for (const k of [...this.order]) if (!k.endsWith('@' + tier) && wanted.has(k.replace(/@\d$/, '@' + tier))) { this.chunks.get(k)?.destroy(); this.chunks.delete(k); this.order = this.order.filter(x => x !== k); }
    if (this.chunks.size > 140) {
      for (const k of [...this.order]) {
        if (wanted.has(k)) continue;
        this.chunks.get(k)?.destroy(); this.chunks.delete(k); this.order = this.order.filter(x => x !== k);
        if (this.chunks.size <= 100) break;
      }
    }
  }

  private makeChunk(i: number, j: number, tier = 1) {
    const k = i + ',' + j + '@' + tier;
    const sx0 = (i - j - 1) * C * PPM, sy0 = (i + j) * C * PPM / 2, w = 2 * C * PPM, h = C * PPM;
    const rt = this.scene.add.renderTexture(sx0, sy0, w * tier, h * tier).setOrigin(0, 0).setDepth(-1e6 + tier).setScale(1 / tier);
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    g.setScale(tier);
    const S = (x: number, y: number): P2 => { const [a, b] = toScreen(x, y); return [a - sx0, b - sy0]; };
    const poly = (pts: P2[], color: number, alpha = 1) => { g.fillStyle(color, alpha); g.fillPoints(pts.map(([x, y]) => { const [a, b] = S(x, y); return new Phaser.Geom.Point(a, b); }), true); };

    // 1. terrain cells from the height grid (water / sand / grass with slope shading)
    const m = this.town.meta, hg = m.height, step = hg.step;
    const xa = i * C, xb = (i + 1) * C, ya = -(j + 1) * C, yb = -j * C; // world y range for this chunk (v = -y)
    const c0 = Math.max(0, Math.floor((xa + m.halfW) / step) - 1), c1 = Math.min(hg.cols - 1, Math.floor((xb + m.halfW) / step) + 1);
    const r0 = Math.max(0, Math.floor((m.halfH - yb) / step) - 1), r1 = Math.min(hg.rows - 1, Math.floor((m.halfH - ya) / step) + 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const hgt = this.town.height[r][c] * hg.unit;
      const x0 = c * step - m.halfW, y1 = m.halfH - r * step, y0 = y1 - step;
      let col: number;
      if (hgt < 0.3) col = ((r * 7 + c * 13) % 5 === 0) ? PAL.water : PAL.waterDeep;
      else if (hgt < 1.4) col = PAL.sand;
      else {
        const hn = this.town.height[Math.max(0, r - 1)][Math.max(0, c - 1)] * hg.unit;
        const d = hgt - hn; col = d > 1.5 ? PAL.grassHi : d < -1.5 ? PAL.grassLo : PAL.grass;
      }
      poly([[x0, y0], [x0 + step, y0], [x0 + step, y1], [x0, y1]], col);
    }
    // 2. land use
    const LUC: Record<string, number> = { farm: PAL.farm, grass: PAL.grass, wood: PAL.wood, scrub: PAL.scrub, res: PAL.res, com: PAL.com, ind: PAL.ind, wet: PAL.wet, sand: PAL.sand, water: PAL.water };
    const drawnLu = new Set<object>();
    for (const l of this.lu.get(i, j)) { if (drawnLu.has(l)) continue; drawnLu.add(l); poly(l.p, LUC[l.c] ?? PAL.grass, l.c === 'res' ? 0.55 : 0.9); }
    // 3. coastline
    g.lineStyle(1.5 * PPM, PAL.coast, 0.8);
    for (const s of this.coast.get(i, j)) { const a = S(...s.a), b = S(...s.b); g.lineBetween(a[0], a[1], b[0], b[1]); }
    // 4. piers
    for (const p of this.piers.get(i, j)) {
      if (p.area) poly(p.p, PAL.pier);
      else { g.lineStyle(4 * PPM, PAL.pier, 1); for (let n = 1; n < p.p.length; n++) { const a = S(...p.p[n - 1]), b = S(...p.p[n]); g.lineBetween(a[0], a[1], b[0], b[1]); } }
    }
    // 5. roads: edge stroke then fill, minor first
    const segs = this.roads.get(i, j).slice().sort((a, b) => b.c - a.c);
    for (const pass of [0, 1]) for (const s of segs) {
      const w = (ROAD_W[s.c] || 3) * PPM;
      const walk = s.c >= 6;
      if (pass === 0) { if (walk) continue; g.lineStyle(w + 1.5 * PPM, PAL.roadEdge, 1); }
      else g.lineStyle(w, walk ? PAL.walk : PAL.road, 1);
      const a = S(...s.a), b = S(...s.b);
      g.lineBetween(a[0], a[1], b[0], b[1]);
      const rad = (pass === 0 ? w + 1.5 * PPM : w) / 2;
      g.fillStyle(pass === 0 ? PAL.roadEdge : walk ? PAL.walk : PAL.road, 1); g.fillCircle(a[0], a[1], rad); g.fillCircle(b[0], b[1], rad);
    }
    rt.draw(g, 0, 0);
    g.destroy();
    this.chunks.set(k, rt); this.order.push(k);
  }
}
