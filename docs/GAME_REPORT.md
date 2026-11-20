# Catan Night — Full Game and World Reference

**Prepared 2 November 2026.** This report describes the local project in `D:\Catan`: commit `e866488` plus the working-tree changes present when inspected. It includes the newer Blender knight and horse, running effects, minimap and music changes, even though those changes are not all committed. It is a source-based reference, not a claim that every feature was freshly playtested.

The game has changed considerably since the first combat prototype. Current source takes priority over old paragraphs in the README and old decision entries. In particular, the current game has online player combat, persistent health, weapon chests and **five bullets per game with no reload**. The old six-shot, reloadable practice description is historical.

## Contents

1. [What the game is](#1-what-the-game-is)
2. [Modes and starting a game](#2-modes-and-starting-a-game)
3. [The island, resources and probability](#3-the-island-resources-and-probability)
4. [The board-game rules](#4-the-board-game-rules)
5. [Game pieces, cards and indicators](#5-game-pieces-cards-and-indicators)
6. [Third-person exploration and controls](#6-third-person-exploration-and-controls)
7. [Weapons, chests, combat and duels](#7-weapons-chests-combat-and-duels)
8. [Trees, plants and agriculture](#8-trees-plants-and-agriculture)
9. [Rocks, mountains, ground and ruins](#9-rocks-mountains-ground-and-ruins)
10. [Buildings, infrastructure and interiors](#10-buildings-infrastructure-and-interiors)
11. [Animals, characters and equipment](#11-animals-characters-and-equipment)
12. [Water, harbors, boats and atmosphere](#12-water-harbors-boats-and-atmosphere)
13. [Character and kingdom customization](#13-character-and-kingdom-customization)
14. [Interface, settings and accessibility](#14-interface-settings-and-accessibility)
15. [Sound and music](#15-sound-and-music)
16. [Networking, saving and technical structure](#16-networking-saving-and-technical-structure)
17. [Artwork and asset pipeline](#17-artwork-and-asset-pipeline)
18. [Performance and verification](#18-performance-and-verification)
19. [Limits, documentation gaps and terminology](#19-limits-documentation-gaps-and-terminology)
20. [Source map](#20-source-map)

## 1. What the game is

Catan Night is a browser-based island trading and building game for three or four seats. Its foundation is base Catan: obtain resources, trade, extend roads, build settlements and cities, buy development cards, and reach the victory-point target. The default target is 10, and victory is checked on the player's own turn.

The same live island also exists as an optional desktop 3D world. Players explore it in third person, enter buildings, ride horses and, in eligible online games, fight other human players. Exploration represents the board position: a settlement is a cottage, a city is a larger hall, and roads appear as timber bridges. These are connected views of one game, rather than separate campaigns.

The visual direction is a colorful medieval countryside: emerald vegetation, golden wheat, warm timber, pale plaster, terracotta clay, cool slate and blue water. The character equipment mixes medieval swords and armor with a revolver because the owner explicitly requested both weapon types. The interface uses graphite surfaces and cream/gold accents.

This is a private, non-commercial fan project. The original codename, **Hexfall**, remains in package names and internal state identifiers. Those names do not represent a second game.

### What counts as an object

This report distinguishes four roles:

| Role                     | Meaning                                                                                       | Examples                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Rule object              | Changes production, ownership, legal actions or the result of a game                          | Settlement, road, resource card, robber, development card   |
| Interactive world object | Responds to a 3D action or participates in movement/combat                                    | Door, horse, weapon chest, another player, training dummy   |
| Scenery or obstacle      | Makes the island readable and attractive; may block movement but grants no resource by itself | Tree, boulder, barn, log pile, millstone                    |
| Presentation effect      | Explains an event or creates atmosphere without being an independent game entity              | Wind, foam, sunlight, sparks, camera recoil, minimap marker |

**A rendered tree is not a harvestable Lumber resource, and a rendered sheep is not a Wool pickup.** Resource cards are produced by the board rules. Walking to scenery does not collect cards, mine ore, cut wood, farm crops or catch fish.

## 2. Modes and starting a game

| Mode              | What it provides                                                            | Important boundary                                                          |
| ----------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Online            | A host creates a room; friends join by code; the server owns the game state | Live fights require eligible human players on their own devices             |
| Local versus bots | Human seats and Easy, Medium or Hard bots play on one browser               | Bots play the board game; they do not fight                                 |
| Hot-seat          | Several humans share one device and pass it between turns                   | A privacy curtain protects hands; it is not simultaneous multiplayer combat |
| Mixed seats       | Human and bot seats can coexist within the supported lobby setup            | Only appropriate human seats participate in PvP                             |

The title screen provides Play and, when applicable, Continue or Rejoin. It also provides access to help, settings, Character and My kingdom. Game configuration includes player seats, board seed/layout and supported match options.

The three bot levels have different decision strategies: Easy is comparatively simple and varied; Medium uses board and resource heuristics; Hard adds lookahead, road interference and estimates based on public information. Bots derive decisions from deterministic game data rather than reading opponents' private hands as an unfair advantage.

The 2D board supports smaller screens. The 3D switch is intentionally hidden on touch devices, including phones, tablets and iPads.

## 3. The island, resources and probability

The standard island contains **19 pointy-top hexes**, arranged in rows of 3, 4, 5, 4 and 3. Its legal construction network has **54 vertices and 72 edges**. Decorative placement does not change that topology.

| Terrain   | Hexes | Resource | What the terrain communicates                                       |
| --------- | ----: | -------- | ------------------------------------------------------------------- |
| Forest    |     4 | Lumber   | Mixed woodland, tree trunks, undergrowth and a woodcutting clearing |
| Hills     |     3 | Brick    | Terracotta banks, exposed clay, kilns and stacked bricks            |
| Pasture   |     4 | Wool     | Meadow, sheep, fences, a barn/byre and farm details                 |
| Fields    |     4 | Grain    | Wheat plots, harvested areas, sheaves and windmills                 |
| Mountains |     3 | Ore      | Slate formations, stone, mineral details and a mine entrance        |
| Desert    |     1 | None     | Sand, scrub, stones and an ancient ruin; the robber begins here     |

Eighteen producing hexes carry number tokens. The numbers are 2–12 excluding 7, with the standard repeated distribution. The dots below a number show how many combinations of two six-sided dice produce it. A 6 or 8 has five combinations; a 2 or 12 has one. Red 6 and 8 tokens emphasize high probability.

Layouts can be seeded and reproduced. The generator supports balanced, random and beginner arrangements, with validation of board constraints such as separation of adjacent 6 and 8 tokens.

The coast has **nine harbors**: four general 3:1 ports and five resource-specific 2:1 ports. Each port serves its exact two coastal vertices. The artwork may form two approaches to one stage, but it does not change which buildings receive the trading benefit.

The standard bank begins with 19 cards of each resource, 95 in total.

## 4. The board-game rules

### Setup and turns

Each player places a settlement and adjoining road in forward turn order, then a second pair in reverse order. The second settlement gives initial resources from its adjacent producing hexes. The distance rule prevents a settlement from being placed directly beside another settlement or city.

A normal turn consists of rolling, resolving production or the robber, building and trading, then ending the turn. A permitted development card can be played before the roll. Special phases handle discard, robber movement, stealing, free roads, domestic trade and duels.

When a producing number is rolled, an adjacent settlement receives one resource card and a city receives two. The robber blocks the occupied hex. Production depends on legal building placement and the bank, not on the amount of vegetation drawn on the tile.

If the bank cannot satisfy production of a resource, the shortage rule applies: when only one player is owed that resource they receive the remainder; when several players are owed it and the bank cannot pay all, none receives it.

On a 7, players holding more than seven resource cards discard half, rounded down. The roller relocates the robber to another hex and may steal a random resource card from an eligible opponent with a building there.

### Construction and supply

| Purchase         | Cost                                  | Result                                                              | Supply per player |
| ---------------- | ------------------------------------- | ------------------------------------------------------------------- | ----------------: |
| Road             | 1 Lumber + 1 Brick                    | Extends the legal network along one edge                            |                15 |
| Settlement       | 1 Lumber + 1 Brick + 1 Wool + 1 Grain | 1 VP; normally produces one card from a matching neighboring hex    |                 5 |
| City             | 2 Grain + 3 Ore                       | Replaces an owned settlement; worth 2 VP and doubles its production |                 4 |
| Development card | 1 Wool + 1 Grain + 1 Ore              | Adds a hidden card to the player's hand                             |       Shared deck |

Returning the replaced settlement to supply is part of a city upgrade. Building models becoming larger does not move the legal vertex. Roads must connect legally, and opponent buildings can interrupt a route.

### Trade

Domestic trade lets the active player negotiate resource exchanges with other players. Offers can be accepted, declined or countered. Maritime trade exchanges matching sets with the bank: normally 4:1, improved to 3:1 at a general port or 2:1 for the matching resource at a specialized port. An owned settlement or city must occupy a served harbor vertex.

### Development cards and claims

| Card           |                              Base count | Meaning                                                            |
| -------------- | --------------------------------------: | ------------------------------------------------------------------ |
| Knight         |                                      14 | Moves the robber and allows stealing; contributes to Largest Army  |
| Victory Point  |                                       5 | One hidden victory point, accounted for in scoring                 |
| Road Building  |                                       2 | Allows two free roads subject to placement/supply rules            |
| Year of Plenty |                                       2 | Takes two chosen resources from the bank within availability rules |
| Monopoly       |                                       2 | Names a resource and takes opponents' holdings of that resource    |
| Man up         | 6 additional cards in PvP-enabled games | Challenges another human to a duel that pauses the board           |

The base deck has 25 cards. A PvP deck adds six Man up cards, making 31. Cards generally cannot be played on the turn bought; non-VP development-card play is limited to one per turn. Man up follows that timing restriction.

**Longest Road** awards two VP for a qualifying route of at least five roads; **Largest Army** awards two VP after at least three Knights. A challenger must exceed the current holder; ties do not automatically transfer the claim. Normal settlements, cities, hidden VP cards and these claims determine the race to the configured target.

## 5. Game pieces, cards and indicators

| Object                      | Definition and role                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Settlement piece / cottage  | An owned legal vertex. The miniature and enterable cottage represent the same rule object.                                            |
| City piece / hall           | An upgraded settlement with higher score and production; a larger architectural silhouette in 3D.                                     |
| Road piece / bridge         | An owned legal edge. Its bridge presentation does not create extra edges, shortcuts or trade routes.                                  |
| Robber                      | The hooded figure tied to the robber's current hex. It blocks that hex's production; it is not an independently roaming combat enemy. |
| Number token                | Shows the dice total that produces a tile's resource. It is a token in 2D and a physical number sign in 3D.                           |
| Number signpost             | A plaque with number and probability pips, rim, post and footing. A world-space reading aid, not an extra roll target.                |
| Resource card               | A counted unit of Lumber, Brick, Wool, Grain or Ore used for costs, trades, stealing and combat rewards.                              |
| Development card            | A hidden action or scoring card with purchase/play timing rules.                                                                      |
| Played-card fan             | A face-up presentation of cards already played; clicking reveals card text. It does not put a spent card back in hand.                |
| Harbor badge                | The readable trade ratio/resource information, separate from the timber dock structure.                                               |
| Player color and emblem     | Ownership cues on pieces, roofs, banners, characters and other relevant artwork. Colors are Red, Blue, White and Orange.              |
| Placement/hover target      | The 2D interaction surface used to inspect tiles and choose legal vertices or edges. Scenery does not shift these targets.            |
| Claims display              | Shows Longest Road and Largest Army status.                                                                                           |
| Dice and production effects | Communicate a roll and the resulting resource events; they do not generate a second outcome.                                          |
| Walker/fight marker         | Marks an online player in 3D or a fight on the 2D board. These are presence indicators.                                               |

## 6. Third-person exploration and controls

The current exploration camera follows over the character's right shoulder. The visible player is a knight whose look comes from the profile. Movement follows the island's ground and collision proxies rather than allowing free flight.

| Input or control          | Current behavior                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------- |
| W / S or up / down arrows | Move forward/backward relative to facing                                               |
| A / D                     | Strafe                                                                                 |
| Left / right arrows       | Turn                                                                                   |
| Shift                     | Run on foot; gallop when mounted                                                       |
| Drag over the scene       | Turn the view without pointer lock                                                     |
| Dive in                   | Locks the pointer for continuous mouse look; mouse sensitivity is configurable         |
| F / left click            | Attack; in pointer lock, left click attacks immediately                                |
| Right mouse button, held  | Guard; the sword can parry attacks from the front                                      |
| 1                         | Select sword after obtaining weapons                                                   |
| 2                         | Select revolver after obtaining weapons                                                |
| 3                         | Select fists                                                                           |
| E                         | Contextual interaction: open a nearby chest, mount/dismount a horse, or operate a door |
| M / minimap click         | Toggle the whole-island and closer rotating minimap views                              |
| Esc                       | Leave pointer lock first; another Esc returns to the board when appropriate            |
| 2D board / 3D walk switch | Change between the two views                                                           |
| Space                     | The board's roll/end-turn shortcut still applies when the game permits it              |

There is no current revolver reload action and no current Next land button. Those belonged to an earlier version.

On foot, nominal movement targets are 5 m/s walking and 10 m/s running, approached through momentum rather than instant speed jumps. Riding targets are 7 and 17 m/s; guarding slows movement. These are game-world values, not a claim of realistic travel scale.

Running adds matched footfalls, body motion, cape motion and restrained camera feedback. Doors and room furniture have independent collision geometry. Movement is subdivided to avoid passing through walls during slow frames. The camera retracts near obstructions and is designed to pass over low fences and railings.

Exploration does not automatically freeze a normal board turn. A required board placement still belongs on the 2D board. A Man up duel is the deliberate exception that pauses board play.

## 7. Weapons, chests, combat and duels

### Obtaining weapons

New games with arms enabled record the player's two starting settlements. One holds the weapon chest, selected using the game RNG; the other is a decoy location. Players begin with fists until their weapon chest is opened. The main chest grants access to sword and revolver; an empty chest has its own opening response.

These weapon chests are distinct from ordinary modeled storage chests inside rooms. A furniture chest does not automatically grant equipment.

The opening sequence has anticipation, a straining/shaking lid, a snap open, a visual burst, coins/sparks, and weapon reveals that travel toward the player. The burst is an effect, not collectible currency and not a dynamic light added to the scene. Reduced motion simplifies the motion and particles while keeping the outcome clear.

### Weapons and health

| Weapon   | Selection                     | Damage on an un-parried player hit | Character                                           |
| -------- | ----------------------------- | ---------------------------------: | --------------------------------------------------- |
| Fists    | 3; available before the chest |                                 10 | Short-range unarmed attack                          |
| Sword    | 1 after the chest             |                                 25 | Melee weapon; raised guard supports frontal parries |
| Revolver | 2 after the chest             |                                 50 | Ranged shot using a scarce bullet                   |

Maximum health is **100**. New arms-enabled games keep health, ammunition, chest state, kills and resource debts in game state. Leaving and reopening 3D is not a legitimate ammunition refill or health reset.

Each player has **five revolver bullets for the entire game**. Firing consumes a bullet even if the shot misses. There is no reloadable six-round supply in the current rules. Older saves without arms state have a compatibility path; they should not be used to infer the rules for a newly created match.

The impact style combines wind-up, quick contact and recovery, synthesized sound, sparks, recoil and brief hit feedback. Reduced-motion settings remove disruptive camera/particle motion. The training dummy remains a reusable, local target: its displayed health is separate from an online player's persistent health.

### Online fighting

Live PvP is for human players in eligible online games. Bots do not fight, and multiple hot-seat humans do not become simultaneous fighters on one keyboard. During a duel, only the two duellists can strike one another through the duel rules.

Positions are relayed approximately ten times per second. The server checks that both fighters have fresh 3D presence, are within the weapon's allowed range plus a latency tolerance, are not striking too quickly, and that a revolver hit follows a shot. It also decides parries using the defender's sword guard and facing, rather than trusting a client-supplied parry result.

This is **not a fully server-simulated movement/physics system**. Those checks do not establish complete anti-cheat protection or prove that the server independently reproduces every terrain collision and line-of-sight calculation. They are important checks with a limited scope.

### Death, rewards and Man up

An un-parried attack that reduces health to zero counts as a kill. The victim's health is restored and the world handles the death/relocation presentation. The killer receives one random resource card from the victim. If the victim has no resource card, a debt is recorded and settled when that player next holds cards. This is not a permanent building capture, a victory-point award or destruction of the island.

Man up consumes an eligible development card and names another human opponent. The phase changes to `duel`, ordinary board play pauses, and it resumes after a duellist is defeated or yields. Yielding counts as losing. A duellist absent from the walk for 90 seconds can be made to yield by the server.

## 8. Trees, plants and agriculture

The inventory below names object **types**. It does not claim a fixed instance count across every seed or graphics setting. Placement varies by biome, seeded decoration, clearings, available space and stress configuration.

### Trees and woodland

| Object                    | Appearance and location                                                                                   | Function                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Oak                       | Broadleaf tree variant with a substantial trunk and spreading foliage; woodland and suitable meadow edges | Scenery, shade and trunk obstacle; no direct harvesting                      |
| Lime tree                 | Second broadleaf model with a different canopy silhouette                                                 | Breaks up repeated woodland shapes; same non-harvesting role                 |
| Spruce                    | Taller layered evergreen variant                                                                          | Adds conifer groups in forests and mountain approaches                       |
| Fir                       | Alternate evergreen silhouette                                                                            | Variety within conifer groups                                                |
| Sapling                   | Young, smaller tree                                                                                       | Fills forest edges and light gaps; small trunk proxy where placed            |
| Shrub A / Shrub B         | Low leafy bushes                                                                                          | Undergrowth and biome transitions; generally softer/nonblocking dressing     |
| Dry scrub                 | Small, dry-tinted shrub placements                                                                        | Sparse desert vegetation; not a separate resource                            |
| Grass A / Grass B         | Two clump variants                                                                                        | Meadow and ground coverage, with distance fade and instancing                |
| Mushrooms                 | Small stems with red or brown caps, placed around woodland scenery                                        | Decorative only; not food or a collectible                                   |
| Stump                     | Cut trunk with a visible top                                                                              | Defines the woodcutter's clearing; a small solid prop                        |
| Axe in stump              | Wooden handle and metal head                                                                              | Tells the woodcutting story; it is not the player's sword or a pickup weapon |
| Log pile                  | Six varied logs in a 3–2–1 arrangement with staggered ends and support details                            | Woodland focal prop/obstacle, not a stack of spendable Lumber cards          |
| Wood chips/support stakes | Small supporting details associated with the log pile                                                     | Decorative construction detail                                               |

Trees are grouped into groves with clearings rather than being evenly spaced on a grid. Trunks, bushes and young trees use different scales. Buildings clear nearby decoration so a tree does not appear in a cottage room or obstruct its doorway.

### Flowers and crops

| Object                        | Definition                                                           | Function                                                        |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- |
| Daisy                         | White-petalled flower with a yellow center                           | Meadow and path-edge color                                      |
| Poppy                         | Red flower variant                                                   | Restrained vivid accents among grasses/crops                    |
| Buttercup                     | Small yellow flower                                                  | Natural meadow variation                                        |
| Lavender                      | Purple flowering stems/pockets                                       | Concentrated patches; purple flowers are not purple UI surfaces |
| Near wheat A/B/C              | Three stalk-clump variants with stems, leaves and recognizable heads | Close crop detail and silhouette variation                      |
| Mid wheat                     | Simplified clump used farther away                                   | Keeps a field readable at lower cost                            |
| Far wheat                     | Still simpler distant crop representation                            | Avoids drawing the full stalk model at long distance            |
| Crop rows and plot boundaries | Organized placement with paths and irregular field edges             | Agriculture composition, not new board boundaries               |
| Ripeness variation            | Slightly varied crop colors between plots                            | Prevents identical gold across every field                      |
| Stubble/harvested plot        | A cut field area with track marks                                    | Shows a different agricultural stage; not a farming timer       |
| Stook                         | Several harvested sheaves stood together for drying                  | Harvest scenery and a small obstacle where proxied              |
| Hay bale                      | Bound bundle near a mill or farm                                     | Farm dressing/solid prop; not inventory                         |
| Entry paths and cart tracks   | Clearer ground routes through vegetation                             | Navigation and composition; no wheeled cart system is implied   |

Wheat, grass and flowers are drawn in batches with distance detail. Their wind comes from GPU deformation, with roots comparatively stable and upper stems more flexible. Reduced motion and Lite simplify or stop ambient motion. There are no per-stalk scene objects receiving individual game updates.

### 2D vegetation

The 2D illustration has its own reusable broadleaf trees, conifers, scrub, dry shrubs, grass tufts, the same four flower families, stooks and stumps. Reeds occur around painted pasture pond details. These SVG symbols are related artwork, not projections of every individual 3D plant. A reed shown in 2D should not be read as evidence of a separately registered 3D reed model.

## 9. Rocks, mountains, ground and ruins

| Object or treatment            | Definition and role                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Boulder A/B/C                  | Three fractured stone models with varied profiles, scales and rotation; terrain dressing and larger obstacle proxies |
| Crag A/B/C                     | Coherent mountain massifs rather than piles of identical small rocks; define the Mountains silhouette                |
| Clay A/B                       | Terraced exposed-earth banks; distinguish Hills from slate Mountains                                                 |
| Ore/mineral details            | Visual hints of the Mountains' resource identity; not individually mineable deposits                                 |
| Mountain shoulders and ledges  | Supporting formations and ground shaping around a main mass                                                          |
| Horizon ranges                 | Distant scaled formations that frame the island; background scenery rather than extra playable hexes                 |
| Pale mountain haze/mist        | Restrained depth cues around formations, subject to graphics settings                                                |
| Sand dunes and ridges          | Shaped desert ground and surface shading; no production                                                              |
| Desert stones                  | Sparse warm-colored rocks scaled for the sand biome                                                                  |
| Ancient ruin                   | Sandstone base, column drums, a broken standing column, fallen lintel and loose fallen section                       |
| Meadow ground                  | Green color variation and grass-detail textures that remain visible between plants                                   |
| Soil/field/clay ground         | Earthy ground detail supporting paths, agriculture and exposed clay                                                  |
| Rock ground                    | Cooler, stonier surface treatment around Mountains                                                                   |
| Sand ground                    | Warm granular surface and ridges for desert/beach areas                                                              |
| Tile transitions and clearings | Biome-aware ground composition respecting exact hex placement and building sites                                     |

The four runtime ground texture families are **grass, soil, sand and rock**, with color and normal maps. Clay identity additionally comes from terrain colors and clay formations. Texture families are visual tools, not extra resource categories.

The ruin is a landmark and obstacle. It is not currently a dungeon, loot vault, quest giver or capture objective. The report does not infer a separate archaeological system from its architecture.

## 10. Buildings, infrastructure and interiors

### Exterior structures

| Object                                    | Where it appears                         | Gameplay versus scenery                                                                     |
| ----------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Cottage                                   | A player's settlement vertex             | Actual rule building with an enterable room                                                 |
| Hall                                      | A player's city vertex                   | Actual rule upgrade, larger silhouette, enterable room                                      |
| Windmill                                  | Fields scenery                           | Enterable ground floor and moving sails; not a second Grain production multiplier           |
| Barn/byre                                 | Pasture farm cluster                     | Farm scenery; not an extra owned settlement or a generally advertised enterable room        |
| Kiln                                      | Hills clay-working area                  | Brick-making visual identity; does not craft extra Brick cards                              |
| Mine entrance                             | Mountains                                | Timber/stone mining landmark; no implemented underground mine level is implied              |
| Brick stacks                              | Near kilns/clay workings                 | Stored-material illustration; not player inventory                                          |
| Timber bridge                             | Each placed road in the current 3D world | Rule road dressed as an arched deck with rails, posts and owner-colored pennants            |
| Short brook beneath a bridge              | Associated road scenery                  | Grounds the bridge's design; not a new sea route or resource                                |
| Fence posts and rails                     | Pasture enclosures and farm boundaries   | Obstacles where modeled; openings remain for navigation                                     |
| Trough                                    | Farm/pasture detail                      | A water container for the animal setting; no thirst mechanic                                |
| Docks and landing stages                  | Coast at ports                           | Harbor presentation and supported walkable strips; trade remains attached to legal vertices |
| Banners, shutters, roof trim and pennants | Buildings/bridges                        | Ownership and style cues, not separate scoring pieces                                       |

The road GLB remains in the asset registry, but the current placed road appearance is built with `makeBridge`. Registered asset availability and actual live placement are not always the same thing.

### Enterable rooms

Room plans are shared between Blender model generation and runtime collision. A cottage has approximately 4.2 × 3.8 m of clear room, a hall 7 × 5 m, and the octagonal mill a 1.95 m internal radius. These are authored room dimensions; the board's legal grid is not stretched to accommodate them.

| Room    | Openings                            | Built-in contents                                                                  |
| ------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| Cottage | One front door, four windows        | Bed, hearth, table, bench, stool, dresser, storage chest and rug                   |
| Hall    | Two front door leaves, five windows | Long table, two benches, chair, hearth, two storage chests, barrels, shelf and rug |
| Mill    | One door, two windows               | Millstone, sacks, ladder and bin                                                   |

Furniture objects communicate how the room is used:

- **Bed:** sleeping-place illustration; not a healing/rest system.
- **Hearth:** masonry fireplace with warm ember/light appearance; no fuel inventory.
- **Tables, benches, chair and stool:** room furnishings and relevant collision proxies; not a sitting interaction system.
- **Dresser, shelf and bookshelf:** storage appearance; not containers with resource-card inventories.
- **Barrels, sacks and bin:** stored supplies in the illustration; no independent looting mechanic.
- **Rug and wall textiles:** decorative surfaces; do not block the path like furniture.
- **Millstone:** the grinding apparatus that identifies the mill's interior; not a player-operated crafting machine.
- **Ladder:** mill interior detail; its presence does not promise climbable upper floors.

Doors are hinged leaves operated with E. They collide at their current angle, show contextual open/close hints, and avoid closing onto a nearby walker. Buildings have walls, floors, thresholds and furniture proxies. When a settlement changes into a city around a player, the world relocates that player outside rather than trapping them in the replacement building.

Interior lighting uses the shared environment, sun/moon, materials and authored/baked shading rather than adding a shadow-casting light per room. Interior visibility is distance-managed; that does not mean the exterior is fully occlusion-culled whenever a player enters a room.

### My kingdom furnishings

My kingdom offers **ten optional furnishing families**, with separate cottage/hall settings and six color choices.

| Furnishing      | Definition                                  | Interaction/collision                                              |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Woven rug       | Floor textile with a patterned field/border | Cosmetic floor dressing                                            |
| Banners         | Hanging colored cloth                       | Cosmetic ownership/style                                           |
| Tapestry        | Larger wall textile                         | Cosmetic                                                           |
| Antler trophy   | Mounted antlers                             | Cosmetic wall decoration                                           |
| Candle wheel    | Suspended candle chandelier                 | Visual lighting fixture; no new per-room shadow light              |
| Bookshelf       | Standing shelves and books                  | Has a walking obstacle proxy                                       |
| Potted plants   | Floor and tabletop greenery                 | Floor pieces have small obstacle proxies                           |
| Armour stand    | Display armor on a stand                    | Has an obstacle proxy; not a second fighter or usable armor pickup |
| Candles         | Wax/flame details placed on surfaces        | Decorative emissive appearance                                     |
| Crossed shields | Wall-mounted heraldic decoration            | Cosmetic, not extra combat shields                                 |

The available furnishing colors are Crimson, Royal blue, Forest, Purple, Gold and Night. Purple is a furnishing option; the surrounding application UI remains graphite. Objects occupy predefined room positions rather than a free-drag house editor, and they grant no production or combat bonuses.

## 11. Animals, characters and equipment

| Object                               | Behavior and role                                                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sheep                                | Wool-bodied farm animals with head, legs, face and tail; graze, look around, walk, blink and react to a nearby walker. They can bleat. They are not combat opponents or manually shearable Wool sources. |
| Pasture horse                        | Grazing horse with coat/hair variation and tack; can be approached and ridden when the interaction permits.                                                                                              |
| Player's waiting mount               | A saddled horse associated with the player's spawn/home area.                                                                                                                                            |
| Mounted horse                        | Carries the rider with riding movement and faster Shift travel. Its presence does not modify road ownership or trade rates.                                                                              |
| Local knight                         | The player's visible third-person character, matching profile choices and seat color.                                                                                                                    |
| Remote knight                        | Another online player's visible character driven by relayed presence and animation state.                                                                                                                |
| Shape-built fallback character/horse | Alternative original geometry used if the newer Blender model cannot load; not an extra species or player class.                                                                                         |
| Straw training dummy                 | Crossbar/post, straw torso/head, binding straps and a base; a local target for practicing feedback. Its recovery does not heal online opponents.                                                         |
| Sword                                | Hand-held melee weapon and frontal guard/parry tool after the weapon chest.                                                                                                                              |
| Revolver                             | Hand-held ranged weapon using limited persistent ammunition.                                                                                                                                             |
| Fists                                | Unarmed equipment state available before the chest.                                                                                                                                                      |
| Shield                               | Visible left-arm equipment tinted for the seat; guard/parry rules are determined by the combat system, not by clicking the shield mesh.                                                                  |
| Muzzle flash and tracer              | Short-lived firing effects; not projectiles that can be picked up.                                                                                                                                       |
| Impact sparks and chest coins        | Pooled visual feedback; coins are not a second currency.                                                                                                                                                 |
| Footfall dust and speed lines        | Running feedback, simplified under Lite/reduced motion.                                                                                                                                                  |

The horse is a Blender-made skinned model on 17 bones, with a flowing body, ears, eyes, hooves, mane, forelock and tail. Tack includes a saddle, owner-colored blanket, girth, stirrups, bridle and reins. The runtime supplies walk/trot/gallop-related bone posing, grazing, head motion and tail movement.

The knight is also a Blender-made rig. Its armor includes breast/back plate, gorget, layered shoulder armor, elbow pieces, forearm plates, gauntlets, waist plates over mail, thigh plates, knee pieces, greaves and armored shoes. Weapon attachments are in the right gauntlet; the shield attaches to the left forearm. Cloth and cape can blend between bones while rigid armor remains rigid.

There is no class-selection, armor-stat progression, animal-breeding or mount-inventory system established by these visual details.

## 12. Water, harbors, boats and atmosphere

### Coast and boats

The 2D board uses rich blue open water, restrained turquoise shallows, short foam accents, sparse waves and a light contact shadow under the island. The former broad cyan halo and heavy muddy/vignette treatment were replaced. Static scenery is cached; retained ambient motion is on whole layers rather than hundreds of individual SVG elements.

Each 2D dock is one connected deck footprint: two short shore approaches join a compact platform offshore. Plank lines stop at structural seams, and posts stand at exposed support points rather than in passage openings. The trade badge is separate from the deck. Boat placement accounts for beach, dock, badge and board bounds.

The miniature 2D boats include a cog-like trader with a raised stern and square sail, a fore-and-aft rig with boom and jib, and a striped square-sail variant. Hull, deck, gunwale, mast and shaped sail convey volume at board scale. These are original SVG illustrations.

The 3D coast uses original dock and boat models. The boat has hull, deck, mast and sail; boats can bob and roll gently. They are scenery, not currently steerable vessels. Their presence does not establish sailing, fishing, cargo delivery or naval combat. Water has distance-to-shore color, moving wave normals and restrained foam rather than an expensive full-scene reflection system.

### Sky and time

| Element                    | Definition                                                                 |
| -------------------------- | -------------------------------------------------------------------------- |
| Sky gradient               | Dome/shader treatment providing depth from horizon to overhead             |
| Clouds                     | Soft shader/cloud forms; not solid independently simulated objects         |
| Sun / moon treatment       | Time-sensitive sky and lighting cues                                       |
| Stars                      | Night sky points used by the day/night presentation                        |
| Directional shadows        | Shared outdoor grounding for characters, buildings, trees and larger props |
| Fill/environment light     | Keeps shaded material colors readable                                      |
| Atmospheric haze/fog       | Restrained distance treatment, varied with time                            |
| Shore foam/wave highlights | Small coastal/water effects; no extra movement or damage rule              |

The clock follows game progress so online players share the same time. The stages are Sunrise, Morning, Midday, Afternoon, Sunset, Dusk, Midnight and Small hours. Rounds select stages and turns interpolate within them. It is not the computer's real local time and not a separately running survival-day timer.

The 3D presentation changes light, sky, exposure, atmosphere and stars. The 2D board uses a restrained whole-layer time wash and a time label. Weather simulation and seasonal crop growth are not established features.

## 13. Character and kingdom customization

The Character screen has a live 3D preview and profile choices for:

- Six skin colors.
- Six hair styles: Bald, Short, Long, Braid, Top knot and Curls.
- Seven hair colors.
- Four beard choices: None, Stubble, Full and Braided.
- Eight tunic/outfit colors, visible where armor leaves the cloth exposed.
- Five helm choices: Great helm, Armet, Bascinet, Bare head and Crowned helm.
- Three cape choices: None, Short and Long.

The seat color remains on identifying regions such as plume, cape and shield so customization does not conceal ownership. Hair, beard and skin are visible where the chosen helm exposes the head.

My kingdom previews and selects the furnishing families described above for cottages and halls. Profile appearance and decoration are saved locally and shared through the online profile/lobby path. These choices are cosmetic rather than additional rule advantages.

## 14. Interface, settings and accessibility

On wide screens, the left side contains the title/round/time/score target, Claims, current and next player, and recent events. The right side contains the toolbar, **Your hand**, Build / Cards / Trade panels and End turn. The island occupies the center. Responsive layouts combine or relocate panels instead of requiring the wide desktop arrangement on a phone.

The toolbar provides relevant undo, log, rules/help, sound, settings and leave controls. Leaving is deliberate and distinct from silently replacing a game with a new one. Legal actions, phase prompts, tooltips and notices explain what the player can do next.

The 3D HUD includes the minimap, location/time information, relevant health/ammunition information, context hints, weapon selection, practice control, Dive in and duel information when applicable. Character customization is in the title menu rather than a permanent Character button over the world. Attacks use F/click rather than a permanent Strike button.

The minimap includes terrain marks, number tokens, harbor rates, coast/shallows, buildings, bridges, robber, horses, other players, unopened weapon chests and a view cone. A duel opponent is emphasized. Whole-island and nearby rotating views serve different navigation needs.

Settings include master/SFX/music volume, mute, mouse sensitivity, reduced motion, colorblind glyphs, hand privacy, hold-to-reveal hand behavior, explanation/tip options, bot speed, UI scale, turn timer, theme, Auto/Full/Lite graphics and 100/75/50% 3D resolution. Not every graphics option increases or decreases the same kind of cost.

Accessibility includes keyboard-operable legal placement targets, focus treatment, textual prompts, screen-reader event announcements, player glyphs in addition to color, configurable hand privacy and reduced motion. Decorative land hexes are not all forced into the keyboard tab order. Reduced motion preserves actions and results while simplifying movement effects; it is not a different ruleset.

## 15. Sound and music

Sound effects are synthesized through WebAudio, including dice, cards, collection, construction, trades, turn/victory feedback, robber events, sheep bleats, attacks, shots, empty-fire clicks, punches, clangs, chest effects and ground-sensitive footfalls. Footsteps distinguish grass, soil, sand, timber and stone, with a restrained armor sound.

The older music ban has been explicitly reversed. Current music is synthesized classical repertoire on a separate volume-controlled bus, heard in menus and the **2D board only**. It fades out in the 3D walk and resumes afterward. The documented current sequence uses Mozart and Beethoven material: Eine kleine Nachtmusik, Moonlight Sonata, Rondo alla Turca, Pathétique's Adagio cantabile, Sonata facile and Ode to Joy.

The notes are represented in LilyPond-style notation and played by the in-project synthesizer; there are no shipped recordings for that music. Credits identify the score editions. The 3D world does not gain an ambient music bed merely because music exists on the menu. Mute and the separate volume controls remain relevant.

## 16. Networking, saving and technical structure

| Part              | Responsibility                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/engine` | Pure deterministic rules, legal actions, production, scoring, bots, records and persistent combat consequences       |
| `packages/net`    | Shared lobby/protocol types, profile/pose data and related helpers                                                   |
| `apps/server`     | WebSocket rooms, ownership checks, authoritative board actions, redaction, reconnect/autopilot and combat validation |
| `apps/web`        | React interface, Zustand stores, SVG board, three.js world and WebAudio                                              |
| `assets/blender`  | Original model/texture generation scripts and editable `.blend` files                                                |
| `docs`            | Rules, design decisions, pipeline notes, benchmark reports and this reference                                        |

The client uses React 18, Vite 5, Zustand 5, Tailwind 3, Framer Motion and three.js 0.186.1. Playwright is pinned to 1.62.1. The application remains a browser game; there is no desktop package established by this report.

The engine applies actions to serializable state and emits typed events. The same event flow drives logs, notifications, sound, effects and accessibility announcements. Its RNG state is part of the game so configuration and action records can reproduce outcomes.

In online play, the server holds the real board state. Clients send actions; they do not declare their own authoritative resource totals. Views hide opponents' private card contents, deck order and other secret data. Public player poses are a different stream from private hands. A reconnect token supports returning to a room, and absent players can receive board-game autopilot after the configured absence period.

Local saves use versioned browser storage; settings and profile have separate storage keys. Replay records retain the `hexfall-record` identity. Local undo is limited to supported non-random actions and is not an online rewind. Hot-seat privacy is represented in game state so reloading should not reveal the wrong player's hand.

Internal names such as `outpost`, `citadel`, `causeway`, `wraith` and `violet` are preserved for compatibility. Display names are Settlement, City, Road, robber and Orange. Renaming internal keys to match the visible text would risk breaking old saves and records.

## 17. Artwork and asset pipeline

The game uses original artwork. The 2D board is SVG/CSS/canvas illustration. The 3D world combines Blender-generated local assets, procedural geometry, shader effects and canvas-generated textures. No downloaded third-party model pack is required.

The model registry has **30 slots**, with variants inside shared GLB files. File sizes measured from the local public directory during this report are:

| Runtime file        |         Bytes | Main contents                                                                                              |
| ------------------- | ------------: | ---------------------------------------------------------------------------------------------------------- |
| `flora.glb`         |     1,534,768 | Wheat LODs, stook, grass, flowers, trees and shrubs                                                        |
| `rocks.glb`         |       609,024 | Boulder, crag and clay-bank families                                                                       |
| `village.glb`       |     1,371,496 | Cottage/hall/mill, doors/interiors, older road model, robber, dock, boat, sheep, barn, kiln, bale and mine |
| `horse.glb`         |     1,093,760 | Skinned horse, hair, hooves and tack                                                                       |
| `knight.glb`        |       564,568 | Skinned armor/body, face, alternate helms and capes                                                        |
| **Five-file total** | **5,173,616** | About 5.17 decimal MB, before ground textures, application code and fonts                                  |

Editable sources are `flora.blend`, `rocks.blend`, `village.blend`, `horse.blend` and `knight.blend` under `assets/blender`. Scripts include `flora.py`, `rocks.py`, `village.py`, `homes.py`, `horse.py` and `knight.py`, coordinated by `build.py`. Shared helpers and texture generation live alongside them.

Flora, stone and village atlases are embedded in their model families. Ground color and normal maps are in `apps/web/public/textures`. Other props/effects are still built directly in code: fences, troughs, brick stacks, log piles, stumps, mushrooms, ruins, number signs, bridges, chest effects and furnishings.

The loader caches files, preloads world assets before exposing the finished view and retains procedural fallbacks. Ownership material regions are tinted without needing a separate downloaded model for each player. Skinned copies receive independent skeletons. Collision stays independent of visual mesh detail.

Characters, shape-built horses, chests and room decor use merging per moving joint/material where appropriate. Independently animated pieces remain separate. The newer skinned horse/knight are another route to reducing object counts without deleting visible detail.

## 18. Performance and verification

### Existing optimization systems

- Repeated vegetation and static scenery are instanced or merged rather than submitted as thousands of independent objects.
- Wheat has three detail tiers; grass and flowers have distance-based visibility/fade.
- Vegetation wind is a GPU effect rather than a CPU update per stalk.
- A depth pre-pass limits expensive shading of overlapping leaves and near wheat.
- Shadow updates share a scheduler rather than redrawing every shadow on every frame.
- Static transformations are frozen where safe, with movement limited to objects that actually animate.
- Auto can reduce rendering resolution under sustained load; Full and fixed benchmark settings avoid silently adapting.
- 3D loading stays lazy, and the 2D SVG separates static art from localized interaction updates.
- Context/resource cleanup supports repeated visits without intentionally keeping a world rendering after it closes.

Resolution reduction and Lite's simplified effects are optional quality changes, not equivalent-quality efficiency gains.

### What prior measurements establish

The browser performance report measured an earlier build on one Lenovo LOQ laptop with Intel UHD and RTX 4050 graphics, using controlled Chromium runs, fixed scenes and timer queries. It recorded substantial equivalent-quality Intel GPU savings, shorter entry stalls, stable sustained runs and stress limits. A later per-joint merging comparison documented fewer draw calls after the first live-combat expansion.

Those are **historical measurements**, not a fresh FPS guarantee for the current knight, horse, minimap, lighting and effects. The rendered content and camera have changed. A refresh-capped 60 FPS observation is not proof of extra headroom, and the old draw-call figures should not be assigned to every present scene.

The repository contains `pnpm bench`, fixed views, a scripted route, late-game fixtures, entry/exit cycles, optional soak runs, 2D probes and development stress presets. These measure frame intervals separately from CPU/GPU execution time. Repeating that controlled benchmark is the appropriate way to establish a current device ceiling.

### Fresh verification for this report

`pnpm verify` was run against the inspected working tree and passed:

| Check             | Result                                                                     |
| ----------------- | -------------------------------------------------------------------------- |
| TypeScript checks | Passed for the workspace, including browser-test types                     |
| ESLint            | Passed with the configured zero-warning requirement                        |
| Engine tests      | 115 passed, including 11 arms tests and the seeded 200-game bot simulation |
| Net/lobby tests   | 6 passed                                                                   |
| Server tests      | 7 passed                                                                   |
| Unit-test total   | **128 passed**                                                             |
| Production build  | Passed                                                                     |

The current build splits 3D code across multiple lazy chunks, including shared decor/renderer code. Looking only at the file named `World3D` would undercount the actual lazy-load download.

No new browser visual review, multiplayer play session, sustained benchmark or cross-device test was performed for this writing task. Existing browser specifications cover combat, PvP, buildings, 3D switching, online play, responsive UI, full games and performance probes, but their presence is not a claim that they were all rerun today. No persistent game server was started to prepare this report.

## 19. Limits, documentation gaps and terminology

### Boundaries of the implemented world

- Trees, flowers, mushrooms, minerals and most furniture are not harvestable or lootable.
- Barns, mines and ruins are not automatically enterable levels just because they have modeled architecture.
- Boats are not a sailing system; chests' effect coins are not an economy.
- Visual armor choices are not combat-stat classes or equipment progression.
- Bots do not become PvP enemies; the robber is not an independent melee boss.
- Kingdom furnishings use authored locations rather than free construction or a physics sandbox.
- The world is not described here as a fully authoritative server-side physics simulation.
- Desktop packaging, weather, survival needs, quests, crafting, animal breeding and procedural dungeon campaigns are not established by the inspected implementation.
- Counts of visible trees, plants, rocks and props vary with seed, available space and graphics/stress choices. This is an object-type catalogue, not a fabricated count of every scene instance.

### Documentation that needs historical context

The README's appended early-combat paragraphs still mention local-only fighting, six reloadable shots and R. Earlier reports discuss first-person views, fewer assets, no music and a permanently afternoon island. Decision entries #40–43 and the current source supersede those descriptions. This report identifies that mismatch; preparing it did not rewrite unrelated source or historical decisions.

Some world code or asset registry entries exist for compatibility/fallback even when a newer presentation is used. For example, `Road` remains an exported GLB node while bridges are the current road visualization. A registered model, an unused helper and an actively spawned object should not be treated as interchangeable evidence.

### Small glossary

| Term             | Plain-language definition                                                          |
| ---------------- | ---------------------------------------------------------------------------------- |
| Hex              | One six-sided terrain tile                                                         |
| Vertex           | A legal settlement/city corner                                                     |
| Edge             | A legal road connection between vertices                                           |
| Biome            | The visual terrain family and its scenery                                          |
| Stook            | Harvested sheaves stood together to dry                                            |
| Byre             | Farm shelter associated with livestock                                             |
| Crag / massif    | A large coherent rocky formation                                                   |
| Lintel           | A horizontal architectural stone/beam spanning an opening; seen fallen in the ruin |
| Gunwale          | The upper edge of a boat's hull                                                    |
| Cog              | A historical trading-ship form inspiring one miniature boat variant                |
| Gorget           | Neck/throat armor                                                                  |
| Pauldron         | Shoulder armor                                                                     |
| Gauntlet         | Armored glove                                                                      |
| Greave / sabaton | Shin armor / armored footwear                                                      |
| LOD              | A simpler model used farther from the camera                                       |
| Instancing       | Drawing many copies of a mesh in a batch                                           |
| Collision proxy  | A simple invisible shape used for movement/contact checks                          |
| GLB              | A packaged glTF model file loaded by the browser                                   |
| Rig / skeleton   | Moving joints/bones used to animate a model                                        |
| Shader           | GPU code producing material appearance, wind, sky or water effects                 |
| PvP              | Player-versus-player combat                                                        |
| Pose stream      | Frequent position/facing/animation updates for online characters                   |
| Redaction        | Sending each player a view that omits other players' secret information            |

## 20. Source map

These are the main repository-relative references used to prepare the report. Paths are supplied so each category can be checked or extended without guessing which system owns it.

| Subject                                    | Primary files                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Overall project guide                      | `AGENTS.md`, `README.md`                                                                                                       |
| Design history and newer feature decisions | `docs/DECISIONS.md`, especially #29–43                                                                                         |
| Board rules                                | `docs/RULES.md`, `packages/engine/src/lexicon-keys.ts`, `packages/engine/src/rules/`                                           |
| Combat consequences and duels              | `packages/engine/src/rules/arms.ts`, engine state/setup and arms tests                                                         |
| Server fight checks                        | `apps/server/src/hub.ts`, `packages/net/src/`                                                                                  |
| 2D terrain and small symbols               | `apps/web/src/art/terrain/TerrainArt.tsx`, `flora.tsx`                                                                         |
| 2D pieces and port/sea composition         | `apps/web/src/art/pieces/Pieces.tsx`, `components/board/Scenery.tsx`, `BoardDefs.tsx`, `geometry.ts`                           |
| World placement and movement               | `apps/web/src/components/world/world.ts`, `terrain.ts`                                                                         |
| Asset registry and loading                 | `apps/web/src/components/world/assets.ts`                                                                                      |
| Vegetation detail and effects              | `apps/web/src/components/world/field.ts`, `shaders.ts`, `wheat.ts`                                                             |
| Procedural scenery/fallbacks               | `apps/web/src/components/world/models.ts`                                                                                      |
| Buildings and rooms                        | `apps/web/src/components/world/buildings.json`, `buildings.ts`, `assets/blender/homes.py`                                      |
| Player and horse                           | `apps/web/src/components/world/avatar.ts`, `knight.ts`, `horse.ts`, `stride.ts`                                                |
| Combat visuals, chest, remotes             | `apps/web/src/components/world/combat.ts`, `chest.ts`, `remote.ts`, `rig.ts`                                                   |
| Kingdom/profile                            | `apps/web/src/components/world/decor.ts`, `looks.ts`, `Preview.tsx`, `components/modals/ProfileModals.tsx`, `state/profile.ts` |
| World HUD and time                         | `apps/web/src/components/world/World3D.tsx`, `Minimap.tsx`, `daytime.ts`, `daylight.ts`                                        |
| Board UI and played cards                  | `apps/web/src/components/screens/GameScreen.tsx`, `components/panels/LeftRail.tsx`, `RightRail.tsx`, `components/hud/Hud.tsx`  |
| Settings, saves and presence               | `apps/web/src/state/persistence.ts`, `store.ts`, `net.ts`, `presence.ts`                                                       |
| Audio and attribution                      | `apps/web/src/audio/engine.ts`, `synth.ts`, `music.ts`, `docs/CREDITS.md`                                                      |
| Asset construction                         | `docs/BLENDER_ASSET_PIPELINE.md`, `assets/blender/`, `apps/web/public/models/`, `apps/web/public/textures/`                    |
| Historical performance                     | `docs/BROWSER_PERFORMANCE_REPORT.md`, `docs/VILLAGE_PROTOTYPE.md`                                                              |
| Verification and benchmarks                | Root/package scripts, `apps/web/e2e/`, `apps/web/e2e/perf/`, `playwright.perf.config.ts`                                       |

This reference covers the current visible world families and principal player-facing systems. Individual bolts, polygon faces, texture pixels and every seeded plant instance are components of these objects, not separate gameplay mechanics.
