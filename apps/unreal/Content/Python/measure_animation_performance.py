"""Short comparable frame-cost capture for the open map (run with Play stopped).

Starts Play, waits 3 s, records 6 s with Unreal's CSV profiler and stops. On a practice map the
player strikes every 0.7 s, the partner counters and the chest opens during the capture; on the
source island the walker stands at the same spawn. Results go to
Saved/animation-performance-<map>.json. Background CPU throttling is relaxed in memory for the run
and restored afterwards; no config, map or save is written.
"""
from pathlib import Path
import csv
import json
import time
import unreal

levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
if levels.is_in_play_in_editor(): raise RuntimeError('Stop Play before measuring.')
MAP = editor.get_editor_world().get_name()
SAVED = Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_saved_dir()))
CSV_DIR = SAVED / 'Profiling' / 'CSV'
PERF = unreal.find_object(None, '/Script/UnrealEd.Default__EditorPerformanceSettings')
THROTTLE = PERF.get_editor_property('bThrottleCPUWhenNotForeground')
# NEVER skips PostEditChange, so the preference is not saved to the user's settings file.
PERF.set_editor_property('bThrottleCPUWhenNotForeground', False, unreal.PropertyAccessChangeNotifyMode.NEVER)
M = {'phase': 0, 't0': None, 'next': 0.0, 'handle': None, 'before': set(CSV_DIR.glob('*.csv')) if CSV_DIR.exists() else set(), 'wall': time.monotonic()}


def stats(values):
    ordered = sorted(values)
    return {'mean': round(sum(values) / len(values), 2), 'p95': round(ordered[int((len(ordered) - 1) * .95)], 2), 'max': round(ordered[-1], 2)}


def finish(error=None):
    unreal.unregister_slate_post_tick_callback(M['handle'])
    PERF.set_editor_property('bThrottleCPUWhenNotForeground', THROTTLE, unreal.PropertyAccessChangeNotifyMode.NEVER)
    if levels.is_in_play_in_editor(): levels.editor_request_end_play()
    report = {'map': MAP, 'error': error, 'engine': unreal.SystemLibrary.get_engine_version(),
              'method': 'PIE in the editor viewport, 3 s warm-up then 6 s CsvProfiler; times in ms'}
    created = sorted(set(CSV_DIR.glob('*.csv')) - M['before']) if CSV_DIR.exists() else []
    if created and error is None:
        rows = list(csv.reader(open(created[-1], newline='')))
        head = rows[0]
        # Frame rows carry numeric stats (column 0 is EVENTS); the repeated header and metadata rows do not.
        def numeric(v):
            try: float(v); return True
            except ValueError: return False
        frames = [r for r in rows[1:] if len(r) >= len(head) and numeric(r[1])]
        for name in ['FrameTime', 'GameThreadTime', 'GPUTime']:  # editor PIE leaves the render-thread column empty
            if name in head:
                i = head.index(name)
                values = [float(r[i]) for r in frames if len(r) > i and r[i]]
                if values: report[name] = stats(values)
        report['frames'] = len(frames); report['csv'] = created[-1].name
    elif error is None:
        report['error'] = 'CsvProfiler wrote no file'
    (SAVED / ('animation-performance-%s.json' % MAP)).write_text(json.dumps(report, indent=2))
    unreal.log('CATAN ANIMATION PERFORMANCE %s: %s' % (MAP, json.dumps(report)))


def tick(delta):
    try:
        if time.monotonic() - M['wall'] > 120: return finish('timed out')
        world = editor.get_game_world()
        if world is None: return
        pawn = unreal.GameplayStatics.get_player_pawn(world, 0)
        if pawn is None: return
        now = unreal.GameplayStatics.get_time_seconds(world)
        if M['t0'] is None: M['t0'] = now
        t = now - M['t0']
        practice = isinstance(pawn, unreal.CatanPracticeCharacter)
        if M['phase'] == 0 and t > 3:
            if practice:
                pawn.reset_practice()
                unreal.GameplayStatics.get_all_actors_of_class(world, unreal.CatanAnimatedChest)[0].open()
            unreal.SystemLibrary.execute_console_command(world, 'csvprofile start')
            M.update(phase=1, next=t)
        elif M['phase'] == 1:
            if practice and t >= M['next']:
                pawn.strike(); M['next'] = t + .7
            if t > 9:
                unreal.SystemLibrary.execute_console_command(world, 'csvprofile stop')
                M.update(phase=2, stop=time.monotonic())
        elif M['phase'] == 2:
            # The profiler writes asynchronously; parse only once its closing metadata row exists.
            created = sorted(set(CSV_DIR.glob('*.csv')) - M['before']) if CSV_DIR.exists() else []
            try: done = bool(created) and b'endtimestamp' in created[-1].read_bytes()
            except PermissionError: done = False  # still open for writing
            if done: finish()
            elif time.monotonic() - M['stop'] > 30: finish('CsvProfiler file incomplete')
    except Exception as error:
        import traceback
        unreal.log_error(traceback.format_exc()); finish(str(error))


M['handle'] = unreal.register_slate_post_tick_callback(tick)
levels.editor_request_begin_play()
