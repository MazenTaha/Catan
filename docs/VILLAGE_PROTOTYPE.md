# Village prototype: enterable buildings in the 3D walk

A first, playable slice of the walk's next visual direction: settlements you can walk into, a
city hall, a windmill with a ground floor, all on the live board. One representative area was
finished and measured before anything spreads across the island. Decisions: DECISIONS #33.
Measured 2026-10-25 against `main` at `e23202c`.

## What you can do

- **Open it:** `?scene=village` (dev or benchmark build) loads a fixed game (seed `perf-bench`)
  and opens the walk outside seat 0's cottage, which borders a wheat field (corner `-2,4`). You
  hold 2 grain and 4 ore, enough for the city upgrade. Every settlement, city and windmill on the
  island is enterable, not just this one.
- **Doors:** walk up to one and look at it. A small *E Open door* hint appears; **E** swings the
  leaf (0.45 s, instant under reduced motion), **E** again closes it. The door won't close on you
  if you stand in the doorway.
- **Inside:** the cottage has a bed nook, hearth with a pot over embers, table and bench, stool,
  dresser with crockery, chest and rug, and four open windows. The hall has a long table with
  benches and a high chair, a big hearth, chests, barrels, a shelf, a candle ring and banners in
  the owner's colour. The mill has a millstone with its shaft, sacks, a grain bin and a ladder.
- **The game carries on:** the HUD, toasts, dice and dialogs (a discard on a 7, trade offers)
  stay visible around and over the walk. **Space** still rolls and ends the turn, **Esc** or
  the **2D board** switch returns to the board at once. Doors are local and decorative; nothing goes over
  the network.

## Scale and composition (one convention)

Metres; 1 Blender unit = 1 m (`docs/BLENDER_ASSET_PIPELINE.md` §5).

- A land tile is 14 m centre to corner and a road is one 14 m edge. Settlements stand on board
  corners at least 24 m apart. The board is never stretched and the placement rules are unchanged.
- The walker's eye is 1.7 m above the floor, and the walker is 0.7 m wide.
- **Doors:** 2.15 m (cottage), 2.1 m (mill) and 2.5 m (hall) high, and 1.05–1.5 m wide. That
  leaves at least 0.35 m of slack past the walker.
- **Rooms:** the cottage is 4.2 × 3.8 m with a 2.6 m ceiling; the hall 7 × 5 m with 3.6 m; the
  mill 3.9 m across with 2.75 m.
- **Floors:** 0.24–0.36 m up, on stone plinths.
- **Footprints:** the cottage is about 4.7 × 4.3 m outside, the hall about 7.8 × 5.8 m plus a
  corner tower, so both stay within their corner's reach.
- **Facing:** a building faces the most inviting tile at its corner (a wheat field first). Roads
  stop at its walls instead of running through the doorway. Wheat, grass, flowers, trees and
  rocks inside a 4.2 m (cottage), 6.2 m (hall) or 3 m (mill) clearing are hidden while the
  building stands.
- **From above:** the 2D board is unchanged. In the 3D overhead view the owner-coloured roofs
  and banners keep ownership readable.

## How it is built

- **One plan, two readers.** `apps/web/src/components/world/buildings.json` holds each room's
  size, walls, doors, windows and furniture boxes. `assets/blender/homes.py` builds the models
  from it, and `world/buildings.ts` turns the same numbers into collision capsules, floors and
  door hinges. The visuals and the collision proxies can't drift apart.
- **Models** (village.glb, rebuilt with `blender -b -P assets/blender/build.py -- village`):
  - **The shell** has thick walls (inner and outer faces, reveals round every opening), floor,
    ceiling with beams, roof, timber framing, shutters and flower boxes.
  - **An `<Name>Interior` child** holds the furniture and props.
  - **One `<Name>Door` node per leaf** has its origin on the hinge.
  - **Triangles** (shell + interior + doors): cottage 2,125 + 1,298 + 50; hall 2,322 + 3,032 + 100;
    mill 854 + 688 + 50 (+ 374 sails).
  - **Materials:** the village atlas set plus one `Interior` material. Nothing is double-sided
    except the sails.
