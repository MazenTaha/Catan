# AGENTS.md — Catan Night (repo codename "Hexfall")

Orientation for AI coding agents. Read this first, then `README.md` (player/run guide) and
`docs/DECISIONS.md` (why things are the way they are). Last updated 2026-10-22.

## 1. What this is

**Catan Night** is a browser game: a faithful, original-art take on the base Catan board game
(3–4 players, 19-hex island, first to 10 VP by default). You can play:

- **Online** with friends via a room code (Node WebSocket server is the authoritative referee),
- **Against bots** (Easy / Medium / Hard),
- **Hot-seat** (several humans on one device, with a pass-the-device privacy curtain),
- or any mix of these.

It also has an optional **first-person 3D "walk"** of the live island (three.js, lazy-loaded).

Key constraints that shape everything:

- **No external assets.** All art is drawn in code (SVG / CSS / canvas / three.js primitives);
  all sound is synthesized with WebAudio. Fonts are self-hosted via `@fontsource`.
- **Sound effects only — there is no music.** Background music was deliberately removed; do not
  re-add a music bus, ambient bed or "Music" volume setting.
- **UI palette is a cool graphite black** (not purple/plum, not blue-slate). Warm amber/gold and
  coral are accents; reds are for danger. See §8.
- Private, non-commercial fan project. "Catan" is a trademark used at the owner's request.

## 2. Run, test, verify

Requires Node 20+ and pnpm 9 (`packageManager: pnpm@9.15.9`). Monorepo via `pnpm-workspace.yaml`.

| Command (repo root) | What it does |
|---|---|
| `pnpm install` | Install everything |
| `pnpm dev` | Web (Vite, port 5173) + game server (port 8787) with hot reload; Vite proxies `/ws` → 8787 |
| `pnpm dev:web` | Web app only (online play unavailable without the server) |
| `pnpm play` / `pnpm start` | Production build, then the server serves app + WebSocket on http://localhost:8787 |
| `pnpm verify` | **typecheck → lint → test → build. Run this before calling work done.** |
| `pnpm typecheck` | `tsc --noEmit` in every package (web also checks `tsconfig.e2e.json`) |
| `pnpm lint` | ESLint, **zero warnings allowed** |
| `pnpm test` | Vitest: engine (≈104 tests incl. 200-game bot simulation), net (lobby), server (rooms) |
| `pnpm e2e` | Playwright (own dev server on 4319, game server on 4320) |
| `pnpm format` | Prettier (single quotes, semicolons, width 100, trailing commas) |

