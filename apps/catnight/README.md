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
  - `ACatnightGameMode`: starts a match (you against three bots) and shows the table.
  - `Lexicon.cpp`: every player-facing word. The terms are still the web game's until gate 0
    (the name and terms) is decided.
- No project assets yet: the game runs on the engine's empty `Entry` map with a Slate table.

## Build, play, test

Close the Unreal editor before building. Paths are this PC's (`E:/UE_5.8`).

```powershell
& 'E:/UE_5.8/Engine/Build/BatchFiles/Build.bat' CatnightEditor Win64 Development -Project="E:/Catan/apps/catnight/Catnight.uproject" -WaitMutex
```

```powershell
& 'E:/UE_5.8/Engine/Binaries/Win64/UnrealEditor.exe' 'E:/Catan/apps/catnight/Catnight.uproject' -game -windowed -ResX=1600 -ResY=900
```

Options for the game (also used for automated screenshots): `-CatnightSeed=<seed>`,
`-CatnightLevel=easy|medium|hard`, `-CatnightAutoplay` (bots play your seat),
`-CatnightBotDelay=<seconds>`, `-CatnightShot=<file.png>` with `-CatnightShotAfter=<seconds>`
(saves a screenshot, then quits).

Tests (run `pnpm golden` once first):

```powershell
pnpm catnight:test
```

That builds the editor target and runs the automation tests: `Catnight.Rules.Golden` replays all
golden games under Unreal's compiler settings, and `Catnight.Match.FullGames` plays 12 games to a
win through the match code the table uses.

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
