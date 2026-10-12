# Hexfall — Build Plan

Hexfall is an original dark-fantasy hex-isle resource/trading/building game for 3–4 players.
This document is the architecture map and milestone checklist.

## Architecture

```
hexfall/
  packages/engine     pure TypeScript rules (no DOM). Deterministic, seedable, serializable.
  apps/web            React 18 + Vite + Zustand + Framer Motion + Tailwind. SVG board, canvas ambience.
  docs/               PLAN, DECISIONS, CREDITS, RULES
  design/             visual reference (skeleton)
```

### Engine (`@hexfall/engine`)

| Module | Responsibility |
|---|---|
| `rng.ts` | `hashSeed` (string → uint32), mulberry32 step functions on a numeric state stored in `GameState` |
| `lexicon-keys.ts` | neutral keys: resources, terrains, omen types, costs, counts |
| `board/coords.ts` | axial hex coords, integer vertex lattice, pixel helpers |
| `board/topology.ts` | standard 19-hex topology: 54 vertices, 72 edges, adjacency (`hexVertices`, `vertexNeighbors`, `vertexEdges`, `edgeVertices`, `vertexHexes`, `hexNeighbors`), coastal edges |
| `board/generator.ts` | Balanced / Fully random / Beginner layouts, seeded |
| `board/harbors.ts` | 9 harbors on coastal edges (4×3:1, 5×2:1), seeded |
| `board/validator.ts` | 6/8 adjacency + identical-number adjacency checks |
| `state/types.ts` | `GameState`, `Action`, `GameEvent`, `GameError`, configs |
| `state/setup.ts` | `createGame(config)` incl. roll-off for first player |
| `state/selectors.ts` | `legalOutpostSpots`, `legalCausewaySpots`, `legalCitadelSpots`, `canAfford`, `bestBankRate`, `victoryPoints`, `missingResources`, `expectedYield`, `handLimitRisk`, `activeActor`… |
| `rules/reducer.ts` | `applyAction(state, action) → Result` (pure, never mutates) |
| `rules/production.ts` | dice production with bank shortage rule |
| `rules/robber.ts` | discard, wraith movement, stealing |
| `rules/trade.ts` | domestic offer/accept/decline/counter, maritime |
| `rules/omens.ts` | omen deck and card effects |
| `rules/longest-road.ts` | DFS longest trail, award logic |
| `rules/scoring.ts` | VP, greatest host, victory check |
| `replay.ts` | replay from `config + actions`, undoability |
| `ai/*` | Wanderer / Warlord / Archdemon bots, evaluation helpers |

### Web (`@hexfall/web`)

| Area | Contents |
|---|---|
| `state/store.ts` | Zustand store: game, history (undo), UI modes, settings, dispatch → events → log/audio/fx |
| `state/persistence.ts` | versioned autosave, settings, export/import |
| `components/board` | SVG board, tiles, tokens, harbors, pieces, wraith, placement layer |
| `components/panels` | left rail (players, bonuses, log), right rail (hand, tabs, end turn) |
| `components/hud` | top bar, turn banner, dice tray, toast, terrain key |
| `components/modals` | discard, steal, trade composer/inbox, omens, rulebook, settings, log, curtain, victory |
| `art/` | procedural SVG terrain, pieces, icons, tokens (swappable via `art/manifest.ts`) |
| `audio/` | manifest + WebAudio synthesized fallback, Howler for real files |
| `styles/` | design tokens (CSS variables) + Tailwind theme |

## Milestones

- [x] **M0** Repo scaffold, tooling, tokens, fonts, CI scripts, PLAN.md
- [x] **M1** Engine board: coordinates, vertices/edges, generator + validator, harbors, seeded RNG, tests
- [x] **M2** Engine rules: setup, turn flow, production, building, bank, 7/Wraith/discard/steal, scoring, win. Tests
- [x] **M3** Engine advanced: trading, Omen deck, Longest Causeway, Greatest Host, undo/replay, fuzz tests
- [x] **M4** Web shell: 3-column layout, token system, store wiring, title + new-game screens
- [x] **M5** Board rendering: SVG terrain art, tokens, harbors, pieces, Wraith, placement modes, tooltips
- [x] **M6** Full interaction: dice, production fx, modals, tabs, trade, omens, curtain, log, rulebook
- [ ] **M7** Art & atmosphere: fog, embers, lighting, motion, audio manifest + synth, victory sequence
- [ ] **M8** Bots, simulation test, settings, autosave/continue, export/import, a11y, responsive
- [ ] **M9** Hardening: perf, bundle size, scripted full games, README, CREDITS, verification
