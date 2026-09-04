// Small 2D geometry helpers. World units are meters; footprints are [x east, y north].
export type P2 = [number, number];

export function area(p: P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}
export function ccw(p: P2[]): P2[] { return area(p) < 0 ? [...p].reverse() : p; }
export function dedupe(p: P2[]): P2[] {
  const out: P2[] = [];
  for (const q of p) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.05) out.push(q); }
  const f = out[0], l = out[out.length - 1];
  if (out.length > 1 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.05) out.pop();
  return out;
}
export function centroid(p: P2[]): P2 {
  let x = 0, y = 0; for (const q of p) { x += q[0]; y += q[1]; } return [x / p.length, y / p.length];
}
/** Minimum-area oriented bounding box: returns center, half sizes, angle (radians, long axis). */
export function obb(p: P2[]) {
  let best = { a: Infinity, ang: 0, cx: 0, cy: 0, hw: 0, hh: 0 };
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    const ang = Math.atan2(y2 - y1, x2 - x1), c = Math.cos(-ang), s = Math.sin(-ang);
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const [x, y] of p) { const rx = x * c - y * s, ry = x * s + y * c; minx = Math.min(minx, rx); maxx = Math.max(maxx, rx); miny = Math.min(miny, ry); maxy = Math.max(maxy, ry); }
    const a = (maxx - minx) * (maxy - miny);
    if (a < best.a) {
      const mx = (minx + maxx) / 2, my = (miny + maxy) / 2, c2 = Math.cos(ang), s2 = Math.sin(ang);
      let hw = (maxx - minx) / 2, hh = (maxy - miny) / 2, ang2 = ang;
      if (hh > hw) { [hw, hh] = [hh, hw]; ang2 = ang + Math.PI / 2; }
      best = { a, ang: ang2, cx: mx * c2 - my * s2, cy: mx * s2 + my * c2, hw, hh };
    }
  }
  return best;
}
export function pointInPoly(p: P2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if (((p[i][1] > y) !== (p[j][1] > y)) && (x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0])) c = !c;
  }
  return c;
}
export function distToPolyline(line: P2[], x: number, y: number): number {
  let d = Infinity;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
    d = Math.min(d, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return d;
}
/** Hash a string to a stable 0..1 number. */
export function hash01(s: string | number): number {
  let h = 2166136261; const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
