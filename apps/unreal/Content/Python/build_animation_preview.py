"""Import original FBX clips and create a playable native animation island without changing the source map."""
from datetime import datetime
from pathlib import Path
import json
import unreal

ROOT=Path(__file__).resolve().parents[4]
SOURCE=ROOT/'apps/unreal/SourceArt/Animation'
DEST='/Game/CatanNight/Animation'
assets=unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
actors=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
levels=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
if levels.is_in_play_in_editor(): raise RuntimeError('Stop Play before building the native animation preview.')
if not hasattr(unreal,'CatanPracticeCharacter'): raise RuntimeError('Compile and enable the CatanAnimation runtime plugin, then restart Unreal.')
# Never save the user's open map implicitly: its edits stay theirs to save or discard.
if unreal.EditorLoadingAndSavingUtils.get_dirty_map_packages(): raise RuntimeError('Save or discard changes to the open map first; it was left untouched.')
if not unreal.EditorLoadingAndSavingUtils.save_dirty_packages(False,True): raise RuntimeError('Save cancelled; current world preserved.')
world=unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
unreal.SystemLibrary.execute_console_command(world,'Interchange.FeatureFlags.Import.FBX 0')
tools=unreal.AssetToolsHelpers.get_asset_tools()
assets.make_directory(DEST)

