# Catnight handoff (2026-11-21)

Where the native Unreal game stands, so another agent can continue. Read with:
`docs/UNREAL_NATIVE_PLAN.md` (phases), `docs/CATNIGHT_PARITY.md` (every browser feature, its
Unreal status and the "better" target) and `apps/catnight/README.md` (build, play, test).

## The goal (owner's words, paraphrased)

The browser game rebuilt entirely in Unreal, for Steam, working title **Catnight**: the *same game*
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

| Commit | What |
|---|---|
| c821d90 | Phase 1: rules, bots, records ported to C++ (`CatnightRules`), proven step by step against TypeScript |
| 82f730a | Phase 2 part 1: Unreal project `apps/catnight`, match layer, plain Slate table |
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
2. Phase 2 leftovers: package a build (`RunUAT BuildCookRun`, README) and check `/Game/Generated`
   cooks; play a game by hand with mouse and a gamepad.
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
