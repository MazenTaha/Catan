# Catan Night

A moonlit take on the classic island trading game: collect Lumber, Brick, Wool, Grain and Ore, build roads, settlements and cities, and play development cards. 3–4 players: friends online with a room code, bots, or friends sharing one device. First to 10 victory points wins.

> *Catan* is a registered trademark of its owners. This is a private, non-commercial fan project; the name and terms are used at the owner's request and no official artwork is used.

All art is drawn in code (SVG/CSS/canvas/three.js) and all sound is synthesized with WebAudio — no external assets. The only network traffic is to your own game server, for online play.

## Run it

Requires Node 20+ and pnpm 9.

```bash
pnpm install
```

```bash
pnpm dev
```

Then open http://localhost:5173. `pnpm dev` starts both the web app and the game server (port 8787); the web app forwards `/ws` to it.

| Script | What it does |
|---|---|
| `pnpm dev` | Web app (Vite, port 5173) and game server (port 8787) together, with hot reload |
| `pnpm play` | Production build, then the game server serves the app and online play on http://localhost:8787 (smoothest way to play) |
| `pnpm server` | Just the game server (serves `apps/web/dist` too if it has been built) |
| `pnpm build` | Production build into `apps/web/dist` |
| `pnpm test` | Engine unit tests, fuzz tests and the 200-game bot simulation; lobby rules; game server rooms (Vitest) |
| `pnpm coverage` | Engine test coverage (≈98% statements) |
| `pnpm lint` | ESLint (zero warnings allowed) |
| `pnpm typecheck` | `tsc --noEmit` for every package |
| `pnpm e2e` | Playwright end-to-end tests (starts its own dev server on port 4319 and game server on 4320): host and join online from two browsers, setup → roll → build → bank trade → reload & continue, hot-seat curtains, export/import replay, phone/tablet layouts, and two complete games to the victory screen with a console-error guard |
| `pnpm verify` | typecheck → lint → test → build |

Opt-in diagnostics: `SHOTS=1 pnpm e2e shots` saves desktop/tablet/phone screenshots to `apps/web/test-results/shots`; `LAG=1 pnpm e2e lag` measures frame pacing and long tasks on the menu, new-game screen and board (idle, hovering, bots playing). Options: `LAG_GPU=1` hardware rendering, `LAG_CPU=4` CPU throttling, `LAG_DPR=2` hi-DPI, `LAG_EFFECTS=full|lite`, `LAG_URL=http://localhost:4173` to test a production preview, `LAG_PROFILE=1` to print hot functions. `LAG=1 pnpm e2e dispatch-cost` reports the store/render cost of each game action.

Playwright is pinned to 1.62.1; run `pnpm --filter @hexfall/web exec playwright install chromium` once if its browser is not installed yet.

## How to play

1. **Play** → set your profile (name, colour, sigil; remembered on this device), then:
   - **Host a game:** you get a room code (like `HEARTH-66`) to share. Pick 3 or 4 players, the board layout and seed (the same seed always gives the same board), the target score and who goes first. Each open seat can wait for a friend (**Invite**), be a **Bot** (Easy / Medium / Hard), or be a friend on **This device**. **Fill empty seats with bots** does the rest. If the game server can't be reached you can still host on this device with bots and pass-and-play.
   - **Join a game:** type the host's code. You take the next open seat and wait for the host to start.
2. **Founding:** place an Outpost and a Causeway, twice (snake order). Your second Outpost pays out immediately.
3. **Each turn:** roll (Space), collect from every hex showing that number, then build and trade, then end your turn (Space).
4. A **7** wakes the Wraith: big hands discard half, the roller moves the Wraith and robs a neighbour.
5. Race to the target with Outposts (1), Citadels (2), the Longest Causeway (2), the Greatest Host (2) and hidden Relics (1 each).

**3D walk:** the **2D board / 3D walk** switch at the bottom-right of the board turns the island into a low-poly world at sunset that you can explore in first person — sheep grazing round a barn on Pastures, a windmill in the Fields, kilns in the Hills, ore in the Mountains — with everyone's roads, settlements, cities and the robber in place. **W A S D** or the arrows walk, drag to look, **Shift** runs; on touch screens use the stick at the bottom-left. **Next land** jumps between the tiles your buildings touch. Placing pieces still happens on the 2D board.

The full rules are in the in-game rulebook (the **?** button) and in [docs/RULES.md](docs/RULES.md).

**Smoothness:** Settings → Graphics is *Auto* by default. If the browser can’t hold ~42 fps with full effects (typically when hardware acceleration is off), it switches to *Lite*, which drops the embers and looping animations. Choose *Full* or *Lite* to override.

