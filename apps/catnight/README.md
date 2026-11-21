# Catnight (working title) in Unreal

The game rebuilt natively in Unreal Engine 5.8, without the browser inside it. Plan and phases:
[`docs/UNREAL_NATIVE_PLAN.md`](../../docs/UNREAL_NATIVE_PLAN.md). The old browser-wrapper app
(`apps/unreal`) keeps working until this one replaces it.

## What is here (phase 2 and the first 3D-table milestone)

- `Plugins/CatnightRules`: the rules, bots and record format in plain C++20 (no Unreal types), a
  port of `packages/engine` proven step by step against it (see the plan, §4.1).
- `Source/Catnight`: the game.
  - `FCatnightMatch` (`CatnightMatch.h`): one local game, its action record and log, and the
    bots' clock. `UCatnightMatchSubsystem` owns it and ticks it every frame.
  - `ACatnightBoardActor` (`Private/Board`): native procedural hexes and sand shelves, instanced
    Blender scenery, 3D tokens/pips, docks/boats, owner-coloured cottages/halls, roads and robber,
    legal-target markers, an oak war table, sun/sky/fog and an orbit camera.
  - `STable` (`Private/Table`): the Slate action panel and board input. The left side lets the
    native board show through; **Flat view** switches to the 2D chart. Click highlighted spots to
    build. The panel has actions, hand/development cards, players and the log.
  - `FCatnightBoardView` (`Private/Table/BoardView.h`): targets, hover/focus and camera callbacks
    shared between the board actor and Slate.
  - `SCatnightRoot` (`Private/Ui`): title, new game (seats, people or bot levels, target,
    layout, seed) and the table. `CatnightUi.h` has the shared Slate pieces.
  - The table also has the hot-seat curtain, the leave and victory dialogs, undo, targeted offers
    and counters, and keyboard/gamepad picking on the board.
  - Saves: every action writes `Saved/SaveGames/Catnight-continue.json` (a `hexfall-record`);
    Continue on the title screen replays it.
  - `ACatnightGameMode`: shows the title screen, or a table straight away with the options below.
  - `Lexicon.cpp`: every player-facing word. The terms are still the web game's until gate 0
    (the name and terms) is decided.
- What the browser game has and Unreal still lacks: [`docs/CATNIGHT_PARITY.md`](../../docs/CATNIGHT_PARITY.md).
- The game uses the engine's `Entry` map and creates its table at runtime. Model/material assets
  live in ignored `/Game/Generated`; recreate them before playing or packaging (below).
- Hall & Chart visual polish, the hall, animated dice/placement, audio and the island walk remain
  later milestones. The Development package passes cooked-asset and match checks; a full manual
  mouse/real-gamepad playthrough is still required.

## Rebuild the board artwork

On a fresh checkout, first build the editor target with the command in the next section.
Close every Unreal editor/game process using this project, then run:

```powershell
pnpm catnight:import
```

`Tools/split_models.py` uses `E:/Blender/blender.exe` to join each root model from the original
`apps/web/public/models/{village,flora,rocks,props,supplies}.glb` files into a single origin-centred
mesh. `Tools/import_models.py` imports 92 meshes and their textures/materials into Unreal using
`E:/UE_5.8`. The intermediate files in `SourceArt/Models` and output in `Content/Generated`
are ignored; the original web GLBs remain tracked. A fresh checkout needs this command. The import report is `Saved/catnight-import.json` and its
Unreal log is `Saved/Logs/catnight-import.log`. Regenerate after changing the Blender GLBs.

The base model material multiplies texture, vertex colour and tint; alpha-cut leaves use
`M_ModelMasked`. Instancing usage is enabled on the materials. Owner slots retain their names
for player-colour tinting. Do not replace these with the default glTF material: it drops the
vertex paint. The command accepts `-Engine` and `-Blender` via `apps/catnight/import.ps1` when
paths differ.

## Build, play, test

Close the Unreal editor before building. Paths are this PC's (`E:/UE_5.8`).

```powershell
& 'E:/UE_5.8/Engine/Build/BatchFiles/Build.bat' CatnightEditor Win64 Development -Project="E:/Catan/apps/catnight/Catnight.uproject" -WaitMutex
```

```powershell
& 'E:/UE_5.8/Engine/Binaries/Win64/UnrealEditor.exe' 'E:/Catan/apps/catnight/Catnight.uproject' -game -windowed -ResX=1600 -ResY=900
```

