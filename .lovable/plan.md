# Level 3: Hold the Wall (options plan)

Level 3 starts the moment Level 2 is won (the cruiser is sealed in). There is no new landing. A short Level 3 start screen appears, then a siege begins. Bugs mass at the walls and climb over them where the swarm is thick enough. You win by surviving the siege.

## 1. Wall overclimb (required)
- Options:
  - **A. Pile-up climb (recommended):** when enough bugs crowd one wall segment, they form a living ramp, and bugs pour over that segment until the crowd thins. You can see it happen: the bugs stack up, the segment glows red, and a warning sound plays.
  - B. Wall damage: bugs chew segments down until they collapse into gaps that engineers must repair.
  - C. Both: crowds climb, and some bugs also damage the wall.
- Engineer teams can **repair or thicken** damaged segments (this costs credits).
- Level 2 walls stay impassable. Overclimbing only exists from Level 3 onward, so Level 2 balance is unchanged.

## 2. New or larger units (pick 1-2)
- **A. Power Suit trooper (recommended):** a slow, tough heavy unit with a short-range flamer. It is good at clearing bugs that have climbed over the wall.
- B. Sniper team: three troopers with long range and high damage, best placed on high ground behind the walls.
- C. Platoon: three squads deployed and moved as one unit (about 40 soldiers).
- D. Mobile mortar team: indirect fire over the wall into the massing crowd.

## 3. New weapon systems (pick 1-2)
- **A. Artillery battery (recommended):** a built defense that shells bug crowds outside the wall automatically. It directly counters pile-ups.
- B. Flame bunker: built on a wall segment, it scorches climbers in a short cone.
- C. Orbital strike: an ability where you click an area and it is hit after a delay. It has a long cooldown and gives a dramatic "save the wall" moment.
- D. Minefield: cheap traps placed outside the wall.

## 4. New enemy types (optional, adds pressure)
- **A. Heavy "tanker" bug (recommended):** a large, slow bug that deals heavy damage to walls and towers and anchors pile-ups.
- B. Fast climbers: small bugs that need a smaller crowd to get over.
- C. Spitter bugs: they attack defenders on the wall from range.

## 5. Win and pacing
- **A. Survive the siege (recommended):** a countdown on screen (for example, hold for 4 minutes) with three escalating assault waves and a final "mega-swarm". You win if the cruiser survives.
- B. Survive a set number of named waves (for example, "Wave 3 of 5").
- Loss works as now: the cruiser is destroyed or all units are lost.

## Recommended bundle
Pile-up climb, plus repair, Power Suit, Artillery battery, the Heavy bug, and survive-the-siege. This gives one new unit, one new weapon and one new threat, so the level stays light and arcade-like.

## Technical notes
- Add a level 3 state to the existing level flow in the engine, entered right after Level 2's sealed-perimeter victory, with its own start screen. It uses the same briefing style as the other levels.
- Overclimb: count bugs near each wall tile per tick. Above a threshold, mark the tile as climbable for pathfinding (with a crossing delay). This only applies in Level 3.
- New units and buildings reuse the shared movement, pathfinding, selection and construction pipelines.
- Add tests for the climb threshold, Level 2 walls staying impassable, the transition into Level 3, and siege win and loss.
