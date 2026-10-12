# Hexfall

A dark-fantasy board game of trade, causeways and citadels on a cursed, fog-drowned isle. 3–4 players (any mix of humans and bots), hot-seat on one device. First to 10 victory points claims the Isle.

All art is drawn in code (SVG/CSS/canvas) and all sound is synthesized with WebAudio — no external assets or network requests.

## Run it

Requires Node 20+ and pnpm 9.

```bash
pnpm install
```

```bash
pnpm dev
```

Then open http://localhost:5173.

| Script | What it does |
|---|---|
| `pnpm dev` | Vite dev server for the web app |
| `pnpm build` | Production build into `apps/web/dist` |
| `pnpm test` | Engine unit tests, fuzz tests and the 200-game bot simulation (Vitest) |
| `pnpm coverage` | Engine test coverage (≈98% statements) |
| `pnpm lint` | ESLint (zero warnings allowed) |
| `pnpm typecheck` | `tsc --noEmit` for every package |
| `pnpm e2e` | Playwright smoke tests (starts its own dev server on port 4319) |
| `pnpm verify` | typecheck → lint → test → build |

## How to play

1. **New game** → choose 3 or 4 seats, human or bot (Wanderer / Warlord / Archdemon), target score, isle layout and seed. The same seed always raises the same isle.
2. **Founding:** place an Outpost and a Causeway, twice (snake order). Your second Outpost pays out immediately.
3. **Each turn:** roll (Space), collect from every hex showing that number, then build and trade, then end your turn (Space).
4. A **7** wakes the Wraith: big hands discard half, the roller moves the Wraith and robs a neighbour.
5. Race to the target with Outposts (1), Citadels (2), the Longest Causeway (2), the Greatest Host (2) and hidden Relics (1 each).

The full rules are in the in-game rulebook (the **?** button) and in [docs/RULES.md](docs/RULES.md).

**Hot-seat privacy:** with two or more humans, a pass-device curtain hides hands whenever the device must change hands (turns, discards, trade responses). Turn it off in Settings → Hot-seat → Open hands.

**Keys:** Space rolls / ends the turn · Esc cancels placement or closes dialogs · Tab moves between board spots, Enter places.

## Architecture

```
packages/engine   pure TypeScript rules — no DOM, deterministic, serializable
apps/web          React 18 + Vite + Zustand + Framer Motion + Tailwind
docs/             PLAN, DECISIONS, RULES, CREDITS
```

**Engine (`@hexfall/engine`).** `GameState` is a plain JSON object. `applyAction(state, action)` is a pure reducer returning `{ state, events }` or a typed `GameError` with a human-readable message; it never mutates its input. Randomness comes from a mulberry32 state stored *in* the game state, so `seed + action log` replays a game exactly (`replay()`, `makeRecord()`, `parseRecord()`).

- `board/` — axial hex coordinates, an integer vertex lattice for canonical vertex/edge IDs, the standard 19-hex topology with adjacency helpers, seeded generators (balanced / random / beginner) and harbors.
- `rules/` — setup, production with the bank-shortage rule, robber/discard/steal, building, domestic & maritime trade, Omens, Longest Causeway (edge-DFS), Greatest Host, victory, hot-seat hand-off.
- `state/` — types, `createGame`, selectors (`legalOutpostSpots`, `bestBankRate`, `victoryPoints`, `expectedYield`, `handLimitRisk`, …).
- `ai/` — Wanderer (random with a building bias), Warlord (heuristics: pip-weighted spots, goals, bank/harbor trades, Wraith on the leader) and Archdemon (adds founding lookahead, trail-blocking, hand estimation from public info). Bots only emit legal `Action`s.

Every state change emits typed `GameEvent`s; the web app derives the log, toasts, sounds, animations and `aria-live` announcements from them — the same events a future multiplayer server would broadcast.

**Web (`@hexfall/web`).** A single Zustand store (`src/state/store.ts`) holds the session (config, action log, state, undo stack, log) and UI state. `dispatch(action)` applies the engine reducer, records events, triggers effects and autosaves to `localStorage` (versioned, with a migration stub). The board is SVG (`components/board`) with memoized static layers; ambience (embers) is a capped canvas that pauses when the tab is hidden and is disabled under reduced motion.

## Replacing art and audio

- **Terrain art:** set image URLs in [`apps/web/src/art/manifest.ts`](apps/web/src/art/manifest.ts) (files go in `apps/web/public/art/`). Each image is drawn into a 174×200 box centred on the hex and clipped to it. Leave an entry `null` to keep the procedural art.
- **Other art:** pieces, tokens, harbors and the Wraith live in `apps/web/src/art/pieces/Pieces.tsx`; icons in `apps/web/src/art/icons/Icon.tsx`; Omen cards in `apps/web/src/art/cards/OmenCard.tsx`. Each is a self-contained component.
- **Audio:** drop files into `apps/web/public/audio/` and map them in [`apps/web/src/audio/manifest.json`](apps/web/src/audio/manifest.json) (e.g. `"dice": "dice.ogg"`, `"ambient": "drone.ogg"`). Mapped sounds play through Howler (lazy-loaded); unmapped ones fall back to the WebAudio synthesizer in `src/audio/synth.ts`.
- **Names:** every player-facing name is in `apps/web/src/lexicon.ts`.
- **Palette:** design tokens are CSS variables in `apps/web/src/styles/tokens.css`; an alternate *Frostbound* theme is defined there as an example.

Licenses and attributions: [docs/CREDITS.md](docs/CREDITS.md). Design decisions: [docs/DECISIONS.md](docs/DECISIONS.md).
