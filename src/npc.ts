import Phaser from 'phaser';
import { Town, P2, toScreen, depthOf } from './town';

type Edge = { to: number; c: number; len: number; oneway: boolean; rev: boolean };
interface Agent { img: Phaser.GameObjects.Image; from: number; to: number; t: number; speed: number; kind: 'walker' | 'car'; len: number; jitter: number }

/** Random walkers on footways and side streets, cars on the main roads, following the OSM road graph. */
export class Npcs {
  adj: Edge[][] = [];
  agents: Agent[] = [];
  constructor(public scene: Phaser.Scene, public town: Town) {
    const { nodes, edges } = town.roads;
    this.adj = nodes.map(() => []);
    for (const [a, b, c, , ow] of edges) {
      const len = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
      this.adj[a].push({ to: b, c, len, oneway: !!ow, rev: false });
      this.adj[b].push({ to: a, c, len, oneway: !!ow, rev: true });
    }
    this.makeTextures();
  }
  private makeTextures() {
    const t = this.scene.textures;
    const mk = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
      if (t.exists(key)) return; const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!); t.addCanvas(key, c);
    };
    const shirt = ['#c94f3d', '#3d6fc9', '#e0b23a', '#4f9a5c', '#8a5ab0', '#f0f0e8'];
    shirt.forEach((col, i) => mk('walker' + i, 6, 12, g => { g.fillStyle = '#2a2420'; g.fillRect(1, 8, 4, 4); g.fillStyle = col; g.fillRect(1, 3, 4, 6); g.fillStyle = '#e8c9a8'; g.fillRect(1, 0, 4, 3); }));
    const paint = ['#c8c8c8', '#2c2f38', '#8b2a2a', '#2a4c8b', '#e8e6df', '#5c6b4a'];
    paint.forEach((col, i) => mk('car' + i, 14, 8, g => { g.fillStyle = col; g.fillRect(0, 2, 14, 5); g.fillStyle = '#9fc3d8'; g.fillRect(4, 0, 6, 3); g.fillStyle = '#222'; g.fillRect(1, 6, 3, 2); g.fillRect(10, 6, 3, 2); }));
  }
  private allowed(kind: 'walker' | 'car', c: number) { return kind === 'walker' ? c >= 3 : c <= 3; }
  spawn(kind: 'walker' | 'car', count: number, near?: P2, radius = 400) {
    const { nodes } = this.town.roads;
    const candidates: number[] = [];
    nodes.forEach((n, i) => {
      if (!this.adj[i].some(e => this.allowed(kind, e.c))) return;
      if (near && Math.hypot(n[0] - near[0], n[1] - near[1]) > radius) return;
      candidates.push(i);
    });
    for (let k = 0; k < count && candidates.length; k++) {
      const from = candidates[Math.floor(Math.random() * candidates.length)];
      const opts = this.adj[from].filter(e => this.allowed(kind, e.c) && !(e.oneway && e.rev));
      if (!opts.length) continue;
      const e = opts[Math.floor(Math.random() * opts.length)];
      const key = kind === 'walker' ? 'walker' + Math.floor(Math.random() * 6) : 'car' + Math.floor(Math.random() * 6);
      const img = this.scene.add.image(0, 0, key).setOrigin(0.5, 1).setScale(kind === 'walker' ? 0.6 : 0.7);
      this.agents.push({ img, from, to: e.to, t: Math.random(), speed: kind === 'walker' ? 1.3 + Math.random() * 0.4 : 9 + Math.random() * 4, kind, len: e.len, jitter: (Math.random() - 0.5) * (kind === 'walker' ? 2.5 : 1.5) });
    }
  }
  update(dt: number) {
    const { nodes } = this.town.roads;
    for (const a of this.agents) {
      a.t += (a.speed * dt) / Math.max(a.len, 0.5);
      while (a.t >= 1) {
        a.t -= 1;
        const prev = a.from; a.from = a.to;
        const opts = this.adj[a.from].filter(e => this.allowed(a.kind, e.c) && !(e.oneway && e.rev) && (e.to !== prev || this.adj[a.from].length === 1));
        const pool = opts.length ? opts : this.adj[a.from].filter(e => this.allowed(a.kind, e.c));
        if (!pool.length) { a.to = prev; a.len = Math.hypot(nodes[prev][0] - nodes[a.from][0], nodes[prev][1] - nodes[a.from][1]); continue; }
        const e = pool[Math.floor(Math.random() * pool.length)];
        a.to = e.to; a.len = e.len;
      }
      const p = nodes[a.from], q = nodes[a.to];
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L * a.jitter, ny = dx / L * a.jitter; // offset to a lane / sidewalk side
      const x = p[0] + dx * a.t + nx, y = p[1] + dy * a.t + ny;
      const [sx, sy] = toScreen(x, y, 0);
      a.img.setPosition(sx, sy).setDepth(depthOf(x, y) + 0.5);
      if (a.kind === 'car') a.img.setFlipX(dx - dy < 0);
    }
  }
}
