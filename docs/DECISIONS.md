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
21. **Dev-only `#artboard`** route renders a bot-played board full-screen for art inspection; it is excluded from production behaviour.
22. **Board rendering is split into three stacked SVG layers**: the animated sea (waves, drifting fog), the static land layer (terrain art, noise, harbors, number tokens — no animations, so it is painted once and cached), and a light dynamic layer (pieces, torches, the Wraith, targets, production effects). Terrain decorations are static on purpose; life comes from torches, waves, fog, embers and the Wraith.
23. **Performance (measured with `LAG=1 pnpm e2e lag`)**: the first version was laggy in browsers that composite in software (no GPU acceleration): the menu ran at ~12 fps and the board at ~31 fps on the production build, because SVG animations inside large SVGs (waves, torch flicker, pulsing targets, the bobbing Wraith), blurred fog and a rotating, filtered title board forced full repaints every frame, and an animated grain overlay four times the screen size was recomposited constantly. Hovering also re-rendered the whole board. The fixes: (a) nothing animates inside a large SVG; the board is split into stacked layers, static ones painted once, and motion is limited to opacity/transform on whole layers (swell, torchlight flicker, target pulse, Wraith bob), which the compositor applies without repainting; (b) fog uses gradients instead of blur filters; the title board is static; grain is a static part of the vignette; no `will-change` on large static layers (extra layers cost more than they save when compositing in software); (c) hover state lives in the hit layer and each target is memoised, so a hover re-renders at most two spots; (d) autosave is coalesced (at most once per 400 ms, flushed on page hide); (e) **Graphics: Auto/Full/Lite**. Auto watches the frame rate and switches to Lite (no embers, no looping animations) if it stays below ~42 fps for 4 s. Results: with GPU, every measured scenario holds 60 fps, including bot turns; with software rendering on Auto, the menu and board hold 60 fps once Lite engages. Per action, store work is under 0.5 ms and the React render ~6 ms (dev build); bot decisions take under 0.1 ms.
24. **Engine tests run files sequentially** (`fileParallelism: false`) to keep peak memory low on constrained machines; the whole suite still runs in ≈15 s.
25. **Renamed to "Catan Night" with the official game's terms (owner's request, overriding the original no-"Catan" guardrail).** Player-facing names now follow the base game: Lumber/Brick/Wool/Grain/Ore; Forest/Hills/Pasture/Fields/Mountains/Desert; Road/Settlement/City; the robber; development cards (Knight, Victory Point, Road Building, Year of Plenty, Monopoly); Longest Road and Largest Army; 3:1 and 2:1 harbors; player colors Red/Blue/White/Orange; bots Easy/Medium/Hard. Only display text changed (all in `apps/web/src/lexicon.ts` plus engine error messages); engine keys, save files and package names are unchanged so old saves still load. All art remains original and drawn in code. "Catan" is a trademark, which matters only if the game is ever published.
26. **Bigger board, less chrome:** the terrain key and under-board notice strip are gone, the seed chip is out of the top bar, the dice sit in the turn banner, the side rails are narrower and the view box is cropped to the island, so the board takes all the height under the banner. Notices float up from the bottom of the screen and fade. Build buttons no longer explain what is missing; clicking one you can't use shows a short "declined" notice (with the error sound) instead.
27. **New terrain art and build sounds:** every tile was redrawn to read as its real terrain at night: pine forest with a log pile; brick hills with a kiln; a pasture with sheep and a fence; wheat fields with sheaves and a windmill; snow-capped mountains with a mine; sand dunes with a cactus. The robber is a hooded pawn. Synthesized sounds: hammer blows (road), quick brick-laying and a trowel scrape (settlement), stone blocks and a bell (city), a card swish (development card).
28. **Living, moonlit board** (`components/board/Scenery.tsx`):
    - **Sea:** moonlit gradient, chart-style wave marks and a moon reflection on the water.
    - **Island:** blurred turquoise shallows, surf lines and a sandy beach; moonlight is shaded across the tiles.
    - **Pieces:** ivory number tokens with gold rims, and harbor medallions on wooden piers with a ship at anchor.
    - **Tiles:** a woodcutter's cabin, pasture ponds, a desert oasis and pines at the mountain foot.
    - **Motion:** windmill sails turn, kilns smoke, fireflies twinkle over woods and meadows, the moon reflection glitters and cloud shadows drift.

    Motion is compositor-only: transform and opacity on small layers. Lite mode and reduced motion stop it, and frame rates stay at 60 fps (`LAG=1 pnpm e2e lag`).

