# Catnight handoff (2026-11-21)

Where the native Unreal game stands, so another agent can continue. Read with:
`docs/UNREAL_NATIVE_PLAN.md` (phases), `docs/CATNIGHT_PARITY.md` (every browser feature, its
Unreal status and the "better" target), `docs/CATNIGHT_UI_PLAN.md` (the Hall & Chart UI plan:
look, components, screens, milestones UI-0 to UI-11) and `apps/catnight/README.md` (build, play,
test).

## The goal (owner's words, paraphrased)

The browser game rebuilt entirely in Unreal, for Steam, working title **Catnight**: the _same game_
with every feature kept, and clearly better in every part, the 3D most of all.

## Rules for whoever continues

- **Never push without the owner's explicit yes** (each push is approved on its own). Commit locally.
- **Another session works in the same checkout (E:\Catan).** Stage only named paths, never
  `git add -A`. Its uncommitted files (3D walk code, models, design files, a kit zip...) are not ours.
- Don't delete the web game: it is the rules reference until phase 6.
- Rules change in `packages/engine` ⇒ same change in `apps/catnight/Plugins/CatnightRules`, then
  `pnpm golden`, `pnpm native:test`, `pnpm catnight:test` (all 248 golden games must match).
- Git on this PC: `C:\Users\LOQ\AppData\Local\GitHubDesktop\app-3.6.6\resources\app\git\cmd\git.exe -c safe.directory=E:/Catan`.
  Write commit messages to a UTF-8 file and use `-F <file>`.
- Close the Unreal editor before building. Engine: `E:/UE_5.8`. Blender: `E:/Blender/blender.exe`.

## Done and pushed (origin/main)

| Commit  | What                                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| c821d90 | Phase 1: rules, bots, records ported to C++ (`CatnightRules`), proven step by step against TypeScript                                                                                      |
| 82f730a | Phase 2 part 1: Unreal project `apps/catnight`, match layer, plain Slate table                                                                                                             |
| ec2a1ef | Phase 2 part 2: title / new-game screens, hot-seat curtain, autosave + Continue, undo, targeted offers and counters, leave and victory dialogs, keys and gamepad on the board; parity list |

## Completed locally: phase 3, first part (the 3D war table)

