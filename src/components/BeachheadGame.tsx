import { useEffect, useRef, useState } from "react";
import { Game, T, W, H, COST, WIN_AFTER, HOLD_NEEDED, setMapSize } from "@/game/engine";
import { renderGame, RS } from "@/game/render";
import { audioTick, unlockAudio, setMuted } from "@/game/sound";
import { panCamera, resetCamera, screenToWorld, wheelZoom, zoomCamera, type Camera } from "@/game/camera";

type Mode = "select" | "platoon" | "tower";

const freshGame = () => {
  if (typeof window !== "undefined") setMapSize(window.innerWidth / window.innerHeight);
  return new Game();
};

export function BeachheadGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const modeRef = useRef<Mode>("select");
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<Camera>(resetCamera());
  const [mode, setModeState] = useState<Mode>("select");
  const [zoom, setZoom] = useState(1);
  const [mute, setMute] = useState(false);
  const [, setTick] = useState(0);
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };
  const toggleMute = () => setMute((m) => { setMuted(!m); return !m; });
  const applyZoom = (next: number, u = 0.5, v = 0.5) => {
    cameraRef.current = zoomCamera(cameraRef.current, next, u, v);
    setZoom(cameraRef.current.zoom);
  };
  const resetView = () => { cameraRef.current = resetCamera(); setZoom(1); };

  useEffect(() => {
    gameRef.current = freshGame();
    setTick((t) => t + 1);
    let raf = 0, last = performance.now(), hud = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const g = gameRef.current!, cv = canvasRef.current;
      if (cv) {
        if (cv.width !== W * T * RS || cv.height !== H * T * RS) { cv.width = W * T * RS; cv.height = H * T * RS; }
        g.update(dt);
        audioTick(g, dt);
        renderGame(g, cv.getContext("2d")!, hoverRef.current, modeRef.current, cameraRef.current);
      }
      hud += dt;
      if (hud > 0.15) { hud = 0; setTick((t) => t + 1); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => {
      unlockAudio();
      if (e.key === "1") setMode("platoon");
      if (e.key === "2") gameRef.current?.trainEngineer();
      if (e.key === "3") setMode("tower");
      if (e.key === "Escape") setMode("select");
      if (e.key === "0") { cameraRef.current = resetCamera(); setZoom(1); }
      if (e.key === "m" || e.key === "M") toggleMute();
    };
    const cv = canvasRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const u = (e.clientX - rect.left) / rect.width, v = (e.clientY - rect.top) / rect.height;
      cameraRef.current = wheelZoom(cameraRef.current, e.deltaY, e.deltaMode, u, v);
      setZoom(cameraRef.current.zoom);
    };
    cv?.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlockAudio);
    return () => {
      cancelAnimationFrame(raf);
      cv?.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlockAudio);
    };
  }, []);

  const toWorld = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return screenToWorld(cameraRef.current, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  const onClick = (e: React.MouseEvent) => {
    const g = gameRef.current, p = toWorld(e);
    if (!g) return;
    if (g.phase === "landing") return void g.land(Math.floor(p.x), Math.floor(p.y));
    if (g.phase !== "playing") return;
    if (modeRef.current === "platoon") { if (g.dropPlatoon(p.x, p.y) && !e.shiftKey) setMode("select"); }
    else if (modeRef.current === "tower") { if (g.placeTower(Math.floor(p.x), Math.floor(p.y)) && !e.shiftKey) setMode("select"); }
    else g.click(p.x, p.y);
  };
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    const g = gameRef.current, p = toWorld(e);
    if (!g) return;
    if (modeRef.current !== "select") return setMode("select");
    const sel = g.platoons.find((x) => x.id === g.selected);
    if (sel) { sel.tx = p.x; sel.ty = p.y; }
  };
  const restart = () => { gameRef.current = freshGame(); setMode("select"); resetView(); };

  const g = gameRef.current;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        width={W * T * RS}
        height={H * T * RS}
        className="absolute inset-0 block h-full w-full cursor-crosshair"
        onClick={onClick}
        onContextMenu={onContext}
        onMouseMove={(e) => (hoverRef.current = toWorld(e))}
        onMouseLeave={() => (hoverRef.current = null)}
      />
      {g && <Hud g={g} mode={mode} setMode={setMode} mute={mute} toggleMute={toggleMute} fmt={fmt} restart={restart} zoom={zoom} applyZoom={applyZoom} resetView={resetView} />}
    </div>
  );
}

