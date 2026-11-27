"""Exercise the native practice island in Play-In-Editor with real key input.

Run with Play stopped and an Island_Animations_* map open. Four PIE sessions check the chest,
combat exchange, guard/cancel rules, weapons, effects, reduced motion, movement, mixer-rendered
synthesized cues, chest persistence across a restart and the R reset. Only the isolated practice
slot is touched; normal saves and the source island are not. Two editor preferences (background
audio and background CPU throttling) are relaxed in memory while it runs and restored afterwards;
they are never written to config. Writes Saved/animation-validation.json.
"""
from pathlib import Path
import json
import time
import unreal

levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
if levels.is_in_play_in_editor(): raise RuntimeError('Stop Play before running native animation validation.')
MAP = editor.get_editor_world().get_name()
if not MAP.startswith('Island_Animations_'): raise RuntimeError('Open an Island_Animations_* practice map first; the source island is never validated with practice actors.')
SAVED = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()))
SLOT = 'CatanNight_AnimationPractice_v1'
V = unreal.Vector
S = {'session': 0, 'step': 0, 't0': None, 'phase': 'begin', 'wall': time.monotonic(), 'checks': [],
     'frames': {'idle': [], 'exchange': []}, 'samples': {}, 'handle': None}
# Unfocused, the editor mutes audio and ticks at a few frames per second. Relax both for this run only.
PREFS = [(unreal.find_object(None, '/Script/UnrealEd.Default__LevelEditorMiscSettings'), 'bAllowBackgroundAudio', True),
         (unreal.find_object(None, '/Script/UnrealEd.Default__EditorPerformanceSettings'), 'bThrottleCPUWhenNotForeground', False)]
RESTORE = [(o, n, o.get_editor_property(n)) for o, n, _ in PREFS]
# NEVER skips PostEditChange, which would SaveConfig the preference into the user's settings file.
QUIET = unreal.PropertyAccessChangeNotifyMode.NEVER
for o, n, v in PREFS: o.set_editor_property(n, v, QUIET)


def check(name, passed, details=None):
    S['checks'].append({'session': S['session'] + 1, 'name': name, 'passed': bool(passed), 'details': details})
    if not passed: unreal.log_warning('CATAN VALIDATION FAILED: %s %s' % (name, details))


def key(name):
    k = unreal.Key(); k.set_editor_property('key_name', name); return k


def tap(actor, name, hold=False):
    """Press (and release unless held) through the controller's real input stack."""
    ok = actor.simulate_practice_key(key(name), True)
    if not hold: actor.simulate_practice_key(key(name), False)
    return ok


def actors(world):
    player = unreal.GameplayStatics.get_player_pawn(world, 0)
    partner = next(p for p in unreal.GameplayStatics.get_all_actors_of_class(world, unreal.CatanPracticeCharacter) if p != player)
    return player, partner, unreal.GameplayStatics.get_all_actors_of_class(world, unreal.CatanAnimatedChest)[0]


def local(player, bone):
    return player.mesh.get_socket_transform(bone, unreal.RelativeTransformSpace.RTS_COMPONENT).translation



# Keys go through the controller's input stack and take effect on the next frame, so each
# step taps keys and a later step checks the result.
# ---------------------------------------------------------------- session 1: the full exchange
def s1_start(w, p, q, c):
    p.reset_practice()
    check('practice slot cleared by reset', not unreal.GameplayStatics.does_save_game_exist(SLOT, 0))
    check('isolated practice HUD active', isinstance(unreal.GameplayStatics.get_player_controller(w, 0).get_hud(), unreal.CatanPracticeHUD))


def s1_ground(w, p, q, c):
    check('native character grounded', not p.character_movement.is_falling())
    check('knight skeletal mesh and clips loaded', p.mesh.skeletal_mesh_asset is not None and len(p.library.clips) == 11, len(p.library.clips))
    check('weapons follow the knight leader pose', all(m.get_editor_property('leader_pose_component') == p.mesh for m in [p.sword_mesh, p.gun_mesh, p.shield_mesh]))
    check('chest is within interaction range', p.nearby_chest == c)


def s1_chest(w, p, q, c):
    for _ in range(13): tap(p, 'E')


def s1_chest_started(w, p, q, c):
    check('E starts the chest opening once', c.opening and c.reveal_requests == 0)
    for _ in range(12): tap(p, 'E')


def s1_chest_reveal(w, p, q, c):
    check('reveal requested on time despite E spam', c.opening and c.reveal_requests == 1, int(c.reveal_requests))
    check('reveal sparks play at the reveal', c.reveal_bits.is_visible())