- **Lighting:** no lamps and no extra lights. Rooms are lit by the sun through the doorway and
  windows (the walls and roof cast shadows) and by the sky's image-based fill. AO is baked into
  vertex colours: gently for furniture, normally for the shells. The hearth embers use the
  existing emissive Glow material.
- **Collision:**
  - **Proxies:** walls are capsules along their centre lines, with gaps exactly at the
    doorways, and furniture boxes become capsules. Door leaves collide at their current angle.
    Nothing is read from the meshes.
  - **Spatial grid:** all colliders sit in a 4 m grid, so a step tests only nearby ones.
  - **Sub-steps:** movement runs in steps of 15 cm or less, so a slow frame can't carry the
    walker through a wall (the software-rendered test found exactly that).
- **Floors:** standing on a building's floor raises the eye smoothly to floor height, and its
  floor counts as walkable even where it overhangs the beach.
- **Safety:**
  - A spawn point never lands inside a building.
  - If a building changes under the walker (a settlement upgraded to a city by its owner), the
    walker is put outside its door, facing it, with a short notice.
  - Door states survive the piece rebuilds that every board change triggers.
- **Loading:** models load before the walk opens. The settlement, city and road shaders are
  precompiled with the rest, so an upgrade appears without a stall. Interiors are hidden beyond
  34 m.

## Verification

- **`e2e/buildings.spec.ts`** (software rendering, part of `pnpm e2e`):
  - The hint appears, E opens the door and no game action is taken.
  - Walking in reaches the floor at eye height; pushing on, the far wall holds.
  - Space ends the turn from indoors, the bots play, and a discard dialog appears over the walk.
  - Walking back out works.
  - Upgrading the occupied cottage to a city puts the walker outside the hall, with the notice.
  - Esc returns to the board.
  - Switching graphics mode inside the walk rebuilds the world on a fresh canvas.
  - The console stays clean throughout.
- **`pnpm verify`** passes (115 tests). **`pnpm e2e`**: 11 passed, 6 opt-in skipped.
- **One batched visual review** of every view below found three defects, all fixed and
  re-checked:
  - a timber brace and the sill beam ran across the doorway;
  - roads ran through doorways and over floors;
  - grass grew through the mill floor.
  - The review also prompted re-facing the cottage door away from a pasture fence.
- **Screenshots:** production build, Intel UHD, 1440 × 900, Full, in `design/village/final/`
  (local, untracked): outside, door, two interiors, overhead, wheat, the mill inside and out,
  and the hall inside, outside and from above.

## Performance

`pnpm bench` on a production build (`VITE_PERF=1`): headless Chromium 151, 1440 × 900 window
(797 × 717 canvas pixels), Full graphics, 100 % resolution, fixed saves and route. Both GPUs of
the owner's laptop, picked by flag and confirmed by the renderer string. Wallpaper Engine was
paused. GPU time comes from timer queries; "missed" means intervals over 20.8 ms.

**Standard benchmark, before (`e23202c`) → after, same seed, route, viewpoints and settings.**
The scene now contains the new buildings, so this is the visual-quality cost.

| | Intel UHD | RTX 4050 |
|---|---|---|
| GPU p50, 11 views | within ±0.4 ms of before (e.g. wheat 8.1 → 8.0, forest edge 8.6 → 8.6, settlement 7.9 → 7.3, pasture 7.2 → 7.6) | within ±0.4 ms (e.g. wheat 3.6 → 3.6, forest clearing 3.6 → 4.0) |
| GPU p95, walk | 13.0 → 13.1 ms | 8.3 → 7.6 ms |
| Triangles, camera pass | +0 – 2 % | same |
| Draw calls, camera pass | +3 – 10 % | same |
| Draw calls, shadow pass | +10 – 25 % (the buildings cast) | same |
| Main thread p50 | equal or lower (not attributed; see below) | equal or lower |
| Missed frames, reachable views and walk | 0 – 1.7 % → 0 % | 0 → 0 – 0.3 % |
| Opening the walk | 1.47 → 0.99 s; long tasks 706 → 422 ms | 1.11 → 0.83 s; 452 → 356 ms |
| Download (once per page) | +399 kB (village.glb 968 → 1,339 kB) | same |
| 20 enter/leave cycles | steady: 85 geometries, 21 textures, 22 programs on every entry (74 before); no WebGL warnings; heap curve as before (10.9 → 14.5 MB, flattening) | same |

