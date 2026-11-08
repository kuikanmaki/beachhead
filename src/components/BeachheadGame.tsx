import { useEffect, useRef, useState } from "react";
import { Game, T, W, H, COST, WIN_AFTER, HOLD_NEEDED, setMapSize } from "@/game/engine";
import { renderGame, RS } from "@/game/render";
import { audioTick, unlockAudio, setMuted } from "@/game/sound";
import { panCamera, resetCamera, screenToWorld, wheelZoom, zoomCamera, type Camera } from "@/game/camera";

type Mode = "select" | "infantry" | "tower" | "wall";
type WallDraft = { x1: number; y1: number; x2: number; y2: number };
type WallDrag = WallDraft & { sx: number; sy: number; moved: boolean };

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
  const dragRef = useRef<{ sx: number; sy: number; lx: number; ly: number; moved: boolean } | null>(null);
  const wallDragRef = useRef<WallDrag | null>(null);
  const wallDraftRef = useRef<WallDraft | null>(null);
  const suppressClickRef = useRef(false);
  const [wallDraft, setWallDraft] = useState<WallDraft | null>(null);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [mode, setModeState] = useState<Mode>("select");
  const [mute, setMute] = useState(false);
  const [satellite, setSatellite] = useState(true);
  const satelliteRef = useRef(true);
  const [, setTick] = useState(0);
  const setMode = (m: Mode) => { modeRef.current = m; setModeState(m); };
  const toggleMute = () => setMute((m) => { setMuted(!m); return !m; });
  const toggleSatellite = () => setSatellite((on) => { satelliteRef.current = !on; return !on; });
  const applyZoom = (next: number, u = 0.5, v = 0.5) => {
    cameraRef.current = zoomCamera(cameraRef.current, next, u, v);
    setZoom(cameraRef.current.zoom);
  };
  const resetView = () => { cameraRef.current = resetCamera(); setZoom(1); };
  const clientToWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return screenToWorld(cameraRef.current, (clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
  };
  const updateWallDraft = (draft: WallDraft | null) => { wallDraftRef.current = draft; setWallDraft(draft); };

  useEffect(() => {
    gameRef.current = freshGame();
    if (import.meta.env.DEV) (window as unknown as { __beachhead: { current: Game } }).__beachhead = gameRef;
    setTick((t) => t + 1);
    let raf = 0, last = performance.now(), hud = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const g = gameRef.current!, cv = canvasRef.current;
      if (cv) {
        if (cv.width !== W * T * RS || cv.height !== H * T * RS) { cv.width = W * T * RS; cv.height = H * T * RS; }
        g.update(dt);
        audioTick(g, dt);
        renderGame(g, cv.getContext("2d")!, hoverRef.current, modeRef.current, cameraRef.current, satelliteRef.current, wallDraftRef.current);
      }
      hud += dt;
      if (hud > 0.15) { hud = 0; setTick((t) => t + 1); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => {
      unlockAudio();
      if (e.key === "1") setMode("infantry");
      if (e.key === "2") gameRef.current?.trainEngineer();
      if (e.key === "3") setMode("tower");
      if (e.key === "4") {
        const g = gameRef.current;
        if (g?.hasCruiser && g.phase === "playing") setMode("wall");
        else if (g) g.message = "Build Wall unlocks with Level 2 engineer teams.";
      }
      if (e.key === "Escape") {
        setMode("select");
        gameRef.current?.unselect();
        wallDragRef.current = null;
        updateWallDraft(null);
      }
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
    const onPointerMove = (e: PointerEvent) => {
      const wallDrag = wallDragRef.current;
      if (wallDrag) {
        const p = clientToWorld(e.clientX, e.clientY);
        wallDrag.x2 = p.x; wallDrag.y2 = p.y;
        if (Math.hypot(e.clientX - wallDrag.sx, e.clientY - wallDrag.sy) >= 5) wallDrag.moved = true;
        updateWallDraft({ x1: wallDrag.x1, y1: wallDrag.y1, x2: wallDrag.x2, y2: wallDrag.y2 });
        return;
      }
      const d = dragRef.current, cvs = canvasRef.current;
      if (!d || !cvs) return;
      const rect = cvs.getBoundingClientRect();
      const dx = e.clientX - d.lx, dy = e.clientY - d.ly;
      d.lx = e.clientX; d.ly = e.clientY;
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
        d.moved = true;
        if (cameraRef.current.zoom > 1) setDragging(true);
      }
      cameraRef.current = panCamera(cameraRef.current, (dx / rect.width) * W / cameraRef.current.zoom, (dy / rect.height) * H / cameraRef.current.zoom);
    };
    const onPointerUp = () => {
      const wallDrag = wallDragRef.current;
      if (wallDrag) {
        wallDragRef.current = null;
        updateWallDraft(null);
        suppressClickRef.current = true;
        const g = gameRef.current;
        if (g && wallDrag.moved) g.buildWall(wallDrag.x1, wallDrag.y1, wallDrag.x2, wallDrag.y2);
        else if (g) g.message = "Click and drag to mark a wall line.";
        setTick((t) => t + 1);
        return;
      }
      if (dragRef.current?.moved) {
        setDragging(false);
        suppressClickRef.current = true;
      }
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", unlockAudio);
    return () => {
      cancelAnimationFrame(raf);
      cv?.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", unlockAudio);
    };
  }, []);

  const toWorld = (e: React.MouseEvent) => clientToWorld(e.clientX, e.clientY);
  const onClick = (e: React.MouseEvent) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; dragRef.current = null; return; }
    if (e.button !== 0 || dragRef.current?.moved) { dragRef.current = null; return; }
    const g = gameRef.current, p = toWorld(e);
    if (!g) return;
    if (g.phase === "landing") return void g.land(Math.floor(p.x), Math.floor(p.y));
    if (g.phase === "shipLanding") return void g.landCruiser(Math.floor(p.x), Math.floor(p.y));
    if (g.phase !== "playing") return;
    if (modeRef.current === "infantry") { if (g.dropInfantry(p.x, p.y) && !e.shiftKey) setMode("select"); }
    else if (modeRef.current === "tower") {
      if (!satelliteRef.current && g.fog.stateAt(p.x, p.y, false) === 0) {
        g.message = "Unexplored sector. Move ground troops there to scout it.";
      } else if (g.placeTower(Math.floor(p.x), Math.floor(p.y)) && !e.shiftKey) setMode("select");
    }
    else if (modeRef.current === "wall") g.message = "Click and drag to mark a wall line.";
    else g.click(p.x, p.y);
  };
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    wallDragRef.current = null; updateWallDraft(null);
    setMode("select");
    gameRef.current?.unselect();
    setTick((t) => t + 1);
  };
  const restart = () => { gameRef.current = freshGame(); setMode("select"); wallDragRef.current = null; updateWallDraft(null); resetView(); };
  const continueMission = () => { if (gameRef.current?.continueToCruiser()) setMode("select"); };

  const g = gameRef.current;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        width={W * T * RS}
        height={H * T * RS}
        className={`absolute inset-0 block h-full w-full ${mode === "wall" ? "cursor-crosshair" : dragging ? "cursor-grabbing" : zoom > 1 ? "cursor-grab" : "cursor-crosshair"}`}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (modeRef.current === "wall" && gameRef.current?.phase === "playing") {
            const p = toWorld(e);
            wallDragRef.current = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, sx: e.clientX, sy: e.clientY, moved: false };
            updateWallDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
            e.preventDefault();
            return;
          }
          if (cameraRef.current.zoom <= 1) return;
          dragRef.current = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
        }}
        onClick={onClick}
        onContextMenu={onContext}
        onMouseMove={(e) => (hoverRef.current = toWorld(e))}
        onMouseLeave={() => (hoverRef.current = null)}
      />
      {g && <Hud g={g} mode={mode} setMode={setMode} mute={mute} toggleMute={toggleMute} fmt={fmt} restart={restart} continueMission={continueMission} zoom={zoom} applyZoom={applyZoom} resetView={resetView} satellite={satellite} toggleSatellite={toggleSatellite} />}
      {g && wallDraft && (
        <div className="pointer-events-none absolute bottom-16 left-4 rounded-sm border border-primary/40 bg-card/90 px-3 py-2 font-mono text-xs backdrop-blur-sm" aria-live="polite">
          {(() => {
            const plan = g.wallPlan(wallDraft.x1, wallDraft.y1, wallDraft.x2, wallDraft.y2);
            return <><p className="text-primary">Wall line · {plan.buildable.length} new segments</p><p className="mt-1 text-muted-foreground">Up to {plan.buildable.length * COST.wall} credits · charged as built{plan.blocked ? ` · ${plan.blocked} occupied sites skipped` : ""}</p></>;
          })()}
        </div>
      )}
    </div>
  );
}