def import_fbx(name,kind,skeleton=None):
    existing=DEST+'/'+name
    # Reuse only a complete earlier import: correct unit scale and a saved skeleton.
    if assets.does_asset_exist(existing):
        cached=assets.load_asset(existing)
        if kind=='static' and cached.get_bounds().box_extent.length()>5: return cached
        if kind!='static' and cached.get_editor_property('skeleton') is not None and assets.does_asset_exist(cached.get_editor_property('skeleton').get_path_name().split('.')[0]):
            if kind=='animation' or cached.get_bounds().box_extent.z>50: return cached
    options=unreal.FbxImportUI()
    options.set_editor_property('automated_import_should_detect_type',False)
    options.set_editor_property('override_full_name',True)
    options.set_editor_property('import_materials',False)
    options.set_editor_property('import_textures',False)
    options.set_editor_property('import_mesh',kind!='animation')
    options.set_editor_property('import_as_skeletal',kind!='static')
    options.set_editor_property('import_animations',kind=='animation')
    options.set_editor_property('create_physics_asset',False)
    options.set_editor_property('mesh_type_to_import',unreal.FBXImportType.FBXIT_ANIMATION if kind=='animation' else unreal.FBXImportType.FBXIT_STATIC_MESH if kind=='static' else unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    if skeleton: options.set_editor_property('skeleton',skeleton)
    # Blender writes metres (UnitScaleFactor 100); convert once to Unreal centimetres.
    for data in ['static_mesh_import_data','skeletal_mesh_import_data','anim_sequence_import_data']:
        options.get_editor_property(data).set_editor_property('convert_scene_unit',True)
    if kind=='skeletal':
        data=options.get_editor_property('skeletal_mesh_import_data')
        data.set_editor_property('vertex_color_import_option',unreal.VertexColorImportOption.REPLACE)
        data.set_editor_property('import_meshes_in_bone_hierarchy',True)
    if kind=='static':
        data=options.get_editor_property('static_mesh_import_data')
        data.set_editor_property('combine_meshes',True)
        data.set_editor_property('vertex_color_import_option',unreal.VertexColorImportOption.REPLACE)
        data.set_editor_property('auto_generate_collision',True)
    task=unreal.AssetImportTask()
    task.filename=str(SOURCE/(name+'.fbx')); task.destination_path=DEST; task.destination_name=name
    task.automated=True; task.save=True; task.replace_existing=True; task.options=options
    tools.import_asset_tasks([task])
    imported=[assets.load_asset(p) for p in task.imported_object_paths]
    expected=unreal.AnimSequence if kind=='animation' else unreal.StaticMesh if kind=='static' else unreal.SkeletalMesh
    result=next((a for a in imported if isinstance(a,expected)),None)
    if result is None: raise RuntimeError(f'Could not import {name}: {task.imported_object_paths}')
    if kind!='static':
        imported_skeleton=result.get_editor_property('skeleton')
        if imported_skeleton is None: raise RuntimeError(f'{name} has no imported skeleton')
        assets.save_loaded_asset(imported_skeleton,only_if_is_dirty=False)
    return result

spec=json.loads((SOURCE/'animation-spec.json').read_text())
knight=import_fbx('Knight','skeletal')
skeleton=knight.get_editor_property('skeleton')
gear={name:import_fbx(name+'Rig','skeletal',skeleton) for name in ['Sword','Revolver','Shield']}
static={name:import_fbx('Chest_'+name,'static') for name in ['Body','Lid','Latch']}
clips={name:import_fbx(name,'animation',skeleton) for name in list(spec['clips'])+['Walk','Run']}
paint=assets.load_asset('/Game/CatanNight/Materials/M_TerrainVertexPaint')
paint.set_editor_property('used_with_skeletal_mesh',True)
unreal.MaterialEditingLibrary.recompile_material(paint)
assets.save_loaded_asset(paint)
for mesh in [knight,*gear.values()]:
    slots=list(mesh.get_editor_property('materials'))
    for slot in slots: slot.set_editor_property('material_interface',paint)
    mesh.set_editor_property('materials',slots); assets.save_loaded_asset(mesh)
for mesh in static.values():
    for i in range(mesh.get_num_sections(0)): mesh.set_material(i,paint)
    assets.save_loaded_asset(mesh)
particle_path=DEST+'/M_InteractionCue'
particle=assets.load_asset(particle_path) if assets.does_asset_exist(particle_path) else tools.create_asset('M_InteractionCue',DEST,unreal.Material,unreal.MaterialFactoryNew())
if not assets.does_asset_exist(particle_path) or not unreal.MaterialEditingLibrary.get_material_property_input_node(particle,unreal.MaterialProperty.MP_BASE_COLOR):
    color=unreal.MaterialEditingLibrary.create_material_expression(particle,unreal.MaterialExpressionConstant3Vector)
    color.set_editor_property('constant',unreal.LinearColor(1,.5,.12,1))
    unreal.MaterialEditingLibrary.connect_material_property(color,'',unreal.MaterialProperty.MP_BASE_COLOR)
    unreal.MaterialEditingLibrary.connect_material_property(color,'',unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    unreal.MaterialEditingLibrary.recompile_material(particle); assets.save_loaded_asset(particle)
# Sparks are instanced cubes; without this flag Unreal renders the default grey material in game.
if not particle.get_editor_property('used_with_instanced_static_meshes'):
    particle.set_editor_property('used_with_instanced_static_meshes',True)
    unreal.MaterialEditingLibrary.recompile_material(particle); assets.save_loaded_asset(particle)
factory=unreal.DataAssetFactory(); factory.set_editor_property('data_asset_class',unreal.CatanMotionLibrary)
lib=assets.load_asset(DEST+'/DA_Interactions') if assets.does_asset_exist(DEST+'/DA_Interactions') else tools.create_asset('DA_Interactions',DEST,unreal.CatanMotionLibrary,factory)
for prop,value in [('knight',knight),('sword',gear['Sword']),('revolver',gear['Revolver']),('shield',gear['Shield']),('chest_body',static['Body']),('chest_lid',static['Lid']),('chest_latch',static['Latch']),('particle_material',particle),('clips',clips),('chest_reveal',spec['chest']['reveal']),('chest_finish',spec['chest']['finish'])]: lib.set_editor_property(prop,value)
keys=[]
for key in spec['chest']['keys']:
    k=unreal.CatanChestKey(); k.time=key['time']; k.lid=key['lid']; k.latch=key['latch']; keys.append(k)
lib.set_editor_property('chest_keys',keys); assets.save_loaded_asset(lib)
unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True,True)

# Save As into a new map; keep the authored island and its former walking pawn untouched.
map_path='/Game/CatanNight/Maps/Island_Animations_'+datetime.now().strftime('%Y%m%d_%H%M%S')
original=world.get_path_name().split('.')[0]
import hashlib
source_file=Path(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir()))/(original.replace('/Game/','',1)+'.umap')
digest=lambda: hashlib.sha256(source_file.read_bytes()).hexdigest()
source_hash=digest()
if not unreal.EditorLoadingAndSavingUtils.save_map(world,map_path): raise RuntimeError('Could not Save As the island for the preview.')
# In UE 5.8 save_map writes a copy and leaves the source world open. Python must not keep that
# world alive across the switch (Unreal aborts on a leaked world), then the copy is opened.
del world
import gc; gc.collect()
if not levels.load_level(map_path): raise RuntimeError('Could not open the practice copy '+map_path)
world=unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
if world.get_path_name().split('.')[0]!=map_path: raise RuntimeError('Practice actors must never be added to the source island.')
for a in actors.get_all_level_actors():
    if 'CatanWalker' in [str(t) for t in a.tags]: actors.destroy_actor(a)
