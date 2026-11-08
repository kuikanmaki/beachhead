// @ts-nocheck -- hot-loop typed-array/grid indexing; strict indexed-access checks are disabled for this file only.
// Beachhead — pure game simulation + canvas renderer (no React).
import { FogOfWar } from "./fog";

export const T = 20;
export let W = 48;
export let H = 32;
/** Fit the map grid to the screen aspect ratio. Call before creating a Game. */
export function setMapSize(aspect: number) { H = 32; W = Math.max(32, Math.min(80, Math.round(32 * aspect))); }
export const GROUND = 0, HIGH = 1, ROCK = 2;

export const COST = { team: 60, squad: 180, engineer: 80, tower: 120 };
export const WIN_AFTER = 180; // seconds before victory can trigger
export const HOLD_NEEDED = 90; // seconds without an infantry death
export const CRUISER_RADIUS = 3; // clear 7×7-tile landing footprint
export const CRUISER_HP = 1400;

type Bug = { x: number; y: number; hp: number; max: number; speed: number; dmg: number; r: number; kind: 0 | 1 | 2; bounty: number };
export type InfantryKind = "team" | "squad";
export type Infantry = { id: number; kind: InfantryKind; fireTeams: number; x: number; y: number; tx: number; ty: number; path: { x: number; y: number }[]; soldiers: number; hp: number; cd: number };
type Engineer = { id: number; x: number; y: number; hp: number; job: number | null };
type Tower = { id: number; tx: number; ty: number; built: number; hp: number; cd: number };
type Tracer = { x1: number; y1: number; x2: number; y2: number; life: number; tower: boolean };
type Splat = { x: number; y: number; life: number; r: number; green: boolean };