**Online play:** the server referees every move, runs the bots, and only sends each player what they may see (opponents' cards stay hidden). If you lose your connection the game reconnects on its own; after a reload, **Rejoin** on the title screen takes you back to your seat. If someone stays away on their turn for 45 seconds, the computer plays for them until they return. A game where nobody joined from another device runs locally, with autosave and undo.

**Hot-seat privacy:** with two or more humans on one device, a pass-device curtain hides hands whenever the device must change hands (turns, discards, trade responses). Turn it off in Settings → Hot-seat → Open hands.

**Keys:** Space rolls / ends the turn · Esc cancels placement or closes dialogs · Tab moves between board spots, Enter places.

## Architecture

```
packages/engine   pure TypeScript rules — no DOM, deterministic, serializable
packages/net      online lobby rules and the browser ⇄ server messages (shared by both)
apps/server       Node game server: rooms, room codes, authoritative games, bots (WebSockets via `ws`)
apps/web          React 18 + Vite + Zustand + Framer Motion + Tailwind + three.js (3D walk)
docs/             PLAN, DECISIONS, RULES, CREDITS
```

**Engine (`@hexfall/engine`).** `GameState` is a plain JSON object. `applyAction(state, action)` is a pure reducer returning `{ state, events }` or a typed `GameError` with a human-readable message; it never mutates its input. Randomness comes from a mulberry32 state stored *in* the game state, so `seed + action log` replays a game exactly (`replay()`, `makeRecord()`, `parseRecord()`).

- `board/` — axial hex coordinates, an integer vertex lattice for canonical vertex/edge IDs, the standard 19-hex topology with adjacency helpers, seeded generators (balanced / random / beginner) and harbors.
- `rules/` — setup, production with the bank-shortage rule, robber/discard/steal, building, domestic & maritime trade, Omens, Longest Causeway (edge-DFS), Greatest Host, victory, hot-seat hand-off.
- `state/` — types, `createGame`, selectors (`legalOutpostSpots`, `bestBankRate`, `victoryPoints`, `expectedYield`, `handLimitRisk`, …).
- `ai/` — Wanderer (random with a building bias), Warlord (heuristics: pip-weighted spots, goals, bank/harbor trades, Wraith on the leader) and Archdemon (adds founding lookahead, trail-blocking, hand estimation from public info). Bots only emit legal `Action`s.

Every state change emits typed `GameEvent`s; the web app derives the log, toasts, sounds, animations and `aria-live` announcements from them — the same events the game server broadcasts in online games.

**Online (`@hexfall/net`, `@hexfall/server`).** The host's browser opens a room over a WebSocket at `/ws` and gets a room code; joiners send the code and are seated in the first open chair (clashing colours and sigils are reassigned). The server keeps the only real `GameState`: it checks that each `Action` comes from the seat's owner, applies it with the engine, runs the bots, and sends every player their own redacted view (`redactFor`: opponents' hands keep their size only; face-down cards, the deck order and the dice seed are hidden until the game ends). Reconnect tokens let a player return after a dropped connection or a reload. In the browser, `src/state/net.ts` owns the socket and `receiveOnline` feeds server updates through the same path as local moves, so sounds, the log and animations behave the same.

**Deploying online play:** run `pnpm install && pnpm build && pnpm server` on any host that runs Node 20 (a VPS, Render, Fly.io, Railway…). It listens on `PORT` (default 8787) and serves both the app and the WebSocket, so players just open that address. Behind HTTPS the app connects with `wss://` automatically. To host the web app separately, build it with `VITE_SERVER_URL=wss://your-server/ws`.

**Web (`@hexfall/web`).** A single Zustand store (`src/state/store.ts`) holds the session (config, action log, state, undo stack, log) and UI state. `dispatch(action)` applies the engine reducer, records events, triggers effects and autosaves to `localStorage` (versioned, with a migration stub). The board is SVG (`components/board`) with memoized static layers; ambience (embers) is a capped canvas that pauses when the tab is hidden and is disabled under reduced motion. The optional 3D walk (`components/world`) is a lazy-loaded three.js scene that mirrors the live state.

## Replacing art and audio

- **3D walk:** the world is built from three.js primitives in `apps/web/src/components/world/` (`models.ts` for each model, `world.ts` for the island, controls and animals) and is lazy-loaded only when the 3D view is opened.
- **Terrain art:** set image URLs in [`apps/web/src/art/manifest.ts`](apps/web/src/art/manifest.ts) (files go in `apps/web/public/art/`). Each image is drawn into a 174×200 box centred on the hex and clipped to it. Leave an entry `null` to keep the procedural art.
- **Other art:** pieces, tokens, harbors and the Wraith live in `apps/web/src/art/pieces/Pieces.tsx`; icons in `apps/web/src/art/icons/Icon.tsx`; Omen cards in `apps/web/src/art/cards/OmenCard.tsx`. Each is a self-contained component.
- **Audio:** drop files into `apps/web/public/audio/` and map them in [`apps/web/src/audio/manifest.json`](apps/web/src/audio/manifest.json) (e.g. `"dice": "dice.ogg"`, `"ambient": "drone.ogg"`). Mapped sounds play through Howler (lazy-loaded); unmapped ones fall back to the WebAudio synthesizer in `src/audio/synth.ts`.
- **Names:** every player-facing name is in `apps/web/src/lexicon.ts`.
- **Palette & components:** design tokens (the warm *Dusk* palette) are CSS variables in `apps/web/src/styles/tokens.css`, with shared component styles (`.panel`, `.btn`, `.tile`, `.chip`, `.meter`) in `apps/web/src/styles/index.css` and interactive building blocks (tooltips, segmented tabs, progress rings, steppers, modals) in `apps/web/src/components/ui/primitives.tsx`; an alternate *Frostbound* theme is defined in the tokens as an example.

Licenses and attributions: [docs/CREDITS.md](docs/CREDITS.md). Design decisions: [docs/DECISIONS.md](docs/DECISIONS.md).
"# Catan" 