function Hud({ g, mode, setMode, mute, toggleMute, fmt, restart, zoom, applyZoom, resetView }: {
  g: Game; mode: Mode; setMode: (m: Mode) => void; mute: boolean; toggleMute: () => void; fmt: (s: number) => string; restart: () => void;
  zoom: number; applyZoom: (next: number) => void; resetView: () => void;
}) {
  const hold = g.phase === "playing" ? g.holdTime() : 0;
  const soldiers = g.platoons.reduce((a, p) => a + p.soldiers, 0);
  return (
    <>
      {/* top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-background/85 to-transparent px-5 pb-8 pt-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">Mobile Infantry // Operation Klendathu</p>
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide">Beachhead</h1>
        </div>
        <p className="mt-2 max-w-md text-center font-mono text-sm text-foreground/90">{g.message}</p>
        <div className="pointer-events-auto flex gap-4 font-mono text-sm">
          <TopStat label="Credits" value={Math.floor(g.credits)} accent />
          <TopStat label="Time" value={fmt(g.t)} />
          <TopStat label="Horde" value={g.phase === "playing" ? `${g.wave} · ${Math.max(0, Math.ceil(g.nextHorde - g.t))}s` : "—"} />
          <button onClick={toggleMute} className="hud-btn self-center px-2 py-1 text-xs" aria-label="Toggle sound">{mute ? "Sound off" : "Sound on"} [M]</button>
        </div>
      </header>

      {/* right sidebar */}
      <aside className="absolute bottom-4 right-4 top-20 flex w-56 flex-col gap-2 overflow-y-auto font-mono text-sm">
        <div className="hud-panel bg-card/80 backdrop-blur-sm">
          <Stat label="LZ core" value={`${Math.max(0, Math.ceil(g.core.hp))}/${g.core.max}`} />
          <Stat label="Troopers" value={`${soldiers} in ${g.platoons.length} plt`} />
          <Stat label="Engineers" value={g.engineers.length} />
          <Stat label="Towers" value={`${g.towers.filter((t) => t.built >= 1).length} (+${g.towers.filter((t) => t.built < 1).length})`} />
          <Stat label="Bugs" value={g.bugs.length} />
        </div>
        <div className="hud-panel bg-card/80 backdrop-blur-sm">
          <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Hold the line</p>
          <div className="h-2 w-full overflow-hidden rounded-sm bg-muted">
            <div className="h-full bg-success transition-all" style={{ width: `${Math.min(100, (hold / HOLD_NEEDED) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {fmt(hold)} / {fmt(HOLD_NEEDED)} without casualties
            {g.t < WIN_AFTER && g.phase === "playing" ? ` · eligible at ${fmt(WIN_AFTER)}` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button className={`hud-btn backdrop-blur-sm ${mode === "platoon" ? "hud-btn-active" : "bg-secondary/85"}`} onClick={() => setMode(mode === "platoon" ? "select" : "platoon")}>
            <span>[1] Drop platoon</span><span>{COST.platoon}</span>
          </button>
          <button className="hud-btn bg-secondary/85 backdrop-blur-sm" onClick={() => g.trainEngineer()}>
            <span>[2] Engineer</span><span>{COST.engineer}</span>
          </button>
          <button className={`hud-btn backdrop-blur-sm ${mode === "tower" ? "hud-btn-active" : "bg-secondary/85"}`} onClick={() => setMode(mode === "tower" ? "select" : "tower")}>
            <span>[3] MG tower</span><span>{COST.tower}</span>
          </button>
        </div>
        <div className="hud-panel mt-auto bg-card/75 text-xs leading-relaxed text-muted-foreground backdrop-blur-sm">
          <p>Click a platoon to select, then click/right-click to move it.</p>
          <p className="mt-1"><span className="text-primary">Light tan</span> = high ground: longer range, less damage taken, slows bugs.</p>
          <p className="mt-1">Engineers auto-build marked towers. Shift-click to place several.</p>
          <p className="mt-1">Scroll to zoom around your cursor. Press 0 to reset.</p>
          <p className="mt-1">You only hear what your troops hear.</p>
        </div>
      </aside>

      <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-sm border border-border bg-card/80 p-1 font-mono text-xs backdrop-blur-sm" aria-label="Map zoom controls">
        <button className="hud-btn justify-center px-3 py-1" onClick={() => applyZoom(zoom / 1.25)} disabled={zoom <= 1} aria-label="Zoom out">−</button>
        <output className="w-12 text-center" aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button className="hud-btn justify-center px-3 py-1" onClick={() => applyZoom(zoom * 1.25)} disabled={zoom >= 3} aria-label="Zoom in">+</button>
        <button className="hud-btn justify-center px-2 py-1" onClick={resetView} disabled={zoom === 1} aria-label="Reset zoom">Reset</button>
      </div>

      {g.phase === "landing" && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-sm border border-primary/40 bg-background/85 px-4 py-2 font-mono text-sm text-primary">
          Click open ground to land your first platoon
        </div>
      )}
      {(g.phase === "won" || g.phase === "lost") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/75">
          <h2 className={`font-display text-6xl uppercase ${g.phase === "won" ? "text-success" : "text-destructive"}`}>
            {g.phase === "won" ? "Beachhead Secured" : "Overrun"}
          </h2>
          <p className="font-mono text-sm text-muted-foreground">
            Survived {fmt(g.t)} · {g.kills} bugs killed · {g.deaths} troopers lost
          </p>
          <button onClick={restart} className="hud-btn hud-btn-primary">New drop</button>
        </div>
      )}
    </>
  );
}

function TopStat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-lg leading-none ${accent ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