Options for the game (also used for automated screenshots); any match option skips the title:
`-CatnightScreen=title|new|table`, `-CatnightSeed=<seed>`, `-CatnightLevel=easy|medium|hard`,
`-CatnightPlayers=3|4`, `-CatnightHotseat=<n>` (the first n seats are people),
`-CatnightAutoplay` (bots play the people's seats), `-CatnightBotDelay=<seconds>`,
`-CatnightNoSave`, `-CatnightShot=<file.png>` with `-CatnightShotAfter=<seconds>` (saves a
screenshot, then quits). Add `-CatnightShotOnWin` to wait until the match has actually ended
before capturing; the log then records `CATNIGHT CAPTURE victory after <n> actions`.

3D table options: `-CatnightFlat` starts with the 2D chart;
`-CatnightCamera=<yawDelta>,<pitchDelta>,<zoomFactor>` adjusts the default camera (degrees and
factor, e.g. `-CatnightCamera=40,12,0.9`); `-CatnightPickTest` projects legal targets to the screen
and picks them back, logging `CATNIGHT PICK n of m targets picked back (k legal)`. A complete
check requires `n == m == k > 0`; repeat from different camera angles. This is additional to the
three rules/match automation tests, not a substitute for manual mouse/gamepad play.

3D camera controls: right or middle mouse drag or the right stick turns/tilts; the wheel zooms.
The camera hint appears below the instruction. **Flat view / 3D view** toggles the board renderer.

Keys: arrows or shoulder buttons choose a spot on the board, Enter or A places it, Space rolls or
ends the turn, Esc cancels or opens the menu, Ctrl+Z undoes.

Tests (run `pnpm golden` once first):

```powershell
pnpm catnight:test
```

That builds the editor target and runs the automation tests: `Catnight.Rules.Golden` replays all
golden games under Unreal's compiler settings, `Catnight.Match.FullGames` plays 12 games to a
win through the match code the table uses, and `Catnight.Match.HotseatSaveUndo` checks hand-offs,
saving and loading a record, and undo.

Package a standalone Windows build (run `pnpm catnight:import` first):

```powershell
pnpm catnight:package
pnpm catnight:test-package
```

`package-game.ps1` checks that the imported meshes and base materials exist before invoking
Unreal BuildCookRun. It accepts `-Engine`, `-Configuration Development|Shipping` and `-OutputDir`.
The result is `Packaged/Windows/Catnight.exe` (git-ignored). Keep the whole `Windows` directory
together. Launch that executable directly;
it does not need the Unreal editor, Node, a browser or the source artwork alongside it.
`DefaultGame.ini` includes `/Game/Generated` and `/Engine/BasicShapes` in the cook because the
actor loads assets by path.

`test-package.ps1` tests a **Development** package. It inspects the cooked IoStore container
against every imported asset, runs the two `Catnight.Match` automation tests inside the packaged
executable, checks legal-target picking from three camera angles, and captures title, new game,
flat board and an autoplay match through victory. The autoplay check waits for an ended match
and requires its victory log; it cannot pass solely because a timed capture exists. Screenshots
require visual review, particularly the victory capture. Logs, screenshots and `report.json` go to a fresh `Saved/PackageValidation/<timestamp>`
directory. Tests disable saving and never need the external golden fixtures. Options:
`-PackageDir`, `-Engine`, `-TimeoutSeconds` (per process). The audit uses UnrealPak from the engine
installation; the packaged game itself has no engine-install dependency.

The first cooked build includes all 92 models and 156 generated asset packages. Both packaged
match tests pass (12 full games and hot-seat/save/undo); picking matches 50/50 spots from each of
three angles. See `validation/package-validation.json` for the recorded scope and remaining
manual/physical-controller checks. This is a Development validation build, not a Steam release.
A clean PC with no existing Microsoft C++ runtime/DirectX prerequisites has not yet been tested.

Manual acceptance still open:

- Play a complete mouse-driven match, exercising trades, cards, robber/discard, undo and victory.
- Repeat with a physical gamepad: menus, shoulders + A picking, right-stick camera, dialogs and
  returning focus after every action. Test reconnecting the controller.

Representative interactive checks already pass: three-player setup, hot-seat curtain, mouse
settlement placement, arrow/Enter road placement, wheel zoom, Flat/3D switching, Ctrl+Z undo,
leave menu and save/Continue after a real process restart. The isolated six-action save remains
byte-for-byte identical after Continue. These checks supplement the full-match automation; they
are not a complete manual playthrough.

For isolated local testing, Unreal's `-UserDir=<absolute directory>` keeps saves and settings
under that directory's `Saved/` folder. Use a fresh directory rather than replacing a player's
existing Continue record.

## Things to know

- `CatnightRules.Build.cs` sets `FPSemantics = Precise` and turns unity builds off. Unreal compiles
  game modules with `/fp:fast` by default, which would let the bots' scores round differently from
  TypeScript. The golden test inside Unreal is what proves this setting works.
- The plugin's public functions carry `CATNIGHTRULES_API` (from `Api.h`) so the editor's DLLs can
  link them. Add it to any new public function.
- Slate `TArray::Add` must not take a reference into the same array (it asserts): copy first.
