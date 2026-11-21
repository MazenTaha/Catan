# Catnight: the game built natively in Unreal

Plan for turning Catan Night into **Catnight** (working title), a game that runs entirely in Unreal
Engine and ships on Steam. Written 2026-11-21. Decision log entry: `docs/DECISIONS.md` #64.

## 1. Where we are and where we're going

**Today** the Unreal app (`apps/unreal`, `Maps/Table`) is a full-screen Chromium browser. It
starts the web game's Node server as a child process and shows the web game: menus, 2D board,
bots, online rooms and the three.js walk. All of that is TypeScript and React in `apps/web` and
`packages/*`. Unreal-native code today is only:

- `CatanTable` (the browser host, about 15 kB of C++);
- the walkable island prototype (`Content/CatanNight/Maps/Island_*`, built by the Python in
  `apps/unreal/Content/Python`);
- the `CatanAnimation` plugin (chest, knight clips, grips, sparring; not connected to the game).

**Goal:** one Unreal game with no browser and no Node inside it. The rules, bots, board, UI, online
play, island walk and duels are all Unreal. It sells on Steam, plays with mouse and keyboard or a
gamepad, and is Steam Deck Verified.

**The web game stays until the Unreal game replaces it** (phase 6). Until then it is the rules
reference that the C++ port is tested against, and the Unreal wrapper keeps working.

## 2. Gate 0: name and identity (before any public step)

Nothing goes public (store page, trailer, playtest) until this gate is closed.

| Question | Status |
|---|---|
| Working title | **Catnight**, chosen by the owner on 2026-11-21 |
| Is the name free? | **No.** *Catnight* is already a Steam game: a $4.99 third-person multiplayer shooter by Rubber Croc, app 1779070. Two games with one name hurts search and invites a dispute. Pick another name, or get advice before using it. |
| Too close to Catan? | "Cat-night" sounds close to "Catan Night". The final name should not suggest the Catan brand. |
| Terms | Replace every Catan-specific term (table below). Generic words (wood, brick, road, city) can stay. |
| Rules | Keep the core trading game, and make sure the parts that are already original are what define it (section 3). |
| Art | All art is original or the owner's (art pack sheets). Keep written proof that the owner holds the rights to the concept-art pack. |
| Fonts | IM Fell, UnifrakturCook, Cinzel and Crimson Pro are SIL Open Font License: they can ship; include the licences. |
| Legal review | A lawyer checks the name, terms, rules and store page before release. This plan is not legal advice. |

**Terms to decide.** The engine keys are already original (`outpost`, `citadel`, `causeway`,
`omen`, `wraith`), so this is a display-text change.

| Today (player sees) | Engine key | Catnight term | Notes |
|---|---|---|---|
| Catan Night | — | **Catnight** (pending gate 0) | |
| Settlement / City / Road | `outpost` `citadel` `causeway` | *to decide* | Generic words can stay; only the set as a whole should not copy Catan's |
| Robber | `wraith` | *to decide* | |
| Development card | `omen` | *to decide* | |
| Knight / Victory Point / Road Building / Year of Plenty / Monopoly | `warden` `relic` `decree` `harvest` `tithe` | *to decide* | Year of Plenty, Road Building and Monopoly are the most recognisable |
| Longest Road / Largest Army | `longestCauseway` `greatestHost` | *to decide* | |
| Lumber, Brick, Wool, Grain, Ore | `wood` `clay` `wool` `grain` `ore` | can stay | Generic |
| Forest, Hills, Pasture, Fields, Mountains, Desert | `witchwood` `ashen` `moors` `fields` `peaks` `waste` | can stay | Generic |

