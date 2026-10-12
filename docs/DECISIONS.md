# Design & engineering decisions

Decisions made where the brief was silent or ambiguous. Newest at the bottom.

1. **Skeleton image absent.** `design/hexfall-skeleton.png` was not present in the repo when the build started. The layout contract was taken from the detailed textual description of the skeleton in the brief (top bar, left rail, center board, bottom key, right rail). Drop the image into `design/` for reference; nothing in code depends on it.
2. **pnpm** is installed globally via npm (corepack could not write to `Program Files`). `packageManager` pins pnpm 9.15.9.
3. **Engine is consumed as TypeScript source** (`exports: ./src/index.ts`). Vite and Vitest compile it directly; no build step for the engine package.
4. **Muted text and venom tokens lifted slightly** (`#a09986`, `#6fa058`) from the brief's `#9a937f` / `#5f8f4a` so small text passes WCAG AA on surface-2.
5. **Fonts**: Cinzel, Cinzel Decorative and Crimson Pro, self-hosted through `@fontsource` (OFL).
6. **RNG lives in `GameState.rng`.** `applyAction(state, action)` takes no RNG argument; it reads the serialized mulberry32 state from `state` and writes the advanced state back. This makes `seed + action log` sufficient for exact replay and keeps the reducer signature simple for a future server.
7. **Hot-seat hand-off is modelled in the engine** (`state.handoff`, `state.viewer`, `AckPassDevice`). Whenever the seat that must act is a *different human* from the one holding the device, every action except `AckPassDevice` (and the active player's `CancelTrade`) is rejected. Because it is engine state, reloading a saved game can never flash the wrong hand. Privacy defaults on when ≥ 2 humans and can be turned off in Settings ("Open hands").
8. **Stealing:** players with empty hands are not steal candidates. A single candidate is robbed automatically (no extra click); several candidates open the `steal` phase.
9. **Domestic trade flow:** an offer to "everyone" is answered seat by seat in turn order; the first acceptance executes atomically. A counter-offer replaces the open offer and goes back to the other party (remaining targets of the original offer drop out). The active player may withdraw an offer at any time, including while the device is being passed.
10. **Pathmaker's Decree** cannot be played with no legal causeway spot or no supply; it ends early when no spot/supply remains (so "only 1 legal spot" places 1).
11. **Harvest Pact** takes `min(2, bank total)` cards, each limited by bank stock.
12. **Victory** is checked after every action for the *current* player, which includes the moment their turn starts (e.g. Longest Causeway gained off-turn wins at the start of their own turn).
13. **Undo** is limited to placement, building and bank trades by the same seat, and only while no randomness was consumed and nothing hidden was revealed. Rolls, steals, Omen draws/plays, domestic trades and End turn clear the undo stack. The undo stack is in memory (not autosaved).
14. **Longest Causeway:** a trail may *end* at a vertex holding an opponent's building but cannot pass through it. Ties and transfers follow the brief exactly; computed by exhaustive edge-DFS (handles branches and cycles).
15. **Production events** list only hexes that actually paid (after the shortage rule) so the gold rim never lies.
16. **Bots** derive their randomness from the game state, so the same position always yields the same decision. Bots never counter-offer; they may propose at most one (Warlord) or two (Archdemon) domestic offers per turn (`state.offersThisTurn`). Archdemon estimates opponents' hands from public information only (hand sizes × expected yields).
17. **Number tokens are click-through** so clicking a tile's number targets the tile (e.g. when moving the Wraith).
18. **Playwright is pinned to 1.62.1** to reuse the Chromium build already present on this machine (the C: drive had < 200 MB free, so a fresh browser download failed).
19. **Small labels:** body copy is ≥ 14 px; uppercase Cinzel labels/chips and badge counters may be 11–12 px.
20. **Themes:** the Frostbound theme (Settings → Theme) swaps UI tokens only; board art keeps its own palette (Phase 3 scaffold).
21. **Dev-only `#artboard`** route renders a bot-played isle full-screen for art inspection; it is excluded from production behaviour.