def s1_chest_done(w, p, q, c):
    check('chest finishes open with one reveal request', c.opened and not c.opening and c.reveal_requests == 1, int(c.reveal_requests))
    roll = c.lid_pivot.get_editor_property('relative_rotation').roll
    check('lid rests open on its rear hinge', -110 < roll < -95, roll)
    check('practice reveal persisted in the isolated slot', unreal.GameplayStatics.does_save_game_exist(SLOT, 0))
    tap(p, 'E')


def s1_chest_locked(w, p, q, c):
    check('open chest cannot restart', c.opened and not c.opening and c.reveal_requests == 1)
    c.set_confirmed_open(True)
    check('state correction does not repeat the reveal', c.reveal_requests == 1)
    S['samples']['hand0'] = local(p, 'HandR'); S['samples']['hand_max'] = 0
    tap(p, 'Two'); tap(p, 'F')


def s1_sword_spam(w, p, q, c):
    check('2 selects sword and shield', p.combat.weapon == unreal.CatanWeapon.SWORD and p.sword_mesh.is_visible() and p.shield_mesh.is_visible())
    S['samples']['count'] = p.combat.attack_count
    check('F starts one attack', p.combat.attack_count == 1, int(p.combat.attack_count))
    for _ in range(12): tap(p, 'F'); tap(p, 'LeftMouseButton')
    tap(p, 'One')


def s1_track_hand(w, p, q, c):
    if 'hand0' in S['samples']:
        S['samples']['hand_max'] = max(S['samples']['hand_max'], (local(p, 'HandR') - S['samples']['hand0']).length())
        S['samples']['sparks'] = S['samples'].get('sparks', False) or q.impact_bits.is_visible()


def s1_contact(w, p, q, c):
    check('attack spam during an action is ignored', p.combat.attack_count == S['samples']['count'], int(p.combat.attack_count))
    check('weapon change waits for recovery', p.combat.weapon == unreal.CatanWeapon.SWORD)
    check('sword contact requested once', p.combat.contact_count == 1, int(p.combat.contact_count))
    check('partner confirmed one practice hit', q.confirmed_practice_hits == 1 and q.practice_health == 75, [int(q.confirmed_practice_hits), int(q.practice_health)])
    check('imported sword clip moves the hand', S['samples']['hand_max'] > 15, S['samples']['hand_max'])
    check('impact sparks appear on a confirmed hit', S['samples'].get('sparks'))


def s1_counter(w, p, q, c):
    check('partner returns a confirmed attack', p.confirmed_practice_hits == 1 and p.practice_health == 75, [int(p.confirmed_practice_hits), int(p.practice_health)])
    rot = q.get_actor_rotation()
    check('partner stays upright while turning', abs(rot.pitch) < 1 and abs(rot.roll) < 1, [rot.pitch, rot.roll])
    tap(p, 'RightMouseButton', hold=True)


def s1_guard_up(w, p, q, c):
    check('right mouse raises the guard', p.combat.guarding)
    q.combat.attack()


def s1_parry(w, p, q, c):
    check('facing sword guard parries', p.practice_parries == 1 and p.practice_health == 75, [int(p.practice_parries), int(p.practice_health)])
    S['samples']['before'] = (p.combat.attack_count, p.combat.contact_count)
    # Release, strike and guard again in one frame: the guard must cancel the fresh contact.
    p.simulate_practice_key(key('RightMouseButton'), False); tap(p, 'F'); tap(p, 'RightMouseButton', hold=True)


def s1_guard_started(w, p, q, c):
    check('strike between guards starts an attack', p.combat.attack_count == S['samples']['before'][0] + 1 and p.combat.guarding)


def s1_guard_cancel(w, p, q, c):
    check('guard cancels the pending contact', p.combat.contact_count == S['samples']['before'][1], int(p.combat.contact_count))
    p.simulate_practice_key(key('RightMouseButton'), False)


def s1_retired_weapon(w, p, q, c):
    check('releasing right mouse lowers the guard', not p.combat.guarding)
    S['samples']['health'] = q.practice_health
    tap(p, 'Three')


def s1_retired_weapon_check(w, p, q, c):
    check('3 cannot select equipment', p.combat.weapon == unreal.CatanWeapon.SWORD and not p.gun_mesh.is_visible())
    check('removed ranged equipment cannot damage the partner', q.practice_health == S['samples']['health'])