Named paths in this milestone (local commit; a push still needs the owner's explicit approval):

```
.gitignore                     (+ apps/catnight/SourceArt/, apps/catnight/Content/Generated/)
package.json                   (+ "catnight:import")
apps/catnight/Catnight.uproject           (+ ProceduralMeshComponent, PythonScriptPlugin, EditorScriptingUtilities)
apps/catnight/Config/DefaultEngine.ini    (Lumen, virtual shadows, TSR, distance fields)
apps/catnight/Config/DefaultGame.ini      (DirectoriesToAlwaysCook /Game/Generated, /Engine/BasicShapes)
apps/catnight/import.ps1                  (new: Blender split + Unreal import)
apps/catnight/Tools/split_models.py       (new, Blender)
apps/catnight/Tools/import_models.py      (new, Unreal Python)
apps/catnight/Source/Catnight/Catnight.Build.cs
apps/catnight/Source/Catnight/Private/Board/CatnightBoardActor.{h,cpp}   (new)
apps/catnight/Source/Catnight/Private/Table/BoardView.h                  (new)
apps/catnight/Source/Catnight/Private/Table/STable.{h,cpp}
apps/catnight/Source/Catnight/Private/Ui/SCatnightRoot.{h,cpp}
apps/catnight/Source/Catnight/Private/CatnightGameMode.cpp
apps/catnight/Source/Catnight/Public/CatnightGameMode.h
apps/catnight/validation/board3d-1.png, board3d-close.png, board3d-setup.png
AGENTS.md, apps/catnight/README.md
docs/CATNIGHT_HANDOFF.md, docs/CATNIGHT_PARITY.md, docs/UNREAL_NATIVE_PLAN.md, docs/DECISIONS.md
```

What it does:

- **Art pipeline** (`pnpm catnight:import`, git-ignored output, rebuilt from the web game's GLBs):
  1. `Tools/split_models.py` (Blender) reads `apps/web/public/models/{village,flora,rocks,props,supplies}.glb`
     and writes `apps/catnight/SourceArt/Models/<family>.glb`, with every root object joined into
     one mesh at the origin (92 models, one shared atlas per family).
  2. `Tools/import_models.py` (Unreal commandlet) imports them to `/Game/Generated/Models/<family>/SM_<Model>`
     and makes `/Game/Generated/Materials/`: `M_Model` (texture × vertex colour × `Color`, `Emissive`),
     `M_ModelMasked` (alpha-cut leaves), `M_Tint`, `M_VertexColor`, `M_Glow`, `M_Water`. Every imported
     slot is re-parented to M_Model / M_ModelMasked with the glTF texture and factors.
- **`ACatnightBoardActor`** (spawned by the game mode): procedural hex tiles and sand shelves,
  per-terrain scenery scattered with instanced meshes (seeded by the board), ivory number tokens
  with pips, docks, boats and rate plaques, settlements (Cottage) and cities (Hall) with the owner's
  colour on `Owner_*` materials, roads, robber, glowing legal-target markers, an oak war table with
  a sea tray, sun + sky atmosphere + sky light + fog, a smoothed orbit camera that keeps the island
  clear of the side panel.
- **`FCatnightBoardView`** (`BoardView.h`) is shared by the UI and the actor: targets, hover,
  focus, `b3D`, `PickUnderMouse()`, `MoveCamera()`, `Revision`.
- **Table UI over 3D:** the left side is transparent; right-drag / right stick turns, wheel zooms;
  "Flat view" button switches back to the 2D chart; the menus show the table dimmed behind them.
- New command-line options: `-CatnightFlat`, `-CatnightCamera=<yaw>,<pitch>,<zoom>`,
  `-CatnightPickTest` (logs `CATNIGHT PICK n of m`).

Verified: builds; screenshots in `apps/catnight/validation/board3d-*.png`; pick self-test
46 of 46 legal spots from three camera angles.

**Completion check (2026-11-21):**

- The editor-target build succeeds, including the final camera-hint panel edit.
- `pnpm catnight:test` completes: **PASSED: 3 automation tests**. All 248 golden games match
  (116,078 actions, 2,417 rejected, 96,489 bot moves, 90,531 probes); 12 match games reach a
  win; hot-seat/save/undo checks 181 hand-offs. `pnpm verify` passes too.
- `pnpm catnight:import` was rerun: 92 meshes in five families. Replacing old generated packages
  logged 36 linker warnings; a separate fresh Unreal process then loaded all 92 meshes and
  checked all 169 material slots (159 regular, 10 alpha-masked), with no missing mesh,
  material, parent or texture. The audit is `Saved/handoff-asset-audit.json` (ignored).
- Fresh setup picking matches **50 of 50 legal targets from each of three camera angles**, with
  saving disabled (the original handoff's seed had 46 legal targets). Logs and extra angle captures are in `Saved/Logs/handoff-pick-*.log` and `Saved/Validation`; the refreshed
  `validation/board3d-setup.png` shows the camera hint.
- Parity, native-plan §10, native README, AGENTS §12 and the decision log are updated.
- The 3D table is still **part**, not a finished phase 3: packaged cooking and a full manual
  mouse/real-gamepad playthrough remain the next gate. No push is authorized by this handoff.
- `native/tests/main.cpp` is an unrelated working-tree edit, excluded from this milestone.

## Gotchas learned the hard way

- **Instanced meshes need `used_with_instanced_static_meshes`** on their materials, or a game build
  silently draws the default grey grid material (set in `import_models.py`'s `material()`).
- glTF materials from Interchange ignore vertex colour; the Blender models are vertex-painted, so
  `M_Model` multiplies `VertexColor`. Don't add a gamma fix: colour round-trips exactly.
- Leaf material is glTF `alphaMode: MASK` → `M_ModelMasked` (alpha modes read from the GLB JSON).
- In `rematerial`, take only the vector parameter `BaseColorFactor` (others like
  `BaseColorTexture_OffsetScale` turn models black).
- UE treats warnings like C4458 (a local hiding a member: `Yaw`, `Owner`, `Clear`...) as errors.
- `CatnightRules` must keep `FPSemantics = Precise` and the `CATNIGHTRULES_API` exports.
- Slate: `TArray::Add` must not take a reference into itself; screen switches are deferred
  (`SCatnightRoot::Show` → next tick) because the caller is often a button on the old screen.
- PowerShell 5.1: `Get-Content -Raw` reads UTF-8 without BOM as ANSI and breaks `·`. Use
  `[IO.File]::ReadAllText/WriteAllText` with UTF-8.

## Next steps (in order)

1. Obtain the owner's approval before pushing the local 3D-table commit.
2. Phase 2 leftovers: finish a full game by hand with mouse and a physical gamepad. The cooked
   Development package, artwork, automated matches and representative interactive flows are
   now checked (see the packaged-validation update below).
3. Phase 3, rest (parity §3–4, §8–9):
   - Board polish: dice that roll on the table, placement animations and dust, hex tooltip,
     production highlights, time of day (sun/moon from rounds), water with foam and better waves,
     tokens readable from any angle, buildings facing their best tile, roads as the web's bridges.
   - The hall around the table (stone, torches, banners) and the menus over it.
   - Hall & Chart UI in UMG/CommonUI: banners, decrees, Treasury with card art
     (`apps/web/public/art/cards`), tabs, toasts, Chronicle, Settings, How to Play.
   - Audio: render the WebAudio SFX and music to WAV; music on menus and the table only.
   - Settings and accessibility (reduce motion, colour-blind glyphs, UI scale, key rebinding).
4. Phase 4: the island walk (migrate `apps/unreal 5.8` island and `CatanAnimation`), knight,
   horses, rooms, chest, minimap, Character and My kingdom.
5. Phase 5: Steam online (host as referee, owner-only replication, rejoin, autopilot) and duels.
6. Phase 6: release (gate 0 name decision first: "Catnight" is taken on Steam).

## Packaged-validation update (2026-11-21)

The 3D table is committed locally as `eb29431`. It has not been pushed. A Windows Development
package now builds at `apps/catnight/Packaged/Windows/Catnight.exe`; keep the full Windows folder.

- `pnpm catnight:package` checks the imported artwork before BuildCookRun; it refuses a missing
  or incomplete import rather than producing an empty board. The cooked IoStore container holds
  all 92 meshes and 156 generated asset packages, plus the basic shapes loaded by path.
- `pnpm catnight:test-package` inspects that cooked container, runs both match automation tests
  inside the packaged executable (12 full games; hot-seat/save/undo), picks 50/50 spots at three
  camera angles, and captures title, new game, flat board and an autoplay victory.
- The screenshot harness now supports `-CatnightShotOnWin`. A fixed delay could capture a
  still-running game under desktop load; the packaged test instead requires an actual ended
  match and its `CATNIGHT CAPTURE victory after ... actions` log before accepting the capture.
  Screenshot polling also quits shortly after the capture completes, rather than waiting another
  full capture delay.
- Interactive native-app checks cover three-player seat setup, the hot-seat curtain, mouse
  settlement placement, arrow/Enter road placement, wheel zoom, Flat/3D switching, Ctrl+Z undo,
  the leave menu and save/Continue across a process restart. An isolated UserDir was used: the
  six-action save stayed byte-for-byte identical after Continue; the player's save was untouched.
- Tracked evidence and scope: `apps/catnight/validation/package-validation.json` and the
  `packaged-table.png` / `packaged-victory.png` captures. Detailed logs and automated reports are
  ignored under `Saved/PackageValidation` and `validation/*.log`.
- Full manual mouse play, a physical gamepad (including reconnect), and a clean-PC prerequisite
  check remain open. This is not a finished phase 3 or a release build. No game rules changed.
- `native/tests/main.cpp` remains another session's edit. Stage only the named native packaging,
  capture-harness, evidence and documentation paths; no push without a fresh owner approval.

## Native table feedback (2026-11-21, isolated branch)

The owner requested continuing the remaining 3D plan. This pass is in the managed worktree
`C:/Users/LOQ/.codex/worktrees/native-table-feedback/Catan`, branch `codex/native-table-feedback`,
integrated with `b4b988c` (the Hall/UI first pass, after `c69a443`). The shared `E:/Catan`
checkout's remaining edits are another session's work; do not stage or overwrite them. This
branch preserves `STableHud.cpp`/HallKit and adds the shared board-view motion flag.

Implemented:

- Carved, bevelled bone dice, a felt/timber tray, a rules-result-driven toss and textual result.
  The toss is kinematic, not a new RNG or physics referee. Real dice physics/camera nudge remain.
- Five-second masked construction of the original painted cottages/halls, including setup and
  city upgrades, with scaffolding and transient dust. Later actions do not restart it. Original
  textures and owner colour are copied into the construction material and restored at completion.
- Accepted-action presentation events, separate from state refresh/replay. Undo, new games and
  Continue clear effects instead of replaying old animation.
- Production uses the actual `ResourcesProduced.hexes` / `blockedHex` event: paid markers with
  `+`, blocked marker with `X`, delayed until dice settle and then cleared.
- Tokens and pips face the orbit camera; houses face their strongest producing neighbour.
- Public map notes: terrain/resource, roll/odds, production claims and robber/bank caveats. Hover
  a hex, or use I / gamepad X. They are non-interactive and hidden during modal/privacy screens.
- The Hall Settings reduced-motion preference also finishes table builds/dice immediately and
  removes dust. No second preference is stored. QA flags override presentation without saving.
- Map notes use HallKit vellum beside the board, clear of the Herald; the Lists show dice results.

Validation support:

- `Catnight.Match.TableFeedback` drives the real match + actor: 36 dice pairs, 10/60/144 Hz
  construction, painted atlas/owner-colour preservation, undo/Continue, reduced motion, real
  production events, and an editor shader-graph connection regression. There are now four native
  automation tests and three packaged match/board tests.
- `pnpm catnight:test-package -ReviewTable` audits all 157 generated packages (92 meshes), tests
  the match/board, repeats three-angle picking and a rendered victory, and captures nine extra
  scenes for staged cottage/city construction, dice, production, reduced motion and a Deck map note.
- Run `pnpm catnight:import` again: `/Game/Generated/Materials/M_Construction` is new. The package
  preflight requires all seven base materials. Generated assets and detailed logs remain ignored.
- Material graph gotcha: ComponentMask's unnamed first input must be connected with an empty
  input name through `MaterialEditingLibrary`. The importer now asserts the connections, and
  the native test checks this graph. A first editor view may still be compiling shaders; accept
  the cooked-game captures and reject any shader/default-material fallback warning.
- Keep source edits isolated while the other session's editor is open. Unreal's IDE Live Coding
  guard is global to the editor executable. For this unloaded worktree module only, build with
  `-NoHotReloadFromIDE` after checking no editor for this project is running; do not close the
  other session's editor. The normal script still requires closing its own editor before builds.

Final validation: four editor tests (248/248 goldens), three packaged match/board tests, all
157 generated assets cooked, 50/50 legal picks at each of three angles, and a rendered 694-action
match to victory. The nine additional scenes and a saved-preference restart were reviewed.
`pnpm verify` also passed (132 tests); no TypeScript changed afterward.
Scoped evidence is in `apps/catnight/validation/table-feedback.json` with selected captures.
The dice tray sits clear of the Hall HUD, and the control hint wraps within the island column.

Next work remains: finish Hall & Chart UI/hall/audio, bridge roads and owner sigils, crop wind,
water/foam/boat motion, time of day, flying resource cards, physics dice, full settings/input
accessibility, full manual/physical-gamepad acceptance, native island walking, Steam online and
release. No game rules changed, and no push is authorized.

## Native knight and riding foundation (2026-11-22, isolated branch)

The owner requested rebuilding the knight, horse and movements with Blender and Unreal and
specifically asked to use `E:/Catan_art_obj`. Work continues in this same isolated branch;
the shared `E:/Catan` checkout is untouched. Read `docs/CATNIGHT_HEROES.md` for implementation,
controls, regeneration and the remaining island gates. DECISIONS #68 records the choices.

- The title's **Knight & riding yard** opens a 120 m local practice area. Esc returns to the
  hall; bots pause while practising. This is phase 4's character foundation, not the live island.
- Original Blender knight: peaked armet, layered plate, articulated fingers, olive cloth, no
  cape (removed 2026-11-27, DECISIONS #76). Anatomical bay horse: painted
  coat, blaze, fitted bridle/saddle/blanket/stirrups. Reference sheets 00/17/19 are hashed.
- Two skeletal meshes, eleven loops, native pose blending, distance-driven gait phase,
  CharacterMovement collision/crouch, late swept camera, supported safe dismount, and visible
  animated hand-to-bit reins. No rule changes or browser asset replacements.
- `pnpm catnight:heroes` builds ignored editable blends/FBXs in `SourceArt/Heroes`, then imports
  `/Game/Generated/Heroes`. It is also part of `catnight:import`. **Both** model and animation
  FBX settings need scene-unit conversion; otherwise the import is 100 times too small.
  Export vertex colours as linear: Unreal's skeletal importer does not decode Blender's
  default sRGB values. Keep this explicit or the cloth and coat wash out.
- `pnpm catnight:test-heroes` checks the cooked meshes/clips, thirteen physical scenarios at
  fixed 10/60/144 Hz simulation steps, six movement modes and a rear riding view. `-Editor` uses the editor game;
  `-Quick` is a two-pose visual iteration only. Results and scope belong in
  `apps/catnight/validation/heroes.json`; detailed logs remain ignored under `Saved`.
- Physical daylight uses manual EV13 exposure and cached-light pre-exposure 8, covering both
  this yard and the table. Default 4 clips the daylight Lumen cache in UE 5.8. Do not hide the
  resulting warning or compensate with a blanket colour filter.

Next: connect this character foundation to the actual live island/rooms, add weapons/combat,
customization, minimap, terrain foot IK, LOD/performance work and full controller acceptance.
The yard alone does not close those parity rows. Stage named files only; no push is authorized.

Completed validation: five editor tests (248/248 golden games), final cooked hero asset/clip
checks, and 7,910 route checks with zero failures across fixed 10/60/144 Hz steps. All seven
packaged views were reviewed, including front gallop and rear riding after lowering the aim
point so the feet remain in frame. Interactive title/yard, mount/dismount, mouse/wheel input,
Esc return and Enter menu focus passed in an isolated UserDir; the test app closed cleanly.
The table regression passed all 181 cooked assets, three match/board tests, 50/50 picks at
each of three angles and a rendered 694-action victory. `pnpm verify` passed (132 tests).
Exact run scope/timing, art hashes, remaining gates and four captures are recorded in
`apps/catnight/validation/heroes.json`. Generated blends/assets/binaries remain ignored.

## Integration for the requested push (2026-11-22)

The owner explicitly requested committing and pushing. The feature branch integrates main
through `c33e683` (UI readability, prompts, sounds/card flights, the hall, day/night and table
camera fixes), preserving the local table feedback and knight/riding work. The shared checkout
is untouched; the target remains `codex/native-table-feedback`.

- The board owns the single carved dice pair. The hall actor's optional dice are disabled in
  this combined app, including after returning from practice.
- Gamepad X remains Undo. I / left-stick click cycles map notes; the bottom hint remains visible
  alongside the newer device prompts. Settings retain both day/night/hall and reduced motion.
- Practice removes the table's global daylight, atmosphere, fog and grading, plus its hall;
  return rebuilds them from the paused match. `catnight:test-heroes` now includes a headless
  yard-return lifecycle check (lighting, hall, dice owner, table view and cursor/input state).
- Rendering scripts explicitly use browser `globalThis` properties inside Playwright callbacks,
  keeping the repository's zero-warning lint check valid.

Integration results and selected packaged captures are in
`apps/catnight/validation/integration.json`. The original hero report remains a record of its
earlier pass; the integration report records this newer combined revision. No rules changed.
The combined revision passed five editor automation tests (248/248 golden games), `pnpm verify`
(132 unit tests), packaging, 7,910 movement checks, the yard-return lifecycle check, seven hero
views, all 181 cooked assets, three packaged match/board tests, 50/50 picks at each of three
angles and a rendered 694-action victory. Physical-gamepad and full-island acceptance stay open.

## Revolver removal (2026-11-22)

At the owner's request, active equipment is now bare hands (1) and sword (2); 3 is unbound.
The HUD, chest reveal, local/remote models and firing effects no longer offer the revolver.
The original Blender props and interaction sources have been rebuilt without it, including
removal of the two old FBX exports. The wrapper's staged game and converted interaction source
match the canonical files. No new push was requested for this change.

Both live reducers reject `Fire` and ranged `Strike`; the online referee rejects them too and
normalizes old ranged poses to hands. Preserve the retired v1 enum/action/ammunition fields:
only archive reconstruction uses `applyRecordedAction` / `ApplyRecordedAction`, and continuing
that record returns to the normal melee-only reducer. TS record replay, standalone C++ and
Unreal tests exercise this boundary. `ShotFired` is no longer required in live golden coverage.

`catnight:import` now produces 91 board meshes and 180 generated assets, with no `SM_Revolver`.
Packaging refuses a stale imported gun, and package validation audits the cooked container and
runs the melee-only automation test. Results are recorded in `apps/catnight/validation/melee-only.json`.
The older animation practice's editor target compiles; its historical four interactive PIE
sessions have not been rerun. This change does not complete the native island/combat migration.

Final removal validation: `pnpm verify` passed (133 unit tests), all 12 focused browser
checks passed, standalone C++ passed 261 checks with all 248 golden games matching, and all
six editor automation tests passed. The rebuilt Development package passed three match tests,
hero asset validation and the new melee-only rules test, the cooked-content audit (180 assets,
no revolver), 50/50 picks from each of three angles, and a rendered match to victory. The
regenerated board and two-slot HUD were visually reviewed. The updated executable is
`apps/catnight/Packaged/Windows/Catnight.exe`; generated outputs remain ignored.

## Full performance audit (2026-11-24)

The owner requested a full game performance test. See `docs/PERFORMANCE_2026-11-24.md` and
`apps/catnight/validation/performance-2026-11-24.json` for scope, data and follow-ups. No gameplay
optimization or new push is included. Saved native runners/raw CSVs and browser reports are ignored
local evidence; the normal Continue save is untouched.

- Verified native 1920x1080 clients at 100% render scale, capped and uncapped, plus 720p and a
  five-minute busy-board soak. Uncapped board/normal/Instant bot samples average 87–96 FPS.
  Capped Instant play has 21.17% late frames; uncapped Instant has none above 20.83 ms.
- Native soak: 59.97 FPS, no >50 ms frames, memory stable near 1110 MiB after its initial rise.
- Full reference island: RTX Full is about 60 FPS through early/late routes, biomes and rooms.
  First entry takes 3.603 s with a 2.124 s main-thread task; repeated entries still take about
  2.4 s. Intel UHD Full falls to 31 FPS in wheat; Lite/75% is insufficient for consistent 60 FPS.
- Twenty enter/exit cycles have zero orphan WebGL draws or context warnings, but post-GC heap
  rises 13.56 -> 17.81 MiB. Attribute game/probe/browser retention before declaring a game leak.
  The separate five-minute island soak has stable renderer resources and fluctuating heap.
- Benchmark log calls now checkpoint partial reports, and normal UI/navigation waits are bounded
  at 30 s. Logging happens outside the timed samples. Force native resolution with `r.SetRes`,
  verify the client size, and use `-csvNoProcessingThread`; async CSV shutdown returned 777003
  while unprofiled and synchronous captures returned 0. Discard the initial unverified grid.
- Final checks: verify (133 tests), native rules (261 checks, 248 goldens), six editor tests and
  all 7,910 movement checks pass. Wallpaper was restored. This is not Shipping/144-Hz, Steam,
  network-latency, CEF-wrapper or cross-machine certification.

## Owner-approved integration and push (2026-11-27)

The revolver removal and performance audit are committed as `3c4963f`. Before pushing the
existing `codex/native-table-feedback` branch, merge main through `2d91eef`: keep its title
banners, frame-rate settings, profiler, TSR history setting, cascaded shadows and editor-only
MCP setup alongside the native character/riding yard. Codex registration is documented in
`apps/catnight/README.md`; the user's personal MCP configuration stays outside Git.

The menu/flat-chart optimization disables world rendering, so entering the yard now explicitly
resumes it, and the collapsed table UI no longer changes viewport rendering. The return
regression simulates entering after the menu has disabled drawing. Game-only editor test
launches exclude experimental MCP toolsets: these are absent from packaged play, and otherwise
raise Python startup errors or attempt a second listener on the editor's port. Normal editor
MCP remains enabled. The separate editor open from `E:/Catan` was left running and unchanged.

Fresh checks: `pnpm verify` passes all 133 unit tests, typechecking, zero-warning lint and the
web production build. `pnpm golden` regenerates 248 games; `pnpm native:test` passes all 261
checks, matching all 248 games and 116,509 actions. The merged editor target builds;
`pnpm catnight:test -NoBuild` passes six automation tests with no error log entries.

`pnpm catnight:test-heroes -Editor` also passes: 7,910 movement checks across 10/60/144 Hz,
the yard-return lifecycle and seven rendered views. Idle, crouch and mounted captures were
visually reviewed. Evidence: `apps/catnight/Saved/HeroValidation/20261127-045550-894` (ignored).
The existing packaged executable was not rebuilt for this integration; package again before
validating or distributing the merged app.

## Native island rework (2026-11-27, local work after 5a6ef3c)

The owner approved rebuilding the native world using Blender and actual Unreal MCP. The new
`Private/Island` code connects Explore island to the match: 19 continuous collision tiles at a
65 m radius, roughly 520 × 563 m, about 19,710 scenery instances for `island-rework`, existing
owner buildings/roads/harbours, native chart, knight and horse. Escape restores the paused table.
No rules/record change and no browser work. See `CATNIGHT_ISLAND.md` for scope and commands.

Six original Blender furnishings and ground detail are in `assets/blender/native_island.py`;
`pnpm catnight:island` exports/imports them without deleting board or hero assets. Full
`catnight:import` includes that step. Interchange mesh paths stay stable across reimports. The
editable generated IslandPreview map is explicitly excluded from cooking. Refresh only with
`-CatnightRefreshIslandPreview`; normal imports preserve any hand edits. Generated files remain
ignored and need rebuilding in fresh checkouts.

Actual Epic MCP on an isolated editor at port 8001 inspected/edited this worktree's island,
sun, cameras and ground material. It discovered and repaired a disconnected vertex-colour
input; the importer now asserts that wiring. Final exposure matches the player camera. MCP
captures/proofs live in Saved/MCP, with selected images retained under validation. The shared
`E:/Catan` editor at port 8000 was left unchanged. Do not reconnect to it for edits to this tree.

Ground support now samples the actual terrain triangles; mounted capsules sweep onto slopes,
dismounts also sweep onto supported floor, and the horse/rider body follows the floor while
retaining saddle/rein contact. Do not describe
this as per-leg foot IK. Hero asset tests wait for cold-load asset compilation before sampling
compressed loops and identify the exact clip/bone if a loop fails.

Checks already completed before packaging: `pnpm verify` (133 unit tests), seven editor
automation tests (including 248/248 goldens and 116,509 actions), 5,453 route samples, 38 real
surface-height probes, 116,925 movement checks across 95 scenarios at 10/60/144 Hz, six biome
renders, three island/table return cycles, and the existing yard's 7,910 movement checks,
return lifecycle and seven rendered poses. See `validation/island-rework.json` for final
packaged evidence and the exact scope/revision. Fixed simulation rates are not rendering FPS.

Phase 4 is partial: closed house shells, static sheep and sails, no crop wind, full minimap
modes/markers, footstep audio, chest/combat/customization, per-leg terrain IK or Steam yet.
Continue from those gates rather than claiming parity is complete. This rework is local;
no new push was requested. Stage named files only if committing, and ask before any new push.

## Movement, summit routes and presentation rework (2026-11-27)

Current work is on `codex/native-table-feedback` in the isolated Codex worktree. The older
uncommitted foundation was preserved in the named stash before fast-forwarding to main's
`297c9c0`; do not pop it over this rework. Another session may still work in `E:/Catan`.

The owner requested upright natural knight walk/run/crouch, a smoother cartoon-realistic horse,
walkable mountains, livelier water/sky/foliage/light, connected table harbor landings, a fitting UI,
stationary player cards, no keyboard-instruction strip and no 3D dice/tray. The changes are native
in `apps/catnight` and its Blender/import tools. `SDiceResult` is shared by table and exploration;
exact dice faces and total are reconstructed from accepted events on replay and written to the log.
No rules, RNG, record schema, browser gameplay or online protocol changed.

Knight foot placement uses game-thread traces and worker-thread two-bone IK, disabled while riding.
Mounted clips preserve the reference hip anchor; the movement suite checks saddle/rein contact.
Solid scenery reserves the actual summit polyline, including its approach, rather than relying on
the faster approximate painted-path distance. There are 15 crag summit routes on the review seed;
all 2,415 floor/slope samples and the existing 5,453 connected route samples pass.

Rebuild original assets with `pnpm catnight:import`, `pnpm catnight:heroes`, `pnpm catnight:island`.
Living sky/wind/water materials are mandatory in package preflight. Keep generated binary output
ignored. Final rendered/packaged validation evidence is recorded alongside this milestone when
completed. Remaining phase 4 work includes interiors, native combat/chest, customization, ambient
animals, sails, footstep audio, horse per-leg terrain IK, map modes, streaming and physical controller
acceptance. This does not claim Fortnite fidelity or a complete phase 4. No new push is authorized.
