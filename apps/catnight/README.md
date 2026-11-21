# Catnight (working title) in Unreal

The game rebuilt natively in Unreal Engine 5.8, without the browser inside it. Plan and phases:
[`docs/UNREAL_NATIVE_PLAN.md`](../../docs/UNREAL_NATIVE_PLAN.md). The old browser-wrapper app
(`apps/unreal`) keeps working until this one replaces it.

## What is here (phase 2)

- `Plugins/CatnightRules`: the rules, bots and record format in plain C++20 (no Unreal types), a
  port of `packages/engine` proven step by step against it (see the plan, §4.1).
- `Source/Catnight`: the game.
  - `FCatnightMatch` (`CatnightMatch.h`): one local game, its action record and log, and the
    bots' clock. `UCatnightMatchSubsystem` owns it and ticks it every frame.
  - `STable` (`Private/Table`): the table, drawn in Slate from code. The board is painted
    hexes, tokens, harbours, roads, buildings and the robber. Click the highlighted spots to build.
    The side panel has the actions, your hand and development cards, the players and the log.
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
- No project assets yet: the game runs on the engine's empty `Entry` map with a Slate table.

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
screenshot, then quits).

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

Package a standalone Windows build:

```powershell
& 'E:/UE_5.8/Engine/Build/BatchFiles/RunUAT.bat' BuildCookRun -project=E:/Catan/apps/catnight/Catnight.uproject -noP4 -platform=Win64 -clientconfig=Development -build -cook -stage -pak -archive -archivedirectory=E:/Catan/apps/catnight/Packaged -unattended -nocompileeditor
```

The result is `Packaged/Windows/Catnight.exe` (git-ignored).

## Things to know

- `CatnightRules.Build.cs` sets `FPSemantics = Precise` and turns unity builds off. Unreal compiles
  game modules with `/fp:fast` by default, which would let the bots' scores round differently from
  TypeScript. The golden test inside Unreal is what proves this setting works.
- The plugin's public functions carry `CATNIGHTRULES_API` (from `Api.h`) so the editor's DLLs can
  link them. Add it to any new public function.
- Slate `TArray::Add` must not take a reference into the same array (it asserts): copy first.
