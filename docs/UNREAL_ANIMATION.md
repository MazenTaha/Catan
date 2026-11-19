# Native animation practice

Status on 2026-11-19: **validated in UE 5.8.4.** The Editor and Game targets compile, both
native action-clock automation tests pass, the preview builder runs without a crash, and the
live practice scene passed 59 of 59 checks across four Play-In-Editor sessions driven by key
input. A real viewport review and a short performance comparison were made. The record is in
`apps/unreal/validation/animation-2026-11-19.json`, with screenshots in
`apps/unreal/validation/animation-practice-2026-11-19.jpg`.

This work targets the Unreal app. The browser game remains the source of truth for board
rules, inventory, rewards, combat health and online authority. None of those systems has been
ported to Unreal. The native practice scene exercises reusable presentation components and a
clearly labelled standalone sparring partner; its HUD states that it has no inventory, rewards,
board rules or online play.

## Build and authoring

The runtime plugin source is `apps/unreal/Plugins/CatanAnimation`. The project module and
editor/game targets live in `apps/unreal/Source`. Building requires the Unreal 5.8 Windows C++
toolchain: MSVC, Windows SDK and .NET Framework SDK. VS Code can be used as the editor; the full
Visual Studio IDE is unnecessary. Close Unreal, then run
`powershell -File apps/unreal/build-native.ps1 -EditorPath E:/UE_5.8/Engine/Binaries/Win64/UnrealEditor.exe`
(add `-Target Game` for the game target). It copies the canonical source into the converted
project before compiling.

Original animation poses and equipment are authored by `assets/blender/native_interactions.py`.
Rebuild with:

```powershell
E:/Blender/blender.exe -b --python-exit-code 1 -P assets/blender/native_interactions.py
```

The editable result is `assets/blender/native_interactions.blend`. Exported FBX files and
timing metadata are in `apps/unreal/SourceArt/Animation`. The knight and equipment share the
original 17-bone bind skeleton. Clips contain in-place bone rotation; character movement belongs
to Unreal's controller, never to an animation root track. Equipment follows the knight through
the leader pose rather than approximate runtime socket offsets.

With the plugin compiled and Play stopped, open the authored island and run
`apps/unreal/Content/Python/build_animation_preview.py` (Tools → Execute Python Script). It:

1. refuses to start if the open map has unsaved edits (it never saves your map for you);
2. imports the meshes and clips with scene-unit conversion (Blender writes metres; Unreal
   needs centimetres, which the first import missed: its chest was 1 cm wide) and saves the
   knight skeleton with its users. It reuses an earlier import only if it is complete;
3. creates `DA_Interactions`, the spark material (with its instanced-mesh usage flag) and
   `BP_AnimationPracticeMode`;
4. writes a timestamped `Island_Animations_*` copy of the open map, releases every Python
   reference to the source world, and opens the copy. In UE 5.8 `save_map` writes a copy but
   keeps the source world open; the earlier crash was Unreal's leaked-world assertion,
   triggered by a script that still held the old world when another map loaded;
5. snaps the player, partner and chest onto the ground and saves only the copy. It checks the
   source map's SHA-256 before and after, and fails if the island file changed.

The project's startup map and settings are not changed. Open the newest practice map with
`powershell -File apps/unreal/open-island.ps1 -Practice -EditorPath E:/UE_5.8/Engine/Binaries/Win64/UnrealEditor.exe`,
or from the Content Browser under `CatanNight/Maps`. The validated map is
`Island_Animations_20261119_231733`.

## Controls and boundaries

Press Play, click the viewport, and use WASD/mouse to move/look. Shift runs; Space jumps; F or
left click attacks; right click guards. 1 selects sword/shield, 2 the revolver, and 3 fists. E
opens the nearby chest. R resets practice actors and the practice chest save. M toggles reduced
motion for every practice character and chest. Esc leaves Play. The follow camera sits 3.6 m
back and 1 m to the right, so the partner stays visible during an exchange.

The sparring partner uses standalone preview health and turns (yaw only) to counterattack. Its
health, attacks and resets do not change the browser game. No native multiplayer, inventory,
ammunition allocation or card rewards are introduced by the preview.

## Timing and interruption

| Action | Contact | Recovery complete | Loop |
|---|---:|---:|---|
| Sword cut, alternating sides | 0.21 s | 0.58 s | No |
| Fist jab | 0.12 s | 0.42 s | No |
| Revolver fire | 0 s | 0.42 s | No |
| Combat idle | — | 1.60 s | Yes |
| Guard hold | — | 1.20 s | Yes |
| Hit reaction | — | 0.30 s | No |
| Guard impact | — | 0.24 s | No |
| Recovery | — | 0.45 s | No |
| Walk / run | — | 0.72 / 0.56 s | Yes |

Repeated attack input during recovery is ignored. Weapon changes wait for recovery. Guard
cancels an unconsumed contact marker without resetting the recovery clock. Movement stays
responsive during actions. Contact is requested once when the clock crosses the marker,
including a frame that crosses the entire action. Reaction poses start only on a confirmed
practice hit or block. Ending Play cancels pending contact and clears event delegates; no timer
callback survives scene disposal.

The animation instance samples shared assets with independent per-character clocks. Game-thread
snapshots feed pose evaluation. Locomotion blends under upper-body attack, guard and reaction
layers; animation evaluation never changes gameplay state.

## Chest lifecycle and integration hooks

