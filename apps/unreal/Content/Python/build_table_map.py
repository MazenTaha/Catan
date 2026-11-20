"""Creates /Game/CatanNight/Maps/Table, the map the packaged app opens: an empty world whose game
mode (ACatanTableGameMode) fills the viewport with the full web game. Run with Play stopped and
no unsaved edits; it leaves your island untouched and reopens the map that was open before.
"""
import gc
import unreal

MAP = '/Game/CatanNight/Maps/Table'
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
assets = unreal.EditorAssetLibrary

if levels.is_in_play_in_editor():
    raise RuntimeError('Stop Play first.')
dirty = [p.get_name() for p in unreal.EditorLoadingAndSavingUtils.get_dirty_map_packages()]
if dirty:
    raise RuntimeError('Save or discard your map edits first: %s' % dirty)

world = editor.get_editor_world()
previous = world.get_path_name().split('.')[0]
del world
gc.collect()  # a held world reference across a map switch trips Unreal's leaked-world check

if not assets.does_asset_exist(MAP):
    if not levels.new_level(MAP):
        raise RuntimeError('Could not create %s' % MAP)
elif not levels.load_level(MAP):
    raise RuntimeError('Could not open %s' % MAP)

world = editor.get_editor_world()
settings = world.get_world_settings()
settings.set_editor_property('default_game_mode', unreal.CatanTableGameMode.static_class())
del settings, world
gc.collect()
if not levels.save_current_level():
    raise RuntimeError('Could not save %s' % MAP)
unreal.log('CATAN TABLE MAP saved %s' % MAP)

if previous != MAP:
    levels.load_level(previous)
