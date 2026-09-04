import Phaser from 'phaser';
import { Town, Building, loadTown, toScreen, toWorld } from './town';
import { Ground } from './ground';
import { Buildings, Manifest } from './buildings';
import { Npcs } from './npc';

const $ = (id: string) => document.getElementById(id) as HTMLElement;

// ---------- clock ----------
const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false });
function coupevilleHours(): number {
  const parts = fmt.formatToParts(new Date()); const g = (t: string) => parseInt(parts.find(p => p.type === t)!.value) || 0;
  return (g('hour') % 24) + g('minute') / 60 + g('second') / 3600;
}
/** 0 = full night, 1 = full day, plus a dusk/dawn warmth factor. Sunrise/sunset drift with the season a little. */
function daylight(t: number) {
  const doy = Math.floor((Date.now() - Date.UTC(new Date().getFullYear(), 0, 1)) / 864e5);
  const seasonal = Math.cos((doy - 172) / 365 * 2 * Math.PI); // 1 in late June, -1 in late December (Coupeville: ~5:15 to ~21:10 in June; ~8:00 to ~16:20 in December)
  const rise = 6.6 - 1.4 * seasonal, set = 18.7 + 2.4 * seasonal;
  const ss = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const day = ss(rise - 0.7, rise + 0.8, t) * (1 - ss(set - 0.8, set + 0.9, t));
  const glow = Math.max(0, 1 - Math.abs(t - rise) / 1.2) + Math.max(0, 1 - Math.abs(t - set) / 1.3);
  return { day, glow, rise, set };
}

class TownScene extends Phaser.Scene {
  town!: Town; ground!: Ground; bld!: Buildings; npcs!: Npcs;
  tint!: Phaser.GameObjects.Rectangle;
  live = true; tod = 12;
  drag: { x: number; y: number; sx: number; sy: number } | null = null;
  pinch: { d: number; z: number } | null = null;
  manifest: Manifest = {};
  constructor() { super('town'); }