**This machine specifically** (Windows, owner's PC):

- Port 5173 is often busy. The Claude preview config `.claude/launch.json` runs the web app on
  **5188** (`hexfall-web`). That config starts Vite only, so online play needs the server too.
- C: drive is nearly full. Playwright is **pinned to 1.62.1** to reuse the cached Chromium;
  don't bump it casually. Engine tests run files sequentially to keep memory low.
- After `pnpm install` changes `node_modules`, restart a running Vite dev server (stale
  Tailwind paths cause `preflight.css ENOENT` errors).

## 3. Repository map

```
packages/engine   @hexfall/engine  Pure TS rules: no DOM, deterministic, JSON-serializable state
packages/net      @hexfall/net     Lobby rules + browser⇄server message types (shared)
apps/server       @hexfall/server  Node game server: rooms, codes, authoritative games, bots (ws)
apps/web          @hexfall/web     React 18 + Vite 5 + Zustand 5 + Framer Motion + Tailwind 3 + three.js
docs/             PLAN.md (architecture/milestones), DECISIONS.md (numbered log), RULES.md, CREDITS.md
design/           untracked local visual references (not in git)
.claude/          launch.json for the Claude desktop preview
```

Packages are consumed **as TypeScript source** (`exports: ./src/index.ts`); there is no build
step for engine/net. Server runs with `tsx`.

## 4. Vocabulary: internal keys vs. what players see (read this!)

The codebase was first built as a dark-fantasy game called *Hexfall*. It was later renamed to
Catan Night with standard Catan terms, but **only display text changed**. Engine keys, action
names, save formats and package names kept the original names so old saves still load.
**Never rename engine keys.** All player-facing strings live in `apps/web/src/lexicon.ts`.

| Engine key / code name | Player sees |
|---|---|
| resources `wood` `clay` `wool` `grain` `ore` | Lumber, Brick, Wool, Grain, Ore |
| terrains `witchwood` `ashen` `moors` `fields` `peaks` `waste` | Forest, Hills, Pasture, Fields, Mountains, Desert |
| `causeway` | Road |
| `outpost` | Settlement |
| `citadel` | City |
| `omen` (Omen deck) | Development card |
| omen types `warden` `relic` `decree` `harvest` `tithe` | Knight, Victory Point, Road Building, Year of Plenty, Monopoly |
| actions `PlayWarden` `PlayDecree` `PlayHarvestPact` `PlayBloodTithe` | play Knight / Road Building / Year of Plenty / Monopoly |
| `wraith` (`wraithHex`, `MoveWraith`) | the robber |
| `longestCauseway` | Longest Road |
| `greatestHost` | Largest Army |
| colors `crimson` `frost` `bone` `violet` | Red, Blue, White, **Orange** (yes, `violet` = orange) |
| sigils `skull` `moon` `eye` `thorn` | player emblem drawn on pieces |
| bots `wanderer` `warlord` `archdemon` | Easy, Medium, Hard |
| CSS tokens `--gold` `--ember` `--blood` `--bone` `--iron` `--abyss` … | see §8 |

## 5. Engine (`packages/engine/src`)

**Contract:** `applyAction(state, action) → Result<{ state, events }, GameError>`. It is pure:
it never mutates its input (deep-clones internally) and has no I/O. `applyOrThrow` and
`isLegal` are conveniences. Errors carry a `code` (e.g. `NOT_YOUR_TURN`, `CANNOT_AFFORD`,
`TOO_CLOSE`, `AWAITING_HANDOFF`) and a human-readable `message` shown to players.

**Determinism:** the mulberry32 RNG state lives *inside* `GameState.rng`. So `config + action log`
replays a game exactly (`replay()`, `makeRecord()`, `parseRecord()`; record format
`hexfall-record` v1). Bots derive their randomness from the state too, so the same position
always gives the same bot move.

Layout:

| Path | Responsibility |
|---|---|
| `lexicon-keys.ts` | Keys + constants: `RESOURCES`, `TERRAINS`, `NUMBER_TOKENS`, `OMEN_DECK_COUNTS`, `COSTS`, `SUPPLY` (15/5/4), `BANK_START` 19, `HAND_LIMIT` 7, `LONGEST_MIN` 5, `HOST_MIN` 3 |
| `rng.ts` | `hashSeed`, `Rng` (mulberry32) |
| `board/coords.ts` | Pointy-top axial hexes; vertices on an integer lattice → canonical IDs like `"3,-5"`; edges are sorted vertex pairs like `"1,-1\|2,-2"` |
| `board/topology.ts` | Standard 19-hex topology (54 vertices, 72 edges) and adjacency helpers |
| `board/generator.ts`, `harbors.ts`, `validator.ts` | Seeded layouts `balanced` / `random` / `beginner`; 9 harbors (4×3:1, 5×2:1); no adjacent 6/8 |
| `state/types.ts` | `GameConfig`, `GameState`, `Phase`, `Action`, `GameEvent`, `GameError` |
| `state/setup.ts` | `createGame(config)` incl. dice roll-off for first player |
| `state/selectors.ts` | `legalOutpostSpots`, `legalCausewaySpots`, `canAfford`, `bestBankRate`, `victoryPoints`, `expectedYield`, `handLimitRisk`, `activeActor`, `privacyEnabled`… |
| `rules/` | `reducer.ts` (dispatch switch), `build`, `production` (bank-shortage rule), `robber` (7 → discard → move → steal), `trade` (domestic offers/counters + maritime), `omens`, `longest-road` (edge DFS), `scoring`, `legal` (`legalActions`, `chooseDiscard`) |
| `ai/` | `decideAction(state, level?, salt?)`; Wanderer (random-ish), Warlord (heuristics), Archdemon (lookahead, trail-blocking, hand estimation from public info only) |
| `__tests__/` | Rules, trade, omens, longest road, board, RNG, replay snapshot, 200-game bot simulation |

`Phase` is a tagged union: `setup` → `roll` → (`discard` → `move-wraith` → `steal`) → `main`
(with sub-phases `decree`, `trade`) → … → `ended`. Hot-seat privacy is modelled in the engine
(`state.handoff`, `state.viewer`, action `AckPassDevice`), so a reload can never flash the
wrong hand. Every change emits typed `GameEvent`s; the UI derives the log, toasts, sounds,
animations and screen-reader announcements from them.

## 6. Online play (`packages/net`, `apps/server`)

- Host's browser opens a WebSocket to `/ws` and sends `{t:'host'}` → gets a room code like
  `HEARTH-66`. Joiners send `{t:'join', code}` and take the first open seat.
- Messages: `ClientMsg` (`host`, `join`, `resume`, `settings`, `seat`, `fill-bots`, `kick`,
  `start`, `action`, `leave`, `ping`) and `ServerMsg` (`welcome`, `lobby`, `game`, `error`,
  `closed`, `pong`), defined in `packages/net/src/index.ts`.
- The server (`apps/server/src/hub.ts`, `Hub` and `Room`) holds the only real `GameState`.
  It checks that each action comes from the seat's owner, applies it with the engine, runs bots
  (700–1400 ms delay) and sends each client a **redacted** view (`redactFor` / `redactEvents`:
  opponents' hand contents, deck order and RNG are hidden until game end).
- Reconnect: a token is saved in `localStorage['hexfall.online']`; **Rejoin** on the title screen.
  If a player is absent on their turn for 45 s, autopilot plays for them.
- `apps/server/src/main.ts` listens on `PORT` (default 8787). When `apps/web/dist` exists
  (or `WEB_DIST`) it serves the built app too. A separately hosted web app uses
  `VITE_SERVER_URL=wss://…/ws`.

## 7. Web app (`apps/web/src`)

**State:** one Zustand store, `state/store.ts`. It holds `screen` (`title` | `setup` | `game`),
`session` (config, action log, state, undo stack, log, `online` info), UI mode (placement mode,
tab, modal, hover), `fx`, `toast` and `settings`.

- `dispatch(action)`: local games apply the engine reducer, then `advance()` turns events into
  log lines, toasts, sounds (`SOUND_FOR` map), fx and announcements, then autosave (coalesced,
  ≤ 1 per 400 ms). **Online** games just send the action to the server. Server replies come in
  through `receiveOnline()` and go through the same `advance()` path, so local and online behave
  identically.
- Local bots and the turn timer are driven by `components/screens/gameHooks.ts` (`decideAction`
  on a timeout scaled by `settings.botSpeed`).
- Undo is local-only and limited to placement, building and bank trades with no randomness used.
- Persistence (`state/persistence.ts`): `localStorage` keys `hexfall.settings`, `hexfall.profile`,
  `hexfall.save` (versioned save with a migration stub), plus `hexfall.online` (in `state/net.ts`).

**UI structure:**

| Path | Contents |
|---|---|
| `App.tsx` | Screen switch, global modals, ember canvas, audio unlock on first gesture |
| `components/screens/` | `TitleScreen` (Play, plus Continue / Rejoin when a save or online seat exists, How to play, Settings), `NewGameScreen` (profile, host/join lobby, seats), `GameScreen`, dev-only `ArtBoard` (`#artboard`) |
| `components/board/` | SVG board: `Board.tsx` (stacked layers + hit/target layer), `Scenery.tsx` (sea, shore, harbors, ambient motion), `BoardDefs.tsx` (gradients/filters), `ZoomPan`, `HexTooltip`, `geometry.ts` |
| `components/hud/` | Top bar, turn banner/players row, dice and dice-roll animation, toasts |
| `components/panels/` | Left rail (claims, recent log), right rail (hand, Build / Cards / Trade tabs, End turn) |
| `components/modals/` | Discard, steal, trade, dev cards, curtain, victory, settings, credits, import, rulebook |
| `components/world/` | 3D walk: `World3D.tsx`, `world.ts` (island, controls, animals), `models.ts` (low-poly models); lazy chunk around 610 kB |
| `components/ui/primitives.tsx` | Shared building blocks: ResourceCard, Tooltip, IconButton, segmented tabs, steppers, Modal |
| `art/` | Procedural terrain (`terrain/TerrainArt.tsx`), pieces/tokens/harbors/robber (`pieces/Pieces.tsx`), sigils, icons, dev-card art; `art/manifest.ts` can swap in image files |
| `audio/` | `engine.ts` (SFX bus, optional Howler files via `manifest.json`), `synth.ts` (WebAudio SFX recipes). **SFX only.** |
| `state/log.ts` | Event → log line / spoken text |
| `lexicon.ts` | Every player-facing name (see §4) |

**Settings** (`Settings` in `persistence.ts`): master/sfx volume, mute, reduce motion,
colorblind glyphs, hand privacy, bot speed, UI scale, turn timer, rookie tips, theme
(`hexfall` default / `frostbound` alternate), graphics `effects: auto|full|lite`.

## 8. Styling and design system

- Tokens are RGB triplets in `styles/tokens.css` (so Tailwind can apply alpha), mapped in
  `tailwind.config.ts` (`bg-abyss`, `bg-surface-1/2/raised`, `border-iron`, `text-gold`, `text-muted`…).
- **Current palette, cool black:** abyss `#090a0b`, surface-1 `#111314`, surface-2 `#1a1d1e`,
  raised `#212426`, iron (borders) `#3a4043`, muted text `#9ea4a7`. Accents: gold `#f2ac52`,
  ember/coral `#ff805c`, blood (danger) `#b0364a`, bone (text) `#f3e6d6`.
  (README.md still calls the palette "Dusk"; that refers to the earlier plum palette and is stale.)
- Shared component classes in `styles/index.css`: `.panel`, `.btn`, `.btn-primary`, `.btn-danger`,
  `.chip`, `.tile`, `.meter`, plus animation utility classes.
- Fonts: Cinzel (display), Cinzel Decorative (logo), Crimson Pro (body).
- Game art has its own palette, separate from the UI. The anime-style pieces and terrain use a dark
  wine outline ink `#2b1a22`, and the robber wears purple. Those are intentional art choices, not UI chrome.

## 9. Conventions and gotchas

- **Display text → `lexicon.ts`.** Engine error messages are the only other player-facing strings.
- **Don't rename engine keys, action types or the save/record format.** Old saves must keep loading.
- **Engine stays pure:** no DOM, no `Math.random`, no `Date`. Use the state RNG. Add tests in
  `packages/engine/src/__tests__` for any rule change. The replay snapshot test pins determinism.
- **Performance rules** (DECISIONS #22–23, #28): nothing animates *inside* a large SVG. Motion is
  transform/opacity on small or whole layers (compositor-only). Static board layers are painted once.
  Hover state lives in the hit layer and targets are memoised. Respect `.fx-lite` and
  `.reduce-motion`. Measure with `LAG=1 pnpm e2e lag`.
- **Board focus:** only actionable board targets are focusable (`tabIndex=0`). Plain hexes have
  no tabIndex. SVG targets show focus through their own hover highlight; `svg [tabindex]:focus`
  has `outline: none`. Don't reintroduce the browser focus box on hexes.
- Strict TypeScript (`noUnusedLocals/Parameters`). ESLint must report zero warnings.
- Match existing style: terse comments explaining *why*, named exports, small memoised components.
- New design or engineering decisions get a numbered entry appended to `docs/DECISIONS.md`.

## 10. Git and collaboration

- Remote: `https://github.com/MazenTaha/Catan.git`, default branch `main` (owner: MazenTaha).
- Work happens both locally and in **Claude cloud sessions**, which push `claude/<name>` branches
  (e.g. `claude/zealous-curie-vk0g8s`). Before pushing, `git fetch` and integrate. `main`
  has moved under parallel sessions before, and UI files (`tokens.css`, `index.css`, `Hud.tsx`,
  `primitives.tsx`, `store.ts`) conflict often.
- When merging UI work, re-check for plum/violet surface colors creeping back (§8). Re-check that
  no music code returns (§1).
- Commit messages: short imperative subject, optional body explaining why.

## 11. Recent history (newest first)

- Focus box removed when clicking land hexes.
- Merged cloud work: compact UI, slimmer player strip, two-part trade tab, anime-style
  (cel-shaded) 3D walk and redrawn 2D board/pieces, simpler title menu, dice-roll animation in
  the players row.
- UI retinted from the plum "Dusk" palette to cool black. Ambient music removed (SFX only).
- Online play: host/join with a room code, authoritative server, redaction, reconnect, autopilot.
- 3D first-person walk of the island at sunset.
- Living moonlit board (sea, shores, harbors with ships, ambient motion). Renamed to Catan Night
  with official terms. Original build milestones M0–M9 are in `docs/PLAN.md`.

## 12. Common tasks, where to start

| Task | Start here |
|---|---|
| Change a rule | `packages/engine/src/rules/*` + tests; check bots in `ai/` still emit only legal actions |
| Add a player-facing label or rename something | `apps/web/src/lexicon.ts` |
| Add or change a sound effect | `audio/synth.ts` (recipe + `SfxName`), `audio/manifest.json`, `SOUND_FOR` in `state/store.ts` |
| Change colors or theme | `styles/tokens.css`, then grep for hard-coded hex values in `components/` |
| Change board visuals | `components/board/*`, `art/terrain/TerrainArt.tsx`, `art/pieces/Pieces.tsx` |
| Change the 3D walk | `components/world/models.ts`, `world.ts` |
| Change the online protocol | `packages/net/src/index.ts` (types + lobby rules), then `apps/server/src/hub.ts` and `apps/web/src/state/net.ts` |
| Add a setting | `Settings` and `DEFAULT_SETTINGS` in `state/persistence.ts`, UI in `components/modals/InfoModals.tsx`; apply it in `store.ts` |
