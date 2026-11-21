"""Import the reproducible Blender heroes, skeletal rigs and baked clips into native Unreal."""
from pathlib import Path
import json
import unreal

ROOT='/Game/Generated/Heroes'
project=Path(unreal.Paths.project_dir())
source=project/'SourceArt/Heroes'
manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
assets=unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
tools=unreal.AssetToolsHelpers.get_asset_tools()
mel=unreal.MaterialEditingLibrary
if assets.does_directory_exist(ROOT): assets.delete_directory(ROOT)
assets.make_directory(ROOT)
base=tools.create_asset('M_Hero',ROOT,unreal.Material,unreal.MaterialFactoryNew())
base.set_editor_property('used_with_skeletal_mesh',True)
base.set_editor_property('two_sided',True)
vc=mel.create_material_expression(base,unreal.MaterialExpressionVertexColor,-600,0)
mel.connect_material_property(vc,'',unreal.MaterialProperty.MP_BASE_COLOR)
for name,prop,value,y in [('Roughness',unreal.MaterialProperty.MP_ROUGHNESS,.7,200),('Metallic',unreal.MaterialProperty.MP_METALLIC,0,300)]:
    p=mel.create_material_expression(base,unreal.MaterialExpressionScalarParameter,-600,y)
    p.set_editor_property('parameter_name',name); p.set_editor_property('default_value',value)
    mel.connect_material_property(p,'',prop)
mel.recompile_material(base)


def task(path,name,options):
    t=unreal.AssetImportTask()
    t.filename=str(path); t.destination_path=ROOT; t.destination_name=name
    t.automated=True; t.replace_existing=True; t.save=True
    t.factory=unreal.FbxFactory(); t.options=options
    tools.import_asset_tasks([t])
    return t.get_objects()


for family,info in manifest['models'].items():
    ui=unreal.FbxImportUI()
    ui.set_editor_property('automated_import_should_detect_type',False)
    ui.set_editor_property('mesh_type_to_import',unreal.FBXImportType.FBXIT_SKELETAL_MESH)
    ui.set_editor_property('import_as_skeletal',True)
    ui.set_editor_property('import_mesh',True)
    ui.set_editor_property('import_animations',False)
    ui.set_editor_property('import_materials',False)
    ui.set_editor_property('import_textures',False)
    ui.set_editor_property('create_physics_asset',False)
    data=ui.skeletal_mesh_import_data
    data.set_editor_property('vertex_color_import_option',unreal.VertexColorImportOption.REPLACE)
    data.set_editor_property('use_t0_as_ref_pose',False)
    data.set_editor_property('convert_scene_unit',True)
    objs=task(source/(family+'.fbx'),'SK_'+family,ui)
    mesh=next((o for o in objs if isinstance(o,unreal.SkeletalMesh)),None)
    if not mesh: raise RuntimeError(f'No skeletal mesh for {family}: {objs}')
    if mesh.get_name()!='SK_'+family:
        assets.rename_asset(mesh.get_path_name(),ROOT+'/SK_'+family)
    slots=mesh.get_editor_property('materials')
    for i,slot in enumerate(slots):
        name=str(slot.material_slot_name)
        mi=tools.create_asset('MI_'+family+'_'+str(i),ROOT,unreal.MaterialInstanceConstant,unreal.MaterialInstanceConstantFactoryNew())
        mel.set_material_instance_parent(mi,base)
        mel.set_material_instance_scalar_parameter_value(mi,'Roughness',.50 if 'Steel' in name else .92 if 'Cloth' in name or 'Owner' in name else .68)
        mel.set_material_instance_scalar_parameter_value(mi,'Metallic',.7 if 'Steel' in name else 0)
        slot.set_editor_property('material_interface',mi)
        slots[i]=slot
    mesh.set_editor_property('materials',slots)
    skeleton=mesh.get_editor_property('skeleton')
    for mode in info['clips']:
        options=unreal.FbxImportUI()
        options.set_editor_property('automated_import_should_detect_type',False)
        options.set_editor_property('mesh_type_to_import',unreal.FBXImportType.FBXIT_ANIMATION)
        options.set_editor_property('import_as_skeletal',True)
        options.set_editor_property('import_mesh',False)
        options.set_editor_property('import_animations',True)
        options.set_editor_property('skeleton',skeleton)
        options.anim_sequence_import_data.set_editor_property('convert_scene_unit',True)
        options.anim_sequence_import_data.set_editor_property('use_default_sample_rate',False)
        options.anim_sequence_import_data.set_editor_property('custom_sample_rate',60)
        options.anim_sequence_import_data.set_editor_property('import_bone_tracks',True)
        clips=task(source/(family+'_'+mode+'.fbx'),'A_'+family+'_'+mode,options)
        seq=next((o for o in clips if isinstance(o,unreal.AnimSequence)),None)
        if not seq: raise RuntimeError(f'No animation {family}/{mode}')
        desired=ROOT+'/A_'+family+'_'+mode
        if seq.get_path_name().split('.')[0]!=desired: assets.rename_asset(seq.get_path_name(),desired)
        seq.set_editor_property('enable_root_motion',False)
        unreal.log('HERO IMPORT clip '+seq.get_path_name())
    assets.save_loaded_asset(mesh)
    unreal.log(f'HERO IMPORT {family}: {len(info["clips"])} clips, {info["triangles"]} triangles')
assets.save_directory(ROOT,only_if_is_dirty=False,recursive=True)
unreal.log('HERO IMPORT COMPLETE')
