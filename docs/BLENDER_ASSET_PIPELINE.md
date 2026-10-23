# Blender asset pipeline (3D walk)

How to replace the procedural models in the 3D walk with models made in Blender. Nothing here
is required: with no model files the game draws everything procedurally, and it does so today.
Models are optional local files you add one slot at a time.

> Status: the integration below is implemented and was checked with a throwaway test GLB
> generated in code, never committed: a box with a roof whose material is named `Owner_Roof`.
> No real Blender model has been tried yet; the first one you add is the first real test.

## 1. What exists in the code

| Piece | Where | What it does |
|---|---|---|
| Slot registry | `apps/web/src/components/world/assets.ts` (`AssetSlot`, `SLOTS`) | The replaceable objects, each with its expected size, collision footprint, draw mode (instanced or per-object), shadow casting and whether it carries player colour. |
| File list | `assets.ts` (`ASSET_FILES`) | Maps a slot to a GLB path. **Empty by default**: no requests are made. |
| Loader and cache | `assets.ts` (`loadAsset`, `cloneAsset`) | Loads each URL once per page with three.js's `GLTFLoader` (imported on demand, so it costs nothing until a file is listed). Shares geometry, materials and textures between worlds, and marks them so a world never disposes them. On failure it warns once and resolves `null`. |
| Swap-in | `components/world/world.ts` (`World.applyAsset`) | Called for every listed file when the walk opens. Replaces a slot's procedural model **without moving anything**: instanced slots keep their per-placement transforms (`Instancer.replace`, `WheatCrop.setVisual`); object slots replace each placed object in place; settlements and cities are rebuilt from the game state with the model. |
| Placement | `world.ts` (biome builders) | Decides where everything stands, its rotation and scale, and what the walker collides with, before any model is chosen. A model never changes gameplay coordinates or collision. |
| Dev hook | `World3D.tsx` (dev builds only) | `window.__world3d.world.applyAsset(slot, url)` swaps a model into the running walk from the browser console. The URL can be a `blob:` URL. |

### Slots

Sizes are those of the procedural model at scale 1 (width x, height y, depth z, in metres). Match
them roughly so the placement spacing still fits. **Footprint** is the radius kept clear and used
for collision, whatever the mesh looks like.

| Slot | Mode | Size (m) | Footprint | Notes |
|---|---|---|---|---|
| `building.settlement` | object | 4.6 × 6.4 × 4.8 | 2.8 | Player-owned: uses `Owner` materials. Door at least 2.0 m tall. |
| `building.city` | object | 9 × 12.5 × 8 | 4.2 | Player-owned. Must read as clearly bigger than a settlement. |
| `wheat.clump` | instanced | 0.35 × 1.25 × 0.35 | 0 | Near level of detail: 4–6 stalks. Drawn about 10,000 times. |
| `wheat.clump.far` | instanced | 0.35 × 1.25 × 0.35 | 0 | Far level of detail for the same clump, used beyond about 14 m. |
| `tree.broadleaf` | instanced | 4 × 6 × 4 | 0.55 | The game scales each placement 0.75–1.5. |
| `tree.conifer` | instanced | 3 × 7.5 × 3 | 0.55 | The game scales each placement 0.6–1.5. |
| `rock.boulder` | instanced | 2 × 1.2 × 2 | 0.9 | Authored at about 1 m radius. Scaled 0.35–1.3 per placement. |
| `sheep` | object | 0.8 × 1.1 × 1.4 | 0.5 | Animated by the game through named nodes (see §4). |
| `prop.windmill` | object | 3.7 × 9.5 × 3.7 | 1.8 | A node named `Sails` keeps turning (see §4). |
| `harbor.dock` | object | 2.6 × 1.2 × 8 | 0 | Runs from the shore along +Z; walkable. |
| `harbor.boat` | object | 2 × 6 × 4.4 | 0.9 | Bobs on the water; bow toward +Z. |

