# Catan Night in Unreal

An editable, walkable world-design prototype for Unreal Engine 5.8+. The working browser
rules, online game and saves remain in the existing application.

## Current project

Continue in `E:/Catan/apps/unreal 5.8/CatanNight.uproject`, the copy Unreal converted when it
first opened. The large map is `Content/CatanNight/Maps/Island_20261119_185517_618131.umap`.
The earlier, smaller map is preserved. Press **Play**, click the viewport, then use **WASD**,
**mouse look** and **Space** to jump. **Esc** stops play. In the editor, right mouse + WASD
flies; W/E/R selects move/rotate/scale. Save As before making a separate design variation.

## Scale and biomes

Each tile has an **84 m radius**, six times the original prototype's horizontal scale and
36 times its area. Houses, trees, doors and furniture retain human scale. The island spans
about 730 m at its widest; a direct crossing at 4 m/s is approximately three minutes.
Terrain relief increases only threefold so its slopes stay traversable.

The generated world contains **33,948 scenery placements** in 37 model groups, represented
by native instanced foliage rather than separate actors. Forests have broadleaf/conifer
canopies, saplings, shrubs, mushrooms and logging sites; fields have four crop plots,
harvest bundles and mills; pasture has sheep, flowers, barns and troughs; hills have clay
banks, brick stock and kilns; mountains have crags, ore seams and mines; desert has scrub,
sand ridges and broken ruins. All nine harbours have docks and boats.

Six cleared spokes per tile reserve walking routes. Mesh collision covers terrain, rocks,
structures and large props. Separate hidden trunk colliders block trees without making
leaf cards into walls. Small vegetation and crop rows do not block movement. Native foliage
culling limits distant detail; the overview deliberately does not show every grass clump.
Use Unreal's Foliage mode to adjust painted instances, or edit a model's foliage type.

## Your concept pictures and components

The 24 PNG sheets in `E:/Catan_art_obj` are preserved, with hashes and model mappings, in
`assets/concepts/references` and `assets/concepts/manifest.json`. In Unreal they are reference
textures under **Content/CatanNight/References**. The source pictures are not changed.

The new `assets/blender/concept_kit.py` family adds **28 original model roots**: cottages A/B/C,
halls A/B/C, barn A, two-approach docks A/B, landing stage, bridges A/B, and modular furniture,
barrels, sacks, storage, ladder and millstone. They are geometry interpreted from the sheets.
Existing tree, rock, harvest, industry, boat and prop families supply the other biome assets.
The export makes all **112 static model roots** available as native meshes under
**Content/CatanNight/Imports/<map>/island/StaticMeshes**. Component children such as doors
remain separate meshes. Mesh metadata records the relevant concept sheet.

Not every variation drawn in the sheets is implemented. Additional hairstyle
variants, bespoke Unreal card UI and VFX remain separate work. Furniture is reusable in the
library; the houses are static exterior prototypes rather than finished interactive rooms.

## Native animation practice

The `CatanAnimation` runtime plugin implements a hinged chest, original knight animation clips,
weapon grips, action/reaction blending and synthesized interaction cues. The preview builder
creates a separate practice island with native movement, attacks and a sparring partner. It
does not connect to the browser's inventory, rewards or multiplayer authority. See
`docs/UNREAL_ANIMATION.md` at the repository root for controls, timings and integration hooks.

**Animation validation status (2026-11-19, UE 5.8.4):** editor and game targets compile, the two
native action-clock tests pass, and `build_animation_preview.py` builds the practice map without
a crash while leaving the authored island byte-identical. `validate_animation_preview.py` passed
59/59 live checks across four Play sessions, driven by key input:
- chest, exchange, guard and cancellation;
- weapons, reduced motion, walking and running;
- mixer-rendered synthesized cues;
- chest persistence and R reset.

A viewport review and a short performance comparison (`measure_animation_performance.py`) were
also made. The imported animation assets and `Maps/Island_Animations_20261119_231733` are
committed. Open that map with `open-island.ps1 -Practice`; the startup map stays the authored
island. Reports and screenshots are in `validation/`.

VS Code works as the editor. Native compilation requires Microsoft C++ Build Tools,
the Windows SDK and .NET Framework SDK; the full Visual Studio IDE is unnecessary.
Close Unreal before rebuilding a loaded runtime DLL:

```powershell
powershell -File apps/unreal/build-native.ps1 -EditorPath E:/UE_5.8/Engine/Binaries/Win64/UnrealEditor.exe
```

The script synchronizes runtime source from `apps/unreal` into the converted working
project before compiling. Never edit the copied runtime source independently.

## Rebuild from source

```powershell
python assets/concepts/prepare.py --engine E:/UE_5.8 --project E:/Catan/apps/unreal
pnpm unreal:export
pnpm unreal:open
```

The preparation step copies reference pictures and the installed engine template's input
and movement Blueprint logic. It copies no mannequin, animation, texture or template level.
These Blueprints and original art are already present in this checkout. Rebuild the new kit
with `E:/Blender/blender.exe -b -P assets/blender/build.py -- concept_kit`.

The launcher opens the saved map in the converted project when present. It regenerates
an island only with `-GenerateIsland`; `-Build` compiles runtime code first; `-Practice` opens the
newest `Island_Animations_*` practice map instead. It can take
`-EditorPath` and `-ProjectPath` through `apps/unreal/open-island.ps1`. Close the existing
editor before opening another. To regenerate in the converted project, copy the generated
`island.glb` and `island.json` from `apps/unreal/SourceArt/Generated` to that project's same
folder, and run the source `apps/unreal/Content/Python/build_island.py` through **Tools →
Execute Python Script**. Each run saves a new timestamped map and import folder; it saves
current changes before switching maps. Python Editor Script Plugin and Interchange Editor
must be enabled. Do not add a second 100× scale: glTF metres become Unreal centimetres once.

The builder restores vertex-painted materials, saves Nanite/instancing material usage flags,
creates native foliage/collision, configures
the walking pawn, imports reference sheets, saves the map and updates its startup path.
The source of truth is the Python in `apps/unreal/Content/Python`, including when the active
project is the converted copy. `inspect_island.py` restores paint/camera framing on the open
map; `finalize_world.py` saves the final map and library. Avoid regenerating over authored
work: use a fresh map and Save As for designs you want to keep.

## Validation

`pnpm unreal:test` checks GLB geometry, textures, vertex colour data, hierarchy, canonical
board topology, scale, model exemplars and population metadata. `pnpm verify` runs the
browser game's typecheck, lint, rules/server tests and production build.

In the Unreal editor, run `Content/Python/validate_walk.py` with play stopped. It starts PIE,
settles the character on each tile, applies walking input, checks grounded state and distance,
then stops play. Reports are written in the active project's `Saved/` folder:

- `island-import.json`: saved map and engine version.
- `island-inspection.json`: nineteen terrain meshes, bounds and paint material.
- `world-population.json`: foliage, trunk colliders and walking configuration.
- `walk-validation.json`: per-tile runtime grounding and movement results.

**Verified in UE 5.8.4 on 2026-11-19:** all 19 PIE probes passed. The character stayed
grounded and covered approximately 5.5 m per walking probe across all six biome types.
The source export checks and complete `pnpm verify` also passed. A saved copy of the native
reports is in `validation/`; the probes establish sampled traversal, not exhaustive testing
of every point on the island.

## Migration boundary

This remains a design prototype, not a packaged Windows game. Its terrain is static mesh,
not sculptable Landscape; vegetation, animals, doors, boats and mill blades are static; sea
is a blockout mesh. Native animation practice includes combat presentation, a small HUD
and synthesized action sounds. Riding, board rules, online play and authoritative game
inventory/rewards are not connected to Unreal yet. The browser game remains playable.
Windows uses DirectX 12 with Shader Model 6 for the imported Nanite meshes. The first
launch after changing shader targets can compile additional shaders. Only a short editor PIE comparison
exists (the animation practice holds the 60 fps cap with about 1 ms extra game-thread time); there
is no packaged-build benchmark, so placement counts do not establish a frame-rate guarantee.

All visual game assets are original procedural Blender art or owner-supplied concept
references. Movement/input Blueprint logic comes from the locally installed Unreal Engine
Third Person template and remains subject to its Unreal Engine license. Python is editor
build tooling, not a packaged runtime dependency.