  preload() {
    this.load.json('manifest', 'sprites/manifest.json');
  }
  async create() {
    this.manifest = (this.cache.json.get('manifest') as Manifest) || {};
    this.town = await loadTown();
    // real sprites listed in the manifest
    const keys = Object.keys(this.manifest);
    if (keys.length) {
      for (const id of keys) this.load.image('b-' + id, 'sprites/' + this.manifest[id].file);
      await new Promise<void>(res => { this.load.once('complete', () => res()); this.load.start(); });
    }
    this.ground = new Ground(this, this.town);
    this.bld = new Buildings(this, this.town, this.manifest, b => this.showCard(b));
    this.bld.build();
    this.npcs = new Npcs(this, this.town);
    const wharf = this.worldOf(-122.6875, 48.2222);
    this.npcs.spawn('walker', 45, wharf, 450);
    this.npcs.spawn('walker', 25);
    this.npcs.spawn('car', 30);

    // camera
    const cam = this.cameras.main;
    const m = this.town.meta;
    const corners = [toScreen(-m.halfW, m.halfH), toScreen(m.halfW, m.halfH), toScreen(m.halfW, -m.halfH), toScreen(-m.halfW, -m.halfH)];
    const minx = Math.min(...corners.map(c => c[0])), maxx = Math.max(...corners.map(c => c[0])), miny = Math.min(...corners.map(c => c[1])), maxy = Math.max(...corners.map(c => c[1]));
    cam.setBounds(minx - 400, miny - 400, maxx - minx + 800, maxy - miny + 800);
    const [wx, wy] = toScreen(wharf[0], wharf[1] - 120);
    cam.centerOn(wx, wy); cam.setZoom(1.6);
    cam.setBackgroundColor(0x4a7f9c);

    // tint overlay for time of day (multiply)
    this.tint = this.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setScrollFactor(0).setOrigin(0).setDepth(1e9).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.scale.on('resize', () => this.layout()); this.layout();

    // input
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (this.input.pointer2?.isDown) return; this.drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY }; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const p1 = this.input.pointer1, p2 = this.input.pointer2;
      if (p1.isDown && p2.isDown) {
        const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        if (!this.pinch) this.pinch = { d, z: cam.zoom }; else cam.setZoom(Phaser.Math.Clamp(this.pinch.z * d / this.pinch.d, 0.35, 5));
        this.drag = null; return;
      }
      if (this.drag && p.isDown) { cam.scrollX = this.drag.sx - (p.x - this.drag.x) / cam.zoom; cam.scrollY = this.drag.sy - (p.y - this.drag.y) / cam.zoom; }
    });
    this.input.on('pointerup', () => { this.drag = null; this.pinch = null; });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      // keep the world point under the cursor fixed: world = scroll + size/2 + (screen - size/2) / zoom
      const z0 = cam.zoom, z1 = Phaser.Math.Clamp(z0 * Math.exp(-dy * 0.0012), 0.35, 5);
      const hx = cam.width / 2, hy = cam.height / 2;
      const wx = cam.scrollX + hx + (p.x - hx) / z0, wy = cam.scrollY + hy + (p.y - hy) / z0;
      cam.setZoom(z1);
      cam.scrollX = wx - hx - (p.x - hx) / z1; cam.scrollY = wy - hy - (p.y - hy) / z1;
    });
    // debug clock controls
    const live = $('live') as HTMLButtonElement, tod = $('tod') as HTMLInputElement;
    live.onclick = () => { this.live = !this.live; live.setAttribute('aria-pressed', String(this.live)); };
    tod.oninput = () => { this.live = false; live.setAttribute('aria-pressed', 'false'); this.tod = parseFloat(tod.value); };
    $('loading').remove();
    $('subtitle').textContent = `${this.town.buildings.length} buildings · ${this.town.buildings.filter(b => b.hero).length} named · placeholder art`;
  }
  worldOf(lon: number, lat: number): [number, number] { const m = this.town.meta; return [(lon - m.origin[0]) * m.kx, (lat - m.origin[1]) * m.ky]; }
  layout() { const { width, height } = this.scale; this.tint.setSize(width, height); }

  showCard(b: Building) {
    const card = $('card');
    const names = b.n.length ? b.n : ['Unnamed building'];
    const kind = b.k ? b.k.replace(/_/g, ' ') : b.t !== 'yes' ? b.t : '';
    card.innerHTML = `<button aria-label="Close">×</button><b>${esc(names[0])}</b>${names.slice(1).map(n => `<div>${esc(n)}</div>`).join('')}<div class="sub">${[b.addr, kind, b.lv ? b.lv + ' floors' : '', Math.round(b.A) + ' m² footprint'].filter((s): s is string => !!s).map(esc).join(' · ')}</div>`;
    card.hidden = false;
    card.querySelector('button')!.onclick = () => { card.hidden = true; };
  }

  update(_time: number, delta: number) {
    if (!this.ground) return;
    const dt = Math.min(delta / 1000, 0.1);
    const cam = this.cameras.main;
    this.ground.update(cam);
    this.npcs.update(dt);
    // clock
    if (this.live) this.tod = coupevilleHours();
    const t = this.tod; const { day, glow } = daylight(t);
    const hh = Math.floor(t), mm = Math.floor((t % 1) * 60);
    const label = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    $('clock').firstChild!.textContent = label; $('tod-o').textContent = this.live ? 'live' : label;
    if (this.live) ($('tod') as HTMLInputElement).value = String(t);
    // multiply tint: night is a cool navy, dusk/dawn warm
    const night = new Phaser.Display.Color(70, 82, 130), dayC = new Phaser.Display.Color(255, 255, 255), warm = new Phaser.Display.Color(255, 196, 150);
    let c = Phaser.Display.Color.Interpolate.ColorWithColor(night, dayC, 100, Math.round(day * 100));
    if (glow > 0) { const w = Phaser.Display.Color.Interpolate.ColorWithColor(new Phaser.Display.Color(c.r, c.g, c.b), warm, 100, Math.round(glow * 45 * (0.4 + 0.6 * day))); c = w; }
    this.tint.setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
    const w = this.cameras.main.worldView; const [cx, cy] = toWorld(w.centerX, w.centerY);
    $('status').textContent = `zoom ${cam.zoom.toFixed(2)} · ${Math.round(cx)}, ${Math.round(cy)} m · chunks ${this.ground.chunks.size}`;
  }
}
function esc(s: string) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string)); }

new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', backgroundColor: '#4a7f9c',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  scene: [TownScene],
});
