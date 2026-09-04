// Town data: types, loading, projection, spatial buckets.
export type P2 = [number, number];
export interface Building {
  id: number; x: number; y: number; w: number; h: number; a: number; A: number; t: string;
  lv?: number; ht?: number; n: string[]; addr?: string; k?: string; roof?: string; pier?: 1; hero: 0 | 1; poly?: P2[];
}
export interface Poi { x: number; y: number; n: string; k: string; area?: 1 }
export interface Landuse { c: string; p: P2[] }
export interface Pier { p: P2[]; area: boolean }
export interface Town {
  meta: { bbox: number[]; origin: number[]; kx: number; ky: number; halfW: number; halfH: number; height: { step: number; rows: number; cols: number; unit: number } };
  buildings: Building[]; pois: Poi[]; landuse: Landuse[]; coast: P2[][]; piers: Pier[];
  roads: { nodes: P2[]; edges: [number, number, number, number, number][]; names: string[] };
  height: number[][];
}

/** Data lives in Quinten's Dropbox (CORS-open raw link) so it can change without a deploy; the local copy is the fallback for dev. */
export const DATA_URLS = [
  'https://dl.dropboxusercontent.com/scl/fi/bmxbf3gqabtgf4x0wgnav/town.json.gz?rlkey=xrci1c4rbztxisvtwzi7rfmom',
  'data/town.json.gz',
];
export async function loadTown(urls: string[] = DATA_URLS): Promise<Town> {
  let lastErr: unknown;
  for (const url of urls) {
    try { return await loadTownFrom(url); } catch (e) { lastErr = e; console.warn('town data failed from', url, e); }
  }
  throw lastErr;
}
async function loadTownFrom(url: string): Promise<Town> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(res.status + ' ' + url);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const isGz = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const txt = isGz
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(bytes);
  return JSON.parse(txt);
}

// ---------- projection ----------
// World: meters, x east, y north. Iso "ground" axes: u = x (east), v = -y (south).
// Screen: sx = (u - v) * PPM, sy = (u + v) * PPM / 2. Up is 1 m = PPM px.
export const PPM = 2;
export function toScreen(x: number, y: number, h = 0): P2 {
  const u = x, v = -y;
  return [(u - v) * PPM, (u + v) * PPM / 2 - h * PPM];
}
export function toWorld(sx: number, sy: number): P2 {
  const u = sy / PPM + sx / (2 * PPM), v = sy / PPM - sx / (2 * PPM);
  return [u, -v];
}
/** Screen-space depth key: things further "down" the screen draw on top. */
export function depthOf(x: number, y: number): number { return (x - y) * PPM / 2; }

// ---------- spatial buckets ----------
export class Buckets<T> {
  cells = new Map<string, T[]>();
  constructor(public size: number) {}
  key(i: number, j: number) { return i + ',' + j; }
  add(item: T, minx: number, miny: number, maxx: number, maxy: number) {
    const i0 = Math.floor(minx / this.size), i1 = Math.floor(maxx / this.size), j0 = Math.floor(miny / this.size), j1 = Math.floor(maxy / this.size);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j); const arr = this.cells.get(k); if (arr) arr.push(item); else this.cells.set(k, [item]);
    }
  }
  get(i: number, j: number): T[] { return this.cells.get(this.key(i, j)) || []; }
}
export function bbox(pts: P2[]) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of pts) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  return { minx, miny, maxx, maxy };
}

/** Building height in meters from tags, or a guess from type and size. */
export function buildingHeight(b: Building): number {
  if (b.ht) return Math.min(b.ht, 30);
  if (b.lv) return b.lv * 3.3 + 1;
  if (b.t === 'shed' || b.t === 'garage' || b.t === 'roof') return 3;
  if (b.t === 'church') return 12;
  if (b.t === 'school' || b.t === 'hospital' || b.t === 'government') return 8;
  if (b.A < 40) return 3;
  if (b.hero) return b.A > 300 ? 8 : 7.5;
  return b.A > 250 ? 7 : 5.5;
}
