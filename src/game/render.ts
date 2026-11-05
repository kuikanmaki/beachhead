// @ts-nocheck -- hot-loop pixel/canvas code; strict indexed-access checks disabled for this file only.
// High-resolution renderer for Beachhead: lit procedural terrain, animated units, light effects.
import type { Game } from "./engine";
import { T, W, H, ROCK, HIGH } from "./engine";
import type { Camera } from "./camera";

export const RS = 2; // render scale: canvas pixels per engine pixel
const PX = T * RS; // canvas pixels per tile
let PW = W * PX, PH = H * PX;
const sizeUp = () => { PW = W * PX; PH = H * PX; };
const TAU = Math.PI * 2;

// ---------- noise ----------
function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, o = 4) {
  let t = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { t += vnoise(x * f, y * f, s + i * 17) * a; f *= 2; a *= 0.5; }
  return t / (1 - Math.pow(0.5, o));
}
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------- terrain ----------
function buildTerrain(g: Game) {
  sizeUp();
  const seed = (g.map.length + g.map.reduce((a, v, i) => (a + v * (i % 97)) | 0, 0)) % 1000;
  const tv = (x: number, y: number) => {
    x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y));
    const t = g.map[y * W + x]; return t === ROCK ? 2 : t === HIGH ? 1 : 0;
  };
  const N = PW * PH;
  const hgt = new Float32Array(N), hi = new Float32Array(N), rk = new Float32Array(N), det = new Float32Array(N);
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const wx = px / PX, wy = py / PX, i = py * PW + px;
    const dx = (fbm(wx * 0.7, wy * 0.7, seed + 11, 3) - 0.5) * 1.1;
    const dy = (fbm(wx * 0.7, wy * 0.7, seed + 23, 3) - 0.5) * 1.1;
    const sx = wx - 0.5 + dx, sy = wy - 0.5 + dy, ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    const top = lerp(tv(ix, iy), tv(ix + 1, iy), fx), bot = lerp(tv(ix, iy + 1), tv(ix + 1, iy + 1), fx);
    const v = lerp(top, bot, fy);
    const d = fbm(wx * 2.2, wy * 2.2, seed + 5, 4);
    const high = sstep(0.38, 0.62, v), rock = sstep(1.22, 1.48, v);
    hi[i] = high; rk[i] = rock; det[i] = d;
    hgt[i] = high * 0.45 + rock * (1.2 + d * 1.1) + d * 0.1 + fbm(wx * 6, wy * 6, seed + 3, 2) * 0.03;
  }
  const img = new ImageData(PW, PH), out = img.data;
  const L = [-0.55, -0.65, 0.52], ll = Math.hypot(...L); L[0] /= ll; L[1] /= ll; L[2] /= ll;
  const sdx = -0.64, sdy = -0.77, slope = 0.9 / PX;
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const i = py * PW + px;
    const l = hgt[py * PW + Math.max(0, px - 1)], r = hgt[py * PW + Math.min(PW - 1, px + 1)];
    const u = hgt[Math.max(0, py - 1) * PW + px], dn = hgt[Math.min(PH - 1, py + 1) * PW + px];
    const gx = (r - l) * PX * 0.5, gy = (dn - u) * PX * 0.5;
    const nl = Math.hypot(gx, gy, 1);
    const lam = Math.max(0, (-gx * L[0] - gy * L[1] + L[2]) / nl);
    // cast shadow
    let sh = 1; const h0 = hgt[i];
    for (let s = 1; s <= 14; s++) {
      const qx = Math.round(px + sdx * s * 4), qy = Math.round(py + sdy * s * 4);
      if (qx < 0 || qy < 0) break;
      if (hgt[qy * PW + qx] > h0 + s * 4 * slope) { sh = 0.62; break; }
    }
    const d = det[i], high = hi[i], rock = rk[i];
    const crack = Math.abs(fbm(px / PX * 1.6, py / PX * 1.6, 77, 3) - 0.5) < 0.012 ? 0.82 : 1;
    // sand
    let cr = lerp(150, 182, d), cg = lerp(92, 118, d), cb = lerp(56, 70, d);
    // plateau
    cr = lerp(cr, lerp(188, 214, d), high); cg = lerp(cg, lerp(140, 166, d), high); cb = lerp(cb, lerp(92, 112, d), high);
    // rock with strata
    const strata = 0.9 + Math.sin(h0 * 26 + d * 4) * 0.1;
    cr = lerp(cr, lerp(84, 120, d) * strata, rock); cg = lerp(cg, lerp(54, 76, d) * strata, rock); cb = lerp(cb, lerp(42, 56, d) * strata, rock);
    const shade = (0.42 + 0.78 * lam) * sh * (rock > 0.5 ? 1 : crack);
    out[i * 4] = Math.min(255, cr * shade);
    out[i * 4 + 1] = Math.min(255, cg * shade);
    out[i * 4 + 2] = Math.min(255, cb * shade * 0.95);
    out[i * 4 + 3] = 255;
  }
  const c = document.createElement("canvas"); c.width = PW; c.height = PH;
  const x = c.getContext("2d")!;
  x.putImageData(img, 0, 0);
  // scatter details
  let s = seed * 7 + 1; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 14; k++) {
    const cx = rnd() * PW, cy = rnd() * PH, i = Math.floor(cy) * PW + Math.floor(cx);
    if (rk[i] > 0.3) continue;
    const rad = (0.6 + rnd() * 1.2) * PX;
    const gr = x.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    gr.addColorStop(0, "rgba(30,18,10,0.45)"); gr.addColorStop(0.7, "rgba(40,24,14,0.18)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, rad, 0, TAU); x.fill();
    x.strokeStyle = "rgba(255,220,170,0.12)"; x.lineWidth = 2; x.beginPath(); x.arc(cx + 2, cy + 2, rad * 0.55, Math.PI * 0.9, Math.PI * 1.9); x.stroke();
  }
  for (let k = 0; k < 700; k++) {
    const cx = rnd() * PW, cy = rnd() * PH, i = Math.floor(cy) * PW + Math.floor(cx);
    if (rk[i] > 0.2) continue;
    const r = 1.2 + rnd() * 3.2;
    x.fillStyle = "rgba(0,0,0,0.28)"; x.beginPath(); x.ellipse(cx + r * 0.5, cy + r * 0.6, r, r * 0.75, 0, 0, TAU); x.fill();
    x.fillStyle = `rgba(${90 + rnd() * 50},${60 + rnd() * 30},${40 + rnd() * 20},0.95)`; x.beginPath(); x.ellipse(cx, cy, r, r * 0.75, rnd() * 3, 0, TAU); x.fill();
    x.fillStyle = "rgba(255,230,190,0.18)"; x.beginPath(); x.arc(cx - r * 0.3, cy - r * 0.3, r * 0.4, 0, TAU); x.fill();
  }
  // warm haze grade
  x.globalCompositeOperation = "soft-light";
  const haze = x.createLinearGradient(0, 0, PW, PH);
  haze.addColorStop(0, "rgba(255,190,120,0.35)"); haze.addColorStop(1, "rgba(60,30,60,0.35)");
  x.fillStyle = haze; x.fillRect(0, 0, PW, PH);
  x.globalCompositeOperation = "source-over";
  return c;
}

