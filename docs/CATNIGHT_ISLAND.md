# Native island rework

The native app now opens a human-scale island from **Explore island** on the match screen.
It uses the match's actual seed, terrain, harbours, buildings and roads. Escape returns to the
same table; exploration pauses the local bot clock and does not create rules actions or rewrite
the match record. Hot-seat hand-off must be acknowledged before entering.

## World and artwork

- The 19 tiles use a 65 m radius, making the land about 520 × 563 m. A direct crossing takes
  several minutes at the normal 2.4 m/s walking speed; sprint remains 6.2 m/s, crouch 1.1 m/s,
  horse walk 2.5 m/s and gallop 8 m/s.
- A single continuous collision mesh (3.5 m grid) supplies the terrain. The **coastline** is
  where a smooth field round the 19 tile centres (Gaussian, σ = 0.95 tile radius, ±12 % noise)
  crosses a level set below its lowest value on any coastal road corridor: the notches between
  the outer hexagons fill in as bays and headlands, every corridor stays dry with a beach beyond
  it, and internal joins are deep inland. `CoastDistance` is that field's first-order signed
  distance. Past the beach the sea floor falls to 23 m and darkens into a dark ocean floor.
- **Relief:** each biome has its own rolling noise (fields nearly level, hills and peaks the
  most). Mountains raise five crags (23–37 m, ridged, with stone on steep faces and snow above
  26 m) between the hub and the corners; hills raise three broad clay swells (4–9.5 m). The
  hub, its trails and all 72 road corridors stay level (the route check enforces it).
- Biome colours blend across the island with lush and sun-dried patches. Only the hubs'
  footpaths are worn, and they wander inside their level lanes; unbuilt road corridors keep the
  biome colour. `M_Ground` multiplies the vertex colour by a painted turf texture at 7 m and 64 m.
- **Sea:** `M_IslandSea` is translucent with per-pixel fog (a 100 km four-vertex plane fogs as if
  50 km away otherwise): turquoise over sand, blue with depth, foam at the waterline. The board
  keeps its opaque `M_Water`.
- Forest groves, wheat, wildflowers, sheep, farms, mills, clay works, mines, ruins, a small
  public hamlet, docks and boats use the project's original Blender artwork. Scenery batches
  by mesh with GPU-culled instancing. **Ground cover** (`Cover`) fills each tile's nearest-centre
  cell on a jittered grid: wheat 2/m², meadow 1.3/m² with flower patches, forest grass and
  shrubs, clay-hill lavender, sparse alpine grass, desert scrub. White Blender grass tufts get a
  green per biome, as in the web walk. Cover stays off footpaths, building sites, road corridors
  and the beach; it culls at 65–90 m (wheat 90–120 m), larger scenery at 300–450 m, crags at
  700–900 m. Sheep graze in flocks. About 200,000 instances in all.
- The hero camera has no motion blur (the engine default smeared the knight whenever it turned).
- Six new original Blender furnishings add a well, market stall, handcart, wayfinding sign,
  lantern post and flowerbed. The owner's `E:/Catan_art_obj` cottage, vegetation, farm, harbour
  and furnishing references guide the materials and shapes. No downloaded asset pack is used.
- Physical walls/roofs, trunks, rocks and pier decks block the player/camera. Boats use their
  authored waterline pivot. Public piers have a matching collision deck and a supported walking
  allowance beyond the ordinary shoreline boundary. These boats are scenery, not boardable vehicles.
- Player buildings use their actual vertex and owner trim; roads follow the actual edges and
  share one instanced surface batch. Ambient hamlet cottages are scenery, not extra rules pieces.
- Warm daylight, a captured sky, soft blue shadow fill, atmospheric depth and matching fixed physical world/player-camera exposure
  keep the native character and environment under one light. This is an original stylized
  daylight direction inspired by the owner's reference, not a claim of matching Fortnite's renderer.
- A public island chart shows biome outlines, the player's heading and a 100 m scale. Nearby/map
  modes, building markers and an expanded map remain to be added.

## Movement and boundaries

