# Native knight and horse

The native Unreal game's first character/riding slice. The title screen's **Knight & riding
yard** opens a local physical practice area; Esc returns to the hall and resumes the table's
bot clock. This is the character foundation for phase 4, not the complete live-island port.
The browser and wrapper keep their existing models and controls.

## Art and source

The owner's `E:/Catan_art_obj` sheets are the visual reference: the knight turnaround,
animals/tack study, and helm/customization sheet. Canonical copies and hashes are in
`assets/concepts/manifest.json` (00, 17 and 19). Geometry is authored in Blender, not pictures
placed in the world or downloaded character packs.

`apps/catnight/Tools/build_heroes.py` reuses the project's original parametric armour and
anatomical horse builders, then authors the native family:

- A peaked, riveted armet with a narrow visor, layered plate, fluted breastplate, articulated
  gauntlets and olive cloth. No cape (owner's request, 2026-11-27; DECISIONS #76): the base
  rig's two cape bones remain but carry no geometry.
- A bay horse with a blaze, dark mane/tail, shaped hooves, fitted bridle, saddle, embroidered
  blanket and stirrups sized to the rider. The shared horse builder accepts an optional
  stirrup height; its browser default stays unchanged.
- Separate skeletal rigs, normalized skin weights (at most four influences), saddle/bit/hand
  anchors and eleven baked loops. Knight: idle, walk, run, crouch idle/walk, riding idle/walk/
  gallop. Horse: idle, walk, gallop. All actions remain editable in the Blender files.

The source export contains 6,304 triangles and 22 bones for the knight, and 26,300 triangles
and 21 bones for the horse. Source foot-contact checks measure zero vertical stance-ankle
error for the knight's three locomotion loops and at most 1.35 cm for the horse's gallop.
These are flat-ground rig checks; terrain adaptation remains a separate gate below.

Blender uses metres; Unreal imports **with scene-unit conversion enabled** for both meshes
and animation. Otherwise the FBX animation can arrive 100 times too small. The native asset
test independently measures imported scale, loops and foot heights.

## Rebuild

Close this project's Unreal editor before rebuilding its module or importing assets.

```powershell
pnpm catnight:heroes
```

This writes `apps/catnight/SourceArt/Heroes/{Knight,Horse}.blend`, skeletal FBXs, individual
animation FBXs and a manifest, then imports `/Game/Generated/Heroes`. Both output directories
are ignored and reproducible. `pnpm catnight:import` also rebuilds the heroes after the board
art. Native packaging checks that both meshes and every named clip are present.
The Python builders are the versioned source of truth. The generated `.blend` files are
editable, but this command replaces them; save a separate copy before making manual edits.

The FBX importer preserves vertex paint and binds separate roughness/metallic values for
armour, cloth, coat and tack. It saves native skeletal meshes, skeletons, materials and
animation sequences. No browser runtime is involved.

FBX vertex colours are explicitly exported as **linear**. Blender's sRGB default and Unreal's
skeletal importer disagree here: Unreal copies the FBX channels into colour bytes without
sRGB decoding. Leaving the default makes the olive cloth and bay coat appear washed out.

## Movement

`Private/Hero/HeroPawn.*` uses Unreal's CharacterMovement collision/substeps and SpringArm
camera sweep. `HeroAnim.*` samples native sequences and blends pose changes over 0.18 s on
the animation worker. Gait phase advances from actual distance travelled, so a blocked move
or a stalled frame does not keep the feet running at an unrelated speed. Camera follow is
after movement, independent of animated bone bobbing. Physical exposure is fixed for the
sunlit yard so a dark wall does not wash out the character colours.

| Action                | Keyboard / mouse | Gamepad                 |
| --------------------- | ---------------- | ----------------------- |
| Move                  | WASD / arrows    | Left stick              |
| Look                  | Mouse            | Right stick             |
| Sprint / gallop       | Hold Shift       | Hold left-stick button  |
| Crouch                | Hold Ctrl or C   | Hold right-stick button |
| Mount / safe dismount | E                | Top face button         |
| Camera distance       | Wheel            | —                       |
| Return to hall        | Esc              | Start                   |

Speeds in cm/s: crouch 110, walk 240, sprint 620, horse walk 250, gallop 800. Sprint cannot
override crouching. Crouching uses a smaller capsule and standing is refused under a low
ceiling. Horse head clearance adds a sweep ahead of the main riding capsule. A parked horse
has a separate collision actor, so the knight cannot ignore it as part of its own capsule.
Dismount checks ground support and full standing clearance before leaving the saddle.

The rider follows the horse's animated saddle. Visible straps connect each bit to its
animated gauntlet, routed outside the neck. Cloth is controlled deformation, without an
unstable free cloth simulation. Controller and animation pose checks supplement visual review;
they do not certify every island slope, room or multiplayer situation.

## Check

```powershell
pnpm catnight:test
pnpm catnight:package
pnpm catnight:test-heroes
pnpm catnight:test-package
pnpm verify
```

`test-heroes.ps1 -Editor` tests the editor game; `-Quick` only captures idle/riding for early
visual iteration. The complete check validates the imported assets, runs thirteen physical
scenarios at fixed 10/60/144 Hz simulation steps, then captures six movement modes and an
additional rear riding view for visual inspection. Logs and
images go to `Saved/HeroValidation/<timestamp>`. `-CatnightHero=idle|walk|run|crouch|ride|gallop`
and `-CatnightHeroAngle=<yaw>` make these captures repeatable; `test` runs the functional route.
The full command also runs `-CatnightHero=return`: the table's hall, global light, fog and
grading leave the practice yard alone, then return with the table camera and mouse input.
The board owns the single dice pair; the hall's optional dice remain disabled.
All automated runs disable saving. An isolated `-UserDir` should be used for interactive tests.
Pose captures disable motion blur for joint inspection; the player's rendering setting is
unchanged. These simulation checks do not claim that this PC renders at 144 FPS.

The completed pass is recorded in `apps/catnight/validation/heroes.json`, with four selected
captures beside it. Five editor automation tests passed, including 248 matching golden games;
the cooked hero assets and eleven clips passed again in the final package. The physical route
passed 367 / 2,215 / 5,328 checks at 10 / 60 / 144 Hz respectively, with zero failures. Seven
views were reviewed. Direct keyboard/mouse checks covered the title button, mounting,
dismounting, camera input, return to the hall and restored keyboard focus. The last camera
aim-only correction was verified in front/rear packaged captures.

The table regression also passed: all 181 generated packages and three basic shapes cooked,
three match/board tests passed, picking found 50/50 targets from each of three angles, and a
694-action rendered match reached victory. `pnpm verify` passed with 132 unit tests. The
report records when these checks ran; physical-gamepad and full-island acceptance remain open.

## Remaining phase 4 work

Connect this character foundation to the match's full-sized live island, terrain and building
interiors; add the weapon chest/combat/duels, customization, minimap and kingdom furnishings.
Animation/terrain foot IK on arbitrary slopes, further LOD/performance work, input rebinding,
complete physical-gamepad testing and broader player acceptance remain gates for that port.

## Live island integration (2026-11-27)

The knight and horse now also explore the match's native 19-tile island through Explore island.
See `CATNIGHT_ISLAND.md`. Mounting sweeps the full riding capsule onto a supported surface;
smoothed horse/rider body alignment follows terrain normals while preserving saddle/rein
contact. Parked horses retain their ground normal. This supplements the yard's tests with
95 cross-biome scenarios at three simulation rates. It does not add per-leg foot IK or claim
that all room/combat/controller acceptance is complete.

## Upright locomotion revision (2026-11-27)

The native loops now use reach-driven pelvis/body height instead of a permanently lowered walking/running pose. Speeds are 160/550/85 cm/s on foot and 200/700 mounted. Distance-driven phases match stance stride lengths. Knight feet use ground traces plus worker-thread two-bone IK, with mounted poses excluded; horse hooves use the same split (traces on the game thread, Upper/Cannon/Pastern solve on the worker). Ride clips keep the reference hips anchor so saddle/rein constraints remain aligned. The horse has a subdivided, smoothly weighted body and warmer natural bay paint. Short clips use full-precision recorder bone compression and disable frame stripping to keep imported loop endpoints continuous. `test-heroes.ps1` includes a rendered slope view.
