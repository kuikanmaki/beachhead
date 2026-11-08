// @ts-nocheck -- WebAudio synth; strict indexed-access checks disabled for this file only.
// Positional battlefield audio: only events within earshot of a living trooper/engineer are played.
import type { Game } from "./engine";

const EAR = 9; // tiles a trooper can hear
let ac: AudioContext | null = null, master: GainNode | null = null, noise: AudioBuffer | null = null;
export let muted = false;
export function setMuted(m: boolean) { muted = m; if (master) master.gain.value = m ? 0 : 0.7; }

export function unlockAudio() {
  if (!ac) {
    ac = new AudioContext();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.7;
    const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === "suspended") ac.resume();
}

function out(vol: number, pan: number) {
  const g = ac!.createGain(); g.gain.value = vol;
  const p = ac!.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p); p.connect(master!); return g;
}
function env(g: AudioParam, t: number, peak: number, dur: number) {
  g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(peak, t + 0.005); g.exponentialRampToValueAtTime(0.0001, t + dur);
}
function noiseHit(dest: AudioNode, type: BiquadFilterType, freq: number, dur: number, peak = 1, q = 1, sweepTo?: number) {
  const t = ac!.currentTime, s = ac!.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ac!.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ac!.createGain(); env(g.gain, t, peak, dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5, dur + 0.05);
}
function tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, peak = 0.5) {
  const t = ac!.currentTime, o = ac!.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac!.createGain(); env(g.gain, t, peak, dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}

const SFX = {
  rifle: (d: AudioNode) => { noiseHit(d, "bandpass", 1800, 0.09, 1, 0.8); tone(d, "square", 180, 60, 0.05, 0.25); },
  mg: (d: AudioNode) => { noiseHit(d, "highpass", 900, 0.05, 0.8); tone(d, "triangle", 120, 50, 0.04, 0.3); },
  squelch: (d: AudioNode) => { noiseHit(d, "lowpass", 900, 0.22, 0.9, 4, 150); tone(d, "sine", 220, 50, 0.2, 0.4); },
  screech: (d: AudioNode) => { tone(d, "sawtooth", 700 + Math.random() * 300, 1500 + Math.random() * 500, 0.28, 0.12); noiseHit(d, "bandpass", 3000, 0.25, 0.3, 6); },
  scream: (d: AudioNode) => { tone(d, "sawtooth", 520, 220, 0.45, 0.22); noiseHit(d, "bandpass", 1200, 0.4, 0.4, 3); },
  weld: (d: AudioNode) => { noiseHit(d, "highpass", 4000, 0.12, 0.35); tone(d, "square", 2200, 1800, 0.03, 0.08); },
  clank: (d: AudioNode) => { tone(d, "triangle", 900, 700, 0.12, 0.25); tone(d, "sine", 2300, 2100, 0.08, 0.1); },
  siren: (d: AudioNode) => { const t = ac!.currentTime, o = ac!.createOscillator(), g = ac!.createGain(); o.type = "sawtooth";
    for (let i = 0; i < 6; i++) o.frequency.setValueAtTime(i % 2 ? 520 : 680, t + i * 0.3);
    g.gain.setValueAtTime(0.12, t); g.gain.linearRampToValueAtTime(0.0001, t + 1.8); const f = ac!.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1800;
    o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + 1.9); },
  rumble: (d: AudioNode) => { noiseHit(d, "lowpass", 400, 2.2, 1, 1, 60); tone(d, "sine", 70, 35, 2, 0.5); },
};

// earshot: distance from the closest living friendly
function hear(g: Game, x: number, y: number) {
  let best = Infinity, lx = 0;
  for (const p of g.infantry) { const d = Math.hypot(p.x - x, p.y - y); if (d < best) { best = d; lx = p.x; } }
  for (const e of g.engineers) { const d = Math.hypot(e.x - x, e.y - y); if (d < best) { best = d; lx = e.x; } }
  if (best > EAR) return null;
  const f = 1 - best / EAR;
  return { vol: f * f, pan: (x - lx) / EAR };
}

const seen = new WeakSet<object>();
let budget = 0, lastT = 0, lastWave = 0, lastPhase = "", screechCd = 0, weldCd = 0;

function play(g: Game, name: keyof typeof SFX, x: number, y: number, gain = 1) {
  if (budget <= 0) return;
  const h = hear(g, x, y); if (!h || h.vol < 0.02) return;
  budget--; SFX[name](out(h.vol * gain, h.pan));
}

/** Call once per frame after the simulation step. */
export function audioTick(g: Game, dt: number) {
  if (!ac || muted || ac.state !== "running") { // still mark events so they don't replay later
    for (const t of g.tracers) seen.add(t); for (const s of g.splats) seen.add(s); lastWave = g.wave; lastPhase = g.phase; return;
  }
  budget = 8;
  if (g.phase !== lastPhase) {
    if (g.phase === "playing" && (lastPhase === "landing" || lastPhase === "shipLanding")) SFX.rumble(out(lastPhase === "shipLanding" ? 0.9 : 0.6, 0));
    lastPhase = g.phase;
  }
  if (g.wave !== lastWave) { lastWave = g.wave; if (g.infantry.length || g.engineers.length) SFX.siren(out(0.8, 0)); }
  for (const s of g.splats) if (!seen.has(s)) { seen.add(s); play(g, s.green ? "squelch" : "scream", s.x, s.y, s.green ? 0.5 : 1); }
  let shots = 0;
  for (const t of g.tracers) if (!seen.has(t)) { seen.add(t); if (shots++ < 4) play(g, t.tower ? "mg" : "rifle", t.x1, t.y1, t.tower ? 0.45 : 0.6); }
  screechCd -= dt;
  if (screechCd <= 0) {
    screechCd = 0.4 + Math.random() * 0.6;
    const near = g.bugs.filter((b) => g.infantry.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < 4));
    if (near.length) { const b = near[Math.floor(Math.random() * near.length)]; play(g, "screech", b.x, b.y, 0.7); }
  }
  weldCd -= dt;
  if (weldCd <= 0) {
    weldCd = 0.28;
    for (const e of g.engineers) {
      const job = g.towers.find((t) => t.id === e.job && t.built < 1);
      const wallJob = g.activeWallJob(e.id), wall = wallJob ? g.nextWallSegment(wallJob) : undefined;
      const buildingTower = job && Math.hypot(job.tx + 0.5 - e.x, job.ty + 1.2 - e.y) < 0.2;
      const buildingWall = wall && wall.paid && Math.hypot(wall.x - e.x, wall.y - e.y) < 0.2;
      if (buildingTower || buildingWall) play(g, Math.random() < 0.5 ? "weld" : "clank", e.x, e.y, 0.5);
    }
  }
  lastT += dt;
}
