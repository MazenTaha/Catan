# Design & engineering decisions

Decisions made where the brief was silent or ambiguous. Newest at the bottom.

1. **Skeleton image absent.** `design/hexfall-skeleton.png` was not present in the repo when the build started. The layout contract was taken from the detailed textual description of the skeleton in the brief (top bar, left rail, center board, bottom key, right rail). Drop the image into `design/` for reference; nothing in code depends on it.
2. **pnpm** is installed globally via npm (corepack could not write to `Program Files`). `packageManager` pins pnpm 9.15.9.
3. **Engine is consumed as TypeScript source** (`exports: ./src/index.ts`). Vite and Vitest compile it directly; no build step for the engine package.
4. **Muted text and venom tokens lifted slightly** (`#a09986`, `#6fa058`) from the brief's `#9a937f` / `#5f8f4a` so small text passes WCAG AA on surface-2.
5. **Fonts**: Cinzel, Cinzel Decorative and Crimson Pro, self-hosted through `@fontsource` (OFL).