## 2. Where the files go

1. Put the file in `apps/web/public/models/`, named after the slot, for example
   `apps/web/public/models/building-settlement.glb`.
2. Register it in `apps/web/src/components/world/assets.ts`:

   ```ts
   export const ASSET_FILES: Partial<Record<AssetSlot, string>> = {
     'building.settlement': 'models/building-settlement.glb',
   };
   ```

Files in `public/` are served as they are and copied into the build. Only listed files are ever
requested.

## 3. Conventions

| Topic | Rule |
|---|---|
| Units | 1 Blender unit = 1 metre (Unit Scale 1.0). A land tile is 14 m from centre to corner (`R`, about 24 m across). The walker's eye is 1.7 m above the ground; doors should be about 2.0–2.2 m. |
| Up and forward | The game is Y-up and a model's front faces +Z. In Blender, model with Z up and the front facing **−Y**, which is what Front view (numpad 1) shows. The standard glTF exporter (+Y Up) converts Blender (x, y, z) to (x, z, −y), so Blender −Y becomes +Z. Don't add corrective rotations. |
| Origin (pivot) | At the centre of the model's footprint, **on the ground** (y = 0 is where it touches the terrain). For the dock, the shore end. For trees, the base of the trunk. |
| Transforms | Apply all transforms before export (Object → Apply → All Transforms). Rotation 0, scale 1. Mesh nodes may be nested; their transforms are honoured. |
| Materials | Metallic-roughness PBR (Principled BSDF). Keep metal to small parts (metallic 1, roughness about 0.3–0.5). Foliage, cloth, plaster and earth should be rough (0.85–1.0). The renderer uses image-based sky light, so metal looks right without an environment texture. |
| Player colour | A material whose name starts with `Owner` (`Owner`, `Owner_Roof`, `Owner_Trim`…) gets its base colour replaced with the owner's colour. Any base-colour texture is kept and multiplied, so paint those textures light grey. |
| Instanced slots | Every part is drawn once per placement, so keep parts and materials few. A mesh with several materials is fine: it exports as one primitive per material, and each becomes its own instanced part. A model's own colours are used as authored (procedural rocks get a per-placement tint; models don't). |
| Textures | Base colour and emissive are sRGB; normal, roughness, metallic and occlusion are linear. The exporter and `GLTFLoader` handle this. Embed PNG, JPEG or WebP in the GLB. **No KTX2, Draco or meshopt**: those decoders aren't set up, and such files fail to load (the procedural model stays). |
| Shadows | Each slot's `castShadow` decides; every mesh receives shadows. Wheat never casts shadows. |
| Levels of detail | Only wheat has them, as two slots (`wheat.clump`, `wheat.clump.far`). Other slots use one model. |
| Collision and grounding | Comes from the slot's `footprint` and the game's own terrain height. The mesh is never used for collision. Keep the visible base within the footprint. |
| Animation | The game doesn't play glTF animations. Sheep and windmill sails are driven through named nodes. |

## 4. Named nodes

- **Sheep:** nodes `Head`, `LegFL`, `LegFR`, `LegBL`, `LegBR` and optionally `Tail`. Each node's
  origin is at its joint: neck, hip or shoulder, base of the tail. The rest pose is standing.
  Legs swing about their local X, the head nods about X and turns about Y, and the tail wags
  about Z. A missing node just doesn't move. The procedural sheep's blinking is not supported.
- **Windmill:** a node `Sails`, origin at the hub, the sails lying in the XY plane facing +Z. It
  turns about its local Z.

## 5. Budgets

Measured with the procedural scene on an Intel UHD (integrated) GPU: 60 fps at about 200–700
draw calls per frame and about 0.7 M triangles in view. Keep replacements in the same range.

