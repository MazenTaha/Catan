"""Finalize the current generated world after import or a resumed finishing pass."""
from pathlib import Path
import json
import re
import runpy
import unreal

project = Path(unreal.Paths.project_dir()).resolve()
assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
bp = assets.load_asset('/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter')
if bp:
    subsystem = unreal.get_engine_subsystem(unreal.SubobjectDataSubsystem)
    library = unreal.SubobjectDataBlueprintFunctionLibrary
    for handle in subsystem.k2_gather_subobject_data_for_blueprint(bp):
        component = library.get_object_for_blueprint(library.get_data(handle), bp)
        if isinstance(component, unreal.SkeletalMeshComponent):
            component.set_skeletal_mesh_asset(None)
            component.set_anim_instance_class(None)
    unreal.BlueprintEditorLibrary.compile_blueprint(bp)
    assets.save_loaded_asset(bp, only_if_is_dirty=False)
runpy.run_path(str(Path(__file__).with_name('inspect_island.py')), run_name='__main__')
unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True)
map_path = world.get_path_name().split('.')[0]
engine_ini = project / 'Config/DefaultEngine.ini'
config = engine_ini.read_text(encoding='utf-8')
if 'EditorStartupMap=' in config:
    config = re.sub(r'^EditorStartupMap=.*$', 'EditorStartupMap=' + map_path, config, flags=re.M)
else:
    config = config.replace('[/Script/EngineSettings.GameMapsSettings]', '[/Script/EngineSettings.GameMapsSettings]\nEditorStartupMap=' + map_path, 1)
engine_ini.write_text(config, encoding='utf-8')
report = {'map': map_path, 'engine': unreal.SystemLibrary.get_engine_version(),
    'status': 'saved large world; see world-population.json and walk-validation.json',
    'mesh_actors': sum(bool(a.get_components_by_class(unreal.StaticMeshComponent)) for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors())}
(project / 'Saved/island-import.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
unreal.log('CATAN WORLD FINALIZED ' + map_path)
