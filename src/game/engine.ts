// @ts-nocheck -- hot-loop typed-array/grid indexing; strict indexed-access checks are disabled for this file only.
// Beachhead — pure game simulation + canvas renderer (no React).
import { FogOfWar } from "./fog";

export const T = 20;
export let W = 48;
export let H = 32;
/** Fit the map grid to the screen aspect ratio. Call before creating a Game. */
export function setMapSize(aspect: number) { H = 32; W = Math.max(32, Math.min(80, Math.round(32 * aspect))); }
export const GROUND = 0, HIGH = 1, ROCK = 2;

export const COST = { team: 60, squad: 180, engineer: 80, engineerTeam: 160, tower: 120, wall: 8 };
export const WALL_BUILD_TIME = 0.75;
export const ENGINEER_TEAM_SIZE = 4;
export const WIN_AFTER = 180; // seconds before victory can trigger
export const HOLD_NEEDED = 90; // seconds without an infantry death
export const CRUISER_RADIUS = 3; // 7×7-tile landing footprint
export const CRUISER_HP = 1400;
export const LEVEL_TWO_GRACE = 6;
export const LEVEL_TWO_FIRST_HORDE = 18;

type Bug = { x: number; y: number; hp: number; max: number; speed: number; dmg: number; r: number; kind: 0 | 1 | 2; bounty: number };
export type InfantryKind = "team" | "squad";
type MovableUnit = { x: number; y: number; tx: number; ty: number; path: { x: number; y: number }[] };
export type Infantry = MovableUnit & { id: number; kind: InfantryKind; fireTeams: number; soldiers: number; hp: number; cd: number };
export type Engineer = MovableUnit & { id: number; kind: "engineer" | "team"; members: number; hp: number; job: number | null; manualMove: boolean };
type Tower = { id: number; tx: number; ty: number; built: number; hp: number; cd: number };
export type WallSegment = { id: number; jobId: number; tx: number; ty: number; x: number; y: number; angle: number; built: number; paid: boolean };
export type WallJob = { id: number; engineerId: number | null; wallIds: number[] };
export type PerimeterStatus = { sealed: boolean; enemiesInside: number };
type Tracer = { x1: number; y1: number; x2: number; y2: number; life: number; tower: boolean };
type Splat = { x: number; y: number; life: number; r: number; green: boolean };

