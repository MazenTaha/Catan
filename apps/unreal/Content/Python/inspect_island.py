"""Restore terrain vertex paint, frame the imported island, save, and report its bounds."""

import json
import re
from pathlib import Path
import unreal


actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
imported = [actor for actor in actors if "CatanNightPrototype" in [str(tag) for tag in actor.tags]]
terrain = [actor for actor in imported if re.fullmatch(r"Hex_\d+_(Forest|Hills|Pasture|Fields|Mountains|Desert)_(\d+|Robber)", actor.get_actor_label())]
if len(terrain) != 19:
    raise RuntimeError(f"Expected 19 island terrain actors, found {len(terrain)}. Open an imported island first.")
material_path = "/Game/CatanNight/Materials/M_TerrainVertexPaint"
material = assets.load_asset(material_path) if assets.does_asset_exist(material_path) else None
if material is None:
    assets.make_directory("/Game/CatanNight/Materials")
    material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        "M_TerrainVertexPaint", "/Game/CatanNight/Materials", unreal.Material, unreal.MaterialFactoryNew()
    )
    if material is None:
        raise RuntimeError("Could not create the native terrain material.")
    roughness = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionConstant)
    roughness.set_editor_property("r", 0.88)
    unreal.MaterialEditingLibrary.connect_material_property(roughness, "", unreal.MaterialProperty.MP_ROUGHNESS)
paint = next((expression for expression in unreal.MaterialEditingLibrary.get_material_expressions(material)
              if isinstance(expression, unreal.MaterialExpressionVertexColor)), None)
if paint is None:
    paint = unreal.MaterialEditingLibrary.create_material_expression(material, unreal.MaterialExpressionVertexColor)
if not unreal.MaterialEditingLibrary.connect_material_property(paint, "", unreal.MaterialProperty.MP_BASE_COLOR):
    raise RuntimeError("Could not connect the terrain vertex colour material.")
unreal.MaterialEditingLibrary.recompile_material(material)
material.set_editor_property('two_sided', True)
assets.save_loaded_asset(material)
grass_path = '/Game/CatanNight/Materials/M_GrassVertexPaint'
grass_material = assets.load_asset(grass_path) if assets.does_asset_exist(grass_path) else None
if grass_material is None:
    grass_material = unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        'M_GrassVertexPaint', '/Game/CatanNight/Materials', unreal.Material, unreal.MaterialFactoryNew())
    grass_material.set_editor_property('two_sided', True)
    vertex = unreal.MaterialEditingLibrary.create_material_expression(grass_material, unreal.MaterialExpressionVertexColor)
    tint = unreal.MaterialEditingLibrary.create_material_expression(grass_material, unreal.MaterialExpressionConstant3Vector)
    tint.set_editor_property('constant', unreal.LinearColor(0.12, 0.28, 0.025, 1))
    multiply = unreal.MaterialEditingLibrary.create_material_expression(grass_material, unreal.MaterialExpressionMultiply)
    unreal.MaterialEditingLibrary.connect_material_expressions(vertex, '', multiply, 'A')
    unreal.MaterialEditingLibrary.connect_material_expressions(tint, '', multiply, 'B')
    unreal.MaterialEditingLibrary.connect_material_property(multiply, '', unreal.MaterialProperty.MP_BASE_COLOR)
    unreal.MaterialEditingLibrary.recompile_material(grass_material)
    assets.save_loaded_asset(grass_material)
for actor in actors:
    if actor.get_actor_label() == "Warm afternoon sun":
        actor.get_component_by_class(unreal.DirectionalLightComponent).set_editor_property("intensity", 6.0)
for actor in terrain:
    for component in actor.get_components_by_class(unreal.StaticMeshComponent):
        component.set_material(0, material)
