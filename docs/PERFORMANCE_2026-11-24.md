# Game performance audit — 24 November 2026

The packaged native Catnight app has comfortable rendering headroom on this PC. Its normal board and riding samples hold the 60 FPS test cap; uncapped 1080p samples average 87–96 FPS. The separate full-island reference version also holds about 60 FPS on the RTX 4050, but opening it stalls the main thread and Intel UHD cannot sustain Full effects. This is a completed local audit with follow-up work, not a claim that every performance target passes.

## Scope and setup

- Lenovo LOQ / Core i7-13650HX, 16 GB RAM, RTX 4050 Laptop plus Intel UHD, Windows Balanced power mode. NVIDIA driver 595.97; Intel driver 32.0.101.7026.
- Native: the actual packaged **Development** executable, DX12 SM5, default Epic scalability, 100% render scale, full motion. Each window size was checked through its Win32 client rectangle. Uncapped back-buffer screenshots also verify 1920 × 1080.
- Full island: production Vite bundle with inspection hooks, Chromium 151 / ANGLE D3D11, DPR 1. GPU identities were read from WebGL. The RTX window is 1920 × 1080, with a **1316 × 807** 3D canvas; Intel uses a 1440 × 900 window and **836 × 627** canvas (627 × 470 in Lite/75%). These are not equal-size native/browser render targets.
- GPU tests ran serially. Animated wallpaper was paused during final captures. Test saves and browser profiles were isolated; the normal Continue save was untouched.
- Native performance uses real elapsed time, not fixed simulation steps. First 300 frames are excluded from steady samples (30 for the moving route). The capped target is 60 FPS; a late frame is longer than **20.83 ms**, allowing a quarter-frame of scheduling tolerance. `p95` means 95% of measured frames were at or below that time.
- Fresh processes use warm OS/driver caches. Native windows are hidden and Chromium is headless. These are engine/page frame timings, not a monitor-present or input-latency certification. Native CSV processing runs synchronously to avoid the asynchronous profiler shutdown defect described below.

## Native app

### 60 FPS capped sweep

| Scene | Measured FPS | Frame p95 | Late frames | Frames >50 ms |
|---|---:|---:|---:|---:|
| title-1080 | 60.00 | 17.25 ms | 0.000% | 0 |
| setup-day-1080 | 60.00 | 17.41 ms | 0.000% | 0 |
| setup-night-1080 | 60.00 | 17.18 ms | 0.000% | 0 |
| late-1080 | 60.00 | 17.23 ms | 0.000% | 0 |
| flat-1080 | 60.00 | 17.33 ms | 0.000% | 0 |
| full-match-1080 | 59.95 | 23.01 ms | 21.167% | 1 |
| yard-idle-1080 | 60.00 | 17.17 ms | 0.000% | 0 |
| yard-route-1080 | 60.00 | 17.31 ms | 0.000% | 0 |
| late-720 | 60.00 | 17.56 ms | 0.000% | 0 |
| yard-route-720 | 60.00 | 17.24 ms | 0.000% | 0 |
| late-soak-1080 | 59.97 | 17.47 ms | 0.111% | 0 |

The moving route exercises the actual native movement/camera code, including walking, running, crouching and riding. Its performance capture stops before the entire physical validation sequence finishes; the separate functional tests cover all thirteen scenarios at fixed 10/60/144 Hz. The 400-action fixture is a reproducible busy board, not an assertion about every possible late-game layout.

### Uncapped comparison

| Scene | Average FPS | Frame p95 | Game-thread p95 | GPU counter p95 |
|---|---:|---:|---:|---:|
| late-uncapped-1080 | 96.16 | 11.84 ms | 4.65 ms | 9.97 ms |
| instant-match-uncapped-1080 | 87.28 | 12.93 ms | 7.80 ms | 11.18 ms |
| normal-bots-uncapped-1080 | 92.67 | 11.87 ms | 4.02 ms | 10.58 ms |

Instant bot play has **21.17% late frames** with the 60 FPS cap, but **0%** above the same 20.83 ms threshold in the uncapped sample. Normal uncapped bots average 92.67 FPS. The observed problem depends on frame limiting with bursty actions; it should not be reported as a general inability to render at 60 FPS. Investigate limiter/presentation scheduling and per-action work before selecting a fix.