def s1_fist(w, p, q, c):
    S['samples']['health'] = q.practice_health
    tap(p, 'One'); tap(p, 'F')


def s1_fist_hit(w, p, q, c):
    check('1 selects fists', p.combat.weapon == unreal.CatanWeapon.FIST and not p.gun_mesh.is_visible() and not p.sword_mesh.is_visible())
    check('fist jab contact', q.practice_health == max(0, S['samples']['health'] - 10), [int(S['samples']['health']), int(q.practice_health)])


def s1_reduced(w, p, q, c):
    S['samples']['reduced_health'] = q.practice_health
    tap(p, 'M'); tap(p, 'Two'); tap(p, 'F')


def s1_reduced_check(w, p, q, c):
    check('M reaches every native component', p.combat.reduced_motion and c.reduced_motion)
    check('reduced-motion sword still deals damage', q.practice_health == max(0, S['samples']['reduced_health'] - 25), int(q.practice_health))
    check('reduced motion draws no impact sparks', not q.impact_bits.is_visible())


def s1_recovered(w, p, q, c):
    check('defeated partner recovers in place', q.practice_health == 100, int(q.practice_health))
    tap(p, 'M')
    unreal.GameplayStatics.get_player_controller(w, 0).set_control_rotation(unreal.Rotator(roll=0, pitch=0, yaw=90))
    S['samples']['walk0'] = p.get_actor_location(); S['samples']['foot'] = []; S['samples']['speed'] = 0
    tap(p, 'W', hold=True)


def s1_track_walk(w, p, q, c):
    if 'walk0' in S['samples']:
        S['samples']['foot'].append(local(p, 'FootL').z)
        S['samples']['speed'] = max(S['samples']['speed'], p.get_velocity().length())


def s1_run(w, p, q, c):
    check('M toggles reduced motion off again', not p.combat.reduced_motion and not c.reduced_motion)
    d = (p.get_actor_location() - S['samples']['walk0']).length()
    check('W walks with native movement', d > 250 and S['samples']['speed'] < 450, [d, S['samples']['speed']])
    foot = S['samples']['foot']
    check('walk clip moves the legs', max(foot) - min(foot) > 4, max(foot) - min(foot))
    S['samples']['speed'] = 0
    tap(p, 'LeftShift', hold=True)


def s1_run_check(w, p, q, c):
    check('Shift runs', S['samples']['speed'] > 700, S['samples']['speed'])
    p.simulate_practice_key(key('LeftShift'), False)
    S['samples']['count'] = p.combat.attack_count
    tap(p, 'F')


def s1_attack_moving(w, p, q, c):
    check('attacks while moving keep movement responsive', p.combat.attack_count == S['samples']['count'] + 1 and p.get_velocity().length() > 300, p.get_velocity().length())
    p.simulate_practice_key(key('W'), False)


def s1_end(w, p, q, c):
    check('releasing W stops the character', p.get_velocity().length() < 20, p.get_velocity().length())
    # Each voice reports the envelope the audio mixer actually rendered; a cue counts once audible.
    for owner, label, kinds in [(c, 'chest', ['Latch', 'ChestCreak', 'Reveal']), (p, 'player', ['Swing', 'Shot', 'Impact', 'Parry']), (q, 'partner', ['Swing', 'Impact'])]:
        sound = owner.get_component_by_class(unreal.CatanInteractionSound)
        started, rendered = [str(k) for k in sound.started_cues], [str(k) for k in sound.rendered_cues]
        for kind in kinds:
            check('%s %s cue synthesized and rendered' % (label, kind), kind in started and kind in rendered,
                  {'started': started.count(kind), 'rendered': rendered.count(kind), 'peak': round(sound.peak_envelope, 3)})


# ---------------------------------------------------------------- session 2: restart restores, exit cancels
def s2_restore(w, p, q, c):
    check('restart restores the open chest without a new reveal', c.opened and not c.opening and c.reveal_requests == 0)
    tap(p, 'E'); tap(p, 'F')


def s2_exit(w, p, q, c):
    check('restored chest ignores E', c.opened and not c.opening and c.reveal_requests == 0)
    check('Play ends mid-attack, before contact', p.combat.attack_count == 1 and p.combat.contact_count == 0)


# ---------------------------------------------------------------- session 3: R resets only practice state
def s3_reset(w, p, q, c):
    check('open state persisted to a second restart', c.opened)
    tap(p, 'R')


