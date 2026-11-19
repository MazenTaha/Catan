"""Build editable native foliage, collision and a walking pawn from the large-world export."""
import json
import math
from pathlib import Path
import unreal


project = Path(unreal.Paths.project_dir()).resolve()
info = json.loads((project / 'SourceArt/Generated/island.json').read_text(encoding='utf-8'))
if info.get('version', 1) >= 2:
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    imported = actors.get_all_level_actors()
    if any('CatanFoliage' in [str(tag) for tag in actor.tags] for actor in imported):
        raise RuntimeError('This world is already populated. Build a fresh map to regenerate it.')
    depot_position = info['depot']
    depot = unreal.Transform(location=unreal.Vector(depot_position[0] * 100, depot_position[2] * 100, depot_position[1] * 100))
    foliage_folder = '/Game/CatanNight/Foliage/' + world.get_name()
    assets.make_directory(foliage_folder)
    collision_meshes = set()
    foliage_types = []
    counts = {}

    def collision(mesh):
        if mesh.get_path_name().startswith('/Engine/'):
            return
        if mesh.get_path_name() not in collision_meshes:
            body = mesh.get_editor_property('body_setup')
            if body is None:
                raise RuntimeError(f'No physics body for {mesh.get_name()}')
            body.set_editor_property('collision_trace_flag', unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
            collision_meshes.add(mesh.get_path_name())

    def add_foliage(name, mesh, transforms, mode, distance, overrides=None):
        foliage = tools.create_asset(name, foliage_folder, unreal.FoliageType_InstancedStaticMesh,
                                     unreal.FoliageType_InstancedStaticMeshFactory())
        if foliage is None:
            raise RuntimeError(f'Cannot create foliage type {name}')
        foliage.set_editor_property('mesh', mesh)
        foliage.set_editor_property('cull_distance', unreal.Int32Interval(int(distance * 75), int(distance * 100)))
        foliage.set_editor_property('enable_density_scaling', mode == 'none')
        body = foliage.get_editor_property('body_instance')
        body.set_editor_property('collision_profile_name', 'BlockAll' if mode == 'mesh' else 'NoCollision')
        foliage.set_editor_property('body_instance', body)
        if overrides:
            foliage.set_editor_property('override_materials', overrides)
        if mode == 'mesh':
            collision(mesh)
        unreal.InstancedFoliageActor.add_instances(world, foliage, transforms)
        foliage_types.append(foliage)
        return foliage

    trunks = []
    for group in info['instanceGroups']:
        parts = [component for actor in imported if actor.get_actor_label() == group['prototype'] or actor.get_actor_label().startswith(group['prototype'] + '_')
                 for component in actor.get_components_by_class(unreal.StaticMeshComponent)]
        if not parts:
            raise RuntimeError(f'Missing model exemplar {group["model"]}')
        root_transforms = []
        for item in group['instances']:
            x, y, z = item['position']
            size = item['scale']
            root_transforms.append(unreal.Transform(
                location=unreal.Vector(x * 100, z * 100, y * 100),
                rotation=unreal.Rotator(yaw=-math.degrees(item['yaw'])),
                scale=unreal.Vector(size, size, size)))
            if group['collision'] == 'trunk':
                trunks.append(unreal.Transform(location=unreal.Vector(x * 100, z * 100, y * 100 + 115),
                                              scale=unreal.Vector(0.6 * size, 0.6 * size, 2.3)))
        for index, part in enumerate(parts):
            relative = unreal.MathLibrary.make_relative_transform(part.get_world_transform(), depot)
            transforms = [unreal.MathLibrary.compose_transforms(relative, root) for root in root_transforms]
            name = 'FT_' + group['model'].replace('/', '_') + f'_{index}'
            add_foliage(name, part.static_mesh, transforms,
                        group['collision'], group['cullDistance'],
                        [part.get_material(i) for i in range(part.get_num_materials())])
        counts[group['model']] = len(root_transforms)
    cylinder = assets.load_asset('/Engine/BasicShapes/Cylinder')
    add_foliage('FT_TreeTrunkCollision', cylinder, trunks, 'mesh', 350)
    for actor in actors.get_all_level_actors():
        if isinstance(actor, unreal.InstancedFoliageActor):
            actor.tags = list(actor.tags) + ['CatanFoliage']
            actor.set_folder_path('Biomes / Instanced foliage')
            for component in actor.get_components_by_class(unreal.FoliageInstancedStaticMeshComponent):
                if component.static_mesh == cylinder:
                    component.set_visibility(False)
                    component.set_hidden_in_game(True)
    for actor in imported:
        label = actor.get_actor_label()
        if label.startswith('Depot_'):
            actors.destroy_actor(actor)
            continue
        for component in actor.get_components_by_class(unreal.StaticMeshComponent):
            if label.startswith('Sea_'):
                component.set_collision_profile_name('NoCollision')
            else:
                collision(component.static_mesh)
                component.set_collision_profile_name('BlockAll')
    for mesh_path in collision_meshes:
        # Basic engine collision shapes are already cooked and are never edited/saved.
        if mesh_path.startswith('/Game/'):
            assets.save_loaded_asset(assets.load_asset(mesh_path))
    for foliage in foliage_types:
        assets.save_loaded_asset(foliage)

    # Native movement graphs come from the installed template; no mannequin art is copied.
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    registry.scan_paths_synchronous(['/Game/ThirdPerson', '/Game/Input'], force_rescan=True)
    walker_bp = assets.load_asset('/Game/ThirdPerson/Blueprints/BP_ThirdPersonCharacter')
    controller_bp = assets.load_asset('/Game/ThirdPerson/Blueprints/BP_ThirdPersonPlayerController')
    if walker_bp is None or controller_bp is None:
        raise RuntimeError('Run assets/concepts/prepare.py for this project to install the movement graphs first.')
    walker_class = walker_bp.generated_class()
    default_walker = unreal.get_default_object(walker_class)
    for component in default_walker.get_components_by_class(unreal.SkeletalMeshComponent):
        component.set_skeletal_mesh_asset(None)
        component.set_anim_instance_class(None)
    unreal.BlueprintEditorLibrary.compile_blueprint(walker_bp)
    assets.save_loaded_asset(walker_bp)
    factory = unreal.BlueprintFactory()
    factory.set_editor_property('parent_class', unreal.GameModeBase)
    game_mode = assets.load_asset('/Game/CatanNight/BP_IslandWalkGameMode') if assets.does_asset_exist('/Game/CatanNight/BP_IslandWalkGameMode') else tools.create_asset('BP_IslandWalkGameMode', '/Game/CatanNight', unreal.Blueprint, factory)
    defaults = unreal.get_default_object(game_mode.generated_class())
    defaults.set_editor_property('default_pawn_class', None)
    defaults.set_editor_property('player_controller_class', controller_bp.generated_class())
    unreal.BlueprintEditorLibrary.compile_blueprint(game_mode)
    assets.save_loaded_asset(game_mode)
    world.get_world_settings().set_editor_property('default_game_mode', game_mode.generated_class())
    input_settings = unreal.get_default_object(unreal.InputSettings)
    input_settings.set_editor_property('default_player_input_class', unreal.EnhancedPlayerInput)
    input_settings.set_editor_property('default_input_component_class', unreal.EnhancedInputComponent)
    x, y, z = info['spawn']
    walker = actors.spawn_actor_from_class(walker_class, unreal.Vector(x * 100, z * 100, y * 100 + 110))
    walker.set_actor_label('Island walker — WASD, mouse, Space')
    walker.tags = ['CatanWalker']
    walker.set_folder_path('Player')
    walker.set_editor_property('auto_possess_player', unreal.AutoReceiveInput.PLAYER0)
    for component in walker.get_components_by_class(unreal.SkeletalMeshComponent):
        component.set_skeletal_mesh_asset(None)
        component.set_anim_instance_class(None)
        component.set_visibility(False)
        component.set_hidden_in_game(True)
    for component in walker.get_components_by_class(unreal.SpringArmComponent):
        component.set_editor_property('target_arm_length', 0.0)
        component.set_relative_location(unreal.Vector(0, 0, 74), False, False)
    movement = walker.get_component_by_class(unreal.CharacterMovementComponent)
    movement.set_editor_property('max_walk_speed', 400.0)
    movement.set_editor_property('max_step_height', 45.0)
    movement.set_editor_property('walkable_floor_angle', 48.0)
    input_ini = project / 'Config/DefaultInput.ini'
    if not input_ini.exists():
        input_ini.write_text('[/Script/Engine.InputSettings]\nDefaultPlayerInputClass=/Script/EnhancedInput.EnhancedPlayerInput\nDefaultInputComponentClass=/Script/EnhancedInput.EnhancedInputComponent\nbCaptureMouseOnLaunch=True\n', encoding='utf-8')
    report = {
        'hex_radius_m': info['hexRadius'], 'horizontal_scale': info['horizontalScale'],
        'biome_instances': sum(counts.values()), 'instance_models': len(counts),
        'trunk_colliders': len(trunks), 'foliage_types': len(foliage_types),
        'walking_pawn': walker.get_path_name(), 'walking_speed_m_s': 4,
        'collision_meshes': len(collision_meshes), 'instances_by_model': counts,
    }
    (project / 'Saved/world-population.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    unreal.log(f'Catan Night world: {sum(counts.values())} instances, {len(trunks)} tree colliders, native walking pawn ready.')