| Slot | Triangles | Meshes and materials | Textures |
|---|---|---|---|
| `wheat.clump` | ≤ 500 | 1 mesh, 1 material (vertex colours preferred) | none, or one small atlas |
| `wheat.clump.far` | ≤ 40 | 1 | none |
| `tree.broadleaf`, `tree.conifer` | ≤ 1,500 | ≤ 2 (bark, leaves) | ≤ 512 px |
| `rock.boulder` | ≤ 300 | 1 | ≤ 512 px |
| `sheep` | ≤ 3,000 | ≤ 3 | ≤ 512 px |
| `building.settlement` | ≤ 6,000 | ≤ 5 | ≤ 1,024 px atlas |
| `building.city` | ≤ 12,000 | ≤ 6 | ≤ 1,024 px atlas |
| `prop.windmill`, `harbor.boat` | ≤ 5,000 | ≤ 4 | ≤ 1,024 px |
| `harbor.dock` | ≤ 2,000 | ≤ 2 | ≤ 512 px |

Instanced slots are drawn hundreds or thousands of times: every triangle and every extra
material there counts many times over.

## 6. Export from Blender (4.x)

1. Model at real size with Unit Scale 1.0, Z up and the front facing −Y. Set the origin on the
   ground at the footprint's centre (snap the 3D cursor there, then Object → Set Origin → Origin
   to 3D Cursor).
2. Apply all transforms. Name materials (`Owner…` for player colour) and name nodes for sheep and
   windmill.
3. File → Export → glTF 2.0. Choose **glTF Binary (.glb)** and these options:
   - Include → Limit to: Selected Objects.
   - Transform: **+Y Up** on (the default).
   - Data → Mesh: Apply Modifiers, UVs, Normals, and Vertex Colors if you use them.
   - Data → Material: Export.
   - Compression: **off** (no Draco).
   - Animation: off.
4. Save as `apps/web/public/models/<slot>.glb`.

## 7. Add and check one model

1. Add the file and its `ASSET_FILES` entry (§2).
2. `pnpm dev`, start a game, switch the board to **3D walk**.
3. Check the console: a failed load prints one line,
   `3D walk: couldn't load …; keeping the built-in model.`
4. Walk up to it. Check:
   - **Scale:** a door next to the 1.7 m eye.
   - **Grounding:** no floating or sinking.
   - **Facing:** settlements face the island's centre.
   - **Player colour:** visible on every owner's pieces.
   - **Shadows**.
5. To try a file without editing the code, run this in the dev console:
   `await __world3d.world.applyAsset('tree.broadleaf', 'models/tree-broadleaf.glb')`.
   It returns `true` when swapped in, `false` when it kept the procedural model.
6. Run `pnpm verify` and `pnpm e2e world3d`. The e2e test fails on any console error or warning.
   On real hardware, compare frame rates in the same spots with the walk open.

## 8. How fallback works

- With no entry in `ASSET_FILES`, the slot is procedural and nothing is requested.
- With an entry, the procedural model shows at once. The file loads in the background (one
  request per page, shared by every world opened later) and swaps in when ready.
- If the file is missing or invalid, there is one console warning and the procedural model stays.
  The failure is cached, so it isn't requested again or retried every frame.
- Closing the walk disposes only what that world created: its owner-colour material copies and
  geometry with transforms baked in. Cached model resources stay for the next time.

## 9. What to replace first

1. **`building.settlement` and `building.city`.** Seen on every land you walk, they carry
   ownership, and a crafted model gains the most over primitives.
2. **`wheat.clump` (and `.far`).** The showcase crop. The procedural one is already decent;
   hand-made stalks and heads, with vertex colours and within budget, would lift whole fields.
3. **`tree.broadleaf` and `tree.conifer`.** They fill forests, pasture edges and mountain feet.
4. **`prop.windmill`, then `harbor.boat` and `harbor.dock`.** Landmarks on fields and coasts.
5. **`rock.boulder`, then `sheep`.** Sheep need the named nodes.
