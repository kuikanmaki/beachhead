# Beachhead

Beachhead is a top-down, real-time browser strategy game combining tower defense with swarm survival. Command vulnerable infantry, protect your engineers, and turn a desert landing zone into a permanent defensive position against hostile arachnids.

## The game

- **Level 1 — Hold the beachhead:** Choose where to land your first four-person infantry team. Position troops at chokepoints and on high ground while individual engineers build automated machine-gun towers. Secure the beachhead by keeping infantry alive long enough for your defenses to hold the line. Engineers return to the ship after completing construction.
- **Level 2 — Secure the cruiser:** Land a larger ship on the same battlefield, retaining surviving troops and defenses outside its footprint. New infantry arrive as thirteen-person squads; engineers operate as four-person teams. An immediate edge-spawned swarm forces you to send squads ahead to protect builders. Surround the cruiser with completed walls and/or impassable rock, then clear every live enemy inside to win.
- **Construction under pressure:** Spend credits on reinforcements, towers, and wall segments. Draw wall lines with the mouse; valid lines build progressively in drag order, while blocked or disconnected plans are rejected. Engineer teams step back toward the cruiser behind each completed segment. If a builder dies, its unfinished construction is cancelled; completed structures remain.
- **Terrain and combat:** Procedurally generated terrain creates ridges, passes, and elevated positions. All movable units route around sheer rock, infantry and towers fire automatically, and enemy pressure escalates over time. The entire battlefield remains visible.
- **Defeat:** The landing ship is destroyed, or all infantry and engineers are lost.

## Controls

- **Left-click:** Select a unit or move the selected unit to a ground position; place landings and structures when their tool is active.
- **Right-click / Esc:** Clear the current selection.
- **Mouse wheel:** Zoom; click and drag the map to pan when zoomed in.
- **Build Wall:** Activate the wall tool, then click and drag to plan a line. Red outlines indicate invalid placement.
- **Deployment buttons / number keys:** Deploy infantry, train engineers, or activate construction tools. Newly deployed movable units are selected automatically.
- **Field manual:** Open optional detailed guidance; the battle pauses while it is open.

## Technical specifications

| Area | Implementation |
| --- | --- |
| Application | TypeScript, React 19, TanStack Start v1 and TanStack Router |
| Tooling | Vite 8 with the Lovable TanStack configuration; Bun or npm for development |
| Interface | Tailwind CSS v4, shadcn/Radix UI components and Lucide icons |
| Graphics | HTML Canvas 2D with procedural terrain, lighting, animated units, tracers and effects |
| Simulation | Custom browser-side engine: seeded map generation, grid-based pathfinding, enemy flow fields, combat, construction and level objectives |
| Movement | Shared terrain-aware pathfinding and waypoint advancement for infantry and engineers; enemy routing also respects completed walls |
| Camera | Cursor-anchored zoom and clamped drag-to-pan, sharing coordinate conversion with pointer commands |
| Audio | Synthesized Web Audio effects, limited to events within earshot of living troops and engineers |
| Tests | Vitest, React Testing Library and jsdom; regression coverage for routing, movement, camera, construction, unit selection and level balance |
| Hosting | TanStack Start app configured for a Cloudflare Worker deployment target |
| Game state | In-memory browser simulation; no connected database, account system or persistent saved games |

### Main source files

- `src/components/BeachheadGame.tsx` — game screen, overlays, briefings, input and animation loop.
- `src/game/engine.ts` — terrain, units, commands, simulation and victory/defeat rules.
- `src/game/render.ts` — Canvas battlefield rendering.
- `src/game/camera.ts` — zoom, panning and screen-to-map coordinates.
- `src/game/sound.ts` — positional sound synthesis.
- `src/game/fog.ts` — exploration bookkeeping; gameplay currently uses full-map visibility.
- `src/routes/index.tsx` — main game route and page metadata.
- `src/test/` — automated regression tests.

## Development

From a local checkout, install dependencies and start the development server with Bun:

```sh
bun install
bun run dev
```

Other useful commands:

```sh
bun run test       # Run regression tests
bun run lint       # Check source lint rules
bun run build      # Create a production build
bun run preview    # Preview the production build locally
```

Node.js and npm can also be used with `npm install` and the corresponding `npm run` commands.

## Built with Lovable

This project was built with [Lovable](https://lovable.dev). Continue editing it in the [Beachhead project](https://lovable.dev/projects/c6309caa-6a7b-496d-9fa2-8135284ac63c).
