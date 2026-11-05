import { useEffect, useRef, useState } from "react";
import { Game, T, W, H, COST, WIN_AFTER, HOLD_NEEDED } from "@/game/engine";

type Mode = "select" | "platoon" | "tower";

export function BeachheadGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(new Game());
  const modeRef = useRef<Mode>("select");
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const [mode, setModeState] = useState<Mode>("select");
  const [, setTick] = useState(0);
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };

  useEffect(() => {
    const ctx = canvasRef.current!.getContext("2d")!;
    let raf = 0, last = performance.now(), hud = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const g = gameRef.current;
      g.update(dt);
      g.render(ctx, hoverRef.current, modeRef.current);
      hud += dt;
      if (hud > 0.15) { hud = 0; setTick((t) => t + 1); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1") setMode("platoon");
      if (e.key === "2") gameRef.current.trainEngineer();
      if (e.key === "3") setMode("tower");
      if (e.key === "Escape") setMode("select");
    };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", onKey); };
  }, []);

  const toWorld = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onClick = (e: React.MouseEvent) => {
    const g = gameRef.current, p = toWorld(e);
    if (g.phase === "landing") return void g.land(Math.floor(p.x), Math.floor(p.y));
    if (g.phase !== "playing") return;
    if (modeRef.current === "platoon") { if (g.dropPlatoon(p.x, p.y) && !e.shiftKey) setMode("select"); }
    else if (modeRef.current === "tower") { if (g.placeTower(Math.floor(p.x), Math.floor(p.y)) && !e.shiftKey) setMode("select"); }
    else g.click(p.x, p.y);
  };
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    const g = gameRef.current, p = toWorld(e);
    if (modeRef.current !== "select") return setMode("select");
    const sel = g.platoons.find((x) => x.id === g.selected);
    if (sel) { sel.tx = p.x; sel.ty = p.y; }
  };
  const restart = () => { gameRef.current = new Game(); setMode("select"); };

  const g = gameRef.current;
  const hold = g.phase === "playing" ? g.holdTime() : 0;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const soldiers = g.platoons.reduce((a, p) => a + p.soldiers, 0);

  return (
    <div className="flex min-h-screen flex-col items-center gap-4 bg-background px-4 py-6 text-foreground">
      <header className="flex w-full max-w-[1200px] flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Mobile Infantry // Operation Klendathu</p>
          <h1 className="font-display text-4xl uppercase leading-none tracking-wide">Beachhead</h1>
        </div>
        <p className="font-mono text-sm text-muted-foreground">{g.message}</p>
      </header>

      <div className="grid w-full max-w-[1200px] gap-4 lg:grid-cols-[1fr_240px]">
        <div className="relative overflow-hidden rounded-sm border-2 border-border shadow-hud">
          <canvas
            ref={canvasRef}
            width={W * T}
            height={H * T}
            className="block h-auto w-full cursor-crosshair"
            onClick={onClick}
            onContextMenu={onContext}
            onMouseMove={(e) => (hoverRef.current = toWorld(e))}
            onMouseLeave={() => (hoverRef.current = null)}
          />
          {g.phase !== "playing" && g.phase !== "landing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80">
              <h2 className={`font-display text-6xl uppercase ${g.phase === "won" ? "text-success" : "text-destructive"}`}>
                {g.phase === "won" ? "Beachhead Secured" : "Overrun"}
              </h2>
              <p className="font-mono text-sm text-muted-foreground">
                Survived {fmt(g.t)} · {g.kills} bugs killed · {g.deaths} troopers lost
              </p>
              <button onClick={restart} className="hud-btn hud-btn-primary">New drop</button>
            </div>
          )}
          {g.phase === "landing" && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-sm bg-background/85 px-4 py-2 font-mono text-sm text-primary">
              Click open ground to land your first platoon
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-3 font-mono text-sm">
          <div className="hud-panel">
            <Stat label="Credits" value={Math.floor(g.credits)} accent />
            <Stat label="Time" value={fmt(g.t)} />
            <Stat label="Horde" value={g.phase === "playing" ? `${g.wave} · next ${Math.max(0, Math.ceil(g.nextHorde - g.t))}s` : "—"} />
            <Stat label="LZ core" value={`${Math.max(0, Math.ceil(g.core.hp))}/${g.core.max}`} />
            <Stat label="Troopers" value={`${soldiers} in ${g.platoons.length} plt`} />
            <Stat label="Engineers" value={g.engineers.length} />
            <Stat label="Towers" value={`${g.towers.filter((t) => t.built >= 1).length} (+${g.towers.filter((t) => t.built < 1).length})`} />
            <Stat label="Bugs" value={g.bugs.length} />
          </div>

          <div className="hud-panel">
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
            <button className={`hud-btn ${mode === "platoon" ? "hud-btn-active" : ""}`} onClick={() => setMode(mode === "platoon" ? "select" : "platoon")}>
              <span>[1] Drop platoon</span><span>{COST.platoon}</span>
            </button>
            <button className="hud-btn" onClick={() => g.trainEngineer()}>
              <span>[2] Engineer</span><span>{COST.engineer}</span>
            </button>
            <button className={`hud-btn ${mode === "tower" ? "hud-btn-active" : ""}`} onClick={() => setMode(mode === "tower" ? "select" : "tower")}>
              <span>[3] MG tower</span><span>{COST.tower}</span>
            </button>
          </div>

          <div className="hud-panel text-xs leading-relaxed text-muted-foreground">
            <p>Click a platoon to select, then click/right-click to move it.</p>
            <p className="mt-1"><span className="text-primary">Light tan</span> = high ground: longer range, less damage taken, slows bugs.</p>
            <p className="mt-1">Engineers auto-build marked towers. Shift-click to place several.</p>
            <p className="mt-1">Win: after {fmt(WIN_AFTER)}, lose no trooper for {fmt(HOLD_NEEDED)}.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "text-primary" : ""}>{value}</span>
    </div>
  );
}