One isolated 59.77 ms frame appeared in the uncapped busy-board sample. It was not reproduced in the uncapped match samples. Do not attribute isolated stalls to a particular subsystem without a correlated trace.

### Five-minute native soak

| Minute | FPS | Frame p95 | Physical memory median |
|---|---:|---:|---:|
| 1 | 59.88 | 17.70 ms | 1111.9 MiB |
| 2 | 60.00 | 17.39 ms | 1109.7 MiB |
| 3 | 60.00 | 17.41 ms | 1110.1 MiB |
| 4 | 60.00 | 17.44 ms | 1109.9 MiB |
| 5 | 60.00 | 17.44 ms | 1109.6 MiB |

The 300.13-second steady sample averages **59.97 FPS**, with **0.111% late frames** and **no frames over 50 ms**. Physical memory rises during the first minute, then remains around 1109–1110 MiB. There is no sustained growth over the following four minutes; this does not prove long-duration leak freedom.

## Full island reference version

### RTX 4050, Full effects

| Route | Distance | Average FPS | Frame p95 | Late frames | GPU p95 |
|---|---:|---:|---:|---:|---:|
| route-first | 467 m | 59.94 | 17.90 ms | 0.053% | 9.74 ms |
| route-warm | 467 m | 59.99 | 17.90 ms | 0.036% | 9.53 ms |
| late-route | 473 m | 60.00 | 17.90 ms | 0.053% | 8.65 ms |

Eleven viewpoints were sampled twice on both early and late boards: wheat, two forest views, mountains, hills, pasture, desert, settlement, city, dock and an elevated stress view. Every **reachable** viewpoint stays below 1% late frames in these short samples; the elevated, unreachable camera slightly exceeds that threshold (about 1.1%). Fourteen village/interior and doorway-route samples also completed without runtime errors. Short-window FPS counts can be affected by sampling boundaries; frame intervals and late-frame counts carry the pacing conclusion.

The first travel route includes one 138 ms frame. The five-minute island soak records three frames over 50 ms, while median/p95 pacing stays near 60 Hz. No corresponding page long tasks were recorded during those travel samples, so the available data does not attribute those isolated gaps to game JavaScript.

### Loading and repeated visits

- First RTX island entry: **3603 ms**, including **2740 ms** of main-thread long tasks. The longest single task is **2124 ms**; local downloads complete after only **134 ms**. Initialization, not local transfer, is the main measured entry bottleneck.
- Twenty subsequent entries take **2051–2680 ms**, median **2424 ms**. The first five entries have a 2529 ms median; the last five have a 2220 ms median, so repeated entry did not progressively slow down.
- All twenty exits have **zero subsequent WebGL draws**. No context-exhaustion warnings or runtime errors were reported.
- After forced GC, retained JS heap rises from **13.56 MiB** after the first visit to **17.81 MiB** after the twentieth. The final ten visits still add about **1.4 MiB**. This is a retention signal requiring heap-snapshot attribution; it is not proof that all growth belongs to the game.
- The resize test changes the window four times on visit two and ends at 1440 × 900. Renderer resource counts depend on view, resize and first-use uploads; they cannot be compared as identical fixed scenes.
- In the separate five-minute island soak, textures/geometries/programs remain **64 / 361 / 39**. Unforced-GC JS heap fluctuates between **95.4 and 108.6 MiB**, ending at **97.8 MiB**. This does not show sustained route-soak growth.

### Intel UHD comparison

| View | Full FPS | Full GPU p95 | Lite +75% FPS | Lite GPU p95 |
|---|---:|---:|---:|---:|
| wheat | 31.0 | 28.5 ms | 36.5 | 21.3 ms |
| forest-edge | 40.0 | 21.6 ms | 38.5 | 18.9 ms |
| forest-clearing | 45.9 | 21.3 ms | 48.2 | 14.9 ms |
| pasture | 43.7 | 23.7 ms | 60.3 | 12.5 ms |
| city | 47.9 | 21.2 ms | 59.3 | 12.2 ms |

Full effects on Intel UHD **do not meet a consistent 60 FPS target**, even at the smaller canvas. Lite/75% helps pasture and city, but dense wheat and forest still miss the target. The presets change both effects and resolution, so this comparison does not isolate their individual contributions. Prefer the tested RTX 4050 for Full effects; integrated-GPU support needs additional work.

