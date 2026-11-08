<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep map-camera coordinate conversion and zoom constraints in `src/game/camera.ts`; rendering and pointer commands must share them so zoomed input stays aligned.
- Keep fog-of-war exploration state in `src/game/fog.ts`; the engine updates it from troop positions so rendering and commands share the same visibility rules.
- Process engineer deaths and construction cancellation before assigning or advancing construction in the simulation; dead builders must never finish work or hand cancelled projects to replacements.
- Keep the Level 1 opening separate from optional field-manual details and hide the battle HUD during the opening; players should reach landing without mandatory detailed instructions.
- All troop types share the existing pathfinder, movement orders, and waypoint advancement in the engine; engineer construction travel uses them too, preventing terrain bypasses.