const SOLDIER_HP = 20;
// US Marine benchmark: four per fire team; three fire teams plus one squad leader.
export const TEAM_SIZE = 4, SQUAD_FIRE_TEAMS = 3, SQUAD_SIZE = TEAM_SIZE * SQUAD_FIRE_TEAMS + 1;
export const maxInfantrySoldiers = (unit: Infantry) => unit.kind === "squad" ? SQUAD_SIZE : TEAM_SIZE;
const C = {
  ground: "#8a6a45", ground2: "#7d5f3d", high: "#b08a58", high2: "#c49a63", rock: "#3d2c22", rock2: "#2c201a",
  bug: "#2b1a12", bugEye: "#e8492a", tank: "#4a1f10", inf: "#9fd0ff", infSel: "#ffd34d", eng: "#ffb347",
  tower: "#c9ced6", core: "#5fd3a0", tracer: "#ffe9a8", ttracer: "#9ff", goo: "#6fae2a", blood: "#9b1b1b",
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Game {
  rand: () => number;
  map: Uint8Array;
  dist = new Float32Array(W * H);
  fog = new FogOfWar(W, H);
  bg: HTMLCanvasElement | null = null;
  phase: "landing" | "shipLanding" | "playing" | "won" | "lost" = "landing";
  level = 1;
  hasCruiser = false;
  core = { x: 0, y: 0, hp: 600, max: 600 };
  bugs: Bug[] = [];
  infantry: Infantry[] = [];
  engineers: Engineer[] = [];
  towers: Tower[] = [];
  tracers: Tracer[] = [];
  splats: Splat[] = [];
  spawns: number[] = [];
  credits = 150;
  t = 0;
  lastDeath = 0;
  deaths = 0;
  kills = 0;
  wave = 0;
  nextHorde = 45;
  spawnAcc = 0;
  selected: number | null = null;
  nid = 1;
  message = "Choose a landing zone: click open ground.";

  constructor(seed = Date.now()) {
    this.rand = rng(seed);
    this.map = this.generate();
    // A short-range drop scan gives the player a usable landing choice without satellite comms.
    this.fog.revealArea(W / 2, H / 2, 9);
  }

  // ---------- map ----------
  generate() {
    const m = new Uint8Array(W * H);
    const grid = (gw: number, gh: number) => Array.from({ length: (gw + 1) * (gh + 1) }, () => this.rand());
    const oct = [[8, 6, 0.65], [16, 11, 0.35]].map(([gw, gh, a]) => ({ gw, gh, a, g: grid(gw, gh) }));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let n = 0;
      for (const o of oct) {
        const fx = (x / W) * o.gw, fy = (y / H) * o.gh, ix = Math.floor(fx), iy = Math.floor(fy);
        const sx = fx - ix, sy = fy - iy, s = (v: number) => v * v * (3 - 2 * v);
        const g = (a: number, b: number) => o.g[b * (o.gw + 1) + a];
        const top = g(ix, iy) + (g(ix + 1, iy) - g(ix, iy)) * s(sx);
        const bot = g(ix, iy + 1) + (g(ix + 1, iy + 1) - g(ix, iy + 1)) * s(sx);
        n += (top + (bot - top) * s(sy)) * o.a;
      }
      m[y * W + x] = n > 0.6 ? ROCK : n > 0.53 ? HIGH : GROUND;
    }
    return m;
  }

  at(x: number, y: number) { return x < 0 || y < 0 || x >= W || y >= H ? ROCK : this.map[y * W + x]; }

  computeFlow() {
    const d = this.dist; d.fill(Infinity);
    const cx = Math.floor(this.core.x), cy = Math.floor(this.core.y);
    d[cy * W + cx] = 0;
    const open = [cy * W + cx];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (d[open[i]] < d[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      const x = cur % W, y = (cur / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, tt = this.at(nx, ny);
        if (tt === ROCK) continue;
        const nd = d[cur] + (tt === HIGH ? 2.5 : 1);
        if (nd < d[ny * W + nx]) { if (d[ny * W + nx] === Infinity) open.push(ny * W + nx); d[ny * W + nx] = nd; }
      }
    }
  }

  land(tx: number, ty: number) {
    if (this.phase !== "landing" || this.at(tx, ty) === ROCK) return false;
    for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 2; x <= tx + 2; x++) if (this.at(x, y) !== ROCK || (x >= 0 && y >= 0 && x < W && y < H)) {
      if (x >= 0 && y >= 0 && x < W && y < H) this.map[y * W + x] = GROUND;
    }
    this.core.x = tx + 0.5; this.core.y = ty + 0.5;
    this.updateSpawnPoints(tx, ty);
    this.bg = null;
    this.phase = "playing";
    this.infantry.push(this.newInfantry(this.core.x, this.core.y + 1.5));
    this.engineers.push({ id: this.nid++, x: this.core.x - 1, y: this.core.y, hp: 40, job: null });
    this.updateFog();
    this.message = "Team down! The swarm is coming. Hold the line.";
    return true;
  }

  updateSpawnPoints(tx: number, ty: number) {
    this.computeFlow();
    const edges = () => {
      const e: number[] = [];
      for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (isFinite(this.dist[y * W + x])) e.push(y * W + x);
      for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (isFinite(this.dist[y * W + x])) e.push(y * W + x);
      return e;
    };
    let e = edges();
    if (e.length < 8) {
      for (const [ex, ey] of [[0, ty], [W - 1, ty], [tx, 0], [tx, H - 1]]) {
        let x = tx, y = ty;
        while (x !== ex || y !== ey) {
          if (x !== ex) x += Math.sign(ex - x); else y += Math.sign(ey - y);
          if (this.map[y * W + x] === ROCK) this.map[y * W + x] = GROUND;
        }
      }
      this.computeFlow(); e = edges();
    }
    this.spawns = e;
  }

  /** First-stage victory unlocks one paused placement step; the battlefield and survivors carry over. */
  continueToCruiser() {
    if (this.phase !== "won" || this.level !== 1) return false;
    this.level = 2;
    this.phase = "shipLanding";
    this.selected = null;
    this.message = "Level 2: choose a clear 7×7 sector for the command cruiser.";
    return true;
  }

  canLandCruiser(tx: number, ty: number) {
    if (tx - CRUISER_RADIUS < 0 || ty - CRUISER_RADIUS < 0 || tx + CRUISER_RADIUS >= W || ty + CRUISER_RADIUS >= H) return false;
    for (let y = ty - CRUISER_RADIUS; y <= ty + CRUISER_RADIUS; y++) for (let x = tx - CRUISER_RADIUS; x <= tx + CRUISER_RADIUS; x++) {
      if (this.at(x, y) === ROCK || this.towers.some((t) => t.tx === x && t.ty === y)) return false;
    }
    return true;
  }

  landCruiser(tx: number, ty: number) {
    if (this.phase !== "shipLanding") return false;
    if (!this.canLandCruiser(tx, ty)) {
      this.message = "The cruiser needs a clear 7×7 sector without rock or towers.";
      return false;
    }
    for (let y = ty - CRUISER_RADIUS; y <= ty + CRUISER_RADIUS; y++) for (let x = tx - CRUISER_RADIUS; x <= tx + CRUISER_RADIUS; x++) {
      this.map[y * W + x] = GROUND;
    }
    this.core = { x: tx + 0.5, y: ty + 0.5, hp: CRUISER_HP, max: CRUISER_HP };
    this.hasCruiser = true;
    this.updateSpawnPoints(tx, ty);
    this.bg = null;
    this.phase = "playing";
    this.nextHorde = this.t + 12;
    this.fog.revealArea(this.core.x, this.core.y, 7);
    this.updateFog();
    this.message = "Cruiser down! All reinforcements now deploy from the ship. Endless hordes inbound.";
    return true;
  }

  newInfantry(tx: number, ty: number, kind: InfantryKind = "team"): Infantry {
    const p: Infantry = {
      id: this.nid++, kind, fireTeams: kind === "squad" ? SQUAD_FIRE_TEAMS : 1,
      x: this.core.x, y: this.core.y, tx: this.core.x, ty: this.core.y, path: [],
      soldiers: kind === "squad" ? SQUAD_SIZE : TEAM_SIZE, hp: SOLDIER_HP, cd: 0,
    };
    this.commandInfantry(p, tx, ty);
    return p;
  }

  /** One order moves the entire team or all three fire teams in a squad together. */
  commandInfantry(p: Infantry, x: number, y: number) {
    if (this.at(Math.floor(x), Math.floor(y)) === ROCK) {
      this.message = "Infantry can't cross sheer rock.";
      return false;
    }
    const path = this.findInfantryPath(p.x, p.y, x, y);
    if (!path.length) {
      this.message = "No infantry route to that position.";
      return false;
    }
    p.tx = x; p.ty = y; p.path = path;
    return true;
  }

  findInfantryPath(sx: number, sy: number, tx: number, ty: number) {
    const startX = Math.floor(sx), startY = Math.floor(sy), goalX = Math.floor(tx), goalY = Math.floor(ty);
    if (this.at(startX, startY) === ROCK || this.at(goalX, goalY) === ROCK) return [];
    const start = startY * W + startX, goal = goalY * W + goalX;
    if (start === goal) return [{ x: tx, y: ty }];
    const came = new Int32Array(W * H); came.fill(-1); came[start] = start;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      if (cur === goal) break;
      const x = cur % W, y = (cur / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || this.at(nx, ny) === ROCK) continue;
        // Do not cut diagonally between two impassable rock tiles.
        if (dx && dy && (this.at(x + dx, y) === ROCK || this.at(x, y + dy) === ROCK)) continue;
        const next = ny * W + nx;
        if (came[next] !== -1) continue;
        came[next] = cur; queue.push(next);
      }
    }
    if (came[goal] === -1) return [];
    const path: { x: number; y: number }[] = [];
    let cur = goal;
    while (cur !== start) {
      path.push({ x: (cur % W) + 0.5, y: ((cur / W) | 0) + 0.5 });
      cur = came[cur];
    }
    path.reverse();
    path[path.length - 1] = { x: tx, y: ty };
    return path;
  }

  // ---------- commands ----------
  dropInfantry(x: number, y: number) {
    return this.hasCruiser ? this.dropSquad(x, y) : this.dropTeam(x, y);
  }

  dropTeam(x: number, y: number) {
    if (this.hasCruiser) return (this.message = "Level 2 deploys full squads."), false;
    return this.deployInfantry(x, y, "team");
  }

  dropSquad(x: number, y: number) {
    if (!this.hasCruiser) return (this.message = "Squads require the Level 2 command cruiser."), false;
    return this.deployInfantry(x, y, "squad");
  }

  private deployInfantry(x: number, y: number, kind: InfantryKind) {
    if (this.phase !== "playing") return false;
    const cost = COST[kind], name = kind === "squad" ? "squad" : "team";
    if (this.credits < cost) return (this.message = `Not enough credits for a ${name}.`), false;
    if (this.at(Math.floor(x), Math.floor(y)) === ROCK) return (this.message = "Infantry can't stand on sheer rock."), false;
    const p = this.newInfantry(x, y, kind);
    if (!p.path.length && Math.hypot(p.x - x, p.y - y) > 0.01) return false;
    this.credits -= cost;
    this.infantry.push(p); this.selected = p.id;
    this.message = kind === "squad"
      ? "Squad deployed from the cruiser: three fire teams and one squad leader moving as one."
      : "Fresh team dropping at the LZ.";
    return true;
  }
  trainEngineer() {
    if (this.phase !== "playing") return false;
    if (this.credits < COST.engineer) return (this.message = "Not enough credits for an engineer."), false;
    this.credits -= COST.engineer;
    this.engineers.push({ id: this.nid++, x: this.core.x, y: this.core.y, hp: 40, job: null });
    this.message = this.hasCruiser ? "Engineer deployed from the cruiser." : "Engineer ready.";
    return true;
  }
  placeTower(tx: number, ty: number) {
    if (this.phase !== "playing") return false;
    if (this.at(tx, ty) === ROCK) return (this.message = "Can't build on rock."), false;
    if (this.towers.some((t) => t.tx === tx && t.ty === ty) || (Math.floor(this.core.x) === tx && Math.floor(this.core.y) === ty))
      return (this.message = "Tile occupied."), false;
    if (this.credits < COST.tower) return (this.message = "Not enough credits for a tower."), false;
    if (!this.engineers.length) return (this.message = "You need an engineer to build towers."), false;
    this.credits -= COST.tower;
    this.towers.push({ id: this.nid++, tx, ty, built: 0, hp: 300, cd: 0 });
    this.message = "Tower site marked. Engineers en route."; return true;
  }
  click(x: number, y: number) {
    const p = this.infantry.find((p) => Math.hypot(p.x - x, p.y - y) < 0.9);
    if (p) { this.selected = p.id; return; }
    const sel = this.infantry.find((p) => p.id === this.selected);
    if (sel) this.commandInfantry(sel, x, y);
  }

  // ---------- simulation ----------
  spawnBug(kind?: 0 | 1 | 2) {
    if (!this.spawns.length) return;
    const s = this.spawns[Math.floor(this.rand() * this.spawns.length)];
    const tankerChance = this.hasCruiser ? 0.14 : 0.08;
    const k = kind ?? (this.t > 150 && this.rand() < tankerChance ? 2 : this.rand() < 0.3 ? 1 : 0);
    const scale = 1 + this.t / 300 + (this.level - 1) * 0.35;
    const damageScale = 1 + (this.level - 1) * 0.25;
    const speedScale = 1 + (this.level - 1) * 0.08;
    const def = [
      { hp: 40, speed: 1.6, dmg: 14, r: 0.32, bounty: 3 },
      { hp: 18, speed: 3.0, dmg: 8, r: 0.24, bounty: 2 },
      { hp: 300, speed: 0.85, dmg: 45, r: 0.55, bounty: 15 },
    ][k];
    this.bugs.push({ x: (s % W) + this.rand(), y: ((s / W) | 0) + this.rand(), hp: def.hp * scale, max: def.hp * scale, speed: def.speed * speedScale, dmg: def.dmg * damageScale, r: def.r, kind: k, bounty: def.bounty });
  }

  killSoldier(p: Infantry) {
    p.soldiers--; p.hp = SOLDIER_HP; this.deaths++; this.lastDeath = this.t;
    this.splats.push({ x: p.x + (this.rand() - 0.5), y: p.y + (this.rand() - 0.5), life: 30, r: 0.25, green: false });
  }

  update(dt: number) {
    if (this.phase !== "playing") return;
    this.t += dt;
    this.credits += 4 * dt;

    // spawning
    this.spawnAcc += dt * (0.35 + this.t / 120) * (this.hasCruiser ? 1.35 : 1);
    while (this.spawnAcc >= 1) { this.spawnAcc--; this.spawnBug(); }
    if (this.t >= this.nextHorde) {
      this.wave++;
      const n = 14 + this.wave * 8 + (this.level - 1) * 12;
      for (let i = 0; i < n; i++) this.spawnBug(this.wave >= 3 && i % 12 === 0 ? 2 : undefined);
      this.nextHorde += this.hasCruiser ? 40 : 45;
      this.message = `HORDE ${this.wave} INBOUND — ${n} bugs!`;
    }

    // bugs
    for (const b of this.bugs) {
      const targets: { x: number; y: number; hit: (d: number) => void }[] = [];
      for (const p of this.infantry) targets.push({ x: p.x, y: p.y, hit: (d) => {
        const hg = this.at(Math.floor(p.x), Math.floor(p.y)) === HIGH ? 0.55 : 1;
        p.hp -= d * hg; while (p.hp <= 0 && p.soldiers > 0) { const over = -p.hp; this.killSoldier(p); p.hp -= over; }
      } });
      for (const e of this.engineers) targets.push({ x: e.x, y: e.y, hit: (d) => (e.hp -= d) });
      for (const t of this.towers) targets.push({ x: t.tx + 0.5, y: t.ty + 0.5, hit: (d) => (t.hp -= d) });
      targets.push({ x: this.core.x, y: this.core.y, hit: (d) => (this.core.hp -= d) });
      let best = null, bd = 1.6;
      for (const tg of targets) { const d = Math.hypot(tg.x - b.x, tg.y - b.y); if (d < bd) { bd = d; best = tg; } }
      if (best && bd < b.r + 0.45) { best.hit(b.dmg * dt); continue; }
      let mx = 0, my = 0;
      if (best) { mx = best.x - b.x; my = best.y - b.y; }
      else {
        const cx = Math.floor(b.x), cy = Math.floor(b.y);
        let bv = this.dist[cy * W + cx], bx = cx, by = cy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (this.at(nx, ny) === ROCK || (dx && dy && (this.at(cx + dx, cy) === ROCK || this.at(cx, cy + dy) === ROCK))) continue;
          const v = this.dist[ny * W + nx] + (dx && dy ? 0.4 : 0);
          if (v < bv) { bv = v; bx = nx; by = ny; }
        }
        mx = bx + 0.5 - b.x; my = by + 0.5 - b.y;
      }
      const l = Math.hypot(mx, my) || 1;
      const sp = b.speed * (this.at(Math.floor(b.x), Math.floor(b.y)) === HIGH ? 0.55 : 1);
      b.x += (mx / l) * sp * dt + (this.rand() - 0.5) * 0.04;
      b.y += (my / l) * sp * dt + (this.rand() - 0.5) * 0.04;
      if (this.at(Math.floor(b.x), Math.floor(b.y)) === ROCK) { b.x -= (mx / l) * sp * dt; b.y -= (my / l) * sp * dt; }
    }

    const nearestBug = (x: number, y: number, range: number) => {
      let best: Bug | null = null, bd = range;
      for (const b of this.bugs) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd && b.hp > 0) { bd = d; best = b; } }
      return best;
    };

    // Teams and squads follow tile-safe routes instead of crossing rock in a straight line.
    for (const p of this.infantry) {
      let movement = 2.4 * dt;
      while (movement > 0 && p.path.length) {
        const waypoint = p.path[0], dx = waypoint.x - p.x, dy = waypoint.y - p.y, d = Math.hypot(dx, dy);
        if (d <= movement || d < 0.02) {
          p.x = waypoint.x; p.y = waypoint.y; p.path.shift(); movement -= d;
        } else {
          p.x += (dx / d) * movement; p.y += (dy / d) * movement; movement = 0;
        }
      }
      p.cd -= dt;
      const high = this.at(Math.floor(p.x), Math.floor(p.y)) === HIGH;
      const tg = nearestBug(p.x, p.y, high ? 6.5 : 4.2);
      if (tg && p.cd <= 0) {
        p.cd = 0.45;
        tg.hp -= 6 * p.soldiers;
        this.tracers.push({ x1: p.x, y1: p.y, x2: tg.x, y2: tg.y, life: 0.08, tower: false });
      }
    }
    this.infantry = this.infantry.filter((p) => p.soldiers > 0);
    if (this.selected && !this.infantry.some((p) => p.id === this.selected)) this.selected = null;

    // engineers
    for (const e of this.engineers) {
      let job = this.towers.find((t) => t.id === e.job && t.built < 1);
      if (!job) {
        e.job = null;
        const free = this.towers.filter((t) => t.built < 1 && !this.engineers.some((o) => o.job === t.id));
        const any = free.length ? free : this.towers.filter((t) => t.built < 1);
        any.sort((a, b) => Math.hypot(a.tx - e.x, a.ty - e.y) - Math.hypot(b.tx - e.x, b.ty - e.y));
        job = any[0]; if (job) e.job = job.id;
      }
      const gx = job ? job.tx + 0.5 : this.core.x - 1, gy = job ? job.ty + 1.2 : this.core.y + 0.8;
      const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy);
      if (d > 0.15) { e.x += (dx / d) * Math.min(d, 2.6 * dt); e.y += (dy / d) * Math.min(d, 2.6 * dt); }
      else if (job) job.built = Math.min(1, job.built + dt / 6);
    }
    this.engineers = this.engineers.filter((e) => {
      if (e.hp <= 0) this.splats.push({ x: e.x, y: e.y, life: 30, r: 0.3, green: false });
      return e.hp > 0;
    });

    // towers
    for (const t of this.towers) {
      if (t.built < 1) continue;
      t.cd -= dt;
      const tg = nearestBug(t.tx + 0.5, t.ty + 0.5, this.towerRangeAt(t.tx, t.ty));
      if (tg && t.cd <= 0) {
        t.cd = 0.12; tg.hp -= 9;
        this.tracers.push({ x1: t.tx + 0.5, y1: t.ty + 0.5, x2: tg.x, y2: tg.y, life: 0.06, tower: true });
      }
    }
    this.towers = this.towers.filter((t) => t.hp > 0);

    // deaths
    this.bugs = this.bugs.filter((b) => {
      if (b.hp > 0) return true;
      this.kills++; this.credits += b.bounty;
      this.splats.push({ x: b.x, y: b.y, life: 20, r: b.r * 1.4, green: true });
      return false;
    });
    for (const tr of this.tracers) tr.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const s of this.splats) s.life -= dt;
    this.splats = this.splats.filter((s) => s.life > 0);
    if (this.splats.length > 400) this.splats.splice(0, this.splats.length - 400);

    this.updateFog();

    // win / lose
    if (this.core.hp <= 0) { this.phase = "lost"; this.message = this.hasCruiser ? "The command cruiser has been destroyed." : "The LZ has been overrun."; }
    else if (!this.infantry.length && !this.engineers.length) { this.phase = "lost"; this.message = "All units lost. The beachhead falls."; }
    else if (this.level === 1 && this.t >= WIN_AFTER && this.t - this.lastDeath >= HOLD_NEEDED) { this.phase = "won"; this.message = "The defenses hold. Beachhead secured!"; }
  }

  towerRangeAt(tx: number, ty: number) { return this.at(tx, ty) === HIGH ? 7 : 5.5; }

  updateFog() {
    const towerVision = this.towers.filter((t) => t.built >= 1).map((t) => ({
      x: t.tx + 0.5, y: t.ty + 0.5, range: this.towerRangeAt(t.tx, t.ty),
    }));
    this.fog.update(this.infantry, this.engineers, towerVision);
  }

  holdTime() { return Math.max(0, this.t - Math.max(this.lastDeath, 0)); }

  // ---------- render ----------
  drawBg() {
    const c = document.createElement("canvas"); c.width = W * T; c.height = H * T;
    const g = c.getContext("2d")!;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = this.map[y * W + x], alt = (x * 7 + y * 13) % 5 === 0;
      g.fillStyle = t === ROCK ? (alt ? C.rock2 : C.rock) : t === HIGH ? (alt ? C.high2 : C.high) : alt ? C.ground2 : C.ground;
      g.fillRect(x * T, y * T, T, T);
      if (t === HIGH) { g.fillStyle = "rgba(255,240,200,0.08)"; g.fillRect(x * T, y * T, T, 3); }
      if (t === ROCK) { g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x * T, y * T + T - 4, T, 4); }
    }
    this.bg = c;
  }

  render(ctx: CanvasRenderingContext2D, hover: { x: number; y: number } | null, mode: string) {
    if (!this.bg) this.drawBg();
    ctx.drawImage(this.bg!, 0, 0);
    for (const s of this.splats) {
      ctx.fillStyle = s.green ? C.goo : C.blood; ctx.globalAlpha = Math.min(0.7, s.life / 10);
      ctx.beginPath(); ctx.arc(s.x * T, s.y * T, s.r * T, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.phase === "landing") {
      if (hover) { ctx.strokeStyle = C.core; ctx.lineWidth = 2; ctx.strokeRect((Math.floor(hover.x) - 2) * T, (Math.floor(hover.y) - 2) * T, T * 5, T * 5); }
      return;
    }
    // core
    ctx.fillStyle = C.core; ctx.fillRect(this.core.x * T - 14, this.core.y * T - 14, 28, 28);
    ctx.strokeStyle = "#0b2a1f"; ctx.lineWidth = 3; ctx.strokeRect(this.core.x * T - 14, this.core.y * T - 14, 28, 28);
    this.bar(ctx, this.core.x, this.core.y - 1, this.core.hp / this.core.max, 1.6);
    // towers
    for (const t of this.towers) {
      const x = t.tx * T, y = t.ty * T;
      ctx.globalAlpha = t.built < 1 ? 0.45 : 1;
      ctx.fillStyle = C.tower; ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
      ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(x + T / 2, y + T / 2, 4, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      if (t.built < 1) this.bar(ctx, t.tx + 0.5, t.ty - 0.1, t.built, 1, "#ffb347");
      else if (t.hp < 300) this.bar(ctx, t.tx + 0.5, t.ty - 0.1, t.hp / 300, 1);
    }
    // engineers
    for (const e of this.engineers) {
      ctx.fillStyle = C.eng; ctx.beginPath(); ctx.moveTo(e.x * T, e.y * T - 6); ctx.lineTo(e.x * T + 6, e.y * T + 5); ctx.lineTo(e.x * T - 6, e.y * T + 5); ctx.fill();
    }
    // platoons
    for (const p of this.infantry) {
      const sel = p.id === this.selected;
      if (sel) {
        ctx.strokeStyle = C.infSel; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(p.x * T, p.y * T); ctx.lineTo(p.tx * T, p.ty * T); ctx.stroke(); ctx.setLineDash([]);
        const high = this.at(Math.floor(p.x), Math.floor(p.y)) === HIGH;
        ctx.strokeStyle = "rgba(255,211,77,0.35)"; ctx.beginPath(); ctx.arc(p.x * T, p.y * T, (high ? 6.5 : 4.2) * T, 0, 7); ctx.stroke();
      }
      for (let i = 0; i < p.soldiers; i++) {
        const a = (i / SQUAD) * Math.PI * 2;
        ctx.fillStyle = sel ? C.infSel : C.inf;
        ctx.beginPath(); ctx.arc(p.x * T + Math.cos(a) * 6, p.y * T + Math.sin(a) * 6, 3, 0, 7); ctx.fill();
      }
      this.bar(ctx, p.x, p.y - 0.8, p.soldiers / SQUAD, 1);
    }
    // bugs
    for (const b of this.bugs) {
      const x = b.x * T, y = b.y * T, r = b.r * T;
      ctx.strokeStyle = b.kind === 2 ? C.tank : C.bug; ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - r * 1.6, y + i * r * 0.6); ctx.lineTo(x + r * 1.6, y - i * r * 0.6); ctx.stroke(); }
      ctx.fillStyle = b.kind === 2 ? C.tank : C.bug; ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = C.bugEye; ctx.fillRect(x - 2, y - r, 4, 2);
      if (b.kind === 2) this.bar(ctx, b.x, b.y - b.r - 0.3, b.hp / b.max, 1.2);
    }
    // tracers
    for (const tr of this.tracers) {
      ctx.strokeStyle = tr.tower ? C.ttracer : C.tracer; ctx.lineWidth = tr.tower ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(tr.x1 * T, tr.y1 * T); ctx.lineTo(tr.x2 * T, tr.y2 * T); ctx.stroke();
    }
    // placement preview
    if (hover && mode === "tower") {
      const ok = this.at(Math.floor(hover.x), Math.floor(hover.y)) !== ROCK;
      const high = this.at(Math.floor(hover.x), Math.floor(hover.y)) === HIGH;
      ctx.strokeStyle = ok ? "rgba(160,255,255,0.8)" : "rgba(255,80,80,0.8)";
      ctx.strokeRect(Math.floor(hover.x) * T, Math.floor(hover.y) * T, T, T);
      ctx.beginPath(); ctx.arc((Math.floor(hover.x) + 0.5) * T, (Math.floor(hover.y) + 0.5) * T, (high ? 7 : 5.5) * T, 0, 7); ctx.stroke();
    }
    if (hover && mode === "platoon") {
      ctx.strokeStyle = "rgba(159,208,255,0.8)"; ctx.beginPath(); ctx.arc(hover.x * T, hover.y * T, 8, 0, 7); ctx.stroke();
    }
  }

  bar(ctx: CanvasRenderingContext2D, x: number, y: number, f: number, w: number, col?: string) {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x * T - (w * T) / 2, y * T, w * T, 3);
    ctx.fillStyle = col ?? (f > 0.5 ? "#7be07b" : f > 0.25 ? "#ffd34d" : "#ff5a3a");
    ctx.fillRect(x * T - (w * T) / 2, y * T, w * T * Math.max(0, f), 3);
  }
}