let vignette: HTMLCanvasElement | null = null;
function getVignette() {
  if (vignette && vignette.width === PW && vignette.height === PH) return vignette;
  const c = document.createElement("canvas"); c.width = PW; c.height = PH;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(PW / 2, PH / 2, PH * 0.35, PW / 2, PH / 2, PW * 0.62);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(10,4,0,0.55)");
  x.fillStyle = g; x.fillRect(0, 0, PW, PH);
  return (vignette = c);
}

// ---------- per-entity visual state ----------
type VS = { ang: number; px: number; py: number; phase: number; blobs?: number[] };
const vs = new WeakMap<object, VS>();
const get = (o: object, ang = 0, x = 0, y = 0) => {
  let s = vs.get(o);
  if (!s) { s = { ang, px: x, py: y, phase: Math.random() * TAU }; vs.set(o, s); }
  return s;
};
const turn = (a: number, t: number, k: number) => a + ((((t - a) % TAU) + TAU * 1.5) % TAU - Math.PI) * Math.min(1, k);
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; r: number };
const particles = new WeakMap<Game, Particle[]>();
const seenTracer = new WeakSet<object>();
let lastNow = 0;

function nearest(g: Game, x: number, y: number, range: number) {
  let best = null, bd = range;
  for (const b of g.bugs) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
  return best;
}