const SOLDIER_HP = 20;
// US Marine benchmark: four per fire team; three fire teams plus one squad leader.
export const TEAM_SIZE = 4, SQUAD_FIRE_TEAMS = 3, SQUAD_SIZE = TEAM_SIZE * SQUAD_FIRE_TEAMS + 1;
export const maxInfantrySoldiers = (unit: Infantry) => unit.kind === "squad" ? SQUAD_SIZE : TEAM_SIZE;
export type FormationSlot = { x: number; y: number; fireTeam: number | null };
const TEAM_FORMATION: FormationSlot[] = [
  { x: 0.28, y: 0, fireTeam: 0 }, { x: -0.12, y: -0.28, fireTeam: 0 },
  { x: -0.12, y: 0.28, fireTeam: 0 }, { x: -0.45, y: 0, fireTeam: 0 },
];
const SQUAD_FORMATION: FormationSlot[] = [
  ...[[0.05, -0.82], [0.05, 0.82], [-0.78, 0]].flatMap(([cx, cy], fireTeam) =>
    TEAM_FORMATION.map((slot) => ({ x: cx + slot.x, y: cy + slot.y, fireTeam }))),
  { x: 0.72, y: 0, fireTeam: null }, // squad leader
];
/** Fixed close-order slots keep all three fire teams together under one shared command. */
export const infantryFormation = (kind: InfantryKind) => kind === "squad" ? SQUAD_FORMATION : TEAM_FORMATION;
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
  levelStartedAt = 0;
  core = { x: 0, y: 0, hp: 600, max: 600 };
  bugs: Bug[] = [];
  infantry: Infantry[] = [];
  engineers: Engineer[] = [];
  towers: Tower[] = [];
  walls: WallSegment[] = [];
  wallJobs: WallJob[] = [];
  wallGrid = new Uint8Array(W * H);
  perimeter: PerimeterStatus = { sealed: false, enemiesInside: 0 };
  lastWallCreditWarning = -Infinity;
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
  wallAt(tx: number, ty: number) { return this.walls.find((w) => w.tx === tx && w.ty === ty); }
  /** Only finished walls block enemies; infantry and engineers can still cross their own lines. */
  isEnemyBlocked(tx: number, ty: number) {
    return this.at(tx, ty) === ROCK || (tx >= 0 && ty >= 0 && tx < W && ty < H && this.wallGrid[ty * W + tx] === 1);
  }

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
        if (this.isEnemyBlocked(nx, ny)) continue;
        const nd = d[cur] + (tt === HIGH ? 2.5 : 1);
        if (nd < d[ny * W + nx]) { if (d[ny * W + nx] === Infinity) open.push(ny * W + nx); d[ny * W + nx] = nd; }
      }
    }
  }

  newEngineer(kind: Engineer["kind"]): Engineer {
    return { id: this.nid++, kind, members: kind === "team" ? ENGINEER_TEAM_SIZE : 1, x: this.core.x, y: this.core.y, tx: this.core.x, ty: this.core.y, path: [], hp: 40, job: null, manualMove: false };
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
    const infantry = this.newInfantry(this.core.x, this.core.y + 1.5);
    this.infantry.push(infantry);
    this.selected = infantry.id;
    const engineer = this.newEngineer("engineer");
    engineer.x = this.core.x - 1;
    this.engineers.push(engineer);
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
    this.bugs = [];
    this.tracers = [];
    this.wave = 0;
    this.spawnAcc = 0;
    this.selected = null;
    this.message = "Level 2: choose a rock-free 7×7 sector. Installations beneath the cruiser will be removed.";
    return true;
  }

  canLandCruiser(tx: number, ty: number) {
    if (tx - CRUISER_RADIUS < 0 || ty - CRUISER_RADIUS < 0 || tx + CRUISER_RADIUS >= W || ty + CRUISER_RADIUS >= H) return false;
    for (let y = ty - CRUISER_RADIUS; y <= ty + CRUISER_RADIUS; y++) for (let x = tx - CRUISER_RADIUS; x <= tx + CRUISER_RADIUS; x++) {
      if (this.at(x, y) === ROCK) return false;
    }
    return true;
  }

  landCruiser(tx: number, ty: number) {
    if (this.phase !== "shipLanding") return false;
    if (!this.canLandCruiser(tx, ty)) {
      this.message = "The cruiser needs a rock-free 7×7 sector within the map.";
      return false;
    }
    const covered = (x: number, y: number) => Math.abs(x - tx) <= CRUISER_RADIUS && Math.abs(y - ty) <= CRUISER_RADIUS;
    for (let i = this.towers.length - 1; i >= 0; i--) {
      const tower = this.towers[i];
      if (covered(tower.tx, tower.ty)) this.towers.splice(i, 1);
    }
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const wall = this.walls[i];
      if (covered(wall.tx, wall.ty)) {
        this.wallGrid[wall.ty * W + wall.tx] = 0;
        this.walls.splice(i, 1);
      }
    }
    for (let i = this.wallJobs.length - 1; i >= 0; i--) {
      const job = this.wallJobs[i];
      job.wallIds = job.wallIds.filter((id) => this.walls.some((wall) => wall.id === id));
      if (!job.wallIds.length) this.wallJobs.splice(i, 1);
    }
    for (const engineer of this.engineers) {
      if (engineer.job !== null && !this.towers.some((tower) => tower.id === engineer.job)) engineer.job = null;
    }
    for (let y = ty - CRUISER_RADIUS; y <= ty + CRUISER_RADIUS; y++) for (let x = tx - CRUISER_RADIUS; x <= tx + CRUISER_RADIUS; x++) {
      this.map[y * W + x] = GROUND;
    }
    this.core = { x: tx + 0.5, y: ty + 0.5, hp: CRUISER_HP, max: CRUISER_HP };
    this.hasCruiser = true;
    // Surviving engineers are reorganized into four-person teams for the construction objective.
    for (const engineer of this.engineers) { engineer.kind = "team"; engineer.members = ENGINEER_TEAM_SIZE; engineer.hp = 40; }
    this.updateSpawnPoints(tx, ty);
    this.bg = null;
    this.phase = "playing";
    this.levelStartedAt = this.t;
    this.bugs = [];
    this.wave = 0;
    this.spawnAcc = 0;
    this.nextHorde = this.t + LEVEL_TWO_FIRST_HORDE;
    this.fog.revealArea(this.core.x, this.core.y, 7);
    this.updateFog();
    this.perimeter = this.perimeterStatus();
    this.message = "Cruiser down! Forward-deploy squads to protect engineers, then drag wall lines with [4].";
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

  /** Shared movement order for every troop type, including engineers. */
  commandInfantry(p: MovableUnit, x: number, y: number) {
    if (this.at(Math.floor(x), Math.floor(y)) === ROCK) {
      this.message = "Units can't cross sheer rock.";
      return false;
    }
    const path = this.findInfantryPath(p.x, p.y, x, y);
    if (!path.length) {
      this.message = "No route to that position.";
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

  /** Existing infantry waypoint movement, shared with engineering units. */
  private advanceMovement(p: MovableUnit, movement: number) {
    while (movement > 0 && p.path.length) {
      const waypoint = p.path[0], dx = waypoint.x - p.x, dy = waypoint.y - p.y, d = Math.hypot(dx, dy);
      if (d <= movement || d < 0.02) {
        p.x = waypoint.x; p.y = waypoint.y; p.path.shift(); movement -= d;
      } else {
        p.x += (dx / d) * movement; p.y += (dy / d) * movement; movement = 0;
      }
    }
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
    return this.hasCruiser ? this.trainEngineerTeam() : this.deployEngineer("engineer");
  }
  trainEngineerTeam() {
    if (!this.hasCruiser) return (this.message = "Engineer teams require the Level 2 command cruiser."), false;
    return this.deployEngineer("team");
  }
  private deployEngineer(kind: Engineer["kind"]) {
    if (this.phase !== "playing") return false;
    const cost = kind === "team" ? COST.engineerTeam : COST.engineer;
    if (this.credits < cost) return (this.message = `Not enough credits for an ${kind === "team" ? "engineer team" : "engineer"}.`), false;
    this.credits -= cost;
    const engineer = this.newEngineer(kind);
    this.engineers.push(engineer);
    this.selected = engineer.id;
    this.message = kind === "team" ? "Four-person engineer team deployed from the cruiser." : "Engineer ready.";
    return true;
  }

  /** One center per crossed tile, all on the exact line and no more than one wall-width apart. */
  wallLine(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1, dy = y2 - y1;
    const length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
    if (!length) return [{ tx: Math.floor(x1), ty: Math.floor(y1), x: x1, y: y1, angle }];

    // Walk every grid boundary exactly; sampling alone can jump over a clipped corner tile.
    const spans: { tx: number; ty: number; start: number; end: number }[] = [];
    let tx = Math.floor(x1), ty = Math.floor(y1), t = 0;
    const stepX = Math.sign(dx), stepY = Math.sign(dy);
    const deltaX = dx ? Math.abs(1 / dx) : Infinity, deltaY = dy ? Math.abs(1 / dy) : Infinity;
    let maxX = dx > 0 ? (tx + 1 - x1) / dx : dx < 0 ? (tx - x1) / dx : Infinity;
    let maxY = dy > 0 ? (ty + 1 - y1) / dy : dy < 0 ? (ty - y1) / dy : Infinity;
    spans.push({ tx, ty, start: 0, end: 0 });
    while (t < 1 && spans.length < 10000) {
      const next = Math.min(maxX, maxY, 1);
      spans[spans.length - 1].end = next * length;
      t = next;
      if (t >= 1) break;
      if (maxX < maxY) { tx += stepX; maxX += deltaX; }
      else if (maxY < maxX) { ty += stepY; maxY += deltaY; }
      else { tx += stepX; ty += stepY; maxX += deltaX; maxY += deltaY; }
      spans.push({ tx, ty, start: t * length, end: t * length });
    }

    // Choose a point in each tile span with reachable, gap-free spacing. Endpoints stay exact.
    const epsilon = 0.000001;
    const reachable: { low: number; high: number }[] = [{ low: 0, high: 0 }];
    let possible = true;
    for (let i = 1; i < spans.length; i++) {
      const previous = reachable[i - 1], span = spans[i];
      const low = Math.max(span.start, previous.low + epsilon);
      const high = Math.min(i === spans.length - 1 ? length : span.end, previous.high + 1);
      if (low > high + epsilon) { possible = false; break; }
      reachable.push({ low, high });
    }
    const positions: number[] = [];
    if (possible) {
      positions[spans.length - 1] = length;
      for (let i = spans.length - 1; i > 0; i--) {
        const previous = reachable[i - 1], position = positions[i];
        const low = Math.max(previous.low, position - 1);
        const high = Math.min(previous.high, position - epsilon);
        if (low > high + epsilon) { possible = false; break; }
        positions[i - 1] = i === 1 ? 0 : high;
      }
    }
    return spans.map((span, i) => {
      const position = possible ? positions[i] : i === 0 ? 0 : i === spans.length - 1 ? length : (span.start + span.end) / 2;
      const f = position / length;
      return { tx: span.tx, ty: span.ty, x: x1 + dx * f, y: y1 + dy * f, angle };
    });
  }

  canBuildWallAt(tx: number, ty: number) {
    return tx >= 0 && ty >= 0 && tx < W && ty < H && this.at(tx, ty) !== ROCK && !this.wallAt(tx, ty)
      && !this.towers.some((t) => t.tx === tx && t.ty === ty)
      && !(Math.floor(this.core.x) === tx && Math.floor(this.core.y) === ty);
  }

  wallPlan(x1: number, y1: number, x2: number, y2: number) {
    const tiles = this.wallLine(x1, y1, x2, y2);
    const buildable = tiles.filter(({ tx, ty }) => this.canBuildWallAt(tx, ty));
    const continuous = tiles.every((tile, i) => {
      if (!i) return true;
      const previous = tiles[i - 1];
      const tileSteps = Math.max(Math.abs(tile.tx - previous.tx), Math.abs(tile.ty - previous.ty));
      return tileSteps === 1 && Math.hypot(tile.x - previous.x, tile.y - previous.y) <= 1.000001;
    });
    const blocked = tiles.length - buildable.length;
    return { tiles, buildable, blocked, continuous, valid: blocked === 0 && continuous };
  }

  nextWallSegment(job: WallJob) {
    for (const id of job.wallIds) {
      const segment = this.walls.find((w) => w.id === id);
      if (segment && segment.built < 1) return segment;
    }
    return undefined;
  }

  activeWallJob(engineerId: number) {
    return this.wallJobs.find((job) => job.engineerId === engineerId && this.nextWallSegment(job));
  }

  assignWallJob(job: WallJob) {
    const first = this.nextWallSegment(job);
    const teams = this.engineers.filter((e) => e.kind === "team" && e.members > 0);
    if (!first || !teams.length) return false;
    teams.sort((a, b) => {
      const queueA = this.wallJobs.filter((j) => j.engineerId === a.id && this.nextWallSegment(j)).length;
      const queueB = this.wallJobs.filter((j) => j.engineerId === b.id && this.nextWallSegment(j)).length;
      return queueA - queueB || Math.hypot(a.x - first.tx, a.y - first.ty) - Math.hypot(b.x - first.tx, b.y - first.ty);
    });
    job.engineerId = teams[0].id;
    return true;
  }

  buildWall(x1: number, y1: number, x2: number, y2: number) {
    if (this.phase !== "playing" || !this.hasCruiser) return (this.message = "Walls unlock with the Level 2 engineer teams."), false;
    if (!this.engineers.some((e) => e.kind === "team" && e.members > 0)) return (this.message = "Deploy an engineer team before marking a wall."), false;
    const plan = this.wallPlan(x1, y1, x2, y2);
    if (!plan.valid) return (this.message = "Wall not started: redraw a continuous line with no red blocked segments."), false;
    const jobId = this.nid++;
    const job: WallJob = { id: jobId, engineerId: null, wallIds: [] };
    for (const { tx, ty, x, y, angle } of plan.tiles) {
      const segment: WallSegment = { id: this.nid++, jobId, tx, ty, x, y, angle, built: 0, paid: false };
      this.walls.push(segment); job.wallIds.push(segment.id);
    }
    this.wallJobs.push(job); this.assignWallJob(job);
    this.message = `Wall marked: ${plan.tiles.length} connected segments, built in drag order for ${COST.wall} credits each.`;
    return true;
  }

  placeTower(tx: number, ty: number) {
    if (this.phase !== "playing") return false;
    if (this.at(tx, ty) === ROCK) return (this.message = "Can't build on rock."), false;
    if (this.towers.some((t) => t.tx === tx && t.ty === ty) || this.wallAt(tx, ty) || (Math.floor(this.core.x) === tx && Math.floor(this.core.y) === ty))
      return (this.message = "Tile occupied."), false;
    if (this.credits < COST.tower) return (this.message = "Not enough credits for a tower."), false;
    if (!this.engineers.length) return (this.message = "You need an engineer to build towers."), false;
    this.credits -= COST.tower;
    this.towers.push({ id: this.nid++, tx, ty, built: 0, hp: 300, cd: 0 });
    this.message = "Tower site marked. Engineers en route."; return true;
  }
  unselect() { this.selected = null; }

  click(x: number, y: number) {
    const p = this.infantry.find((p) => Math.hypot(p.x - x, p.y - y) < (p.kind === "squad" ? 1.5 : 0.9));
    if (p) { this.selected = p.id; return; }
    const engineer = this.engineers.find((e) => Math.hypot(e.x - x, e.y - y) < 0.9);
    if (engineer) { this.selected = engineer.id; return; }
    const selectedUnit = this.infantry.find((unit) => unit.id === this.selected) ?? this.engineers.find((unit) => unit.id === this.selected);
    if (selectedUnit && this.commandInfantry(selectedUnit, x, y) && "manualMove" in selectedUnit) selectedUnit.manualMove = true;
  }

  // ---------- simulation ----------
  spawnBug(kind?: 0 | 1 | 2) {
    const available = this.spawns.filter((s) => !this.isEnemyBlocked(s % W, (s / W) | 0));
    if (!available.length) return;
    const s = available[Math.floor(this.rand() * available.length)];
    const tankerChance = this.hasCruiser ? 0.14 : 0.08;
    const elapsed = this.hasCruiser ? Math.max(0, this.t - this.levelStartedAt - LEVEL_TWO_GRACE) : this.t;
    const k = kind ?? (elapsed > 150 && this.rand() < tankerChance ? 2 : this.rand() < 0.3 ? 1 : 0);
    const scale = 1 + elapsed / 300 + (this.level - 1) * 0.35;
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
    const levelElapsed = this.t - this.levelStartedAt;
    const attackElapsed = Math.max(0, levelElapsed - LEVEL_TWO_GRACE);
    const spawnRate = this.hasCruiser
      ? levelElapsed <= LEVEL_TWO_GRACE ? 0 : (0.3 + attackElapsed / 110) * 1.35
      : 0.35 + this.t / 120;
    this.spawnAcc += dt * spawnRate;
    while (this.spawnAcc >= 1) { this.spawnAcc--; this.spawnBug(); }
    if (this.t >= this.nextHorde) {
      this.wave++;
      const n = (this.hasCruiser ? 30 : 14) + this.wave * (this.hasCruiser ? 12 : 8);
      for (let i = 0; i < n; i++) this.spawnBug(this.wave >= 3 && i % 12 === 0 ? 2 : undefined);
      this.nextHorde += this.hasCruiser ? Math.max(40, 65 - this.wave * 5) : 45;
      this.message = `HORDE ${this.wave} INBOUND — ${n} bugs!`;
    }

    // bugs
    for (const b of this.bugs) {
      const targets: { x: number; y: number; hit: (d: number) => void }[] = [];
      for (const p of this.infantry) targets.push({ x: p.x, y: p.y, hit: (d) => {
        const hg = this.at(Math.floor(p.x), Math.floor(p.y)) === HIGH ? 0.55 : 1;
        p.hp -= d * hg; while (p.hp <= 0 && p.soldiers > 0) { const over = -p.hp; this.killSoldier(p); p.hp -= over; }
      } });
      for (const e of this.engineers) targets.push({ x: e.x, y: e.y, hit: (d) => {
        e.hp -= d;
        while (e.hp <= 0 && e.members > 0) { const over = -e.hp; e.members--; e.hp = 40; e.hp -= over; }
      } });
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
          if (this.isEnemyBlocked(nx, ny) || (dx && dy && (this.isEnemyBlocked(cx + dx, cy) || this.isEnemyBlocked(cx, cy + dy)))) continue;
          const v = this.dist[ny * W + nx] + (dx && dy ? 0.4 : 0);
          if (v < bv) { bv = v; bx = nx; by = ny; }
        }
        mx = bx + 0.5 - b.x; my = by + 0.5 - b.y;
      }
      const l = Math.hypot(mx, my) || 1;
      const sp = b.speed * (this.at(Math.floor(b.x), Math.floor(b.y)) === HIGH ? 0.55 : 1);
      const oldX = b.x, oldY = b.y;
      b.x += (mx / l) * sp * dt + (this.rand() - 0.5) * 0.04;
      b.y += (my / l) * sp * dt + (this.rand() - 0.5) * 0.04;
      if (this.isEnemyBlocked(Math.floor(b.x), Math.floor(b.y))) { b.x = oldX; b.y = oldY; }
    }

    const nearestBug = (x: number, y: number, range: number) => {
      let best: Bug | null = null, bd = range;
      for (const b of this.bugs) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd && b.hp > 0) { bd = d; best = b; } }
      return best;
    };

    // Teams and squads follow tile-safe routes instead of crossing rock in a straight line.
    for (const p of this.infantry) {
      this.advanceMovement(p, 2.4 * dt);
      p.cd -= dt;
      const high = this.at(Math.floor(p.x), Math.floor(p.y)) === HIGH;
      const tg = nearestBug(p.x, p.y, high ? 6.5 : 4.2);
      if (tg && p.cd <= 0) {
        p.cd = 0.45;
        tg.hp -= 6 * p.soldiers;
        const volleys = p.kind === "squad" ? [[0, -0.82], [0, 0.82], [-0.78, 0]] : [[0, 0]];
        for (const [ox, oy] of volleys) this.tracers.push({ x1: p.x + ox, y1: p.y + oy, x2: tg.x, y2: tg.y, life: 0.08, tower: false });
      }
    }
    this.infantry = this.infantry.filter((p) => p.soldiers > 0);

    // Cancel a fallen builder's unfinished work before anyone can take it over.
    const fallenEngineers = this.engineers.filter((e) => e.members <= 0 || e.hp <= 0);
    if (fallenEngineers.length) {
      const fallenIds = new Set(fallenEngineers.map((e) => e.id));
      const towerIds = new Set(fallenEngineers.map((e) => e.job).filter((id) => id !== null));
      const wallJobIds = new Set(this.wallJobs.filter((job) => fallenIds.has(job.engineerId)).map((job) => job.id));
      this.towers = this.towers.filter((tower) => tower.built >= 1 || !towerIds.has(tower.id));
      this.walls = this.walls.filter((wall) => wall.built >= 1 || !wallJobIds.has(wall.jobId));
      this.wallJobs = this.wallJobs.filter((job) => !wallJobIds.has(job.id));
      for (const e of fallenEngineers) this.splats.push({ x: e.x, y: e.y, life: 30, r: 0.3, green: false });
      this.engineers = this.engineers.filter((e) => !fallenIds.has(e.id));
    }

    // Engineer teams prioritize queued wall lines, then return to automatic tower construction.
    for (const job of this.wallJobs) {
      if (!this.nextWallSegment(job)) continue;
      const assigned = this.engineers.some((e) => e.id === job.engineerId && e.kind === "team" && e.members > 0);
      if (!assigned) { job.engineerId = null; this.assignWallJob(job); }
    }
    for (const e of this.engineers) {
      if (e.manualMove) {
        this.advanceMovement(e, 2.6 * dt);
        if (!e.path.length) e.manualMove = false;
        continue;
      }
      const wallJob = this.activeWallJob(e.id), segment = wallJob ? this.nextWallSegment(wallJob) : undefined;
      let job = segment ? undefined : this.towers.find((t) => t.id === e.job && t.built < 1);
      if (!segment && !job) {
        e.job = null;
        const free = this.towers.filter((t) => t.built < 1 && !this.engineers.some((o) => o.job === t.id));
        const any = free.length ? free : this.towers.filter((t) => t.built < 1);
        any.sort((a, b) => Math.hypot(a.tx - e.x, a.ty - e.y) - Math.hypot(b.tx - e.x, b.ty - e.y));
        job = any[0]; if (job) e.job = job.id;
      }
      if (!segment && !job) continue;
      const gx = segment ? segment.x : job.tx + 0.5;
      const gy = segment ? segment.y : this.at(job.tx, Math.floor(job.ty + 1.2)) === ROCK ? job.ty + 0.5 : job.ty + 1.2;
      const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy);
      if (d > 0.15) {
        if (e.tx !== gx || e.ty !== gy || !e.path.length) this.commandInfantry(e, gx, gy);
        this.advanceMovement(e, 2.6 * dt);
      }
      else if (segment) {
        if (!segment.paid) {
          if (this.credits >= COST.wall) { this.credits -= COST.wall; segment.paid = true; }
          else if (this.t - this.lastWallCreditWarning >= 2) {
            this.lastWallCreditWarning = this.t;
            this.message = `Wall construction paused: ${COST.wall} credits needed for the next segment.`;
          }
        }
        if (segment.paid) {
          segment.built = Math.min(1, segment.built + dt / WALL_BUILD_TIME);
          if (segment.built >= 1 && !this.wallGrid[segment.ty * W + segment.tx]) {
            this.wallGrid[segment.ty * W + segment.tx] = 1;
            this.computeFlow();
            this.message = `Wall segment secured. ${this.walls.filter((w) => w.built >= 1).length} completed.`;
          }
        }
      }
      else if (job) job.built = Math.min(1, job.built + dt / 6);
    }
    if (this.selected && !this.infantry.some((p) => p.id === this.selected) && !this.engineers.some((e) => e.id === this.selected)) this.unselect();

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
    if (this.hasCruiser) this.perimeter = this.perimeterStatus();

    // win / lose
    if (this.core.hp <= 0) { this.phase = "lost"; this.message = this.hasCruiser ? "The command cruiser has been destroyed." : "The LZ has been overrun."; }
    else if (!this.infantry.length && !this.engineers.length) { this.phase = "lost"; this.message = "All units lost. The beachhead falls."; }
    else if (this.level === 1 && this.t >= WIN_AFTER && this.t - this.lastDeath >= HOLD_NEEDED) { this.phase = "won"; this.message = "The defenses hold. Beachhead secured!"; }
    else if (this.level === 2 && this.perimeter.sealed && this.perimeter.enemiesInside === 0) {
      this.phase = "won"; this.message = "Perimeter sealed and clear. Landing zone secured!";
    }
  }

  /** Flood from the map edges: if outside ground cannot reach the cruiser, its perimeter is sealed. */
  perimeterStatus(): PerimeterStatus {
    const size = W * H, exterior = new Uint8Array(size), queue = new Int32Array(size);
    let head = 0, tail = 0;
    const addExterior = (tx: number, ty: number) => {
      const index = ty * W + tx;
      if (exterior[index] || this.isEnemyBlocked(tx, ty)) return;
      exterior[index] = 1; queue[tail++] = index;
    };
    for (let x = 0; x < W; x++) { addExterior(x, 0); addExterior(x, H - 1); }
    for (let y = 0; y < H; y++) { addExterior(0, y); addExterior(W - 1, y); }
    while (head < tail) {
      const cur = queue[head++], x = cur % W, y = (cur / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) addExterior(nx, ny);
      }
    }
    const coreIndex = Math.floor(this.core.y) * W + Math.floor(this.core.x);
    if (exterior[coreIndex]) return { sealed: false, enemiesInside: 0 };

    // Only contacts in the cruiser's own sealed region delay completion, not separate pockets or outside hordes.
    const inside = new Uint8Array(size);
    head = 0; tail = 0; queue[tail++] = coreIndex; inside[coreIndex] = 1;
    while (head < tail) {
      const cur = queue[head++], x = cur % W, y = (cur / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const next = ny * W + nx;
        if (inside[next] || this.isEnemyBlocked(nx, ny)) continue;
        inside[next] = 1; queue[tail++] = next;
      }
    }
    let enemiesInside = 0;
    for (const bug of this.bugs) if (bug.hp > 0 && inside[Math.floor(bug.y) * W + Math.floor(bug.x)]) enemiesInside++;
    return { sealed: true, enemiesInside };
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
    // infantry teams and squads
    for (const p of this.infantry) {
      const sel = p.id === this.selected;
      if (sel) {
        ctx.strokeStyle = C.infSel; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(p.x * T, p.y * T); ctx.lineTo(p.tx * T, p.ty * T); ctx.stroke(); ctx.setLineDash([]);
        const high = this.at(Math.floor(p.x), Math.floor(p.y)) === HIGH;
        ctx.strokeStyle = "rgba(255,211,77,0.35)"; ctx.beginPath(); ctx.arc(p.x * T, p.y * T, (high ? 6.5 : 4.2) * T, 0, 7); ctx.stroke();
      }
      for (let i = 0; i < p.soldiers; i++) {
        const a = (i / maxInfantrySoldiers(p)) * Math.PI * 2;
        ctx.fillStyle = sel ? C.infSel : C.inf;
        ctx.beginPath(); ctx.arc(p.x * T + Math.cos(a) * 6, p.y * T + Math.sin(a) * 6, 3, 0, 7); ctx.fill();
      }
      this.bar(ctx, p.x, p.y - 0.8, p.soldiers / maxInfantrySoldiers(p), 1);
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
    if (hover && mode === "infantry") {
      ctx.strokeStyle = "rgba(159,208,255,0.8)"; ctx.beginPath(); ctx.arc(hover.x * T, hover.y * T, 8, 0, 7); ctx.stroke();
    }
  }

  bar(ctx: CanvasRenderingContext2D, x: number, y: number, f: number, w: number, col?: string) {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x * T - (w * T) / 2, y * T, w * T, 3);
    ctx.fillStyle = col ?? (f > 0.5 ? "#7be07b" : f > 0.25 ? "#ffd34d" : "#ff5a3a");
    ctx.fillRect(x * T - (w * T) / 2, y * T, w * T * Math.max(0, f), 3);
  }
}
