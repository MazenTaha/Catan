"""Import the owner's pictures as reference textures and label matching native mesh assets."""
import json
from pathlib import Path
import unreal

project = Path(unreal.Paths.project_dir()).resolve()
repo = project.parents[1]
manifest = json.loads((repo / 'assets/concepts/manifest.json').read_text(encoding='utf-8'))
assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
tasks = []
for sheet in manifest['sheets']:
    name = f'Sheet_{sheet["sheet"]:02d}_{sheet["id"]}'
    path = '/Game/CatanNight/References/' + name
    if not assets.does_asset_exist(path):
        task = unreal.AssetImportTask()
        task.filename = str(repo / sheet['path'])
        task.destination_path = '/Game/CatanNight/References'
        task.destination_name = name
        task.automated = True
        task.save = True
        task.replace_existing = False
        tasks.append(task)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
mesh_assets = [assets.load_asset(path) for path in assets.list_assets('/Game/CatanNight/Imports', recursive=True)
               if '/StaticMeshes/' in path]
for sheet in manifest['sheets']:
    for model in sheet['models']:
        expected = model.replace('/', '_')
        for mesh in mesh_assets:
            if isinstance(mesh, unreal.StaticMesh) and (mesh.get_name() == expected or mesh.get_name().startswith(expected + '_')):
                assets.set_metadata_tag(mesh, 'CatanConcept', sheet['title'])
                assets.set_metadata_tag(mesh, 'CatanConceptSource', sheet['path'])
                assets.save_loaded_asset(mesh)
unreal.log(f'Catan Night concept references: {len(manifest["sheets"])} sheets available under /Game/CatanNight/References.')