// ---------- drawing primitives ----------
function shadow(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.35) {
  c.fillStyle = `rgba(20,8,0,${a})`; c.beginPath(); c.ellipse(x + 0.07, y + 0.09, rx, ry, 0, 0, TAU); c.fill();
}
function poly(c: CanvasRenderingContext2D, x: number, y: number, r: number, n: number, rot = 0) {
  c.beginPath();
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; i ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath();
}
function bar(c: CanvasRenderingContext2D, x: number, y: number, f: number, w: number, col?: string) {
  const h = 0.09;
  c.fillStyle = "rgba(10,6,4,0.7)"; c.fillRect(x - w / 2 - 0.03, y - 0.03, w + 0.06, h + 0.06);
  c.fillStyle = col ?? (f > 0.5 ? "#8fe36f" : f > 0.25 ? "#ffcf4a" : "#ff5a3a");
  c.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, f)), h);
}

function trooper(c: CanvasRenderingContext2D, x: number, y: number, ang: number, armor: string, pack: string, flash: boolean, sel: boolean) {
  shadow(c, x, y, 0.15, 0.11, 0.4);
  c.save(); c.translate(x, y); c.rotate(ang);
  c.strokeStyle = "#16181a"; c.lineWidth = 0.05; c.lineCap = "round";
  c.beginPath(); c.moveTo(0.02, 0.06); c.lineTo(0.27, 0.05); c.stroke();
  c.fillStyle = pack; c.fillRect(-0.15, -0.075, 0.07, 0.15);
  c.fillStyle = armor; c.beginPath(); c.ellipse(0, 0, 0.1, 0.15, 0, 0, TAU); c.fill();
  c.strokeStyle = sel ? "#ffd34d" : "rgba(0,0,0,0.55)"; c.lineWidth = sel ? 0.035 : 0.02; c.stroke();
  const hg = c.createRadialGradient(0.0, -0.03, 0.01, 0.02, 0, 0.08);
  hg.addColorStop(0, "#a9b3ad"); hg.addColorStop(1, "#3b4540");
  c.fillStyle = hg; c.beginPath(); c.arc(0.02, 0, 0.075, 0, TAU); c.fill();
  if (flash) {
    c.globalCompositeOperation = "lighter";
    const fg = c.createRadialGradient(0.3, 0.05, 0, 0.3, 0.05, 0.14);
    fg.addColorStop(0, "rgba(255,240,180,1)"); fg.addColorStop(1, "rgba(255,140,40,0)");
    c.fillStyle = fg; c.beginPath(); c.arc(0.3, 0.05, 0.14, 0, TAU); c.fill();
    c.globalCompositeOperation = "source-over";
  }
  c.restore();
}

