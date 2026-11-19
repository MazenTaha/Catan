"""Persist Nanite/instancing usage on original island materials after shader setup."""
from pathlib import Path
import json
import unreal

assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
updated = []
for path in assets.list_assets('/Game/CatanNight', recursive=True):
    if '/Materials/' not in path:
        continue
    material = assets.load_asset(path)
    if isinstance(material, unreal.Material):
        material.set_editor_property('used_with_nanite', True)
        material.set_editor_property('used_with_instanced_static_meshes', True)
        unreal.MaterialEditingLibrary.recompile_material(material)
        assets.save_loaded_asset(material, only_if_is_dirty=False)
        updated.append(material.get_path_name())
report = {'materials': updated, 'nanite_usage_saved': True}
Path(unreal.Paths.project_saved_dir(), 'material-setup.json').write_text(json.dumps(report, indent=2))
unreal.log(f'CATAN MATERIAL SETUP COMPLETE: {len(updated)} materials')
