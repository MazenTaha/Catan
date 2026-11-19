# Native animation practice

Status on 2026-11-19: the editor and game targets compile and both native action-clock
automation tests pass. Live scene validation is pending. The first import completed but
map duplication caused an editor world-cleanup crash; the builder now uses Save As.
That corrected build workflow and the interactive preview still require an editor check.
Unvalidated native animation import output is excluded from this commit.

This work targets the Unreal app. The browser game remains the source of truth for
board rules, inventory, rewards, combat health and online authority. None of those
systems has been ported to Unreal. The native practice scene exercises reusable
presentation components and a clearly labelled standalone sparring partner.

## Build and authoring

The runtime plugin source is `apps/unreal/Plugins/CatanAnimation`. The project module
and editor/game targets live in `apps/unreal/Source`. Building requires the Unreal
5.8 Windows C++ toolchain: MSVC, Windows SDK and .NET Framework SDK. VS Code can be
used as the editor; the full Visual Studio IDE is unnecessary.

Original animation poses and equipment are authored by
`assets/blender/native_interactions.py`. Rebuild with:

```powershell
E:/Blender/blender.exe -b --python-exit-code 1 -P assets/blender/native_interactions.py
```

The editable result is `assets/blender/native_interactions.blend`. Exported FBX files
and timing metadata are in `apps/unreal/SourceArt/Animation`. The knight and equipment
share the original 17-bone bind skeleton. Clips contain in-place bone rotation;
character movement belongs to Unreal's controller, never to an animation root track.
Equipment uses the same leader pose as the knight rather than approximate runtime
socket offsets.

After compiling the runtime plugin and restarting Unreal, run
`apps/unreal/Content/Python/build_animation_preview.py` with Play stopped. It imports
the original meshes and clips, creates `DA_Interactions`, and duplicates the current
island into a timestamped `Island_Animations_*` map. The source island is preserved.
Always open the intended island before running this script.

## Controls and boundaries

Press Play, click the viewport, and use WASD/mouse to move/look. Shift runs; Space
jumps; F or left click attacks; right click guards. 1 selects sword/shield, 2 the
revolver, and 3 fists. E opens the nearby chest. R resets practice actors and the
practice chest save. M toggles reduced motion. Esc leaves Play.

The sparring partner uses standalone preview health and can counterattack. Its
health, attacks and resets do not change the browser game. No native multiplayer,
inventory, ammunition allocation or card rewards are introduced by the preview.

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

Repeated attack input during recovery is ignored. Weapon changes wait for recovery.
Guard cancels an unconsumed contact marker without resetting the recovery clock.
Movement stays responsive during actions. Contact is requested once when the clock
crosses the marker, including a frame that crosses the entire action. Reaction poses
start only on a confirmed practice hit or block. Ending Play cancels pending contact
and clears event delegates; no timer callback survives scene disposal.

The animation instance samples shared assets with independent per-character clocks.
Game-thread snapshots feed pose evaluation. Locomotion blends under upper-body attack,
guard and reaction layers; animation evaluation never changes gameplay state.

## Chest lifecycle and integration hooks

The chest has separate body, rear-hinged lid and moving latch meshes. The latch releases
before the weighted opening arc and small settling motion. Reveal is requested once at
0.64 s; the chest reaches its stable open state at 2.4 s. Additional E presses do not
restart an opening or open chest.

`ACatanAnimatedChest.OnRevealRequested` is a presentation request, not a reward grant.
Future native gameplay should validate and grant rewards in its authoritative system,
then call `SetConfirmedOpen` for initial state or corrections. `UCatanCombatPresentation`
similarly emits `OnContactRequested`; native gameplay must validate contact and call
`ConfirmHit` from a confirmed event. Mesh overlap and pose sampling never grant rewards
or apply board-game damage.

Only the practice chest enables preview persistence. It writes the isolated slot
`CatanNight_AnimationPractice_v1` when reveal is crossed. Leaving before reveal permits
a fresh attempt; leaving after reveal restores an open chest. R deletes only that slot.
Normal game saves, browser profiles and user settings are untouched.

## Feedback and checks

Short latch, creak, reveal, swing, gunshot, impact and parry cues are synthesized as
finite PCM voices in memory. There are no audio files, music or ambient loops. Each
component limits concurrent voices and destroys them on completion or EndPlay. Sparks
use eight pooled instances, stop ticking when finished, and are suppressed by reduced
motion. No camera shake is added.

The native automation tests are under `Catan.Animation` in Unreal's Automation window.
They cover contact once, input spam, large frame gaps, guard cancellation, recovery and
scene cancellation. Export checks and browser regression checks remain
`pnpm unreal:test` and `pnpm verify`. Passing browser checks alone does not establish
that the native plugin compiles or that the interactive scene has been validated.