const BUGPAL = [
  { hi: "#b77a45", lo: "#3a1d0e", leg: "#2a160b", eye: "#ff5a2a" },
  { hi: "#c8a06a", lo: "#4d3318", leg: "#3a2612", eye: "#ffb02a" },
  { hi: "#d8602c", lo: "#3c0f08", leg: "#2a0c06", eye: "#ffe04a" },
];
const bugGrad = new Map<number, CanvasGradient>();
function bugGradient(c: CanvasRenderingContext2D, kind: number, r: number) {
  let gr = bugGrad.get(kind);
  if (!gr) {
    gr = c.createRadialGradient(-r * 0.3, -r * 0.25, r * 0.05, -r * 0.2, 0, r * 1.1);
    gr.addColorStop(0, BUGPAL[kind].hi); gr.addColorStop(1, BUGPAL[kind].lo);
    bugGrad.set(kind, gr);
  }
  return gr;
}
function bug(c: CanvasRenderingContext2D, b: any, ang: number, phase: number, now: number) {
  const r = b.r, p = BUGPAL[b.kind];
  shadow(c, b.x, b.y, r * 1.5, r * 1.1, 0.38);
  c.save(); c.translate(b.x, b.y); c.rotate(ang);
  // legs
  c.strokeStyle = p.leg; c.lineCap = "round"; c.lineJoin = "round";
  const sp = now * b.speed * 7 + phase;
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const swing = Math.sin(sp + i * 1.7 + (side > 0 ? Math.PI : 0)) * 0.35;
    const la = (1.5 - i) * 0.45 + swing;
    const bx = r * (0.35 - i * 0.22), by = side * r * 0.25;
    const kx = bx + Math.sin(la) * r * 0.9, ky = by + side * Math.cos(la) * r * 0.9;
    const fx = kx + Math.sin(la) * r * 1.2 + r * 0.25 * (1.5 - i), fy = ky + side * Math.cos(la) * r * 0.45;
    c.lineWidth = r * 0.16; c.beginPath(); c.moveTo(bx, by); c.lineTo(kx, ky); c.stroke();
    c.lineWidth = r * 0.08; c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy); c.stroke();
  }
  // mandibles
  const m = Math.sin(now * 9 + phase) * 0.25;
  c.lineWidth = r * 0.1;
  for (const side of [-1, 1]) {
    c.beginPath(); c.moveTo(r * 0.75, side * r * 0.12);
    c.quadraticCurveTo(r * 1.1, side * r * (0.35 + m * 0.3), r * 1.25, side * r * (0.05 + m * 0.1)); c.stroke();
  }
  const gr = bugGradient(c, b.kind, r);
  c.fillStyle = gr;
  c.beginPath(); c.ellipse(-r * 0.55, 0, r * 0.8, r * 0.6, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(r * 0.15, 0, r * 0.42, r * 0.36, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(r * 0.62, 0, r * 0.25, r * 0.22, 0, 0, TAU); c.fill();
  // carapace ridges
  c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = r * 0.06;
  for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(-r * (0.2 + k * 0.32), 0, r * 0.5, Math.PI * 0.6, Math.PI * 1.4); c.stroke(); }
  c.fillStyle = p.eye;
  c.beginPath(); c.arc(r * 0.7, -r * 0.1, r * 0.06, 0, TAU); c.arc(r * 0.7, r * 0.1, r * 0.06, 0, TAU); c.fill();
  if (b.kind === 2) {
    c.globalCompositeOperation = "lighter";
    c.fillStyle = `rgba(255,120,30,${0.25 + Math.sin(now * 4 + phase) * 0.1})`;
    c.beginPath(); c.ellipse(-r * 0.6, 0, r * 0.4, r * 0.25, 0, 0, TAU); c.fill();
    c.globalCompositeOperation = "source-over";
  }
  c.restore();
}