The chest has separate body, rear-hinged lid and moving latch meshes. The latch swings out
(0.08–0.17 s) before the weighted opening arc. The lid overshoots to about 108° at 0.82 s and
settles at 104°, clear of the body and back wall. Reveal is requested once at 0.64 s. The chest
reaches its stable open state at 2.4 s. Additional E presses do not restart an opening or open
chest. (The first native lid code used the Blender sign unchanged. Because the FBX import
mirrors Y, the lid would have swung down through the chest. The keys now map to Unreal roll
directly.)

`ACatanAnimatedChest.OnRevealRequested` is a presentation request, not a reward grant. Future
native gameplay should validate and grant rewards in its authoritative system, then call
`SetConfirmedOpen` for initial state or corrections. `UCatanCombatPresentation` similarly emits
`OnContactRequested`; native gameplay must validate contact and call `ConfirmHit` from a
confirmed event. Mesh overlap and pose sampling never grant rewards or apply board-game damage.

Only the practice chest enables preview persistence. It writes the isolated slot
`CatanNight_AnimationPractice_v1` when reveal is crossed. Leaving before reveal permits a fresh
attempt; leaving after reveal restores an open chest without a new reveal request. R deletes
only that slot. A missing slot is not read, so a fresh run logs no load warnings. Normal game
saves, browser profiles and user settings are untouched.

## Feedback

Short latch, creak, reveal, swing, gunshot, impact and parry cues are synthesized as finite PCM
voices in memory. There are no audio files, music or ambient loops. Each component limits
concurrent voices (six) and destroys them on completion or EndPlay. Every voice reports the
envelope the audio mixer actually rendered; `StartedCues`/`RenderedCues` record each cue for
validation. Sparks use eight pooled instances, stop ticking when finished, render amber (the
material carries the instanced-mesh flag; without it Unreal fell back to grey) and are
suppressed by reduced motion. No camera shake is added. The HUD text sits on translucent
backing so it stays legible over the white knights and the sand.

## Validation

Run `apps/unreal/Content/Python/validate_animation_preview.py` with Play stopped and a practice
map open. It sends real key events through the player controller's input stack
(`SimulatePracticeKey`), runs four PIE sessions and writes `Saved/animation-validation.json`.
While it runs it relaxes two editor preferences in memory, background audio and background CPU
throttling, because an unfocused editor mutes audio and ticks at about 3 fps. It restores both
afterwards and never writes them to config. Result on 2026-11-19: **59/59 passed.**

- **Chest:** E opens once; 25 E presses during and after opening are ignored; reveal is
  requested on time once; reveal sparks play; the lid rests at −104° roll; the slot is written;
  a state correction does not repeat the reveal.
- **Exchange:**
  - F starts one attack; 24 F/click presses and a weapon switch during the action are ignored.
  - Contact is requested once, the partner confirms a hit (100→75), the sword clip moves the
    hand and sparks appear.
  - The partner turns upright and counters; the facing sword guard parries.
  - A strike between guards is cancelled before contact.
  - Revolver (−50) and fist (−10) contacts land; the partner recovers in place after defeat.
- **Weapons and options:** 1/2/3 switch weapons and visibility. M reaches every character and
  chest, and no partner sparks appear. M off restores them.
- **Movement:** W walks at 400 cm/s with leg motion; Shift runs above 700 cm/s. An attack while
  moving keeps the character moving; releasing W stops.
- **Sound:** chest latch/creak/reveal, player swing/shot/impact/parry and partner swing/impact
  were started and rendered by the mixer (envelope peaks 0.016–0.02).
- **Restart:** a second Play restores the open chest with no new reveal and ignores E; ending
  Play mid-attack leaves no contact; the open state survives a third Play; R closes the chest,
  deletes only the practice slot and restores health; a fourth Play offers a fresh chest.
- `Automation RunTests Catan.Animation`: MarkerOnce and Cancellation pass.

The visual review used PIE viewport screenshots of:
- the chest latch, lift, reveal and settled lid;
- sword wind-up, contact and follow-through;
- the partner's counter, the guard parry and revolver recoil;
- the reduced-motion HUD.

Additional side-view captures checked facing, grips (hilt locked in the gauntlet throughout) and
hinge clearance. The review led to the wider camera offset and the HUD backing above.

Performance: `apps/unreal/Content/Python/measure_animation_performance.py` profiles the open map
in PIE (3 s warm-up, 6 s CsvProfiler). Runs alternated between the source island (walker at the
spawn) and the practice map (strike every 0.7 s, partner counters, chest opening). All
measurements are on the RTX 4050 laptop in the editor viewport:

| Map | Frame mean / p95 (ms) | Game thread mean / p95 (ms) | GPU mean / p95 (ms) |
|---|---|---|---|
| Source island, run 1 | 16.75 / 16.69 | 6.72 / 9.11 | 9.42 / 9.87 |
| Practice exchange, run 1 | 16.84 / 16.70 | 7.87 / 9.16 | 10.06 / 10.76 |
| Practice exchange, run 2 | 16.67 / 16.67 | 6.10 / 7.53 | 9.42 / 10.06 |
| Source island, run 2 | 16.69 / 16.67 | 5.03 / 5.62 | 8.99 / 9.29 |

Both maps hold the editor's 60 fps cap. The exchange costs roughly +0.4–0.7 ms GPU and about
+1 ms game thread on average, within the spread between runs. These are editor measurements
(they include editor overhead), not a packaged-build budget.

`pnpm unreal:test` and `pnpm verify` remain the export and browser regression checks; passing
them alone does not establish that the native plugin compiles or that the scene works.

## Known limits

The knights are untinted (the browser's seat colours are not applied natively), there is no
lock-on camera, and the partner is a scripted sparring target rather than AI. The performance
figures come from the editor, not a packaged build.
