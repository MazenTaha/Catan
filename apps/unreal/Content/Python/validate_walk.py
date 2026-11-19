"""PIE smoke test: settle and walk on each of the nineteen biome surfaces."""
import json
import math
import time
from pathlib import Path
import unreal

project = Path(unreal.Paths.project_dir()).resolve()
info = json.loads((project / 'SourceArt/Generated/island.json').read_text())
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
map_name = editor.get_editor_world().get_name()
if levels.is_in_play_in_editor():
    raise RuntimeError('Stop the current play session before running walking validation.')
state = {'index': 0, 'phase': 'starting', 'since': time.monotonic(), 'results': [], 'pawn': None}

def finish(error=None):
    unreal.unregister_slate_post_tick_callback(state['handle'])
    levels.editor_request_end_play()
    report = {'map': map_name, 'results': state['results'], 'error': error}
    report['passed'] = error is None and len(report['results']) == 19 and all(r['passed'] for r in report['results'])
    (project / 'Saved/walk-validation.json').write_text(json.dumps(report, indent=2))
    unreal.log('CATAN WALK VALIDATION: ' + str(report['passed']))

def tick(delta):
    try:
        now = time.monotonic()
        world = editor.get_game_world()
        if state['phase'] == 'starting':
            if now - state['since'] > 45:
                finish('Timed out starting PIE'); return
            if world is None:
                return
            pawn = unreal.GameplayStatics.get_player_pawn(world, 0)
            if pawn is None:
                return
            state['pawn'] = pawn
            state['phase'] = 'teleport'
        pawn = state['pawn']
        movement = pawn.get_component_by_class(unreal.CharacterMovementComponent)
        if state['phase'] == 'teleport':
            probe = info['walkProbes'][state['index']]
            x, y, z = probe['position']
            pawn.set_actor_location(unreal.Vector(x * 100, z * 100, y * 100 + 180), False, True)
            movement.stop_movement_immediately()
            state['since'] = now
            state['phase'] = 'settle'
        elif state['phase'] == 'settle' and now - state['since'] > 1.5:
            state['start'] = pawn.get_actor_location()
            state['grounded'] = not movement.is_falling()
            state['since'] = now
            state['phase'] = 'walk'
        elif state['phase'] == 'walk':
            pawn.add_movement_input(unreal.Vector(1, 0, 0), 1.0, True)
            if now - state['since'] > 1.5:
                end = pawn.get_actor_location()
                start = state['start']
                distance = math.hypot(end.x - start.x, end.y - start.y)
                passed = state['grounded'] and not movement.is_falling() and distance > 100
                state['results'].append({'hex': info['walkProbes'][state['index']]['hex'],
                    'terrain': info['walkProbes'][state['index']]['terrain'], 'grounded': state['grounded'],
                    'falling_after_walk': movement.is_falling(), 'distance_cm': distance,
                    'height_change_cm': end.z - start.z, 'passed': passed})
                state['index'] += 1
                if state['index'] == len(info['walkProbes']):
                    finish(); return
                state['phase'] = 'teleport'
    except Exception as error:
        finish(str(error))
        unreal.log_error(str(error))

state['handle'] = unreal.register_slate_post_tick_callback(tick)
levels.editor_request_begin_play()