function core(c: CanvasRenderingContext2D, g: Game, now: number) {
  const { x, y } = g.core;
  // pad
  shadow(c, x, y, 1.45, 1.35, 0.3);
  c.fillStyle = "#4b4844"; poly(c, x, y, 1.4, 6, Math.PI / 6); c.fill();
  c.strokeStyle = "#2a2826"; c.lineWidth = 0.06; c.stroke();
  c.strokeStyle = "rgba(255,190,60,0.85)"; c.lineWidth = 0.05; c.setLineDash([0.18, 0.12]);
  poly(c, x, y, 1.2, 6, Math.PI / 6); c.stroke(); c.setLineDash([]);
  // bunker
  shadow(c, x, y, 0.75, 0.6, 0.45);
  const bg = c.createLinearGradient(x - 0.7, y - 0.55, x + 0.7, y + 0.55);
  bg.addColorStop(0, "#77806d"); bg.addColorStop(1, "#353b31");
  c.fillStyle = bg; c.beginPath(); c.roundRect(x - 0.7, y - 0.5, 1.4, 1.0, 0.15); c.fill();
  c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 0.04; c.stroke();
  c.fillStyle = "#2a2e27"; c.fillRect(x - 0.5, y - 0.3, 0.45, 0.25); c.fillRect(x + 0.1, y + 0.05, 0.45, 0.25);
  // radar
  const ra = now * 1.6;
  c.strokeStyle = "#c9cfc4"; c.lineWidth = 0.06;
  c.beginPath(); c.moveTo(x + 0.35, y - 0.25); c.lineTo(x + 0.35 + Math.cos(ra) * 0.28, y - 0.25 + Math.sin(ra) * 0.28); c.stroke();
  c.fillStyle = "#c9cfc4"; c.beginPath(); c.arc(x + 0.35, y - 0.25, 0.07, 0, TAU); c.fill();
  // lights
  const blink = Math.sin(now * 5) > 0;
  c.globalCompositeOperation = "lighter";
  for (const [lx, ly, col] of [[-0.62, -0.42, "255,60,40"], [0.62, 0.42, "80,255,140"]]) {
    const on = blink === (col[0] === "2");
    const lg = c.createRadialGradient(x + lx, y + ly, 0, x + lx, y + ly, on ? 0.35 : 0.12);
    lg.addColorStop(0, `rgba(${col},1)`); lg.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = lg; c.beginPath(); c.arc(x + lx, y + ly, 0.35, 0, TAU); c.fill();
  }
  c.globalCompositeOperation = "source-over";
  bar(c, x, y - 1.25, g.core.hp / g.core.max, 1.8);
}

