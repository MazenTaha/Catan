# Concept art → game assets

The owner's art pack (`D:\BenhCode\catan-night-concepts-2026-11-02`, 27 sheets) mapped to what
the game ships. The sheets guide shape, colour and proportion. Every 3D asset is modelled by a
Blender script in `assets/blender/` and exported as GLB, and none of the drawn pictures are used
as textures. The one exception is the card illustrations (sheet 22), which are cropped
without their text. DECISIONS #44 explains the choices.

Status: **done** (in the game), **partial** (some of the sheet), **kept** (the existing asset
already matches closely enough), **open** (not done yet).

| Sheet | Objects in the game | Source → output | Status |
|---|---|---|---|
| 00 knight turnaround | `Knight`: layered pauldrons, fluted breastplate, medallion, cloth cowl, slung belt, scabbard, tattered hem; helms, capes, rig, weapons and looks unchanged | `knight.py` → `knight.glb`; `knight.ts`, `avatar.ts` | done |
| 01 trees | `Oak` `OakB` `Lime` `LimeB` `Spruce` `Fir` `Sapling` (slot `tree.broadleaf` now picks among four broadleaves) | `flora.py` → `flora.glb` | done |
| 02 undergrowth & flowers | shrubs A/B, `DryScrub` (desert), grasses A/B, daisies, poppies, buttercups, lavender; `Reeds` by the docks; `MushRed` `MushBrown` (forest floor) | `flora.py`, `props.py` | done |
| 03 wheat & harvest | wheat A/B/C, mid, far, stook, hay bale (existing LOD and wind kept) | `flora.py`, `village.py` | kept |
| 04 woodland worksite | `StumpA` `StumpB` `AxeStump` `Log` `LogPile` (six logs, 3-2-1, lashed stakes) `Stakes` `Chips` in each forest clearing | `props.py` → `props.glb`; `world.ts buildForest` | done |
| 05 stone, ore & mountains | boulders A/B/C, crags A/B/C (massifs and horizon), `OreFace` and `Ledge` at the mountains' way in | `rocks.py` → `rocks.glb` | done |
| 06 clay, desert & ruins | clay banks A/B (hills); `DesertStones` `SandRidge` `Column` `Drums` `Lintel` `Ruin` (desert) | `rocks.py`, `props.py`; `world.ts buildDesert` | done |
| 07 settlement cottages | `Cottage` (A): terracotta roof, owner ridge cap, owner shutters, owner banner on a bracket by the door; room, door and furniture from `buildings.json` | `homes.py` → `village.glb` | partial (B/C variants open) |
| 08 city halls | `Hall` (A): terracotta roof, owner ridge cap and banners | `homes.py` | partial (B/C open) |
| 09 windmills | `Mill` with `Sails`, `MillInterior`, `MillDoor` | `homes.py` | kept |
| 10 farm & industry | `Barn`, `Kiln`, `Mine` | `village.py` | kept (B variants open) |
| 11 bridges, fences & props | roads are bridges (existing); `FencePost` `FenceRail` `Gate` (open at the pasture's way in), `TroughA` `TroughB`, `BrickStack` (hills) | `props.py`; `world.ts buildPasture`, `buildHills` | done |
| 12 harbours & boats (v2) | `Boat` (cog trader, open raised stern deck and rail, sail in the harbour's colour), `BoatSloop`, `BoatStriped`; `Dock` | `village.py` | partial (3D dock is still one pier, not the two-approach deck) |
| 13 chests | `WeaponChest` (Chest B) + `WeaponChestLid` hinged at the rear; decoy uses the same chest so it isn't given away | `props.py`; `chest.ts` | done |
| 14 interior furniture | bed, tables, benches, stool, chair, dresser, shelf (existing room builder) | `homes.py` | kept (remodel open) |
| 15 hearth, mill & storage | hearths, barrels, sacks, bin, ladder, millstone (existing room builder) | `homes.py` | kept (remodel open) |
| 16 textiles & heraldry | owner banners (cottage bracket, hall), `Tapestry` and `Banner` in the furnishing colour, capes (knight) | `homes.py`, `props.py`, `knight.py` | partial |
| 17 kingdom decor | `Antlers` `CandleWheel` `FloorPlant` `TablePlant` `ArmorStand` `Candles` `CrossedShields` `Tapestry` `Banner` `Bookshelf`; rug stays painted in code | `props.py`; `decor.ts` | done |
| 18 sheep & horses | sheep (existing); horse coats bay, dark bay, chestnut, grey, black, palomino with saddle, blanket, girth, stirrups, bridle, reins | `village.py`, `horse.py`; `horse.ts` | kept |
| 19 shields, revolvers & training | `Shield` (A, seat colour), `Revolver` (A), `DummyA` (the practice target), `DummyB` | `props.py`; `avatar.ts`, `combat.ts` | done |
| 20 helms, robber & customization | helms Great/Armet/Bascinet/Crowned/bare (existing choices); robber | `knight.py`, `village.py` | kept (hairstyle heads, robber turnaround open) |
| 21 board pieces & signs | 3D number sign (post, stone footing, ivory plaque drawn from game data) | `models.ts makeTokenSign` | kept (2D pieces, badges open) |
| 22 resource & development cards | 11 illustrations: lumber, brick, wool, grain, ore; knight, victory point, road building, year of plenty, monopoly, man up | `apps/web/public/art/cards/*.webp`; `OmenCard.tsx`, `primitives.tsx ResourceCard` | done |
| 23 biomes, ground & water | existing ground textures and sea shader | `textures.py`, `shaders.ts` | kept |
| 24 effects & lighting | chest burst, sparks, muzzle flash, tracer, footfall dust, running lines, foam, eight time stages (existing systems) | `chest.ts`, `combat.ts`, `stride.ts`, `daylight.ts` | kept |
| 25 sword variations | Sword A | `props.py` | done |
| 26 sword & scabbard | Sword A's grip, guard and pommel; the scabbard with brass throat, chape and red cord on the knight's hip | `props.py`, `knight.py` | done |

## Remaining

- Cottage B/C, Hall B/C, Barn B, Kiln B, Mine B as variants.
- Interior furniture and hearths remodelled to sheets 14 and 15 (the rooms keep their existing furniture).
- The 3D harbour as two approaches joining one platform (the 2D board already draws it that way).
- The robber as the hooded figure of sheet 20; hairstyle heads for the bare-head look.
- 2D board pieces, harbour badges and claim emblems redrawn to sheet 21.
- The clay pit in the hills reads as a bright patch at midday (seen in the probe; not caused by this pass).