Main-thread time per frame and entry time came out lower. The collider grid only matters while
walking, though, and run-to-run noise in entry time is ±0.3 s, so neither gain is claimed.

**The prototype area** (`village` scenario; GPU p50 / p95 ms; missed frames out of ~180):

| View | Intel UHD | RTX 4050 |
|---|---|---|
| Cottage from the wheat (1.0 M triangles) | 11.5 / 14.5, 0 | 3.2 / 6.6, 0 |
| At the door | 7.1 / 10.4, 0 | 4.1 / 6.9, 0 |
| Inside, towards the hearth | 8.7 / 12.0, 0 | 4.4 / 7.0, 0 |
| Inside, towards the door | 7.8 / 11.8, 0 | 3.4 / 6.2, 0 |
| Wheat | 11.5 / 14.2, 1 | 3.9 / 7.1, 1 |
| Mill outside / inside | 7.2 / 10.4, 0 · 5.9 / 8.9, 0 | 3.4 / 5.7, 0 · 2.7 / 5.1, 0 |
| Hall outside | 11.9 / 15.0, 2 | 3.7 / 7.1, 0 |
| Hall inside (table / corner) | 7.3 / 10.6, 0 · 8.5 / 11.6, 0 | 3.9 / 7.2, 0 · 4.7 / 7.5, 0 |
| Walking in and out of the cottage | 9.9 / 14.6, 8 of ~2,000 | 4.0 / 7.5, 1 |
| Walking through the hall | 9.6 / 13.7, 0 | 3.6 / 6.4, 0 |
| Overhead, 14–16 m up (a camera players can't reach) | 13–14 / 16–17, 15–32 | 3.5–3.7 / 6.7–7.2, 0 |

Indoors, the outdoors behind the walls is still drawn: three.js has no occlusion culling, so
looking at the hearth issues 339 draws, against 92 looking at the door. Pixels hidden by walls
are cheap thanks to the depth test, which is why indoor GPU time stays below outdoor time.

## Can this quality extend across the island?

Yes, in the browser, for buildings. Every settlement, city and windmill is already enterable,
and the standard benchmark shows the cost:
- **GPU:** within noise on both GPUs.
- **Draws:** +3–10% in the camera pass and +10–25% in the shadow pass.
- **Download:** +0.4 MB.

On the Intel UHD at 1440 × 900 every reachable view of the prototype area holds 60 Hz, with GPU
p95 at most 15 ms. The RTX 4050 has more than 2× headroom.

What doesn't scale for free:
- **Shadow-pass draws grow** with each building (about 9–14 draws apiece while inside the
  shadow box). A fully built board (54 buildings) would add several hundred shadow draws near
  the walker. The earlier stress test of a full board (DECISIONS #32) passed on the Intel UHD,
  but with the old, simpler buildings; it should be re-run with these.
- **The Intel UHD has 1–2 ms of p95 headroom** in the busiest outdoor views. Richer vegetation
  or bigger interiors would need the Auto resolution step-down, or a cheaper shadow pass.
- **Furnishing more building types** (barns, mines) is mostly authoring work. The plan, door
  and collision system is generic.

## Left for later

- **Grove, meadow and sky:** these were not reworked. The area uses the existing forest,
  pasture, flowers and sky; the only outdoor changes are per-plot wheat ripeness and the
  clearings.
- **Indoor draws:** no occlusion culling, so indoors the outdoors is still submitted. A simple
  "inside" visibility mask (hide far tiles while standing in a room) would cut indoor draws.
- **Doors and props** are decorative and local; nothing is synchronised between players by design.
- **Untested:** the RTX 4050 and Intel UHD were the only GPUs tested, Chromium the only
  browser. No real low-end CPU was tested.