function tower(c: CanvasRenderingContext2D, g: Game, t: any, now: number, dt: number, firing: boolean) {
  const x = t.tx + 0.5, y = t.ty + 0.5, s = get(t, -Math.PI / 2);
  if (t.built < 1) {
    c.globalAlpha = 0.5;
    c.strokeStyle = "#ffb347"; c.lineWidth = 0.04; c.setLineDash([0.1, 0.08]);
    poly(c, x, y, 0.45, 8, Math.PI / 8); c.stroke(); c.setLineDash([]);
    c.strokeStyle = "#8a7a60"; c.lineWidth = 0.035;
    c.beginPath(); c.moveTo(x - 0.35, y - 0.35); c.lineTo(x + 0.35, y + 0.35); c.moveTo(x + 0.35, y - 0.35); c.lineTo(x - 0.35, y + 0.35); c.stroke();
    c.globalAlpha = 1;
    c.strokeStyle = "#ffb347"; c.lineWidth = 0.07; c.beginPath(); c.arc(x, y, 0.55, -Math.PI / 2, -Math.PI / 2 + TAU * t.built); c.stroke();
    return;
  }
  const tg = nearest(g, x, y, g.at(t.tx, t.ty) === HIGH ? 7 : 5.5);
  if (tg) s.ang = turn(s.ang, Math.atan2(tg.y - y, tg.x - x), dt * 10);
  shadow(c, x, y, 0.5, 0.45, 0.45);
  // sandbag ring
  c.fillStyle = "#8f7d5a"; poly(c, x, y, 0.5, 8, Math.PI / 8); c.fill();
  c.strokeStyle = "rgba(40,30,15,0.6)"; c.lineWidth = 0.03; c.stroke();
  const cg = c.createRadialGradient(x - 0.12, y - 0.12, 0.05, x, y, 0.42);
  cg.addColorStop(0, "#a3a69d"); cg.addColorStop(1, "#4d504a");
  c.fillStyle = cg; poly(c, x, y, 0.38, 8, Math.PI / 8); c.fill();
  // turret
  c.save(); c.translate(x, y); c.rotate(s.ang);
  c.fillStyle = "#1d1f1e";
  c.fillRect(0.1, -0.1, 0.48, 0.06); c.fillRect(0.1, 0.04, 0.48, 0.06);
  const tgd = c.createLinearGradient(-0.2, -0.2, 0.2, 0.2);
  tgd.addColorStop(0, "#6e7a64"); tgd.addColorStop(1, "#2f362b");
  c.fillStyle = tgd; c.beginPath(); c.roundRect(-0.22, -0.2, 0.42, 0.4, 0.08); c.fill();
  c.strokeStyle = "rgba(0,0,0,0.6)"; c.lineWidth = 0.03; c.stroke();
  c.fillStyle = "#ffcf4a"; c.fillRect(-0.18, -0.03, 0.08, 0.06);
  if (firing) {
    c.globalCompositeOperation = "lighter";
    const fg = c.createRadialGradient(0.65, 0, 0, 0.65, 0, 0.3);
    fg.addColorStop(0, "rgba(255,245,200,1)"); fg.addColorStop(0.4, "rgba(255,170,60,0.7)"); fg.addColorStop(1, "rgba(255,100,20,0)");
    c.fillStyle = fg; c.beginPath(); c.arc(0.65, 0, 0.3, 0, TAU); c.fill();
    c.globalCompositeOperation = "source-over";
  }
  c.restore();
  if (t.hp < 300) bar(c, x, y - 0.75, t.hp / 300, 0.9);
}

