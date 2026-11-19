"""Run in Unreal's editor, after pnpm unreal:export. Never replaces an edited map."""

from datetime import datetime
from pathlib import Path
import json
import runpy

import unreal


def build_island():
    version = unreal.SystemLibrary.get_engine_version().split("-", 1)[0].split(".")
    if tuple(map(int, version[:2])) < (5, 8):
        raise RuntimeError("This prototype requires Unreal Engine 5.8 or newer.")
    project = Path(unreal.Paths.project_dir()).resolve()
    source = project / "SourceArt" / "Generated" / "island.glb"
    metadata = source.with_suffix(".json")
    if not source.is_file() or not metadata.is_file():
        raise RuntimeError("Run pnpm unreal:export in the repository before building the island.")
    if not hasattr(unreal, "InterchangeManager"):
        raise RuntimeError("Enable Unreal's Interchange Editor plugin, restart, and run again.")

    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

    # new_level closes the current world. Do not discard any unsaved level or asset edits.
    if not unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True, True):
        raise RuntimeError("Save was cancelled. The current level was left open.")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    destination = f"/Game/CatanNight/Imports/Island_{stamp}"
    map_path = f"/Game/CatanNight/Maps/Island_{stamp}"
    assets.make_directory("/Game/CatanNight/Maps")
    if not levels.new_level(map_path):
        raise RuntimeError(f"Could not create {map_path}")

    manager = unreal.InterchangeManager.get_interchange_manager_scripted()
    parameters = unreal.ImportAssetParameters()
    parameters.is_automated = True
    parameters.replace_existing = False
    source_data = unreal.InterchangeManager.create_source_data(str(source))
    if not manager.import_scene(destination, source_data, parameters):
        raise RuntimeError("Scene import failed. See Output Log > Interchange for details.")
    imported = actors.get_all_level_actors()
    meshes = [actor for actor in imported if actor.get_components_by_class(unreal.StaticMeshComponent)]
    if not meshes:
        raise RuntimeError("Interchange created no mesh actors. Check that glTF scene import is enabled.")

    def spawn(actor_class, name, location=(0, 0, 0), rotation=(0, 0, 0)):
        actor = actors.spawn_actor_from_class(
            actor_class, unreal.Vector(*location), unreal.Rotator(*rotation)
        )
        if not actor:
            raise RuntimeError(f"Could not create {name}")
        actor.set_actor_label(name)
        actor.set_folder_path("Lighting and cameras")
        return actor

    for actor in meshes:
        actor.set_folder_path("Island source")
        actor.tags = list(actor.tags) + ["CatanNightPrototype"]
    spawn(unreal.SkyAtmosphere, "Sky atmosphere")
    sun = spawn(unreal.DirectionalLight, "Warm afternoon sun", rotation=(-32, -38, 0))
    light = sun.get_component_by_class(unreal.DirectionalLightComponent)
    light.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    light.set_editor_property("atmosphere_sun_light", True)
    light.set_editor_property("intensity", 6.0)
    light.set_editor_property("light_color", unreal.Color(255, 234, 209, 255))
    sky = spawn(unreal.SkyLight, "Cool sky fill")
    sky_light = sky.get_component_by_class(unreal.SkyLightComponent)
    sky_light.set_editor_property("mobility", unreal.ComponentMobility.MOVABLE)
    sky_light.set_editor_property("real_time_capture", True)
    spawn(unreal.ExponentialHeightFog, "Coastal atmosphere")
    spawn(unreal.PlayerStart, "Flythrough start", location=(0, -6500, 1400), rotation=(0, 90, 0))
    spawn(unreal.CameraActor, "Island overview", location=(11000, -13000, 10000), rotation=(-33, 130, 0))
    # UE 5.8's glTF material misses ground vertex paint; use a native material and aim
    # from imported bounds instead of relying on positional Euler-angle conversion.
    runpy.run_path(str(Path(__file__).with_name("inspect_island.py")), run_name="__main__")
    runpy.run_path(str(Path(__file__).with_name("populate_world.py")), run_name="__main__")
    runpy.run_path(str(Path(__file__).with_name("import_concept_references.py")), run_name="__main__")
    runpy.run_path(str(Path(__file__).with_name("finalize_world.py")), run_name="__main__")
    runpy.run_path(str(Path(__file__).with_name("save_material_usage.py")), run_name="__main__")
    if not assets.save_directory(destination, only_if_is_dirty=False, recursive=True):
        raise RuntimeError("Some imported assets could not be saved. Check Output Log.")
    if not levels.save_current_level():
        raise RuntimeError("Could not save the generated level.")
    engine_ini = project / "Config" / "DefaultEngine.ini"
    config = engine_ini.read_text(encoding="utf-8")
    if "EditorStartupMap=" not in config:
        section = "[/Script/EngineSettings.GameMapsSettings]"
        if section not in config:
            raise RuntimeError("DefaultEngine.ini is missing the map settings section.")
        engine_ini.write_text(
            config.replace(section, f"{section}\nEditorStartupMap={map_path}", 1),
            encoding="utf-8",
        )
    info = json.loads(metadata.read_text(encoding="utf-8"))
    report = {
        "map": map_path,
        "engine": unreal.SystemLibrary.get_engine_version(),
        "source_seed": info["seed"],
        "mesh_actors": sum(bool(actor.get_components_by_class(unreal.StaticMeshComponent)) for actor in actors.get_all_level_actors()),
        "status": "imported and saved; inspect the rendered scene before editing",
    }
    report_path = project / "Saved" / "island-import.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    unreal.log(f"Catan Night: island ready for inspection at {map_path}. Save As to keep your design.")


if __name__ == "__main__":
    build_island()
