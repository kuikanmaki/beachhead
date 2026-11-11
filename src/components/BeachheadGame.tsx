import { useEffect, useRef, useState } from "react";
import { Game, T, W, H, COST, WIN_AFTER, HOLD_NEEDED, setMapSize } from "@/game/engine";
import { renderGame, RS } from "@/game/render";
import { audioTick, unlockAudio, setMuted } from "@/game/sound";
import { panCamera, resetCamera, screenToWorld, wheelZoom, type Camera } from "@/game/camera";
import {
  activeLeaders,
  clearCampaign,
  fallenLeaders,
  formatLeaderName,
  medalOf,
  rankOf,
} from "@/game/roster";
import { activeKillBanner } from "@/game/kills";
import { ArrowRight, BookOpen, Crosshair, Medal, Shield, TowerControl } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [briefingOpen, setBriefingOpen] = useState(true);
  const briefingRef = useRef(true);
  const introductionRef = useRef(true);
  const [introduction, setIntroduction] = useState(true);
  const [rosterOpen, setRosterOpen] = useState(false);
  const rosterRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [, setTick] = useState(0);
  const setBriefing = (open: boolean) => {
    briefingRef.current = open;
    setBriefingOpen(open);
  };
  const setRoster = (open: boolean) => {
    rosterRef.current = open;
    setRosterOpen(open);
  };
  const setPausedOpen = (open: boolean) => {
    pausedRef.current = open;
    setPaused(open);
  };
  const advanceBriefing = () => {
    if (introductionRef.current) {
      introductionRef.current = false;
      setIntroduction(false);
    } else setBriefing(false);
  };
  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  };
  const toggleMute = () =>
    setMute((m) => {
      setMuted(!m);
      return !m;
    });
  const resetView = () => {
    cameraRef.current = resetCamera();
    setZoom(1);
  };
  const frozen = () => briefingRef.current || pausedRef.current || rosterRef.current;
  const clientToWorld = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return screenToWorld(cameraRef.current, (clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
  };
  const updateWallDraft = (draft: WallDraft | null) => {
    wallDraftRef.current = draft;
    setWallDraft(draft);
  };

  useEffect(() => {
    gameRef.current = freshGame();
    setTick((t) => t + 1);
    let raf = 0,
      last = performance.now(),
      hud = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = gameRef.current!,
        cv = canvasRef.current;
      if (cv) {
        if (cv.width !== W * T * RS || cv.height !== H * T * RS) {
          cv.width = W * T * RS;
          cv.height = H * T * RS;
        }
        if (!frozen()) {
          g.update(dt);
          audioTick(g, dt);
        }
        renderGame(g, cv.getContext("2d")!, hoverRef.current, modeRef.current, cameraRef.current, wallDraftRef.current);
      }
      hud += dt;
      if (hud > 0.15) {
        hud = 0;
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => {
      unlockAudio();
      const phase = gameRef.current?.phase;
      if (briefingRef.current) {
        if (e.key === "Enter") {
          e.preventDefault();
          advanceBriefing();
        }
        if (e.key === "Escape" && phase === "playing") setBriefing(false);
        return;
      }
      if (rosterRef.current) {
        if (e.key === "Escape" || e.key === "r" || e.key === "R") setRoster(false);
        return;
      }
      if (e.key === "m" || e.key === "M") {
        toggleMute();
        return;
      }
      if (e.key === "p" || e.key === "P") {
        if (phase === "playing" || phase === "landing" || phase === "shipLanding") {
          setPausedOpen(!pausedRef.current);
        }
        return;
      }
      if (pausedRef.current) {
        if (e.key === "Escape") {
          setPausedOpen(false);
          return;
        }
        if (e.key === "?") {
          setBriefing(true);
          return;
        }
        if (e.key === "r" || e.key === "R") {
          setRoster(true);
          return;
        }
        return;
      }
      if (e.key === "?") {
        setBriefing(true);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        setPausedOpen(true);
        setRoster(true);
        return;
      }
      if (phase !== "playing" && phase !== "landing" && phase !== "shipLanding") return;
      if (e.key === "1") setMode("infantry");
      if (e.key === "2") gameRef.current?.trainEngineer();
      if (e.key === "3") setMode("tower");
      if (e.key === "4") {
        const g = gameRef.current;
        if (g?.hasCruiser && g.phase === "playing") setMode("wall");
        else if (g) g.announce("Build Wall unlocks with Level 2 engineer teams.", 3);
      }
      if (e.key === "Escape") {
        setMode("select");
        gameRef.current?.unselect();
        wallDragRef.current = null;
        updateWallDraft(null);
      }
      if (e.key === "0") {
        cameraRef.current = resetCamera();
        setZoom(1);
      }
    };
    const cv = canvasRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const u = (e.clientX - rect.left) / rect.width,
        v = (e.clientY - rect.top) / rect.height;
      cameraRef.current = wheelZoom(cameraRef.current, e.deltaY, e.deltaMode, u, v);
      setZoom(cameraRef.current.zoom);
    };
    cv?.addEventListener("wheel", onWheel, { passive: false });
    const onPointerMove = (e: PointerEvent) => {
      const wallDrag = wallDragRef.current;
      if (wallDrag) {
        const p = clientToWorld(e.clientX, e.clientY);
        wallDrag.x2 = p.x;
        wallDrag.y2 = p.y;
        if (Math.hypot(e.clientX - wallDrag.sx, e.clientY - wallDrag.sy) >= 5) wallDrag.moved = true;
        updateWallDraft({ x1: wallDrag.x1, y1: wallDrag.y1, x2: wallDrag.x2, y2: wallDrag.y2 });
        return;
      }
      const d = dragRef.current,
        cvs = canvasRef.current;
      if (!d || !cvs) return;
      const rect = cvs.getBoundingClientRect();
      const dx = e.clientX - d.lx,
        dy = e.clientY - d.ly;
      d.lx = e.clientX;
      d.ly = e.clientY;
      if (!d.moved) {
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
        d.moved = true;
        if (cameraRef.current.zoom > 1) setDragging(true);
      }
      cameraRef.current = panCamera(
        cameraRef.current,
        ((dx / rect.width) * W) / cameraRef.current.zoom,
        ((dy / rect.height) * H) / cameraRef.current.zoom,
      );
    };
    const onPointerUp = () => {
      const wallDrag = wallDragRef.current;
      if (wallDrag) {
        wallDragRef.current = null;
        updateWallDraft(null);
        suppressClickRef.current = true;
        const g = gameRef.current;
        if (g && wallDrag.moved) g.buildWall(wallDrag.x1, wallDrag.y1, wallDrag.x2, wallDrag.y2);
        else if (g) g.announce("Click and drag to mark a wall line.", 3);
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
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      dragRef.current = null;
      return;
    }
    if (e.button !== 0 || dragRef.current?.moved) {
      dragRef.current = null;
      return;
    }
    if (frozen()) return;
    const g = gameRef.current,
      p = toWorld(e);
    if (!g) return;
    if (g.phase === "landing") return void g.land(Math.floor(p.x), Math.floor(p.y));
    if (g.phase === "shipLanding") return void g.landCruiser(Math.floor(p.x), Math.floor(p.y));
    if (g.phase !== "playing") return;
    if (modeRef.current === "infantry") {
      if (g.dropInfantry(p.x, p.y) && !e.shiftKey) setMode("select");
    } else if (modeRef.current === "tower") {
      if (g.placeTower(Math.floor(p.x), Math.floor(p.y)) && !e.shiftKey) setMode("select");
    } else if (modeRef.current === "wall") g.announce("Click and drag to mark a wall line.", 3);
    else g.click(p.x, p.y);
  };
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault();
    wallDragRef.current = null;
    updateWallDraft(null);
    setMode("select");
    gameRef.current?.unselect();
    setTick((t) => t + 1);
  };
  const restart = () => {
    gameRef.current = freshGame();
    setMode("select");
    wallDragRef.current = null;
    updateWallDraft(null);
    resetView();
    setPausedOpen(false);
    setRoster(false);
    introductionRef.current = true;
    setIntroduction(true);
    setBriefing(true);
  };
  const continueMission = () => {
    if (gameRef.current?.continueToCruiser()) {
      setMode("select");
      setPausedOpen(false);
      setRoster(false);
      setBriefing(true);
    }
  };

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
          if (e.button !== 0 || frozen()) return;
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
      {g && !(briefingOpen && (g.phase === "landing" || g.phase === "shipLanding")) && (
        <Hud
          g={g}
          mode={mode}
          setMode={setMode}
          fmt={fmt}
          restart={restart}
          continueMission={continueMission}
          openRoster={() => {
            setPausedOpen(true);
            setRoster(true);
          }}
        />
      )}
      {g && paused && !rosterOpen && !briefingOpen && (g.phase === "playing" || g.phase === "landing" || g.phase === "shipLanding") && (
        <PauseMenu
          mute={mute}
          toggleMute={toggleMute}
          onResume={() => setPausedOpen(false)}
          onBriefing={() => setBriefing(true)}
          onRoster={() => setRoster(true)}
        />
      )}
      {g && rosterOpen && (
        <RosterPanel
          g={g}
          onClose={() => setRoster(false)}
          onResetCampaign={() => {
            clearCampaign();
            restart();
          }}
        />
      )}
      {g && wallDraft && !frozen() && (
        <div
          className="pointer-events-none absolute bottom-16 left-4 rounded-sm border border-primary/40 bg-card/90 px-3 py-2 font-mono text-xs backdrop-blur-sm"
          aria-live="polite"
        >
          {(() => {
            const plan = g.wallPlan(wallDraft.x1, wallDraft.y1, wallDraft.x2, wallDraft.y2);
            return plan.valid ? (
              <>
                <p className="text-primary">Continuous wall · {plan.buildable.length} new segments</p>
                <p className="mt-1 text-muted-foreground">
                  Release to build · up to {plan.buildable.length * COST.wall} credits, charged as built
                </p>
              </>
            ) : (
              <>
                <p className="text-destructive">Wall blocked · nothing will be built</p>
                <p className="mt-1 text-muted-foreground">Redraw so every outlined segment is clear and connected.</p>
              </>
            );
          })()}
        </div>
      )}
      {g && briefingOpen && <FieldManual g={g} introduction={introduction} onClose={advanceBriefing} />}
    </div>
  );
}