def s3_check(w, p, q, c):
    check('R closes the practice chest and deletes only its slot', not c.opened and c.reveal_requests == 0 and not unreal.GameplayStatics.does_save_game_exist(SLOT, 0))
    check('R restores practice health', p.practice_health == 100 and q.practice_health == 100 and p.confirmed_practice_hits == 0)


# ---------------------------------------------------------------- session 4: fresh attempt after reset
def s4_fresh(w, p, q, c):
    check('after reset a restart offers a fresh chest', not c.opened and not c.opening)


SESSIONS = [
    [(.3, s1_start), (1.0, s1_ground), (1.2, s1_chest), (1.35, s1_chest_started), (1.95, s1_chest_reveal), (3.8, s1_chest_done),
     (3.95, s1_chest_locked), (4.05, s1_sword_spam), ('track', 3.96, 4.6, s1_track_hand), (4.6, s1_contact), (5.6, s1_counter),
     (5.75, s1_guard_up), (6.4, s1_parry), (6.5, s1_guard_started), (7.1, s1_guard_cancel), (7.8, s1_retired_weapon),
     (8.0, s1_retired_weapon_check), (8.8, s1_fist), (9.2, s1_fist_hit), (10.0, s1_reduced), (10.4, s1_reduced_check),
     (12.2, s1_recovered), ('track', 12.3, 13.4, s1_track_walk), (13.4, s1_run), ('track', 13.45, 14.6, s1_track_walk),
     (14.6, s1_run_check), (14.85, s1_attack_moving), (16.0, s1_end)],
    [(1.0, s2_restore), (1.1, s2_exit)],
    [(1.0, s3_reset), (1.2, s3_check)],
    [(1.0, s4_fresh)],
]


def finish(error=None):
    unreal.unregister_slate_post_tick_callback(S['handle'])
    if levels.is_in_play_in_editor(): levels.editor_request_end_play()
    for o, n, v in RESTORE: o.set_editor_property(n, v, QUIET)
    report = {'map': MAP, 'engine': unreal.SystemLibrary.get_engine_version(), 'error': error, 'checks': S['checks'],
              'scope': 'standalone native animation practice; no inventory, rewards, board rules or online authority'}
    report['passed'] = error is None and bool(S['checks']) and all(c['passed'] for c in S['checks'])
    report['frame_ms'] = {}
    for name, frames in S['frames'].items():
        if frames:
            ordered = sorted(frames)
            report['frame_ms'][name] = {'samples': len(frames), 'mean': round(sum(frames) / len(frames), 2), 'p95': round(ordered[int((len(ordered) - 1) * .95)], 2)}
    (SAVED / 'animation-validation.json').write_text(json.dumps(report, indent=2))
    unreal.log('CATAN NATIVE ANIMATION VALIDATION: %s (%d/%d)' % (report['passed'], sum(c['passed'] for c in S['checks']), len(S['checks'])))


def tick(delta):
    try:
        if time.monotonic() - S['wall'] > 300: return finish('PIE validation timed out')
        if S['phase'] == 'begin':
            S.update(phase='wait', t0=None, step=0); levels.editor_request_begin_play(); return
        if S['phase'] == 'ending':
            if not levels.is_in_play_in_editor() and editor.get_game_world() is None:
                S['session'] += 1
                if S['session'] >= len(SESSIONS): return finish()
                S['phase'] = 'begin'
            return
        world = editor.get_game_world()
        if world is None: return
        player = unreal.GameplayStatics.get_player_pawn(world, 0)
        if not isinstance(player, unreal.CatanPracticeCharacter): return
        now = unreal.GameplayStatics.get_time_seconds(world)
        if S['t0'] is None: S['t0'] = now
        t = now - S['t0']
        if S['session'] == 0:
            S['frames']['idle' if t < 1.2 else 'exchange'].append(unreal.GameplayStatics.get_world_delta_seconds(world) * 1000)
        p, q, c = actors(world)
        steps = SESSIONS[S['session']]
        timed = [s for s in steps if s[0] != 'track']
        while S['step'] < len(timed) and t >= timed[S['step']][0]:
            timed[S['step']][1](world, p, q, c); S['step'] += 1
        for item in steps:
            if item[0] == 'track' and item[1] <= t < item[2]: item[3](world, p, q, c)
        if S['step'] >= len(timed):
            S['phase'] = 'ending'; levels.editor_request_end_play()
    except Exception as error:
        import traceback
        unreal.log_error(traceback.format_exc()); finish(str(error))


S['handle'] = unreal.register_slate_post_tick_callback(tick)