function Hud({ g, mode, setMode, mute, toggleMute, fmt, restart, continueMission, zoom, applyZoom, resetView, satellite, toggleSatellite }: {
  g: Game; mode: Mode; setMode: (m: Mode) => void; mute: boolean; toggleMute: () => void; fmt: (s: number) => string; restart: () => void; continueMission: () => void;
  zoom: number; applyZoom: (next: number) => void; resetView: () => void;
  satellite: boolean; toggleSatellite: () => void;
}) {
  const hold = g.phase === "playing" ? g.holdTime() : 0;
  const soldiers = g.infantry.reduce((a, p) => a + p.soldiers, 0);
  const teamCount = g.infantry.filter((p) => p.kind === "team").length;
  const squadCount = g.infantry.filter((p) => p.kind === "squad").length;
  const completedWalls = g.walls.filter((w) => w.built >= 1).length;
  const selectedInfantry = g.infantry.find((unit) => unit.id === g.selected);
  const selectedEngineer = g.engineers.find((unit) => unit.id === g.selected);
  const selectedName = selectedInfantry?.kind === "squad" ? "Squad" : selectedInfantry ? "Team" : selectedEngineer?.kind === "team" ? "Engineer Team" : selectedEngineer ? "Engineer" : null;
  return (
    <>
      {/* top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-background/85 to-transparent px-5 pb-8 pt-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">Mobile Infantry // Operation Beachhead</p>
          <h1 className="font-display text-3xl uppercase leading-none tracking-wide">Beachhead</h1>
        </div>
        <p className="mt-2 max-w-md text-center font-mono text-sm text-foreground/90">{g.message}</p>
        <div className="pointer-events-auto flex gap-4 font-mono text-sm">
          <TopStat label="Level" value={g.level === 1 ? "1 · LZ" : "2 · Ship"} />
          <TopStat label="Credits" value={Math.floor(g.credits)} accent />
          <TopStat label="Time" value={fmt(g.t)} />
          <TopStat label="Horde" value={g.phase === "playing" ? `${g.wave} · ${Math.max(0, Math.ceil(g.nextHorde - g.t))}s` : "—"} />
          <button onClick={toggleMute} className="hud-btn self-center px-2 py-1 text-xs" aria-label="Toggle sound">{mute ? "Sound off" : "Sound on"} [M]</button>
        </div>
      </header>

      {/* right sidebar */}
      <aside className="absolute bottom-4 right-4 top-20 flex w-56 flex-col gap-2 overflow-y-auto font-mono text-sm">
        <div className="hud-panel flex items-center justify-between gap-3 bg-card/80 backdrop-blur-sm">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Satellite comms</p>
            <p className={`mt-1 text-xs ${satellite ? "text-primary" : "text-muted-foreground"}`}>{satellite ? "ON · full orbital map" : "OFF · ground vision"}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={satellite}
            aria-label="Satellite comms"
            onClick={toggleSatellite}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${satellite ? "border-primary bg-primary/30" : "border-border bg-muted"}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full transition-transform ${satellite ? "translate-x-5 bg-primary" : "translate-x-0 bg-muted-foreground"}`} />
          </button>
        </div>
        <div className="hud-panel bg-card/80 backdrop-blur-sm">
          <Stat label={g.hasCruiser ? "Command cruiser" : "LZ core"} value={`${Math.max(0, Math.ceil(g.core.hp))}/${g.core.max}`} />
          <Stat label="Troopers" value={soldiers} />
          <Stat label="Teams / squads" value={`${teamCount} / ${squadCount}`} />
          <Stat label={g.hasCruiser ? "Engineer teams" : "Engineers"} value={g.engineers.length} />
          <Stat label="Towers" value={`${g.towers.filter((t) => t.built >= 1).length} (+${g.towers.filter((t) => t.built < 1).length})`} />
          {g.hasCruiser && <Stat label="Wall segments" value={`${completedWalls} / ${g.walls.length}`} />}
          <Stat label="Bugs" value={g.bugs.length} />
        </div>
        {g.level === 1 ? (
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
        ) : (
          <div className="hud-panel bg-card/80 backdrop-blur-sm" aria-label="Landing zone objective">
            <p className="text-xs uppercase tracking-widest text-primary">Secure the landing zone</p>
            <p className={`mt-2 text-sm ${g.perimeter.sealed ? "text-success" : "text-foreground"}`}>{g.perimeter.sealed ? "Perimeter sealed" : "Perimeter open"}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {g.perimeter.sealed
                ? g.perimeter.enemiesInside ? `${g.perimeter.enemiesInside} live ${g.perimeter.enemiesInside === 1 ? "enemy" : "enemies"} inside. Clear them to complete the level.` : "Perimeter clear. Securing landing zone…"
                : "Encircle the cruiser with walls and/or sheer rock. Outside enemies do not block completion."}
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button disabled={g.phase !== "playing"} className={`hud-btn backdrop-blur-sm ${mode === "infantry" ? "hud-btn-active" : "bg-secondary/85"}`} onClick={() => setMode(mode === "infantry" ? "select" : "infantry")}>
            <span>[1] {g.hasCruiser ? "Drop Squad" : "Drop Team"}</span><span>{g.hasCruiser ? COST.squad : COST.team}</span>
          </button>
          <button disabled={g.phase !== "playing"} className="hud-btn bg-secondary/85 backdrop-blur-sm" onClick={() => g.trainEngineer()}>
            <span>[2] {g.hasCruiser ? "Engineer Team" : "Engineer"}</span><span>{g.hasCruiser ? COST.engineerTeam : COST.engineer}</span>
          </button>
          <button disabled={g.phase !== "playing"} className={`hud-btn backdrop-blur-sm ${mode === "tower" ? "hud-btn-active" : "bg-secondary/85"}`} onClick={() => setMode(mode === "tower" ? "select" : "tower")}>
            <span>[3] MG tower</span><span>{COST.tower}</span>
          </button>
          {g.hasCruiser && (
            <button disabled={g.phase !== "playing"} className={`hud-btn backdrop-blur-sm ${mode === "wall" ? "hud-btn-active" : "bg-secondary/85"}`} onClick={() => setMode(mode === "wall" ? "select" : "wall")} aria-label="Build Wall">
              <span>[4] Build Wall</span><span>{COST.wall}/seg</span>
            </button>
          )}
        </div>
        <div className="hud-panel mt-auto bg-card/75 text-xs leading-relaxed text-muted-foreground backdrop-blur-sm">
          <p>Click a unit to select; left-click ground to move a team or squad. Right-click or press Esc to unselect.</p>
          <p className="mt-1"><span className="text-primary">Light tan</span> = high ground: longer range, less damage taken, slows bugs.</p>
          <p className="mt-1">Engineers auto-build marked towers. Shift-click to place several.</p>
          {g.hasCruiser && <p className="mt-1 text-primary">Choose [4] Build Wall, then drag a line. Engineer teams build from your starting point to the end; each segment costs {COST.wall} credits.</p>}
          {g.hasCruiser && <p className="mt-1">Seal the cruiser with walls and rock, then eliminate every live enemy inside.</p>}
          <p className="mt-1">Scroll to zoom around your cursor. Click and drag to pan while zoomed. Press 0 to reset.</p>
          <p className="mt-1">With satellite comms off, troops and completed MG towers reveal ground. Explored areas stay dim; enemies need current sight.</p>
          <p className="mt-1">You only hear what your troops hear.</p>
        </div>
      </aside>

      {selectedName && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-sm border border-primary/50 bg-card/90 px-3 py-1.5 font-mono text-xs backdrop-blur-sm" aria-live="polite">
          <span>Selected: <strong className="text-primary">{selectedName}</strong></span>
          <button className="hud-btn px-2 py-1" onClick={() => g.unselect()} aria-label="Unselect unit">Unselect [Esc]</button>
        </div>
      )}

      <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-sm border border-border bg-card/80 p-1 font-mono text-xs backdrop-blur-sm" aria-label="Map zoom controls">
        <button className="hud-btn justify-center px-3 py-1" onClick={() => applyZoom(zoom / 1.25)} disabled={zoom <= 1} aria-label="Zoom out">−</button>
        <output className="w-12 text-center" aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button className="hud-btn justify-center px-3 py-1" onClick={() => applyZoom(zoom * 1.25)} disabled={zoom >= 3} aria-label="Zoom in">+</button>
        <button className="hud-btn justify-center px-2 py-1" onClick={resetView} disabled={zoom === 1} aria-label="Reset zoom">Reset</button>
      </div>

      {g.phase === "landing" && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-sm border border-primary/40 bg-background/85 px-4 py-2 font-mono text-sm text-primary">
          {satellite ? "Click open ground to land your first team" : "Drop scan online: click open ground in the lit landing area"}
        </div>
      )}
      {g.phase === "shipLanding" && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-sm border border-primary/40 bg-background/85 px-4 py-2 text-center font-mono text-sm text-primary">
          Level 2 · Click a clear 7×7 sector to land the command cruiser
          <span className="mt-1 block text-xs text-muted-foreground">Survivors and defenses carry over · seal the cruiser to secure the landing zone</span>
        </div>
      )}
      {(g.phase === "won" || g.phase === "lost") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/75">
          <h2 className={`font-display text-6xl uppercase ${g.phase === "won" ? "text-success" : "text-destructive"}`}>
            {g.phase === "won" ? g.level === 2 ? "Landing Zone Secured" : "Beachhead Secured" : "Overrun"}
          </h2>
          <p className="font-mono text-sm text-muted-foreground">
            Survived {fmt(g.t)} · {g.kills} bugs killed · {g.deaths} troopers lost
          </p>
          {g.phase === "won" && <p className="max-w-md text-center font-mono text-sm text-foreground">{g.level === 2 ? "The cruiser is encircled and every enemy inside the perimeter has been eliminated." : "Level 1 complete. Bring in a command cruiser, relocate your base, and fortify its landing zone."}</p>}
          <div className="flex gap-2">
            {g.phase === "won" && g.level === 1 && <button onClick={continueMission} className="hud-btn hud-btn-primary">Continue to Level 2</button>}
            <button onClick={restart} className={`hud-btn ${g.phase === "lost" || g.level === 2 ? "hud-btn-primary" : ""}`}>New drop</button>
          </div>
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