info=json.loads((Path(unreal.Paths.project_dir())/'SourceArt/Generated/island.json').read_text())
x,y,z=info['spawn']; floor=unreal.Vector(x*100,z*100,y*100)
def ground(offset,lift):
    # Snap each practice actor onto the island's collision instead of trusting one spawn height.
    at=floor+offset
    hit=unreal.SystemLibrary.line_trace_single(world,at+unreal.Vector(0,0,600),at-unreal.Vector(0,0,1200),unreal.TraceTypeQuery.ECC_VISIBILITY,False,[],unreal.DrawDebugTrace.NONE,True)
    point=hit.to_tuple()[5] if hit and hit.to_tuple()[0] else at
    return unreal.Vector(point.x,point.y,point.z+lift)
player=actors.spawn_actor_from_class(unreal.CatanPracticeCharacter,ground(unreal.Vector(0,0,0),92))
player.set_editor_property('library',lib); player.set_editor_property('auto_possess_player',unreal.AutoReceiveInput.PLAYER0)
player.set_actor_label('Practice player — WASD, F, E, right click'); player.tags=['CatanAnimationPractice']; player.refresh_preview()
partner=actors.spawn_actor_from_class(unreal.CatanPracticeCharacter,ground(unreal.Vector(205,0,0),92),unreal.Rotator(yaw=180))
partner.set_editor_property('library',lib); partner.set_editor_property('practice_partner',True)
partner.set_actor_label('Practice partner — confirmed hit and counter'); partner.tags=['CatanAnimationPractice']; partner.refresh_preview()
chest=actors.spawn_actor_from_class(unreal.CatanAnimatedChest,ground(unreal.Vector(40,-145,0),0))
chest.set_editor_property('library',lib); chest.set_editor_property('preview_persistence',True)
chest.set_actor_label('Hinged chest — E, one reveal request'); chest.tags=['CatanAnimationPractice']; chest.refresh_preview()
for a in [player,partner,chest]: a.set_folder_path('Animation practice')
factory=unreal.BlueprintFactory(); factory.set_editor_property('parent_class',unreal.GameModeBase)
mode_path=DEST+'/BP_AnimationPracticeMode'
mode=assets.load_asset(mode_path) if assets.does_asset_exist(mode_path) else tools.create_asset('BP_AnimationPracticeMode',DEST,unreal.Blueprint,factory)
default=unreal.get_default_object(mode.generated_class()); default.set_editor_property('default_pawn_class',None); default.set_editor_property('hud_class',unreal.CatanPracticeHUD)
unreal.BlueprintEditorLibrary.compile_blueprint(mode); assets.save_loaded_asset(mode,only_if_is_dirty=False)
world.get_world_settings().set_editor_property('default_game_mode',mode.generated_class())
if unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world().get_path_name().split('.')[0]!=map_path: raise RuntimeError('Refusing to save practice actors outside '+map_path)
unreal.EditorLoadingAndSavingUtils.save_dirty_packages(True,True); levels.save_current_level()
# The startup map and project settings stay on the authored island; open-island.ps1 -Practice opens this map.
report={'map':map_path,'source_map':original,'source_map_unchanged':digest()==source_hash,'clips':{k:v.get_path_name() for k,v in clips.items()},'player':player.get_path_name(),'partner':partner.get_path_name(),'chest':chest.get_path_name(),'scope':'standalone native animation practice; no board-game inventory or multiplayer rewards'}
(Path(unreal.Paths.project_saved_dir())/'animation-build.json').write_text(json.dumps(report,indent=2))
if not report['source_map_unchanged']: raise RuntimeError('The source island file changed; restore it before using the preview.')
unreal.log('CATAN NATIVE ANIMATION PREVIEW READY '+map_path)