# The texture-free concept kit and painted props use the same native vertex-colour path.
painted_meshes = set()
for actor in actors:
    for component in actor.get_components_by_class(unreal.StaticMeshComponent):
        mesh = component.static_mesh
        if mesh is None:
            continue
        painted = mesh.get_name().startswith(('concept_kit_', 'props_'))
        grass = mesh.get_name() in ('flora_GrassA', 'flora_GrassB')
        changed = False
        for slot in range(component.get_num_materials()):
            source = component.get_material(slot)
            if painted or grass or (source and source.get_name().startswith('flora_Plant')):
                target = grass_material if grass else material
                component.set_material(slot, target)
                mesh.set_material(slot, target)
                changed = True
        if changed and mesh.get_path_name() not in painted_meshes:
            assets.save_loaded_asset(mesh, only_if_is_dirty=False)
            painted_meshes.add(mesh.get_path_name())
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
foliage_folder = '/Game/CatanNight/Foliage/' + world.get_name()
if assets.does_directory_exist(foliage_folder):
    for path in assets.list_assets(foliage_folder):
        foliage = assets.load_asset(path)
        if isinstance(foliage, unreal.FoliageType_InstancedStaticMesh):
            overrides = list(foliage.get_editor_property('override_materials'))
            grass = foliage.get_editor_property('mesh').get_name() in ('flora_GrassA', 'flora_GrassB')
            if grass or any(item and item.get_name().startswith('flora_Plant') for item in overrides):
                foliage.set_editor_property('override_materials', [grass_material if grass else material if item and item.get_name().startswith('flora_Plant') else item for item in overrides])
                assets.save_loaded_asset(foliage)
samples = []
low = [float("inf")] * 3
high = [float("-inf")] * 3
hidden = 0
for actor in imported:
    origin, extent = actor.get_actor_bounds(False)
    temporary_hidden = actor.is_temporarily_hidden_in_editor()
    hidden += int(temporary_hidden)
    if len(samples) < 12:
        samples.append({
            "label": actor.get_actor_label(),
            "location": list(actor.get_actor_location().to_tuple()),
            "bounds_origin": list(origin.to_tuple()),
            "bounds_extent": list(extent.to_tuple()),
            "temporary_hidden": temporary_hidden,
        })
    if actor in terrain:
        for axis, (center, size) in enumerate(zip(origin.to_tuple(), extent.to_tuple())):
            low[axis] = min(low[axis], center - size)
            high[axis] = max(high[axis], center + size)
camera = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
before_location, before_rotation = camera.get_level_viewport_camera_info()
if terrain:
    center = unreal.Vector(*[(a + b) / 2 for a, b in zip(low, high)])
    radius = max(high[0] - low[0], high[1] - low[1]) / 2
    location = center + unreal.Vector(radius, -radius * 1.25, radius * 0.95)
    rotation = unreal.MathLibrary.find_look_at_rotation(location, center)
    camera.set_level_viewport_camera_info(location, rotation)
    for actor in actors:
        if actor.get_actor_label() == "Island overview":
            actor.set_actor_location(location, False, False)
            actor.set_actor_rotation(rotation, False)
report = {
    "mesh_actors": len(imported), "terrain_actors": len(terrain),
    "temporarily_hidden": hidden,
    "terrain_bounds_min": low, "terrain_bounds_max": high,
    "previous_camera": {"location": list(before_location.to_tuple()), "rotation": list(before_rotation.to_tuple())},
    "samples": samples,
    "terrain_material": material.get_path_name(),
    "base_color_connected": unreal.MaterialEditingLibrary.get_material_property_input_node(
        material, unreal.MaterialProperty.MP_BASE_COLOR
    ) is not None,
}
path = Path(unreal.Paths.project_saved_dir()) / "island-inspection.json"
path.write_text(json.dumps(report, indent=2), encoding="utf-8")
if not unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level():
    raise RuntimeError("Could not save the finished island level.")
unreal.log(f"Catan Night inspection: {len(imported)} mesh actors, {hidden} hidden. Report: {path}")