The 2D idle, hover, bot-round, and roll/production samples completed on both GPUs. RTX idle/hover/production intervals stay near 16.7 ms; the bot-round sample has eight late frames and one gap up to 149.9 ms, with no observed page long task. Intel also has an isolated 550 ms hover gap. These outliers remain unassigned rather than being silently discarded.

## Follow-up priorities

1. **Split/profile island initialization.** The repeated two-second main-thread block is the clearest loading problem.
2. **Investigate capped Instant-bot pacing.** Preserve the uncapped comparison; the rendering budget alone does not explain the capped jitter.
3. **Attribute repeated-entry heap retention.** Compare heap snapshots after fixed-view visits, accounting for the benchmark/probe and browser caches.
4. **Improve integrated-GPU foliage/render cost**, or explicitly target the discrete GPU for Full effects.
5. **Measure native Flat view without the obscured world.** The chart toggle changes Slate painting but does not disable board/world rendering in the game code. Its GPU counters stay close to 3D; an A/B capture is needed to quantify the avoidable work. Relevant code: `STableHud.cpp` chart toggle, `STable.cpp` flat painting, and `CatnightGameMode.cpp` board visibility.

## Validation and reproducibility

Functional checks were run after timing captures to avoid competing for CPU/GPU resources. Final statuses are appended below. No gameplay optimization is included in this audit. The benchmark itself now saves intermediate reports and bounds ordinary UI/navigation waits at 30 seconds, making long runs recoverable and stale selectors easier to diagnose.

- Machine-readable summary: `apps/catnight/validation/performance-2026-11-24.json`.
- Native raw captures, runner, parser and process-memory samples: `apps/catnight/Saved/Performance/2026-11-24/` (`native-results.json`, `uncapped-results.json`, and `verified/`). The local runners use isolated UserDir paths, `r.SetRes`, Win32 size verification, synchronous CSV capture and no fixed timestep.
- Browser raw reports: `apps/web/perf-results/full-2026-11-24-{rtx1080,intel900,intel-lite75}/`.
- Main browser command: `pnpm bench` with `PERF_GPU=nvidia`, `PERF_W=1920`, `PERF_H=1080`, `PERF_EFFECTS=full`, `PERF_RENDER_SCALE=1`, `PERF_REPEAT=2`, `PERF_SCENARIOS=entry,route,views,late,cycle,2d,soak,village`, `PERF_SOAK_MIN=5`, `PERF_CYCLES=20`.
- Intel comparison uses `PERF_GPU=intel`, 1440 × 900, one repeat, `entry,views,2d`. The Lite/75% follow-up samples the five dense views above.
- Preliminary native captures that ignored the requested resolution were discarded. Only the verified grid and uncapped captures appear in the final tables.
- Asynchronous Unreal CSV profiling returned exit **777003** after normal shutdown; an unprofiled control exited **0**. Synchronous CSV processing also exited **0**, and was used for every final native sample. This is a profiler-path finding, not a demonstrated normal-play crash.
- The original PowerShell browser supervisor treated a harmless `NO_COLOR`/`FORCE_COLOR` stderr warning as an error after the complete RTX run. The full results and the observed passed runner status were retained. Intel follow-ups use CMD redirection and both return **0**.

Native live-island/Steam online parity remains unfinished. This audit does not certify the old CEF wrapper, internet latency, physical gamepad use, mobile, Shipping builds, other machines or 144 Hz rendering. The fixed-rate movement checks are correctness checks, not FPS measurements.

## Final validation results

- `pnpm verify`: passed strict typechecking, zero-warning lint, **133 unit tests**, and the production build.
- `pnpm native:test`: **261 checks passed**, all **248 golden games / 116,509 actions** matched.
- `pnpm catnight:test`: **six editor automation tests passed**.
- `pnpm catnight:test-heroes`: **7,910 checks**, zero failures, thirteen physical scenarios at fixed 10/60/144 Hz; hero asset/melee rules and yard-return lifecycle checks passed. Seven rendered views were captured; current crouch and rear-riding captures were reviewed.
- Intel comparison and Lite/75% follow-up return exit code **0**. The full RTX report contains all four requested scenario groups and no runtime/context problems; its observed runner status passed despite the supervisor's stderr-warning handling issue.
- All final native performance captures exit **0**. Animated wallpaper was restored. Normal saves and gameplay code were not changed.

The audit is complete. The performance findings above remain open; functional test success does not make the Intel or capped-Instant performance failures disappear.