// ---------- main ----------
export function renderGame(g: Game, ctx: CanvasRenderingContext2D, hover: { x: number; y: number } | null, mode: string, camera: Camera) {
  const now = performance.now() / 1000, dt = Math.min(0.1, now - (lastNow || now)); lastNow = now;
  if (!g.bg) g.bg = buildTerrain(g);
  sizeUp();
  const scale = PX * camera.zoom, ox = -camera.x * scale, oy = -camera.y * scale;
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.drawImage(g.bg, 0, 0, W, H);
  const c = ctx;

  // splats (decals)
  for (const s of g.splats) {
    const v = get(s);
    if (!v.blobs) { v.blobs = []; for (let k = 0; k < 6; k++) v.blobs.push((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, 0.3 + Math.random() * 0.6); }
    c.globalAlpha = Math.min(0.85, s.life / 8);
    c.fillStyle = s.green ? "#5f8f1e" : "#6e1010";
    for (let k = 0; k < v.blobs.length; k += 3) { c.beginPath(); c.arc(s.x + v.blobs[k] * s.r, s.y + v.blobs[k + 1] * s.r, v.blobs[k + 2] * s.r, 0, TAU); c.fill(); }
    c.fillStyle = s.green ? "rgba(190,230,90,0.35)" : "rgba(160,40,30,0.4)";
    c.beginPath(); c.arc(s.x - s.r * 0.15, s.y - s.r * 0.15, s.r * 0.35, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;

  if (g.phase === "landing") {
    if (hover) {
      const hx = Math.floor(hover.x) + 0.5, hy = Math.floor(hover.y) + 0.5, ok = g.at(Math.floor(hover.x), Math.floor(hover.y)) !== ROCK;
      const pulse = 0.5 + Math.sin(now * 5) * 0.5, col = ok ? "95,211,160" : "255,90,60";
      c.fillStyle = `rgba(${col},0.12)`; poly(c, hx, hy, 2.6, 6, Math.PI / 6); c.fill();
      c.strokeStyle = `rgba(${col},${0.5 + pulse * 0.5})`; c.lineWidth = 0.08; c.stroke();
      c.lineWidth = 0.05; c.beginPath(); c.arc(hx, hy, 0.6 + pulse * 0.6, 0, TAU); c.stroke();
      c.beginPath(); c.moveTo(hx - 1, hy); c.lineTo(hx + 1, hy); c.moveTo(hx, hy - 1); c.lineTo(hx, hy + 1); c.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(getVignette(), 0, 0);
    return;
  }

  // firing state from tracers
  const towerFire = new Set<string>();
  let parts = particles.get(g); if (!parts) particles.set(g, (parts = []));
  for (const tr of g.tracers) {
    if (tr.tower) towerFire.add(`${tr.x1},${tr.y1}`);
    if (!seenTracer.has(tr)) {
      seenTracer.add(tr);
      for (let k = 0; k < (tr.tower ? 2 : 3); k++) {
        const a = Math.random() * TAU, sp = 1 + Math.random() * 2.5;
        parts.push({ x: tr.x2, y: tr.y2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35, max: 0.35, col: k ? "150,210,60" : "255,220,140", r: 0.05 + Math.random() * 0.05 });
      }
    }
  }

  core(c, g, now);
  for (const t of g.towers) tower(c, g, t, now, dt, towerFire.has(`${t.tx + 0.5},${t.ty + 0.5}`));

  // bugs
  for (const b of g.bugs) {
    const s = get(b, 0, b.x, b.y);
    const mx = b.x - s.px, my = b.y - s.py;
    if (mx * mx + my * my > 1e-6) s.ang = turn(s.ang, Math.atan2(my, mx), dt * 8);
    s.px = b.x; s.py = b.y;
    bug(c, b, s.ang, s.phase, now);
  }
  for (const b of g.bugs) if (b.kind === 2) bar(c, b.x, b.y - b.r - 0.45, b.hp / b.max, 1.1);

  // platoons
  for (const p of g.platoons) {
    const sel = p.id === g.selected, s = get(p, -Math.PI / 2, p.x, p.y);
    const high = g.at(Math.floor(p.x), Math.floor(p.y)) === HIGH, range = high ? 6.5 : 4.2;
    const tg = nearest(g, p.x, p.y, range);
    const mvx = p.x - s.px, mvy = p.y - s.py;
    if (tg) s.ang = turn(s.ang, Math.atan2(tg.y - p.y, tg.x - p.x), dt * 10);
    else if (mvx * mvx + mvy * mvy > 1e-6) s.ang = turn(s.ang, Math.atan2(mvy, mvx), dt * 8);
    s.px = p.x; s.py = p.y;
    if (sel) {
      c.strokeStyle = "rgba(255,211,77,0.7)"; c.lineWidth = 0.04; c.setLineDash([0.2, 0.15]);
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.tx, p.ty); c.stroke(); c.setLineDash([]);
      c.fillStyle = "rgba(255,211,77,0.05)"; c.strokeStyle = "rgba(255,211,77,0.35)";
      c.beginPath(); c.arc(p.x, p.y, range, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = "rgba(255,211,77,0.9)"; c.lineWidth = 0.05;
      c.beginPath(); c.ellipse(p.x, p.y + 0.05, 0.75, 0.6, 0, 0, TAU); c.stroke();
    }
    const flash = p.cd > 0.38;
    const ca = Math.cos(s.ang), sa = Math.sin(s.ang);
    const form = [[0.35, 0], [0, -0.38], [0, 0.38], [-0.38, -0.2], [-0.38, 0.2]];
    for (let i = 0; i < p.soldiers; i++) {
      const [fx, fy] = form[i];
      const jx = Math.sin(now * 2 + i * 2.1 + s.phase) * 0.03;
      trooper(c, p.x + fx * ca - fy * sa + jx, p.y + fx * sa + fy * ca, s.ang + (i - 2) * 0.05, "#5d6b74", "#3c463c", flash && (i + Math.floor(now * 20)) % 2 === 0, sel);
    }
    bar(c, p.x, p.y - 0.85, p.soldiers / 5, 0.9);
  }

  // engineers
  for (const e of g.engineers) {
    const s = get(e, 0, e.x, e.y);
    const mx = e.x - s.px, my = e.y - s.py, moving = mx * mx + my * my > 1e-6;
    const job = g.towers.find((t) => t.id === e.job && t.built < 1);
    if (moving) s.ang = turn(s.ang, Math.atan2(my, mx), dt * 8);
    else if (job) s.ang = turn(s.ang, Math.atan2(job.ty + 0.5 - e.y, job.tx + 0.5 - e.x), dt * 8);
    s.px = e.x; s.py = e.y;
    trooper(c, e.x, e.y, s.ang, "#b0873a", "#ffb347", false, false);
    if (job && !moving && Math.random() < 0.6) {
      const a = Math.random() * TAU;
      parts.push({ x: e.x + Math.cos(s.ang) * 0.3, y: e.y + Math.sin(s.ang) * 0.3, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 0.25, max: 0.25, col: "160,220,255", r: 0.04 });
    }
  }

  // tracers + particles (additive light)
  c.globalCompositeOperation = "lighter"; c.lineCap = "round";
  for (const tr of g.tracers) {
    const a = tr.life / (tr.tower ? 0.06 : 0.08);
    c.strokeStyle = tr.tower ? `rgba(255,170,60,${0.35 * a})` : `rgba(255,220,120,${0.3 * a})`; c.lineWidth = 0.16;
    c.beginPath(); c.moveTo(tr.x1, tr.y1); c.lineTo(tr.x2, tr.y2); c.stroke();
    c.strokeStyle = `rgba(255,250,220,${a})`; c.lineWidth = 0.04; c.stroke();
  }
  for (const pt of parts) {
    pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.9; pt.vy *= 0.9;
    c.fillStyle = `rgba(${pt.col},${Math.max(0, pt.life / pt.max)})`;
    c.beginPath(); c.arc(pt.x, pt.y, pt.r, 0, TAU); c.fill();
  }
  particles.set(g, parts.filter((p) => p.life > 0).slice(-600));
  c.globalCompositeOperation = "source-over";

  // placement previews
  if (hover && mode === "tower") {
    const tx = Math.floor(hover.x), ty = Math.floor(hover.y), ok = g.at(tx, ty) !== ROCK, high = g.at(tx, ty) === HIGH;
    const col = ok ? "140,230,255" : "255,90,60";
    c.fillStyle = `rgba(${col},0.07)`; c.strokeStyle = `rgba(${col},0.6)`; c.lineWidth = 0.05;
    c.beginPath(); c.arc(tx + 0.5, ty + 0.5, high ? 7 : 5.5, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = `rgba(${col},0.35)`; poly(c, tx + 0.5, ty + 0.5, 0.48, 8, Math.PI / 8); c.fill(); c.stroke();
  }
  if (hover && mode === "platoon") {
    const pulse = 0.5 + Math.sin(now * 6) * 0.5;
    c.strokeStyle = "rgba(140,200,255,0.9)"; c.lineWidth = 0.05;
    c.beginPath(); c.arc(hover.x, hover.y, 0.5 + pulse * 0.3, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(hover.x - 0.9, hover.y); c.lineTo(hover.x - 0.3, hover.y); c.moveTo(hover.x + 0.3, hover.y); c.lineTo(hover.x + 0.9, hover.y);
    c.moveTo(hover.x, hover.y - 0.9); c.lineTo(hover.x, hover.y - 0.3); c.moveTo(hover.x, hover.y + 0.3); c.lineTo(hover.x, hover.y + 0.9); c.stroke();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(getVignette(), 0, 0);
}