If the cat in the name is meant literally (cats at night as the world's people), decide that now:
it changes character models, card art and every heading.

## 3. What makes it its own game

These exist today and become the centre of the pitch:

- **The island you walk.** Every road and building on the board stands on a walkable island
  (enterable cottages, halls and mills, horses, docks).
- **Arms and duels.** A weapon chest, bullets, swords and *Man up* fights that pause the board
  (`rules/arms.ts`).
- **Day and night** on the island and the board, and the Hall & Chart table look.

Candidates to discuss (rule changes, each one tested by the bot simulation before keeping it):
night production effects, island events found while walking, duel stakes tied to trades.

## 4. Architecture

### 4.1 Rules core: `CatnightRules` (C++)

`packages/engine` is about 3,100 lines of TypeScript. It is pure and deterministic, so it ports
cleanly.

- **A plain C++20 library** in `apps/catnight/Plugins/CatnightRules/Source/CatnightRules`. No
  `UObject`s and no Unreal types in the rules: plain structs and enums, standard-library
  containers only, no exceptions (Unreal builds without them). A thin UE module wraps it. Also
  compiled by `native/build.ps1` (MSVC) so the tests run in seconds outside the editor.
- **Same contract:** `ApplyAction(const GameState&, const Action&) -> Result<{State, Events}, Error>`,
  `LegalActions`, selectors, `DecideAction(State, Level, Salt)` for the three bot levels.
- **Same RNG:** mulberry32 on `uint32_t` (matches `Math.imul` and `>>> 0`); the float step divides
  by 4294967296.0 exactly as JS does.
- **Ordering traps to copy exactly:** JavaScript object key order (insertion order, but integer-like
  keys first), `Array.sort` stability, and any `Object.entries` iteration. Every place the TS code
  iterates a `Record` is listed and mirrored with an ordered container.
- **Topology:** the vertex and edge ids (`"3,-5"`, `"1,-1|2,-2"`) stay as the canonical ids in the
  golden data, so states compare as JSON.

**Golden testing (the gate for phase 1):**

1. `pnpm golden` (`native/golden/export.ts`) plays games with the TypeScript engine and writes,
   per game, the config and one entry per action: the action, whether it was accepted (or its
   error code and message), and hashes of the canonical state and events after it.
   - The 200 games of the engine's bot simulation test, seat for seat.
   - 48 mixed games with scripted human seats: hot-seat hand-offs, trades and counter-offers,
     weapons, duels, all three layouts, 8–14 target points, and deliberately illegal moves.
     In every position of these games all three bot levels are also asked for their move.
   - The data is regenerated, not committed (`native/golden/data/`, about 22 MB).
2. `pnpm native:test` replays every game through the C++ rules and compares the state, the
   events, the error code and message, and every bot decision after **each** action. At the
   first difference it writes the C++ state and events to `native/golden/out/` and prints the
   command that writes the TypeScript ones (`pnpm golden --dump <game> <step>`) for a diff.
3. The C++ bots must choose the same action as the TypeScript bots in every recorded position.
4. The Vitest suites stay the rules' specification in TypeScript. Their behaviours are covered
   in C++ through the golden games (the runner fails if a rule never occurs: every card, all
   bank rates, shortages, Longest Road and Largest Army changing hands, kills, duels, hand-offs).

### 4.2 Game layer (Unreal)

- `UCatnightMatchSubsystem` owns the authoritative state on the host and applies actions.
- Actions travel as `USTRUCT`s through server RPCs; events drive the UI, sounds, effects and the
  screen-reader text, as `advance()` does in the web store.
- Hot-seat privacy (`handoff`, `viewer`) works as in the engine.
- Undo follows the web rules (local games only; no randomness used).

### 4.3 Online play and Steam

- **Host-authoritative listen server** (the host's game is the referee, as the Node server is now).
  No dedicated servers to pay for.
- **Steam:** `OnlineSubsystemSteam` with Steam Sockets; lobbies, friend invites, rich presence,
  join from the friends list. Room codes can stay for invites outside Steam friends.
- **Secrets stay secret:** other players' hands and the deck order are never replicated to clients;
  each player's private state replicates owner-only (`COND_OwnerOnly`). This replaces `redactFor`.
- **Reconnect and autopilot:** a dropped player can rejoin the lobby session; after 45 s on their
  turn a bot plays for them, as today. Duels: 90 s away yields.
- **No cross-play with the web version.**

### 4.4 Presentation

- **Table:** the board in 3D on a war table in the hall, with the camera above it; a flat 2D view
  for clarity. Board art direction stays (sunlit miniatures, DECISIONS #29–30).
- **UI:** UMG with CommonUI (gamepad focus, input prompts, layers). Rebuild the Hall & Chart kit as
  widgets: banner, coat of arms, decree, oak panel, map note, wax-seal button, scale-bar meter, bone
  dice. Reuse the textures in `apps/web/src/ui/hall/tex` and the card art in `public/art/cards`.
  `design/hall-chart/MIGRATION_CHECKLIST.md` is the screen list. **The full UI plan (design
  system, hall scene, every component and screen, input, build approach, quality bar, milestones
  UI-0 to UI-11) is `docs/CATNIGHT_UI_PLAN.md`.**
- **Text:** a string table replaces `lexicon.ts` (and makes translation possible later).
- **Accessibility carried over:** UI scale, colour plus sigil, reduced motion, rebindable keys,
  readable at Steam Deck size (1280×800).

### 4.5 The island, walk and duels

- Merge the island prototype (`Island_*` maps and the Python builders) and the `CatanAnimation`
  plugin (renamed `CatnightAnimation`) into the new project.
- The island reads the live match state: buildings and roads appear where they are built.
- Arms, chest and duels use the C++ rules; movement and hits are checked on the host (as the server
  checks `Strike` today).
- Horses, knight looks, My kingdom decor and the minimap port from `components/world/*`.

### 4.6 Audio

The music and sound effects are synthesized in WebAudio today. Render them once to WAV (headless
Chrome, `OfflineAudioContext`) and import them as Sound Waves; move the ones that need variety to
MetaSounds later. The music stays on menus and the table only.

### 4.7 Saves

`USaveGame` slots synced by Steam Cloud. Old browser saves are not imported.

### 4.8 Project layout

A **new, clean project** at `apps/catnight` (`Catnight.uproject`, game module `Catnight`), instead
of renaming `apps/unreal` and `apps/unreal 5.8` in place:

```
apps/catnight/
  Catnight.uproject
  Source/Catnight/                 game module: subsystems, player controller, pawns, UI glue
  Plugins/CatnightRules/           rules core (also built by native/CMakeLists.txt)
  Plugins/CatnightAnimation/       moved from CatanAnimation
  Content/Catnight/                maps, UI widgets, materials, migrated island assets
native/
  build.ps1                        builds CatnightRules + tests with MSVC outside Unreal
  tests/main.cpp                   unit checks and the golden replay
  golden/export.ts                 records reference games from the TypeScript engine
```

The old projects stay until phase 6 so nothing is lost. Island assets move with the editor's
*Migrate*. Before large binary assets land, set up **Git LFS** for `*.uasset`, `*.umap`, `*.blend`,
`*.glb`, `*.wav` (the repo has none today, and the old Unreal copy already commits 462 files).

## 5. Phases

Each phase ends with something you can play or check. Sizes are rough: S is days, M is one to two
weeks, L is several weeks of focused work.

| # | Phase | Size | Done when |
|---|---|---|---|
| 0 | **Identity** | S | Final name cleared, terms table filled, rule changes chosen, lawyer consulted |
| 1 | **Rules core in C++** — *done 2026-11-21* | L | All golden games match step by step; the C++ bots pick the same moves; the 200-game simulation passes |
| 2 | **Playable table** — *first part done 2026-11-21 (§8)* | L | In a packaged build: menu → new game → full game against three bots to the victory screen, with mouse and with a gamepad; hot-seat with the privacy curtain; save and continue |
| 3 | **The look: 3D table and Hall & Chart** | L | The board is a modelled 3D miniature on the war table in a lit hall; every screen in the migration checklist exists in UMG; music and sounds; accessibility settings |
| 4 | **The island walk (local)** | L | Walk the live island from a match: buildings and roads appear as built, knight, horses, rooms, chest, dummy, minimap, Character and My kingdom |
| 5 | **Online through Steam, duels** | L | Four players on separate PCs: invite from the friends list, full game, one player drops and rejoins, autopilot covers an absence; no client ever sees another player's hand; live fights and Man up duels |
| 6 | **Steam release** | M | Steamworks app (Steam Direct fee), achievements, Steam Cloud, store page and capsule art, trailer, content survey and age rating, EULA and privacy text, crash reports, Steam Deck review, a closed playtest. Then: tag the web version, retire `apps/web`, `apps/server`, `packages/*` and the wrapper project |

**The bar** (owner, 2026-11-21): the same game as the browser game, every feature kept, and
clearly better in every part, the 3D most of all. `docs/CATNIGHT_PARITY.md` lists every browser
feature, its status in Unreal and what "better" means for it. The look (phase 3) and the island
(phase 4) come before online play so the game looks like the finished game early.

## 6. Risks

| Risk | Answer |
|---|---|
| The C++ rules drift from TypeScript in rare cases (key order, sort, RNG floats) | Step-by-step golden comparison over many games; diff prints the first mismatching path |
| Two games to maintain until phase 6 | Freeze rule changes in TypeScript once phase 1 starts, except bug fixes made in both |
| The web/3D walk keeps changing in parallel sessions | Port the walk in phase 4 from the state of `components/world` at that time |
| Name refused or disputed | Gate 0 before any public step |
| Unreal networking cheats (clients reading hidden data) | Hidden state never leaves the host; owner-only replication; host checks every action |
| Repo size with binary assets | Git LFS before the first migration |
| Steam Deck performance with the dense island | Per-platform scalability settings; measure on Deck in phase 5 |

## 7. Phase 1 result (2026-11-21)

The rules core is ported: `apps/catnight/Plugins/CatnightRules` (about 4,000 lines of C++).

| Header | Port of |
|---|---|
| `Keys.h` | `lexicon-keys.ts`: resources, terrains, cards, costs, constants |
| `Rng.h` | `rng.ts`: the seed hash and mulberry32, bit for bit |
| `Board.h` | `board/*`: topology (ids kept, indices inside), generator, harbours, validator |
| `State.h` | `state/types.ts`: config, state, phases, actions; events as JSON objects |
| `Rules.h` | `state/setup.ts`, `state/selectors.ts`, `rules/*`: `CreateGame`, `ApplyAction`, `LegalActions` |
| `Bots.h` | `ai/*`: `DecideAction` for Wanderer, Warlord and Archdemon (with its setup lookahead) |
| `Serialize.h`, `Json.h` | the engine's JSON shapes: state, config, actions (records and saves) |

```powershell
pnpm golden
pnpm native:test
```

**Result:** 248 of 248 games match: 116,078 actions (2,417 of them rejected with the same error
code and message), 96,489 bot moves and 90,531 bot probes, in about 12 seconds. Changing one bot
weight by 0.01 or the hand limit by one makes 227 of the 248 games fail, so the comparison is
sensitive.

Events are JSON objects for now; the UI may get typed events later.

## 8. Phase 2, first part (2026-11-21)

`apps/catnight` is a new Unreal 5.8 C++ project; its README covers building, playing, testing and
packaging.

- **The rules compile inside Unreal.** `CatnightRules.Build.cs` sets `FPSemantics = Precise`.
  Unreal builds game modules with `/fp:fast` by default, which would change how the bots' scores
  round. It also turns unity builds off and exports the public API (`CATNIGHTRULES_API`).
- **The golden replay runs inside Unreal** as the automation test `Catnight.Rules.Golden`: 248 of
  248 games match under Unreal's own compiler settings. `pnpm catnight:test` runs it.
- **A match layer.** `FCatnightMatch` holds one local game: state, action record, log, and the
  bots on a timer. `UCatnightMatchSubsystem` ticks it. `Catnight.Match.FullGames` plays 12 games
  (3 and 4 players, all three bot levels) to a win through it.
- **A plain playable table** (`STable`, Slate drawn from code, no assets yet):
  - the board with terrain, number tokens, harbours, roads, settlements, cities and the robber;
  - legal spots highlighted on hover and click;
  - an action panel with roll, build, buy, bank and harbour trades, offers to all players,
    accepting or declining bot offers, discarding, robbing, and all development cards;
  - your hand, the players (points, cards, knights, road length, Longest Road and Largest Army),
    and a log.
  - It runs as `-game` on the engine's `Entry` map; with `-CatnightAutoplay` the bots finish a
    whole game in about 25 seconds.

**Second part (2026-11-21):**
- **Screens:** title (Continue when a save exists, Play, Quit), new game (3 or 4 seats, each a
  person on this device or an Easy / Medium / Hard bot, names, victory target 8–14, layout, seed
  and reroll), the table, a leave dialog (Main menu, New game, Restart with the same seed, Cancel)
  and a victory dialog with the final reckoning.
- **Hot-seat:** the table shows the engine's viewer; an opaque curtain says whom to pass the
  device to and why, and `AckPassDevice` reveals their hand.
- **Save and continue:** every action saves the game as a `hexfall-record` (the web game's
  format: config and actions) in `Saved/SaveGames/Catnight-continue.json`; Continue replays it. A
  finished game deletes it.
- **Undo** with the web rules (placements, builds and bank trades that used no randomness).
- **Trade:** choose cards on both sides, offer to everyone or to chosen players, counter an offer.
- **Keys and gamepad:** arrows or shoulder buttons choose a board spot, Enter or A places it,
  Space rolls or ends the turn, Esc cancels or opens the menu, Ctrl+Z undoes; focus moves to the
  main button after every change.
- Test `Catnight.Match.HotseatSaveUndo`: a two-person hot-seat game with 181 hand-offs; a record
  saved halfway loads to the same state; a road is built and undone exactly.

**Not done yet in phase 2:**
- Clicking through a whole game by hand with a mouse and with a real gamepad (the tests drive the
  same actions; the screenshots show focus landing on the main button).
- Git LFS (generated Unreal art is still rebuilt rather than committed).

A Windows Development package with the screens and cooked artwork now passes the packaged
match tests and multi-angle picking. Full manual/physical-gamepad play remains open.

## 9. Next steps

1. Owner: decide the name and terms (gate 0, section 2).
2. Finish phase 2 validation: the Development package and cooked artwork are checked; a full game by hand with mouse and a real gamepad remains. The menus, privacy, saves and board focus are implemented.
3. Phase 3: the 3D war table and the Hall & Chart UI (`docs/CATNIGHT_PARITY.md` §3–4).

## 10. Phase 3, first part: the native 3D war table (2026-11-21)

The native editor game now draws a miniature island on an oak war table. `ACatnightBoardActor`
builds procedural hexes/sand shelves, instanced terrain scenery, ivory tokens with pips,
docks/boats and rate plaques, player-coloured cottages/halls and roads, the robber and glowing
legal targets, with sun, sky, atmosphere/fog and shadows. `FCatnightBoardView` shares legal
spots, hover/focus and camera requests with Slate. Right/middle drag or right stick orbits/tilts;
the wheel zooms; Flat view keeps the 2D chart. Menus dim the table behind them. The side panel
includes the camera-control hint beneath the instruction.

`pnpm catnight:import` regenerates 92 static meshes and the board materials from the existing
Blender GLBs. `SourceArt/Models` and `Content/Generated` are ignored, so the import is required on
a fresh checkout and before packaging. Model materials preserve texture × vertex colour ×
tint, owner slots, cut-out leaves and instancing usage. See `apps/catnight/README.md` for paths,
logs, options and troubleshooting.

The resumed build succeeds and `pnpm catnight:test` reports **PASSED: 3 automation tests**:
248/248 golden games, 12/12 full matches to victory, and hot-seat/save/undo (181 hand-offs).
`-CatnightPickTest` separately checks projection/deprojection of every legal spot under the
current camera: the fresh setup matches 50/50 legal spots from each of three angles. The
handoff's captures show the 3D scenery and player pieces; the refreshed setup capture also shows
the camera hint. The rules and their TypeScript reference are unchanged.

The standalone Windows Development package now cooks all 92 models and 156 generated asset
packages, passes both match tests, and picks 50/50 legal targets from three camera angles. A
rendered autoplay match reaches victory after 694 actions. `pnpm catnight:package` and
`pnpm catnight:test-package` make these build/check steps repeatable.

This completes the first table presentation milestone, not phase 3 as a whole. Next: finish the
full manual mouse/physical-gamepad playthrough, then finish
board polish, the hall, Hall & Chart UI and audio. The island walk is phase 4 and Steam online,
rejoin/autopilot and duels are phase 5. Gate 0 still precedes public release.

## 11. Table feedback milestone (2026-11-21)

The next native presentation pass adds carved bone dice and an oak/felt tray, a result-driven
visual toss, five-second cottage/city construction with the original paint and owner trim,
scaffolding and dust, actual production markers, camera-facing token labels/pips, stronger
building orientation and public hex map notes. Reduced motion shares the Hall Settings screen's persistent
preference. Presentation reacts only to accepted live actions; replay, Continue and undo
reset it. No rules or their RNG change. Dice animation is kinematic; real dice physics, a
camera nudge and flying resource cards are still open.

`Catnight.Match.TableFeedback` checks the real board against the match, including 36 dice
pairs, construction at 10/60/144 Hz, original texture/colour preservation, construction shader
connections, undo/Continue, reduced motion and the production event's paid/blocked hexes.
`pnpm catnight:test-package -ReviewTable` adds staged visual captures at 1280x800. The generated
construction material requires `pnpm catnight:import` again (157 generated asset packages,
still 92 meshes). Native and packaged validation evidence is recorded with this milestone.

This pass is isolated in the managed `native-table-feedback` worktree on
`codex/native-table-feedback`. It integrates the Hall/UI first pass (`b4b988c`), preserves its
HUD refactor, and shares `FHallSettings::bReduceMotion` with the table. QA motion flags override
presentation without changing saved preferences. Map notes use HallKit vellum beside the board,
and the Lists include the dice result. The shared checkout's remaining edits stay untouched.

Remaining phase 3 work: the real hall, the remaining Hall & Chart/CommonUI work, audio, further
board polish (bridge roads, sigils, crop wind, water/foam/boats, time of day, flying gains and
physics dice), settings/accessibility and the full manual/gamepad acceptance. Phase 4 is the
native island walk; phase 5 is Steam online and duels; phase 6 is release.
