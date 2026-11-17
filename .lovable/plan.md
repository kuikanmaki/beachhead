# Level 3: Hold the Wall

Level 3 begins the moment Level 2 is won (the cruiser is sealed in). There is no new landing. A short Level 3 start screen appears, with the same style as the other levels:
- Title: "Hold the wall"
- Line: "Survive the swarm until it breaks."
- Tip: "Call Orbital Napalm on swarms piling up at the wall."

After the start screen, the swarms attack at once and keep getting bigger.

## Wall overclimb (pile-up)
- If enough bugs crowd one wall segment, they form a living ramp. Bugs cross that segment until the crowd thins out.
- Warning signs: the segment pulses red, a crowd marker appears, and you hear a warning sound if your troops are nearby.
- Climbing takes a short moment, so your troops get a chance to react.
- Walls in Level 2 stay impassable, so Level 2 is unchanged.

## Orbital Napalm Strike (new weapon)
- New button [5] Orbital Napalm. It costs a large amount of credits and has a cooldown.
- Click a spot on the map. A targeting circle appears, and after about 2 seconds a fire strike hits it.
- The fire burns for a few seconds and kills or damages bugs in the area. It also hurts your own troops standing there, which fits the expendable-infantry theme.
- Visuals: a beam from orbit, a fireball, burning ground and scorch marks. Sound: a distant roar, then the blast.

## Objective and end
- Goal: survive the swarms.
- The game counts how many bugs you kill during Level 3. The target number is hidden from the player.
- When you reach the target, every bug turns and runs back to the map edge, and a "The swarm breaks!" victory screen appears.
- You lose as now: the cruiser is destroyed, or all your units are lost.
- The swarm pressure is set so that you can't win by just waiting: you need napalm, towers and squads.

## Not included now
No new or larger units yet.

## Technical notes
- Engine: add level 3 to the level flow, entered from Level 2's sealed-perimeter victory, with a hidden `levelThreeKillTarget` and a per-level kill counter. Add a retreat phase in which bugs path to the nearest edge and despawn, then victory.
- Overclimb: count bugs per tick in a radius around each wall tile. Above a threshold, the pathfinder treats that tile as passable with a climb delay. This applies only in Level 3.
- Napalm: add `orbitalStrike(x, y)` with cost and cooldown checks, a delayed impact, and a burning area-damage zone. Rendering and sound reuse the existing effect and positional-audio systems.
- UI: a [5] button with cooldown and cost display, the Level 3 briefing, and the victory screen. The HUD hides during the briefing, matching the existing rule.
- Tests: climb threshold, Level 2 walls stay impassable, transition into Level 3, napalm cost, cooldown and damage, and that the kill target triggers retreat and victory.
- Update README, AGENTS.md, memory and the roadmap.