29. **Sunlit medieval wilderness art direction** (replaces the cel-shaded, ink-outlined look of #27–28). The board now reads as a painted miniature landscape under one light: warm sun from the upper left, cool blue-green shade lower right, on every tile, piece, token and the 3D walk.
    - **Terrain** (`art/terrain/TerrainArt.tsx`) is composed per tile from its own seed (`board seed : hex id`, a separate stream from the game RNG; no `Math.random`): a large silhouette first (canopy masses with a sunlit clearing, field plots split by hedgerows with furrows in different directions, terraced clay banks with a dug pit and a cut bank, jagged snow-capped peaks, crescent dunes with lee shadows), material detail second. The middle under the number token and the tile edges stay calm.
    - **Shared kit** (`art/terrain/flora.tsx`): oaks, conifers, scrub, dry shrubs, four stone types, sheep, flower patches (daisy, buttercup, poppy, occasional lavender), reeds, stooks and a stump are built once as `<g id="fl-…">` in the board defs, each with its own lighting and contact shadow, and placed with `<use>` — about one DOM node per tree instead of a dozen. The whole board is ≈2.7k SVG nodes.
    - **Board:** the plum ink outlines between tiles became fine seams plus a per-tile bevel (lit edges upper left, shaded lower right) and a sun wash; the cyan shoreline halo became a narrow muted shelf, foam, a raised earthen board edge and a slim beach; the moonlit sea became deep teal with sun glitter; fireflies became drifting pollen; the night-time torchlight layer was removed.
    - **Pieces** (`art/pieces/Pieces.tsx`) are lit miniatures in player colour: timber roads with grain and bevels; three-quarter-view half-timbered settlements on stone plinths; cities with a round tower, gabled hall, crenellated keep with pennant and a gated curtain wall (distinct from settlements by silhouette, not just colour); the robber is a hooded traveller in weathered charcoal with a staff on a stone pawn base. Number tokens and harbor plaques are aged ivory with umber lettering (6 and 8 in madder red); harbors have timber docks and small sailing boats.
    - **UI** keeps the graphite palette: panel titles carry an engraved antique-gold lozenge (`--antique`) instead of a glowing dot, panels a faint metal edge, muted text was lifted to `#acb1b2`, build tiles show available/selected/unavailable clearly, resource cards share one crafted finish, and ore's colour moved from violet to brushed steel.
    - **3D walk** follows the same direction with the same renderer and controls: golden-hour sky and warm haze instead of indigo/rose, warm sun with a cool fill and an olive ground bounce, softer toon bands, thin olive-charcoal outlines instead of plum, natural ground palettes, restrained wildflowers, rocky snow-capped peaks instead of karst pillars (also on the horizon), stones instead of cacti, iron-grey ore instead of neon cyan, cream clouds and a charcoal robber.
    - Performance rules from #22–23 are unchanged: everything new is static and painted once; motion is still opacity/transform on whole small layers and stops in Lite and reduced motion.


30. **A living medieval countryside, and a rebuilt 3D walk** (refines #29: same light, livelier colour).
    - **2D board:** each terrain was retuned on its own with clear light, middle and shadow values instead of one muted, olive-leaning palette:
      - spring-green meadows and varied, cooler forest canopies;
      - luminous gold wheat, with the young crop fresh green rather than olive;
      - terracotta clay with brighter crests;
      - cool slate peaks with readable sunlit faces;
      - pale honey sand.

      The grain overlay is neutral grey instead of brown, and the sunlight washes are lighter. The broad blurred turquoise halo around the island became a narrow, lightly blurred shelf of shallows on a clearer blue sea. Settlements, cities and roads have a thin dark outline around the whole piece, so player colours separate from any terrain, white pieces on wheat included.
    - **3D renderer:** the cel-shaded toon materials and the ink-outline pass (which drew the whole scene a second time) were replaced by physically based materials with a finish per material:
      - rough foliage, cloth and plaster;
      - slightly glossier timber and stone;
      - controlled metal on small parts.

      Lighting is a late-afternoon sun (about 30° up) plus image-based fill from a small generated sky (PMREM), with a deliberately neutral, less blue fill so shade keeps its colour. Neutral tone mapping keeps saturated colours, and light haze leaves the island clear. Shadows: one 2048 px map covering 80 m around the walker, snapped to texels so edges don't crawl. Wheat, grass and flowers receive shadows but don't cast them.
    - **Ground:** each tile is now a shaped, vertex-coloured surface (`components/world/terrain.ts`) over a neutral detail texture:
      - pastures roll, hills mound, dunes ripple, fields stay flat;
      - paths are worn in, clay pits are stepped, and there is scree with alpine grass.

      Heights are zero along tile edges, where roads and settlements stand, calm at the centre sign, and flattened under props, so placement never depends on the mesh. The walker's eye follows the ground, smoothed, and the head bob was removed.
    - **Water:** a single sea plane coloured in the shader by distance to the island: pale turquoise over the sand, a blue-green shelf, then deep blue, reflecting the sky. A narrow sand ring and soft foam make the shore.
    - **Wheat** (`wheat.ts`):
      - each clump is five stalks, each with a stem, two leaves and a kernel head with awns (about 90 triangles a stalk), plus a 6-triangle far version;
      - clumps are planted in rows across 2–4 plots per tile, split by paths, with an entry path to the sign and an occasional harvested plot with stooks;
      - instancing is in 7 m cells that swap between near and far detail by distance.

      Wind runs in the vertex shader (gust envelope, travelling wave, per-stalk flutter, bending more toward the tips) in one world direction. It stops under reduced motion and in Lite.
    - **Biomes and pieces:**
      - **Mountains and hills** are angular rock masses in strata (`makeCrag`), with grass on the ledges and snow above a line; hills get flat-topped clay banks.
      - **Trees** are lumpy broadleaves and star-rimmed conifers of varied size, in groves with undergrowth.
      - **Flowers** grow in drifts.
      - **Settlements and cities** are 1.4 times larger, so doors are about 2 m next to the 1.7 m eye. The city adds a second house and a curtain wall.
      - **Roads** run vertex to vertex as natural cobbles with timber rails painted in the owner's colour.
      - **The barn** became a thatched timber byre.
    - **Performance (Intel UHD, Full, same views):** the main reductions were the static props across the whole island merged into one mesh per finish (colour carried as vertex colour), sheep parts merged, no outline pass, a cheap chamfered box instead of `RoundedBoxGeometry`, and shaders compiled in parallel before the first frame.

      | | Before | After |
      |---|---|---|
      | Frame rate | 27–60 fps | 60 fps |
      | Draw calls per frame | up to 3,100 | 200–700 |
      | Opening the walk | 1.5–2 s | 2.4–2.9 s (much more content) |

      A world disposed while its shaders are still linking releases them only afterwards: deleting them mid-link made the driver log errors under React's dev double-mount.
    - **Blender-ready slots** (`assets.ts`, `docs/BLENDER_ASSET_PIPELINE.md`): trees, wheat (near and far), rocks, sheep, settlements, cities, docks, boats and windmills are typed slots. Each draws its procedural model unless a local GLB is listed in `ASSET_FILES` (empty by default, so nothing is requested). A listed GLB is loaded once per page and swapped in at the same placements; a material named `Owner…` is tinted in the player's colour. A missing or broken file keeps the procedural model, with one warning. Collision comes from each slot's footprint, never from the mesh.