The existing CharacterMovement and swept SpringArm remain authoritative. Mounting now sweeps
the mounted capsule onto a supported floor instead of assuming the parked horse stands on a
flat plane. The visible horse follows a smoothed ground normal/height, and the rider stays on its
saddle; parked horses retain the floor normal too. While falling, the visible horse follows
the falling physics body. Reins still join the actual bit and gauntlet sockets.

The shoreline check uses extra forward clearance when mounted to keep the horse's front feet
on supported land/deck. Dismounting also sweeps the standing capsule onto its candidate floor, then requires full
clearance and a position inside that boundary.
This is body alignment, not per-leg terrain IK; that remains a separate animation milestone.

## Rebuild and edit

```powershell
pnpm catnight:island
```

This runs `assets/blender/native_island.py` in Blender, retaining the editable
`apps/catnight/SourceArt/Island/island.blend`, and imports its GLB and ground detail into
`/Game/Generated/Island`. It leaves the original board and skeletal assets intact. Repeated
imports keep Interchange's stable asset paths. `pnpm catnight:import` includes this step after
the board and character imports. Packaging checks the six furnishings and ground material first.

The generated `/Game/Generated/Island/Review/IslandPreview` map is an editable composition
preview. It is excluded from cooking. Use the app's default Entry map to play the actual game.
The preview actor exposes `PreviewSeed`, `TileRadius` and `SunYaw`, plus **Rebuild Island** in its
Details panel. Change `TileRadius` rather than scaling the actor. Rebuilding regenerates scenery;
individual instance edits should be considered a review experiment until moved into the generator.

The normal import creates the preview only when it is missing. The commandlet argument
`-CatnightRefreshIslandPreview` explicitly regenerates that review map; do not use it to preserve
hand edits. Generated artwork, the review map and `.blend` outputs are ignored and reproducible.

## Review through the Unreal MCP (2026-11-27)

The terrain, coast, sea and planting above were reviewed in an editor for this checkout on port
8001 (`-ModelContextProtocolPort=8001 -ModelContextProtocolStartServer`, preview map open):
`StaticMeshTools.get_triangle_count` set the ground-cover budget (grass 70–113 triangles,
wheat 102), and `EditorAppToolset.CaptureViewport` with fixed poses gave aerial, coast and
crag views after each change. Those views found the hexagonal shoreline, the grey sea (per-vertex
fog), the sea floor's edge showing through the water, the cone-shaped clay hills and a floating
crag shoulder. Eye-level views of the six biomes came from `-game` captures. Captures stay in
the reviewer's scratch space; `validation/island-*.png` are the committed examples.

## Actual Unreal MCP work

Epic's MCP plugin was used against a separate editor on port **8001** for this managed checkout.
The shared `E:/Catan` editor on port 8000 was left unchanged. The MCP review placed the native
island, inspected its properties, adjusted sun direction, positioned cameras and captured the
viewport. Material inspection found an unwired vertex-colour input; MCP connected it, recompiled
the shader and verified both inputs before saving the ground material. The importer now asserts
those connections, so a fresh import reproduces the correction. Packaging and game-only
checks disable the editor-only toolsets; the normal editor keeps MCP available.

`apps/catnight/Tools/unreal_mcp.py` is a small sequential HTTP client for the same official MCP
endpoint, useful before the desktop app reloads its MCP tools. Discover schemas before calling:

```powershell
python apps/catnight/Tools/unreal_mcp.py --url http://127.0.0.1:8001/mcp list
python apps/catnight/Tools/unreal_mcp.py --url http://127.0.0.1:8001/mcp describe EditorToolset.EditorAppToolset
```

Confirm the editor process/project serving the port before editing. Tool calls execute serially
on Unreal's game thread. Captures and the material wiring proof are retained in `Saved/MCP`.

## Validation

```powershell
pnpm verify
pnpm catnight:test
pnpm catnight:test-island -Editor
pnpm catnight:test-heroes -Editor
```

