# Browser performance report

What limits Catan Night in the browser, what was changed, how much it helped, and how much more scene the 3D walk can carry. Measured 2026-10-24/25 on the base `main` at `0e14e34`. Commands are in §11; decisions are in DECISIONS #32.

## 1. Summary

- **The 3D walk is GPU-bound on integrated graphics and comfortable on a discrete GPU.** On the Intel UHD at 1440 × 900, every frame used 6–12 ms of GPU time against a 16.7 ms budget, and the shadow redraw on every third frame pushed p95 to 12–16 ms. On the RTX 4050 the GPU needs 2–4.5 ms. On both, main-thread work is 1.5–3 ms per frame.
- **Equal-quality changes cut GPU time per frame by 15–35% on the Intel UHD** (§4). The renders are pixel-identical except a few foam pixels at the shoreline. Missed frames in reachable views went from up to 7% to under 1%. On the RTX 4050, which has ample headroom, GPU and main-thread time are unchanged within noise. On both GPUs the main-thread freeze when opening the walk fell from ~0.8–0.9 s to ~0.3 s, and the ~0.1 s hitch the first time the robber came into view is gone.
- **One lifecycle defect fixed:** every visit to the walk kept a WebGL context alive until the page closed. Chrome warned past 16.
- **New, optional:** a *3D resolution* setting (100 / 75 / 50%), and adaptive resolution under *Auto* graphics. Both only lower the canvas resolution; the UI stays sharp. In a large window on the Intel UHD, Auto turns 32% missed frames into none.
- **Tested ceiling at 60 Hz** (§7): the RTX 4050 carries every stress preset tested at once, the caps included (3 × vegetation, 3 × view distance, 8 × sheep, a fully built board, 2 × resolution). The Intel UHD at 1440 × 900 carries any one of 1.5 × vegetation, 2 × view distance, 8 × sheep or a fully built board, but not two of them together, and not 1.5 × resolution.
- **2D board:** 60 fps with no long tasks in every probe at normal CPU speed. No change was needed.

## 2. How it was measured

### The benchmark (`pnpm bench`)

`apps/web/e2e/perf/bench.spec.ts`, run by `apps/web/playwright.perf.config.ts`:

1. Builds a **production bundle** with `VITE_PERF=1` into `apps/web/dist-perf`. The flag only exposes the inspection handles (`window.__hexfall`, `window.__world3d`) and the stress presets; ordinary builds leave them out (`src/perfHooks.ts`).
2. Serves it with `vite preview` and opens it in Playwright's Chromium (151, ANGLE on Direct3D 11) at a fixed **1440 × 900 window, device pixel ratio 1**. The 3D canvas then draws **797 × 717 device pixels** (the board area keeps its aspect).
3. Loads one of two **saved games** in the app's own autosave format (`e2e/perf/fixtures/early.json`, `late.json`), made by `e2e/perf/make-fixtures.ts` from the fixed seed `perf-bench` with the engine's own bots. Both stop on the human seat's turn after rolling, so nothing moves while the benchmark runs. The late game has 16 settlements and cities and 31 roads.
4. Clicks **Continue**, then **3D walk**, and runs the scenarios:

| Scenario | What it does |
|---|---|
| `entry` | Times the click on *3D walk* to the first drawn frame, the downloads and the main-thread long tasks in between, then samples the first 2 s. |
| `route` | A scripted walk at 5 m/s through the wheat, into the forest, past a city, up to the mountains and along the coast (204 m, 41 s on the early board). It is driven by real time, so it is frame-rate independent. Run twice: first visit, then warm. |
| `views` | The eleven fixed viewpoints of `look3d.spec.ts` (wheat, forest edge and clearing, mountains, hills, pasture, desert, settlement, city, dock, elevated), 1.2 s to settle, then 3 s sampled, `PERF_REPEAT` times (2). The *elevated* view is a camera 42 m up that players can't reach: a stress view, reported but not judged. |
| `late` | Route and viewpoints again on the late-game board. |
| `cycle` | Enters and leaves the walk 20 times (more than Chrome's 16 live WebGL contexts) and resizes the window while inside; logs time to first frame, renderer resources, JS heap after a forced GC, and WebGL draws issued after leaving. |
| `soak` | `PERF_SOAK_MIN` minutes of walking the route in a loop, one summary per minute. |
| `2d` | The 2D board on the late game: idle, hovering tiles, a road placement preview, a full bot round and a roll with production. |
| `attrib`, `ab` | Diagnostics: hide one family of objects at a time (attribution), or interleave shown/hidden rounds of one family (A/B). |

### What is recorded per frame (`e2e/perf/probe.ts`)

The probe wraps the world's per-frame function and three's shadow pass:

- **Frame interval**: time between frames as the page sees them. This is what the player feels, and it is capped by the display: 60 Hz headless, 144 Hz on this laptop's panel.
- **Main-thread time** in the frame: the game update, sheep, LOD switches and three.js submitting draw calls.
- **GPU time** from `EXT_disjoint_timer_query_webgl2`, split into the shadow-map pass and the rest. Results are read asynchronously several frames later, and any result overlapping a *disjoint* event is discarded. Nothing waits on the GPU.
- **Draw calls and triangles** for the camera pass and the shadow pass separately; textures, geometries and shader programs; long tasks (`PerformanceObserver`, from page start).

Reported: median (p50), p95 and p99 of each, and **missed frames**: intervals longer than 1.25 × 16.7 ms, i.e. a 60 Hz deadline missed, allowing a quarter frame of timing noise. Frame rate alone is not used to judge headroom: at a 60 Hz cap, a frame that takes 6 ms and one that takes 15 ms both show 60 fps; the GPU and main-thread times show the difference. A run **passes 60 Hz** when the walk and every reachable view miss at most 1% of frames and the worst view's GPU p95 stays under 15 ms (a 10% margin).

The old forced-completion method (back-to-back renders, each finished with `readPixels`) is still available as `PERF_SYNTH=1`. It is labelled *synthetic* and kept separate: it measures throughput, not pacing.

### Before/after comparisons

The pre-change code (`main` at `0e14e34`) was checked out into a separate worktree with only the inspection handles added, and the benchmark run **alternately** on the old and new builds (A, B, A, B), so heat and background load fall on both. For single changes, **in-page A/B** toggles them in one session, in interleaved rounds, at fixed viewpoints. Hidden-object tests are only used for changes that keep the image identical, such as the depth pre-pass twins.

Image equivalence was checked by rendering every viewpoint (early and late game) on both builds with *Reduce motion* on, which stops the wind and the sheep, and diffing the pixels.

### Limitations

- **One machine.** Lenovo LOQ laptop (model 83DV): i7-13650HX, 16 GB, Intel UHD (integrated) and RTX 4050 Laptop, 1920 × 1080 144 Hz panel at 125 % scaling, Windows 11, on mains power, *Balanced* power plan. Chromium was steered to each GPU with `--force-low-power-gpu` / `--force-high-performance-gpu`; the renderer string confirms which was used. **No other browser or machine was tested.**
- **Headless runs are paced at 60 Hz**, so intervals there can't show more than 60 fps. GPU and main-thread times carry the headroom. Headed runs at the panel's 144 Hz are reported separately (§5).
- **Absolute GPU times differ between headless and headed** (e.g. RTX 4050 walk p50: 3.3 ms headless, 1.1 ms headed). Compare within one mode only.
- **GPU timer queries include time the GPU waits for the CPU** inside a frame. Under heavy CPU throttling they read high.
- **Integrated-GPU clocks follow load.** A lighter scene can read *slower* per frame because the GPU clocks down. Lite on the Intel UHD shows this in some views. Compare like with like.
- **Wallpaper Engine** (`wallpaper64.exe`) used ~43% of the Intel GPU at idle on this PC and roughly doubled frame times in the first runs. It was paused with its own `-control pause` for every measurement here. The GPU figures in DECISIONS #31 were probably taken with it running.
- Run-to-run spread on the same build is about ±0.3 ms GPU and ±0.2 ms main thread in steady views. Isolated hitches (one 100–600 ms frame every few minutes) occur on this laptop with no matching work in the page.
- CPU throttling (`PERF_CPU=4`) is Chrome's emulation of a slower CPU, not a real one.

## 3. What was slowing it down

Starting point (`0e14e34`, Full graphics, 1440 × 900, 797 × 717 canvas pixels):

- **GPU-bound on the Intel UHD**: 6–12 ms of GPU work per frame, plus a shadow-map redraw on every third frame (2.6–4.4 ms), so p95 sat at 12–16 ms: 60 fps held, with little to spare.
- **No single dominant cost.** Hiding one family of objects at a time showed GPU time spread over wheat (up to 4.8 ms inside a field; 3.6 ms of far-wheat cards from the elevated view), trees, shrubs and rocks (2–4 ms), the sea (1–2.5 ms), the ground (0.7–2.2 ms) and the sky (~0.5 ms).
- **Overdraw from draw order.** The sky was drawn *first* over the whole screen, and the sea, a plane spanning the island, early, so their per-pixel shaders ran on pixels the land later covered.
- **The sea shader** worked out the distance to the shore per pixel by looping over all 19 tiles.
- **No culling for trees, shrubs, rocks, crags and stooks.** Each was one instanced mesh spanning the island: drawn whole by the camera and the shadow map, whatever was in view.
- **Main thread:** three.js recomputed the matrices of ~1,800 scene objects every frame, though nearly all are static. About 30 sheep were ~220 separate draw calls in both the camera and the shadow pass.
- **Opening the walk** froze the main thread for ~0.8 s on the Intel UHD. ~0.45 s of that was the image-based lighting (PMREM): three's GGX prefilter shader takes ~0.4 s to compile under Direct3D, and it compiled synchronously on every entry.
- **First-visit hitch:** the robber was added after the shaders were precompiled, so its glowing-eye material compiled the first time it came into view: a 90–145 ms frame on the first walk past it.
- **Large windows.** Full caps the pixel ratio at 1.5. A maximised window on a 150 % display, or a 4K monitor, makes the Intel GPU draw 3–4 × the pixels (1551 × 1395 here). It then misses a third of its frames, and there was no resolution control besides Lite.
- **Lifecycle:** leaving the walk disposed three's renderer but never released the WebGL context.

The depth pre-pass, the LOD tiers, GPU wind and the selective shadow updates already worked as intended (§4.3).

## 4. Changes at equal quality

All in `apps/web/src/components/world/`. A pixel diff of every viewpoint (early and late game, both builds, *Reduce motion* on) shows no difference beyond 0.04% of pixels, all of them foam at the water's edge in the dock and elevated views. Everything else is bit-identical or within ±1 level.

| Change | Why |
|---|---|
| **Sky drawn last among opaque objects, sea after the land** (`shaders.ts` `makeSky`, `world.ts` `buildSea`) | Depth testing now skips the cloud shader and the sea shader wherever land already covers them. |
| **Shore distance precomputed** into a 256² half-float texture (`shoreDistance`) | The sea shader samples it once instead of looping over 19 tiles per pixel. The distance is piecewise linear, so bilinear filtering reproduces it except within a texel of tile corners. |
| **Trees, shrubs, rocks, crags and stooks instanced per tile** (`Instancer.flush`, `chunkOf`) | Each tile (or a 250 m square on the horizon) is its own draw, so the camera culls what is out of view. |
| **Static matrices frozen** after building (`freezeStatic`) | Only sheep, the robber, pieces, sails, boats, the sky and the sun keep updating. |
| **Sheep instanced per pasture**, one draw per body part (`makeFlock`, `syncFlock`) | ~220 draws became ≤ 28 in each pass; every sheep keeps its own rig and animation. |
| **Environment prefilter compiled in parallel** (`buildEnvironment`, `finishEnvironment`) | The GGX/blur shaders join the parallel shader compile; the scene compiles against a same-size stand-in, then the real environment renders once everything is linked. It uses PMREMGenerator internals, which is safe because three is pinned at 0.186.1. |
| **Robber and one of each piece in the shader precompile** (`addRobber`, `startWhenCompiled`) | No new shader the first time the robber, a city or a road appears. |
| **WebGL context released when the walk closes** (`release`: `forceContextLoss`) | Fixes the context buildup (§8). |

### 4.1 Intel UHD: before and after

Two alternating runs per build; mean of the per-run medians (range across runs in brackets).

Main-thread time drops too here (10–25%), but on this GPU part of a frame's main-thread time is spent waiting on the busy GPU, and the RTX 4050 shows no main-thread change (§4.2).

| View | GPU p50 ms | GPU p95 ms | Main thread p50 ms | Shadow-pass draws | Missed frames |
|---|---|---|---|---|---|
| Wheat | 10.8 → **8.1** | 14.2 → 11.2 | 1.5 → 1.3 | 160 → 106 | 0.4% → 0.1% |
| Forest edge | 11.9 → **8.7** | 16.1 → 12.5 | 3.0 → 2.5 | 153 → 125 | 7.2% (0–14) → 0.8% |
| Forest clearing | 11.6 → **9.2** | 15.8 → 12.8 | 2.5 → 2.2 | 190 → 150 | 2.4% → 0 |
| Mountains | 8.3 → **6.7** | 12.8 → 11.3 | 2.1 → 1.8 | 285 → 194 | 0.3% → 0 |
| Hills | 6.4 → **4.8** | 10.2 → 8.7 | 1.6 → 1.6 | 202 → 204 | 0.1% → 0.1% |
| Pasture | 10.2 → **7.3** | 14.7 → 10.6 | 2.2 → 1.8 | 165 → 125 | 1.4% → 0 |
| Desert | 7.4 → **5.1** | 11.9 → 8.8 | 1.6 → 1.5 | 287 → 199 | 0 → 0 |
| Settlement | 10.6 → **8.0** | 15.3 → 11.9 | 1.9 → 1.6 | 202 → 175 | 2.4% → 0 |
| City | 7.9 → **6.5** | 12.6 → 11.1 | 1.9 → 1.8 | 263 → 209 | 0.1% → 0 |
| Dock | 5.9 → **4.0** | 9.1 → 7.1 | 1.5 → 1.2 | 271 → 192 | 0 → 0 |
| Elevated (stress view) | 15.6 → **12.9** | 21.2 → 15.0 | 3.1 → 2.3 | 38 → 32 | 34.9% → 17.6% |
| Walk, first visit | 10.0 → **7.9** | 16.9 → 15.9 | 2.5 → 1.8 | 238 → 172 | 4.8% → 2.6% |
| Walk, warm | 9.5 → **7.9** | 16.5 → 14.3 | 1.9 → 1.7 | 233 → 168 | 3.7% → 0.9% |

Opening the walk on a fresh page (Intel UHD): main-thread long tasks **1,020–1,026 ms → 432–532 ms**; the longest single task **795–802 ms → 292–300 ms**. Time to the first frame stays ~1.2–1.3 s, of which the downloads are ~60 ms from a local server. The worst main-thread frame on the first walk dropped from **114–146 ms to 11–35 ms** (the robber's shader).

### 4.2 RTX 4050: before and after

Two alternating runs per build. GPU time on this GPU is dominated by fixed per-frame costs, not pixels. The changes are neutral here: GPU p50 moved by −0.8 to +0.7 ms per view, GPU p95 by −1.5 to +0.9 ms, main thread by ±0.1 ms, and no view missed a frame on either build. The extra per-tile draws cost about what culling saves on this GPU.

| View | GPU p50 ms | GPU p95 ms | Main thread p50 ms | Camera draws | Shadow-pass draws |
|---|---|---|---|---|---|
| Wheat | 4.0 → 3.6 | 8.4 → 9.2 | 1.2 → 1.1 | 55 → 43 | 160 → 106 |
| Forest edge | 3.9 → 3.8 | 7.7 → 7.3 | 2.1 → 2.0 | 423 → 380 | 150 → 125 |
| Forest clearing | 3.6 → 3.5 | 7.5 → 7.5 | 1.8 → 1.9 | 288 → 295 | 196 → 150 |
| Mountains | 4.0 → 3.6 | 7.6 → 7.5 | 1.6 → 1.6 | 173 → 161 | 286 → 194 |
| Pasture | 4.0 → 3.8 | 6.5 → 6.1 | 1.7 → 1.6 | 185 → 181 | 165 → 125 |
| Settlement | 3.2 → 3.9 | 7.0 → 6.6 | 1.5 → 1.4 | 102 → 101 | 202 → 175 |
| Dock | 2.3 → 1.5 | 6.3 → 7.1 | 1.3 → 1.1 | 34 → 20 | 264 → 192 |
| Walk, warm | 3.5 → 3.4 | 7.3 → 7.8 | 1.4 → 1.5 | 115 → 133 | 232 → 172 |

Opening the walk: long tasks **941–1,005 ms → 402–451 ms**, longest **833–900 ms → 294–325 ms**, first frame 1.2–1.3 s → 1.0–1.1 s. The worst main-thread frame on the first walk: **107–120 ms → 6 ms**.

**Slower CPU (4 × throttling, RTX 4050, two alternating runs):** main-thread p50 is the same within noise (forest edge 12.1 → 12.3 ms, mountains 11.7 → 9.8, pasture 9.7 → 10.1, desert 8.1 → 7.9, settlement 8.6 → 9.1). At that speed both builds miss 5–18% of frames in these views, so **a CPU about four times slower than this i7 is the walk's real limit**. Opening the walk there blocks the main thread for 1.7–1.9 s in one task (was 2.2–2.4 s).

### 4.3 Kept as they were, after measurement

- **Depth pre-pass** (interleaved in-page A/B, Intel, GPU ms per frame shown → hidden). Leaf pre-pass: forest edge 9.5 → 13.9 ms, forest clearing 10.1 → 14.0 ms without it, neutral elsewhere. Wheat pre-pass: 8.8 → 9.9 ms without it inside the field; 0.4 ms cheaper without it at the pasture view; neutral elsewhere. **Both stay.**
- **LOD tiers and the wheat far cards.** Far wheat costs 3.6 ms only from the elevated view, which players can't reach. Not changed.

### 4.4 Tried and dropped

| Tried | Result | Why dropped |
|---|---|---|
| **Static shadow cache**: static casters' depth drawn once and copied back (2048² depth blit) before drawing only the moving casters on the every-third-frame updates | Shadow-pass draws 106–209 → 28–46. Interleaved A/B: Intel GPU unchanged (±0.3 ms), main thread −0.1–0.2 ms; RTX 4050 GPU **+0.3–0.6 ms** (the depth copy costs 1.6 ms on the Intel UHD, 0.1 ms on the RTX 4050, and seems to defeat depth compression). | No net gain for a large amount of three-internals code. |
| **Skip the periodic shadow redraw when no sheep, sail or boat is in the shadow box** | The box covers ~80 × 160 m of ground (sun 30° up); on this board 15–31 sheep are inside it from every viewpoint. | Never triggers. |
| **No-op `updateMatrixWorld` on frozen subtrees** (beyond freezing their matrices) | In-page A/B at 4 × CPU throttle: no gain over the matrix flags alone. The extra own property seems to cost elsewhere in three's render loop. | No gain. |

Freezing static matrices (kept), in the same in-page A/B at 4 × CPU throttle, main thread p50: pasture 13.1 → 12.3 ms, city 13.9 → 12.8 ms, forest edge 17.9 → 17.8 ms.

## 5. Frame pacing at 144 Hz (headed)

Real windows on the laptop's 144 Hz panel, after the changes, Full, 1440 × 900:

- **RTX 4050:** 144 fps in the walk and in all eleven views. Frame interval p50/p95 6.9/7.2 ms; main thread p50 1.6 ms.
- **Intel UHD:** walk 95 fps (interval p50 9.3 ms, p95 19 ms). Views run 57–129 fps: forest clearing 68, forest edge 72, settlement 76, wheat 78, dock 129. Above 60 Hz in every reachable view, but not at 120 Hz in the dense ones.

## 6. Optional quality reductions

These lower quality and are **not** counted as optimisation.

| Configuration | Canvas pixels | Walk GPU p50 / p95 ms | Walk missed | Views GPU p50 (mean) | Worst view missed | Passes 60 Hz |
|---|---|---|---|---|---|---|
| Intel, Full 100 % | 797 × 717 | 8.7 / 13.2 | 0 | 7.5 | 0 | yes |
| Intel, Full 75 % | 597 × 537 | 7.2 / 12.5 | 0 | 6.3 | 0.3% | yes |
| Intel, Full 50 % | 398 × 358 | 6.0 / 12.1 | 0 | 5.1 | 0.3% | yes |
| Intel, Lite | 797 × 717 | 8.1 / 11.5 | 0.1% | 8.7 | 0.6% | yes |
| RTX 4050, Full 100 % | 797 × 717 | 3.3 / 7.5 | 0 | 3.3 | 0 | yes |
| RTX 4050, Lite | 797 × 717 | 2.3 / 3.5 | 0 | 2.6 | 0 | yes |
| **Large window** (1920 × 1080, DPR 1.5) | | | | | | |
| Intel, Full 100 % | 1551 × 1395 | 16.6 / 27.1 | **31.8%** | 17.6 | 80% | **no** |
| Intel, Full 75 % | 1163 × 1046 | 11.6 / 18.5 | 15.6% | 11.7 | 42% | no |
| Intel, Full 50 % | 775 × 697 | 7.3 / 12.9 | 0 | 7.5 | 0.3% | yes |
| Intel, Lite (pixel ratio 1) | 1034 × 930 | 8.6 / 10.5 | 0 | 7.3 | 0.6% | yes |
| **Intel, Auto (adaptive)** | 1551 × 1395 → 930 × 836 | 7.6 / 12.8 | **0** (warm) | 7.4 | 0.3% | yes |
| RTX 4050, Full 100 % | 1551 × 1395 | 3.8 / 7.1 | 0 | 3.6 | 0 | yes |

At 1440 × 900 the resolution setting saves 1.5–2.7 ms on the Intel UHD; the shadow pass (unchanged by resolution) keeps p95 near 12 ms. Lite removes the shadow redraws, so its p95 is lowest. Its p50 is not lower in every view because the integrated GPU clocks down when it has slack (§2).

**Adaptive resolution (Auto)** (`adaptive.ts`): judges 2-second windows of frame intervals. If more than 10% of frames miss a 60 Hz deadline, it steps down 1 → 0.85 → 0.7 → 0.6 → 0.5 (two steps at once past 40% late), then waits 2 s. After 10 s of on-time frames it steps back up one level, but not to a level that failed in the last 60 s. In the large Intel window it reached 0.5 during the first walk, then settled at 0.6 (pixel ratio 0.9). The first walk missed ~5% of its frames while it adapted; the warm walk missed none. The existing Auto → Lite fallback now waits until the walk has reached its lowest step. Before, it rebuilt the world in Lite within seconds of opening it. At 1440 × 900 Auto never changes resolution. Full and the fixed settings never adapt.

## 7. Stress tests and the tested ceiling

Development and benchmark builds only (`?stress=` on the URL, `components/world/stress.ts`). Decorative placement keeps using the world's own seeded RNG; nothing touches the game state or saves. One factor at a time, then combined. Walk plus the wheat, forest edge, forest clearing, pasture and city views, Full, 1440 × 900.

Scene size per density (from the world): density 1 → 6,590 wheat clumps, 4,314 grass tufts, 586 flowers, 244 forest trees, 31 sheep; 1.5 → 9,866 / 6,351 / 775 / 320; 2 → 13,162 / 8,435 / 1,086 / 363; 3 → 19,727 / 12,308 / 1,538 / 452 (trees saturate: the tiles run out of room). Sheep 4 × = 124, 8 × = 248. *All pieces* = 54 buildings and 72 roads.

| Preset | Intel UHD: walk GPU p95 ms / missed / worst view missed | Intel passes | RTX 4050: walk GPU p95 ms / worst view GPU p95 | RTX passes |
|---|---|---|---|---|
| none | 13.2 / 0 / 0 | yes | 7.5 / 8.6 | yes |
| density 1.5 | 14.3 / 0 / 0 | **yes** | 8.0 / 8.0 | yes |
| density 2 | 15.4 / 2.0% / 2.2% | no | 8.2 / 9.5 | yes |
| density 3 | 17.9 / 5.4% / 22.7% | no | 8.3 / 9.4 | yes |
| distance 1.5 | 13.5 / 0 / 0 | yes | 7.9 / 8.4 | yes |
| distance 2 | 14.1 / 0.1% / 0 | **yes** | 7.6 / 8.6 | yes |
| distance 3 | 14.6 / 1.0% / 2.2% | no | 8.3 / 8.6 | yes |
| sheep 2 / 4 / 8 | 13.3 / 13.2 / 13.9, 0 missed | **yes** (main thread p95 7 ms at 8 ×) | 7.9 / 8.1 / 8.2 | yes |
| resolution 1.5 × (1195 × 1075) | 19.0 / 14.1% / 37% | no | 7.7 / 8.1 | yes |
| resolution 2 × (1594 × 1434) | 26.6 / 30.5% / 84% | no | 7.5 / 8.1 | yes |
| all pieces | 12.3 / 0 / 0.6% | **yes** | 7.6 / 8.1 | yes |
| density 1.5 + distance 1.5 + sheep 4 + all pieces | 14.4 / 0.7% / 4.5% | no | — | — |
| density 2 + distance 2 + sheep 4 + all pieces | 15.9 / 2.0% / 27% | no | 8.0 / 8.9 | yes |
| **all at their caps**: density 3, distance 3, sheep 8, all pieces, resolution 2 × | — | — | 7.8 / 8.6 (main thread p95 up to 8.5 ms) | **yes** |

**Highest tested passing settings at 60 Hz:**

- **Intel UHD, 1440 × 900:** one of density 1.5 ×, view distance 2 ×, 8 × sheep or a fully built board. Two together already miss frames in the densest views. Resolution must stay at 1 × or below. The limit is GPU time: the main pass grows with vegetation, and the every-third-frame shadow redraw (3–4.5 ms) sets p95.
- **RTX 4050:** everything tested, up to every cap at once (2.3 Mpx). GPU p95 stays at 8–9.5 ms; main-thread p95 reaches 8.5 ms with 248 sheep, a fully built board and triple vegetation. Its 60 Hz limit lies beyond the caps. At 120–144 Hz the shadow-redraw frames (p95 ≈ 8 ms) are what would miss first.

## 8. Sustained sessions and resource lifecycle

**16-minute walks** (route in a loop, one sample per minute, after the changes):

| | GPU p50 first → last minute | GPU p50 range | GPU p95 range | Main thread p50 | Missed frames (median / worst minute) | Renderer resources | JS heap |
|---|---|---|---|---|---|---|---|
| Intel UHD | 9.9 → 9.9 ms | 9.8–10.0 | 14.4–17.3 | 1.8–2.2 ms | 0 / 4.2% | 89 geometries, 35 textures, 22 programs, unchanged | 18–44 MB, sawtooth, no growth |
| RTX 4050 | 3.7 → 3.7 ms | 3.6–3.7 | 7.7–8.2 | 1.5–1.8 ms | 0 / 0 | unchanged | 19–32 MB, no growth |

No thermal drift showed in GPU time on either GPU. The Intel minutes with misses (at most 4.2%) were single hitches with no matching work in the page.

**Enter and leave 20 times** (Intel, with a 4-size resize while inside): renderer resources are the same on every entry (74 geometries, 21 textures, 22 programs). No WebGL draws happen after leaving, and the canvas follows every resize without reallocating anything else. Before the fix, Chrome warned *"Too many active WebGL contexts"* from the 17th entry on, because each closed walk still held its context; after it, no warnings. Re-entry takes 440–700 ms once the models are cached; the first entry takes ~1.1 s. The JS heap measured after a forced GC rises by 0.6 MB on the second entry, then by less each time, to ~0.1 MB per entry by the 15th (10.6 → 14.4 MB over 20). The old build shows the same curve (10.5 → 13.7 MB). It is not caused by these changes and flattens out, which points to engine caches warming rather than retained worlds, but it was not traced to a cause.

## 9. 2D board

Late-game board, production build, Intel UHD, Full:

| Probe | Normal CPU: fps, interval p95, missed, long tasks | 4 × CPU throttle |
|---|---|---|
| Idle | 60, 16.8 ms, 1, none | 60, 16.7 ms, 0, none |
| Hovering tiles | 60*, 16.8 ms, 1, none | 51, 33 ms, 37, 2 (max 54 ms) |
| Bot round (3 bot turns) | 60, 16.8 ms, 6, none | 46, 33 ms, 275, 17 (max 112 ms) |
| Roll + production | 60, 16.7 ms, 0, none | 41, 50 ms, 51, 1 (62 ms) |

\* One 0.6 s frame at the first hover after loading; it does not recur.

At normal speed the board has no long tasks. Under 4 × throttling, main-thread time in bot turns is spread across React renders of the panels and log, framer-motion's animation updates, and the ember canvas (~2%). None of it is an unnecessary render that could be removed at equal quality. The static board layers and the separate hit layer behave as designed (DECISIONS #22–23, #28). **No 2D change was made.**

## 10. Remaining issues and recommendations

**Remaining**

- **Shadow redraws set p95 on integrated GPUs.** 2.6–4.5 ms every third frame on the Intel UHD, independent of resolution. Caching static shadows didn't pay (§4.4). Cheaper options all change the look: a smaller or tighter shadow box, a lower redraw rate for the sheep and sails, or 1024² maps.
- **Far wheat from high viewpoints** (3.6 ms) and a 2 × vegetation density are beyond the Intel UHD at 60 Hz.
- **Slow JS heap rise across visits to the walk** (§8): about +4 MB over 20 visits, flattening, present before these changes. Not traced.
- Opening the walk a second time in the same page on the Intel UHD (late game) still had one ~620 ms long task. Not investigated further.
- Only Chromium on one laptop was measured. Firefox, Safari, other GPUs (AMD, Apple) and real low-end CPUs were not.

**Recommended defaults**

- **Keep *Auto* as the default.** On discrete GPUs and normal windows it behaves exactly like Full. On integrated GPUs in large or high-DPI windows it now lowers the walk's resolution instead of dropping frames or switching to Lite.
- **Integrated GPUs (Intel UHD class):** *Auto*, or *Full* with *3D resolution 75 %* on displays above ~1.5 megapixels of canvas. *Lite* for the steadiest pacing (no shadow redraws).
- **Discrete GPUs (RTX 4050 class):** *Full*, *3D resolution 100 %*. Headroom exists for denser vegetation or longer view distances if the art direction wants them (§7). At 144 Hz the shadow redraws are the first thing to optimise.

## 11. Running the benchmark

```bash
pnpm bench
```

From the repo root this builds `apps/web/dist-perf` (`VITE_PERF=1`), serves it on port 4331 and runs `apps/web/e2e/perf/bench.spec.ts`. Results go to `apps/web/perf-results/<PERF_LABEL>/report.txt` and `results.json`.

| Option | Meaning |
|---|---|
| `PERF_GPU=intel` / `nvidia` | Which GPU Chromium uses on a dual-GPU laptop |
| `PERF_SCENARIOS` | `entry,route,views,late,cycle` (default), plus `soak`, `2d`, `attrib`, `ab`, `ab-freeze` |
| `PERF_REPEAT`, `PERF_SAMPLE_MS`, `PERF_VIEWS` | Repeats per view (2), sample length (3000 ms), which views |
| `PERF_EFFECTS=full|lite|auto`, `PERF_RENDER_SCALE=1|0.75|0.5`, `PERF_REDUCE=1` | Graphics settings |
| `PERF_W`, `PERF_H`, `PERF_DPR` | Window size and device pixel ratio (1440, 900, 1) |
| `PERF_CPU=4` | Chrome CPU throttling |
| `PERF_HEADED=1` | A visible window, paced by the display |
| `PERF_STRESS=density:2,distance:2,sheep:4,scale:1.5,pieces:all` | Stress preset (caps 3, 3, 8, 2) |
| `PERF_SOAK_MIN=16` | Soak length |
| `PERF_SHOTS=1`, `PERF_DUMP=1`, `PERF_SYNTH=1` | Screenshots per view, raw frame records, the synthetic forced-completion timing |
| `PERF_PROFILE_ENTRY=1`, `PERF_PROFILE_ROUTE=1`, `PERF_PROFILE_2D=1`, `PERF_INVENTORY=1` | CPU profiles; shaders and textures created on a walk |
| `PERF_REUSE=1` | Reuse a running `vite preview` on 4331 instead of rebuilding |

Regenerate the saved games after a rules or bot change with `../server/node_modules/.bin/tsx e2e/perf/make-fixtures.ts` (from `apps/web`). Pause anything else that uses the GPU first; on this PC that means Wallpaper Engine.