function PauseMenu({
  mute,
  toggleMute,
  onResume,
  onBriefing,
  onRoster,
}: {
  mute: boolean;
  toggleMute: () => void;
  onResume: () => void;
  onBriefing: () => void;
  onRoster: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
      <section
        className="w-full max-w-sm rounded-sm border border-primary/40 bg-card/95 p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">Operation Beachhead</p>
        <h2 id="pause-title" className="mt-1 font-display text-4xl uppercase tracking-wide">
          Paused
        </h2>
        <div className="mt-5 flex flex-col gap-2">
          <Button autoFocus className="font-mono uppercase" onClick={onResume}>
            Resume [P]
          </Button>
          <button className="hud-btn justify-center bg-secondary/85" onClick={onBriefing}>
            Briefing [?]
          </button>
          <button className="hud-btn justify-center bg-secondary/85" onClick={onRoster}>
            Campaign roster [R]
          </button>
          <button className="hud-btn justify-center bg-secondary/85" onClick={toggleMute}>
            {mute ? "Sound off" : "Sound on"} [M]
          </button>
        </div>
      </section>
    </div>
  );
}

function Hud({
  g,
  mode,
  setMode,
  fmt,
  restart,
  continueMission,
  openRoster,
}: {
  g: Game;
  mode: Mode;
  setMode: (m: Mode) => void;
  fmt: (s: number) => string;
  restart: () => void;
  continueMission: () => void;
  openRoster: () => void;
}) {
  const hold = g.phase === "playing" ? g.holdTime() : 0;
  const soldiers = g.infantry.reduce((a, p) => a + p.soldiers, 0);
  const completedWalls = g.walls.filter((w) => w.built >= 1).length;
  const selectedInfantry = g.infantry.find((unit) => unit.id === g.selected);
  const selectedEngineer = g.engineers.find((unit) => unit.id === g.selected);
  const selectedLeader = selectedInfantry
    ? g.campaign.soldiers.find((s) => s.id === selectedInfantry.leaderId)
    : null;
  const selectedName = selectedInfantry
    ? `${selectedInfantry.kind === "squad" ? "Squad" : "Team"} · ${selectedLeader ? formatLeaderName(selectedLeader) : "Unknown"}`
    : selectedEngineer?.kind === "team"
      ? "Engineer Team"
      : selectedEngineer
        ? "Engineer"
        : null;
  return (
    <>
      {/* top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-background/85 to-transparent px-5 pb-8 pt-3">
        <KillTally kills={g.kills} pulse={g.killPulse} banner={activeKillBanner(g.killBanner, g.t)} />
        <p className="mt-2 max-w-md text-center font-mono text-sm text-foreground/90">{g.message}</p>
        <div className="flex gap-4 font-mono text-sm">
          <TopStat label="Credits" value={Math.floor(g.credits)} accent />
          <TopStat label="Time" value={fmt(g.t)} />
          <TopStat
            label="Horde"
            value={g.phase === "playing" ? `${g.wave} · ${Math.max(0, Math.ceil(g.nextHorde - g.t))}s` : "—"}
          />
        </div>
      </header>

      {/* right sidebar */}
      <aside className="absolute bottom-4 right-4 top-20 flex w-52 flex-col gap-2 overflow-y-auto font-mono text-sm">
        <div className="hud-panel bg-card/80 backdrop-blur-sm" aria-label="Battle status">
          <Stat
            label={g.hasCruiser ? "Command cruiser" : "LZ core"}
            value={`${Math.max(0, Math.ceil(g.core.hp))}/${g.core.max}`}
          />
          <div className="mt-1 grid grid-cols-2 gap-x-3 border-t border-border/60 pt-1">
            <CompactStat label="Troopers" value={soldiers} />
            <CompactStat label="Bugs" value={g.bugs.length} />
            <CompactStat label={g.hasCruiser ? "Eng. teams" : "Engineers"} value={g.engineers.length} />
            <CompactStat
              label="Towers"
              value={`${g.towers.filter((t) => t.built >= 1).length}/${g.towers.length}`}
            />
            {g.hasCruiser && <CompactStat label="Walls" value={`${completedWalls}/${g.walls.length}`} />}
          </div>
        </div>
        {g.level === 1 ? (
          <div className="hud-panel bg-card/80 backdrop-blur-sm">
            <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Hold the line</p>
            <div className="h-2 w-full overflow-hidden rounded-sm bg-muted">
              <div
                className="h-full bg-success transition-all"
                style={{ width: `${Math.min(100, (hold / HOLD_NEEDED) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {fmt(hold)} / {fmt(HOLD_NEEDED)} without casualties
              {g.t < WIN_AFTER && g.phase === "playing" ? ` · after ${fmt(WIN_AFTER)}` : ""}
            </p>
          </div>
        ) : (
          <div className="hud-panel bg-card/80 backdrop-blur-sm" aria-label="Landing zone objective">
            <p className="text-xs uppercase tracking-widest text-primary">Secure the landing zone</p>
            <p className={`mt-2 text-sm ${g.perimeter.sealed ? "text-success" : "text-foreground"}`}>
              {g.perimeter.sealed ? "Perimeter sealed" : "Perimeter open"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {g.perimeter.sealed
                ? g.perimeter.enemiesInside
                  ? `Clear ${g.perimeter.enemiesInside} inside.`
                  : "Perimeter clear…"
                : "Seal with walls or rock, then clear inside."}
            </p>
          </div>
        )}
        <div className="mt-auto flex flex-col gap-2">
          <button
            disabled={g.phase !== "playing"}
            className={`hud-btn backdrop-blur-sm ${mode === "infantry" ? "hud-btn-active" : "bg-secondary/85"}`}
            onClick={() => setMode(mode === "infantry" ? "select" : "infantry")}
          >
            <span>[1] {g.hasCruiser ? "Drop Squad" : "Drop Team"}</span>
            <span>{g.hasCruiser ? COST.squad : COST.team}</span>
          </button>
          <button
            disabled={g.phase !== "playing"}
            className="hud-btn bg-secondary/85 backdrop-blur-sm"
            onClick={() => g.trainEngineer()}
          >
            <span>[2] {g.hasCruiser ? "Engineer Team" : "Engineer"}</span>
            <span>{g.hasCruiser ? COST.engineerTeam : COST.engineer}</span>
          </button>
          <button
            disabled={g.phase !== "playing"}
            className={`hud-btn backdrop-blur-sm ${mode === "tower" ? "hud-btn-active" : "bg-secondary/85"}`}
            onClick={() => setMode(mode === "tower" ? "select" : "tower")}
          >
            <span>[3] MG tower</span>
            <span>{COST.tower}</span>
          </button>
          {g.hasCruiser && (
            <button
              disabled={g.phase !== "playing"}
              className={`hud-btn backdrop-blur-sm ${mode === "wall" ? "hud-btn-active" : "bg-secondary/85"}`}
              onClick={() => setMode(mode === "wall" ? "select" : "wall")}
              aria-label="Build Wall"
            >
              <span>[4] Build Wall</span>
              <span>{COST.wall}/seg</span>
            </button>
          )}
        </div>
      </aside>

      {selectedName && (
        <div
          className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-sm border border-primary/50 bg-card/90 px-3 py-1.5 font-mono text-xs backdrop-blur-sm"
          aria-live="polite"
        >
          <span>
            <strong className="text-primary">{selectedName}</strong>
            {selectedInfantry && selectedLeader && (
              <span className="ml-2 text-muted-foreground">
                {selectedInfantry.soldiers}/{selectedInfantry.startingStrength}
                {selectedLeader.medals.length > 0
                  ? ` · ${selectedLeader.medals.map((m) => medalOf(m).abbr).join(" ")}`
                  : ""}
              </span>
            )}
          </span>
        </div>
      )}

      {g.phase === "landing" && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-sm border border-primary/40 bg-background/85 px-4 py-2 font-mono text-sm text-primary">
          Click open ground to land your first team
        </div>
      )}
      {g.phase === "shipLanding" && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-sm border border-primary/40 bg-background/85 px-4 py-2 text-center font-mono text-sm text-primary">
          Level 2 · Click a rock-free 7×7 sector to land the command cruiser
          <span className="mt-1 block text-xs text-muted-foreground">
            Installations beneath the ship are removed · survivors and other defenses carry over
          </span>
        </div>
      )}
      {(g.phase === "won" || g.phase === "lost") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-background/75 px-4 py-8">
          <h2 className={`font-display text-6xl uppercase ${g.phase === "won" ? "text-success" : "text-destructive"}`}>
            {g.phase === "won" ? (g.level === 2 ? "Landing Zone Secured" : "Beachhead Secured") : "Overrun"}
          </h2>
          <p className="font-mono text-sm text-muted-foreground">
            Survived {fmt(g.t)} · {g.kills} bugs killed this campaign · {g.deaths} troopers lost this battle ·{" "}
            {g.campaign.totalFallen} campaign fallen
          </p>
          {g.phase === "won" && (
            <p className="max-w-md text-center font-mono text-sm text-foreground">
              {g.level === 2
                ? "The cruiser is encircled and every enemy inside the perimeter has been eliminated."
                : "Level 1 complete. Bring in a command cruiser, relocate your base, and fortify its landing zone."}
            </p>
          )}
          {g.afterAction.length > 0 && (
            <div className="w-full max-w-lg rounded-sm border border-primary/40 bg-card/90 p-4 font-mono text-xs backdrop-blur-sm">
              <p className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-primary">
                <Medal className="size-3.5" aria-hidden="true" /> After-action awards
              </p>
              <ul className="flex flex-col gap-1.5 text-foreground/90">
                {g.afterAction.map((award, i) => (
                  <li key={`${award.soldierId}-${award.kind}-${i}`}>{award.detail}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {g.phase === "won" && g.level === 1 && (
              <button onClick={continueMission} className="hud-btn hud-btn-primary">
                Continue to Level 2
              </button>
            )}
            <button
              onClick={restart}
              className={`hud-btn ${g.phase === "lost" || g.level === 2 ? "hud-btn-primary" : ""}`}
            >
              New drop
            </button>
            <button onClick={openRoster} className="hud-btn">
              Campaign roster
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function RosterPanel({
  g,
  onClose,
  onResetCampaign,
}: {
  g: Game;
  onClose: () => void;
  onResetCampaign: () => void;
}) {
  const leaders = activeLeaders(g.campaign);
  const fallen = fallenLeaders(g.campaign);
  const levelKeys = Object.keys(g.campaign.fallenByLevel).sort((a, b) => Number(a) - Number(b));
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <section
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-sm border border-primary/40 bg-card/95 p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="roster-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
              Mobile Infantry · Campaign record
            </p>
            <h2 id="roster-title" className="mt-1 font-display text-3xl uppercase tracking-wide">
              Roster & honors
            </h2>
          </div>
          <button className="hud-btn px-2 py-1 font-mono text-xs" onClick={onClose} aria-label="Close roster">
            Close [R]
          </button>
        </div>
        <p className="mt-3 font-mono text-sm text-muted-foreground">
          {g.campaign.totalFallen} fallen across the campaign
          {levelKeys.length
            ? ` · ${levelKeys.map((k) => `L${k}: ${g.campaign.fallenByLevel[k]}`).join(" · ")}`
            : ""}
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-primary">Active leaders</h3>
            {leaders.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">No named leaders yet. Land a team to begin.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {leaders.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-sm border border-border/70 bg-secondary/35 px-3 py-2 font-mono text-xs"
                  >
                    <p className="text-foreground">
                      <span className="text-primary">{rankOf(s.rank).short}.</span> {s.surname}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {rankOf(s.rank).title} · {s.battles} battles · {s.killsCredit} kills
                    </p>
                    {s.medals.length > 0 && (
                      <p className="mt-1 text-primary/90">
                        {s.medals.map((m) => medalOf(m).name).join(" · ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-destructive">Fallen leaders</h3>
            {fallen.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">No named leaders lost yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {fallen.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-sm border border-destructive/30 bg-secondary/25 px-3 py-2 font-mono text-xs"
                  >
                    <p className="text-foreground/80">
                      <span className="text-destructive">{rankOf(s.rank).short}.</span> {s.surname}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Fell on level {s.fallenOn.join(", ") || "—"}
                      {s.medals.length ? ` · ${s.medals.map((m) => medalOf(m).abbr).join(" ")}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-border/60 pt-4">
          <p className="font-mono text-xs text-muted-foreground">
            Leaders who take losses but survive may be decorated and promoted.
          </p>
          <div className="flex gap-2">
            <button className="hud-btn text-xs" onClick={onResetCampaign}>
              Reset campaign
            </button>
            <Button autoFocus className="font-mono uppercase" onClick={onClose}>
              Return
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FieldManual({
  g,
  introduction,
  onClose,
}: {
  g: Game;
  introduction: boolean;
  onClose: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const levelTwo = g.level === 2;
  const starting = g.phase === "landing" || g.phase === "shipLanding";
  if (starting && !showDetails) {
    return (
      <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-background/80 px-6 py-8 sm:px-12">
        <section
          className="my-auto w-full max-w-2xl text-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="opening-title"
        >
          {!introduction && <p className="mb-4 font-mono text-sm uppercase text-primary">Level {g.level}</p>}
          <h2
            id="opening-title"
            className={`font-display uppercase leading-none ${introduction ? "text-7xl sm:text-8xl" : "text-5xl sm:text-7xl"}`}
          >
            {introduction ? "Beachhead" : levelTwo ? "Secure the cruiser" : "Hold the beachhead"}
          </h2>
          {introduction ? (
            <>
              <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-foreground/90 sm:text-lg">
                Command a desperate landing force against an endless arachnid swarm.
              </p>
              <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
                Drop infantry, protect your engineers, and turn a hostile desert into a permanent defensive position
                before your troops are overrun.
              </p>
              <div className="mt-8 flex justify-center gap-8 border-y border-border/70 py-5" aria-hidden="true">
                <Crosshair className="size-8 text-destructive" strokeWidth={1.5} />
                <Shield className="size-8 text-primary" strokeWidth={1.5} />
                <TowerControl className="size-8 text-success" strokeWidth={1.5} />
              </div>
            </>
          ) : (
            <>
              {levelTwo ? (
                <Shield className="mx-auto mt-8 size-10 text-primary" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <TowerControl className="mx-auto mt-8 size-10 text-success" strokeWidth={1.5} aria-hidden="true" />
              )}
              <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-foreground/90 sm:text-lg">
                {levelTwo
                  ? "Build walls around your cruiser to form a base. Clear any bugs trapped inside."
                  : "Keep your infantry alive long enough for your defenses to stabilize the line."}
              </p>
              <p className="mx-auto mt-7 max-w-md border-t border-border/70 pt-5 text-sm leading-relaxed text-muted-foreground">
                <span className="text-primary">Tip: </span>
                {levelTwo
                  ? "Forward-deploy larger squads to protect the wall builders."
                  : "Once machine gun towers are built, pull soldiers behind them."}
              </p>
            </>
          )}
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button
              key={introduction ? "game" : `level-${g.level}`}
              autoFocus
              size="lg"
              className="h-12 w-full max-w-64 font-mono uppercase"
              onClick={onClose}
            >
              {introduction ? "Play" : levelTwo ? "Land cruiser" : "Land troops"} <ArrowRight aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowDetails(true)}>
              <BookOpen aria-hidden="true" /> Briefing
            </Button>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <section
        className="max-h-full w-full max-w-xl overflow-y-auto rounded-sm border border-primary/40 bg-card/95 p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-manual-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
              {starting ? `Mission ${g.level}` : "Battle paused"}
            </p>
            <h2 id="field-manual-title" className="mt-1 font-display text-3xl uppercase tracking-wide">
              {levelTwo ? "Secure the Landing Zone" : "Establish the Beachhead"}
            </h2>
          </div>
          {!starting && (
            <button className="hud-btn px-2 py-1 font-mono text-xs" onClick={onClose} aria-label="Close briefing">
              Close [Esc]
            </button>
          )}
        </div>
        {levelTwo ? (
          <div className="mt-4 space-y-5 text-sm leading-relaxed text-muted-foreground">
            <div className="space-y-2">
              <p>Land the command cruiser on clear ground.</p>
              <p>Seal a perimeter with walls or rock, then clear every bug trapped inside.</p>
            </div>
            <BriefingBlock title="Hold the Line">
              <p>Forward-deploy squads to protect the wall builders.</p>
              <p>High ground gives your troops better range and cover.</p>
              <p>If a builder dies, unfinished work is lost.</p>
            </BriefingBlock>
            <BriefingBlock title="Campaign">
              <p>Troopers who survive under fire may earn medals and promotions.</p>
            </BriefingBlock>
          </div>
        ) : (
          <div className="mt-4 space-y-5 text-sm leading-relaxed text-muted-foreground">
            <div className="space-y-2">
              <p>Land your first team and hold the landing zone.</p>
              <p>
                After three minutes, keep every trooper alive for another 90 seconds to secure the beachhead.
              </p>
            </div>
            <BriefingBlock title="Hold the Line">
              <p>High ground gives your troops better range and cover.</p>
              <p>If a builder dies, unfinished work is lost.</p>
            </BriefingBlock>
            <BriefingBlock title="Campaign">
              <p>Troopers who survive under fire may earn medals and promotions.</p>
            </BriefingBlock>
          </div>
        )}
        <div className="mt-5 flex items-center justify-between gap-4 border-t border-border/60 pt-4">
          <p className="font-mono text-xs text-muted-foreground">
            {starting ? "Review the briefing, then choose your landing site." : "Return when you are ready."}
          </p>
          <Button
            autoFocus
            className="shrink-0 font-mono uppercase"
            onClick={() => (starting ? setShowDetails(false) : onClose())}
          >
            {starting ? "Back" : "Return to battle"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function BriefingBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-widest text-primary">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function KillTally({
  kills,
  pulse,
  banner,
}: {
  kills: number;
  pulse: number;
  banner: { kind: string; text: string; detail?: string; pulse: number } | null;
}) {
  const countRef = useRef<HTMLParagraphElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const lastPulse = useRef(pulse);
  const lastBannerPulse = useRef(banner?.pulse ?? 0);

  useEffect(() => {
    if (pulse === lastPulse.current) return;
    lastPulse.current = pulse;
    const el = countRef.current;
    if (!el) return;
    el.classList.remove("kill-count-pop");
    // Force a reflow so the pop animation can restart on the same node.
    void el.offsetWidth;
    el.classList.add("kill-count-pop");
  }, [pulse]);

  useEffect(() => {
    if (!banner || banner.pulse === lastBannerPulse.current) return;
    lastBannerPulse.current = banner.pulse;
    const el = bannerRef.current;
    if (!el) return;
    el.classList.remove("kill-banner-in");
    void el.offsetWidth;
    el.classList.add("kill-banner-in");
  }, [banner]);

  return (
    <div className="min-w-28">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary">Bugs killed</p>
      <p
        ref={countRef}
        className="font-display text-4xl leading-none tracking-wide text-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        {kills}
      </p>
      <div className="mt-2 min-h-10" aria-live="polite" aria-atomic="true">
        {banner ? (
          <div
            ref={bannerRef}
            className={banner.kind === "milestone" ? "kill-banner-milestone" : undefined}
          >
            <p className="font-display text-lg uppercase leading-none tracking-wide text-primary">{banner.text}</p>
            {banner.detail && <p className="mt-1 font-mono text-[10px] text-muted-foreground">{banner.detail}</p>}
          </div>
        ) : null}
      </div>
    </div>
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

function CompactStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 py-0.5">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p>{value}</p>
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