The island automation checks repeatability, 5,453 route samples, internal joins, actual floor
collision and preservation of the match record. The functional runner drives the real character
through five movement modes on each tile (95 scenarios) at fixed 10/60/144 Hz, verifies three
island/table return cycles, then captures all
six biomes with the HUD. This verifies simulation at those rates, not rendering at 144 FPS.
`-Quick` captures pasture and forest for visual iteration. Logs/images are under
`Saved/IslandValidation/<timestamp>`. Reports under `validation/` identify the actual revision
and scope that passed.

If a separate checkout's editor is open, build this editor target with
`-NoHotReloadFromIDE`, then use `pnpm catnight:test -NoBuild`. Never close another session's editor
or connect its MCP endpoint for edits. Cold hero-asset checks wait for asynchronous asset
compilation before sampling the imported animation loops.

## Smooth walking (2026-11-27)

The walk stuttered and juddered while turning, and the edge of the drawn cover travelled with the
walker. DECISIONS #74 has the measurements; in short:

- Scenery batches are plain instanced meshes (GPU culling per instance). Hierarchical ones cost
  about 5 ms of CPU visibility work a frame for the view and each shadow cascade.
- Plants use `M_IslandCover` / `M_IslandCoverMasked` (built by `import_island.py`): two-sided
  foliage shading and a shrink into each plant's pivot between `FadeStart` and `FadeEnd`, set per
  batch to 62–97 % of its cull distance. Plants do not feed distance-field lighting.
- While the island is open the game mode turns off TSR's flicker and resurrection heuristics and
  the translucency lighting volume and sets `r.GTSyncType 1`; leaving puts them back.
- Entering fades up from black over 0.8 s and collects garbage under the fade.

Measure with a scripted tour (walk and sprint, the view swinging 70° either way):

```powershell
UnrealEditor.exe Catnight.uproject -game -CatnightIsland=0 -CatnightIslandDrive=tour -CatnightPerf=<file.csv> -CatnightPerfSeconds=30 -CatnightTourLog=<camera.csv>
```

Add `-CatnightPerfCapped` to keep the player's frame-rate setting (vsync) and
`-CatnightTourShots=<dir>` for twelve frames in motion from 10 s. Pause other GPU users first
(Wallpaper Engine on the owner's PC took the GPU for seconds at a time).

## Still open

This advances phase 4; it does not complete native island parity. Houses currently have closed
collision shells. Enterable rooms/doors, chest/combat interactions, Character/My kingdom, grazing
and animated sheep, moving mill sails, crop wind, complete minimap modes, footstep audio, per-leg
terrain IK, physical-controller acceptance, streaming/LOD refinement and Steam multiplayer remain.
The board's existing construction/dice/production effects stay intact; historical builds appear
settled when entering the walk.

## Summit paths and living atmosphere (2026-11-27)

Mountain shapes are the rendered collision terrain, with four directional relaxation passes bounding grid edge rise to 0.48 times the grid spacing. Marked switchback paths reach the crag summits; solid scenery tests clearance against their actual polylines, including the outer approach. The `Catnight.Island` automation checks 2,415 physical floor/slope samples across 15 peaks on the review seed, alongside the original 5,453 route samples and match preservation.

`Tools/living_world_materials.py`, run by the island importer, generates root-pinned foliage wind and an original drifting-cloud sky. Water has depth color, shore foam and animated ripple normals with stronger opacity and less specular glare. A warmer key, cool fill and restrained distance fog keep the original painted models readable. These are generated local assets; the package preflight requires all living-world material masters. Knight feet and horse hooves are placed on the terrain (two-bone IK per leg; the horse's body already tilts to the smoothed slope, each hoof corrects for the ground under it). The other uncompleted island gameplay systems remain open.

**Light and woods (2026-11-27).** The island's sun is low and golden (24°, warm) over a cooler, weaker sky light; haze glows warm toward the sun (directional inscattering) and stays blue away from it; a soft vignette, ambient occlusion and split toning (cool shade, warm light) replace the neutral grade. Forest tiles grow in stands chosen by broad noise: dark spruce and fir woods, oak groves with the odd giant old oak and fallen logs, and lime glades, using all seven tree models from the concept sheet instead of a fixed five-tree rotation.
