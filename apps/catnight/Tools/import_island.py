"""Import original Blender furnishings and ground detail without replacing existing artwork."""
from pathlib import Path
import json
import runpy
import unreal

project=Path(unreal.Paths.project_dir()).resolve()
helpers=runpy.run_path(str(project/'Tools/import_models.py'),run_name='catnight_material_helpers')
assets=unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
tools=unreal.AssetToolsHelpers.get_asset_tools()
mel=unreal.MaterialEditingLibrary
root='/Game/Generated/Island'
assets.make_directory(root)
task=unreal.AssetImportTask()
task.filename=str(project/'SourceArt/Island/island.glb')
task.destination_path=root+'/Meshes'
task.automated=True; task.save=True; task.replace_existing=True
tools.import_asset_tasks([task])
base=unreal.load_asset('/Game/Generated/Materials/M_Model')
assert base, 'Import the original board artwork first'
meshes={}
for path in assets.list_assets(root+'/Meshes',recursive=True,include_folder=False):
    if '/island/StaticMeshes/' not in path: continue
    data=assets.find_asset_data(path)
    if str(data.asset_class_path.asset_name)!='StaticMesh': continue
    mesh=unreal.load_asset(path)
    name=str(data.asset_name).removeprefix('SM_')
    # Keep Interchange's stable import paths so repeated imports replace the same assets.
    target=path.split('.')[0]
    for i,slot in enumerate(mesh.static_materials):
        mi=tools.create_asset('MI_'+name+'_'+str(i),root+'/Materials',unreal.MaterialInstanceConstant,unreal.MaterialInstanceConstantFactoryNew()) if not assets.does_asset_exist(root+'/Materials/MI_'+name+'_'+str(i)) else unreal.load_asset(root+'/Materials/MI_'+name+'_'+str(i))
        mel.set_material_instance_parent(mi,base)
        mesh.set_material(i,mi)
        assets.save_loaded_asset(mi)
    assets.save_loaded_asset(mesh)
    meshes[name]=target
assert len(meshes)==6, f'Expected six furnishings, found {meshes}'
task=unreal.AssetImportTask(); task.filename=str(project/'SourceArt/Island/ground.png')
task.destination_path=root; task.destination_name='T_Ground'; task.automated=True; task.save=True; task.replace_existing=True
tools.import_asset_tasks([task])
ground=unreal.load_asset(root+'/M_Ground')
if not ground: ground=tools.create_asset('M_Ground',root,unreal.Material,unreal.MaterialFactoryNew())
mel.delete_all_material_expressions(ground)
vc=mel.create_material_expression(ground,unreal.MaterialExpressionVertexColor,-500,0)
# The same turf texture twice: tufts and mottling every 7 m, broad patches every 64 m
# (a shorter repeat shows as diagonal bands from a distance).
fine_uv=mel.create_material_expression(ground,unreal.MaterialExpressionTextureCoordinate,-1100,200)
fine_uv.set_editor_property('u_tiling',1.0); fine_uv.set_editor_property('v_tiling',1.0)
broad_uv=mel.create_material_expression(ground,unreal.MaterialExpressionTextureCoordinate,-1100,400)
broad_uv.set_editor_property('u_tiling',.11); broad_uv.set_editor_property('v_tiling',.11)
tex=mel.create_material_expression(ground,unreal.MaterialExpressionTextureSample,-850,200)
tex.texture=unreal.load_asset(root+'/T_Ground')
broad=mel.create_material_expression(ground,unreal.MaterialExpressionTextureSample,-850,400)
broad.texture=tex.texture
assert mel.connect_material_expressions(fine_uv,'',tex,'UVs'), 'Ground fine UVs are not connected'
assert mel.connect_material_expressions(broad_uv,'',broad,'UVs'), 'Ground broad UVs are not connected'
both=mel.create_material_expression(ground,unreal.MaterialExpressionMultiply,-600,300)
assert mel.connect_material_expressions(tex,'RGB',both,'A'), 'Ground detail is not connected'
assert mel.connect_material_expressions(broad,'R',both,'B'), 'Ground mottling is not connected'
# Two samples averaging about 0.93 each: lift back to the painted vertex colour's brightness.
lift=mel.create_material_expression(ground,unreal.MaterialExpressionMultiply,-400,300)
lift.set_editor_property('const_b',1.16)
assert mel.connect_material_expressions(both,'',lift,'A'), 'Ground lift is not connected'
mult=mel.create_material_expression(ground,unreal.MaterialExpressionMultiply,-200,0)
assert mel.connect_material_expressions(vc,'',mult,'A'), 'Ground vertex colours are not connected'
assert mel.connect_material_expressions(lift,'',mult,'B'), 'Ground detail is not connected'
assert mel.connect_material_property(mult,'',unreal.MaterialProperty.MP_BASE_COLOR)
rough=helpers['scalar'](ground,'Roughness',.93,-200,200)
assert mel.connect_material_property(rough,'',unreal.MaterialProperty.MP_ROUGHNESS)
ground.set_editor_property('two_sided',True)
mel.recompile_material(ground); assets.save_loaded_asset(ground)

# The island's own sea: translucent, so the sand shows through the shallows and the colour
# deepens with the water under each pixel (DepthFade), with foam where it meets the shore.
# The board keeps its opaque M_Water.
sea=unreal.load_asset(root+'/M_IslandSea')
if not sea: sea=tools.create_asset('M_IslandSea',root,unreal.Material,unreal.MaterialFactoryNew())
mel.delete_all_material_expressions(sea)
sea.set_editor_property('blend_mode',unreal.BlendMode.BLEND_TRANSLUCENT)
sea.set_editor_property('translucency_lighting_mode',unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
# One 100 km plane has four vertices: per-vertex fog (the translucent default) would fog every
# pixel as if it were 50 km away, turning the whole sea grey.
sea.set_editor_property('compute_fog_per_pixel',True)
def node(cls,x,y,**props):
    e=mel.create_material_expression(sea,cls,x,y)
    for k,v in props.items(): e.set_editor_property(k,v)
    return e
def link(a,b,pin,out=''):
    assert mel.connect_material_expressions(a,out,b,pin), f'Sea graph: {pin} is not connected'
def blend(a,b,alpha,x,y):
    e=node(unreal.MaterialExpressionLinearInterpolate,x,y); link(a,e,'A'); link(b,e,'B'); link(alpha,e,'Alpha'); return e
near=node(unreal.MaterialExpressionDepthFade,-1100,-300,fade_distance_default=90.0)
mid=node(unreal.MaterialExpressionDepthFade,-1100,0,fade_distance_default=900.0)
deep=node(unreal.MaterialExpressionDepthFade,-1100,300,fade_distance_default=2600.0)
shallow=helpers['vector'](sea,'Shallow',(0.07,0.42,0.40,1),-900,-700)
middle=helpers['vector'](sea,'Middle',(0.018,0.23,0.34,1),-900,-550)
far=helpers['vector'](sea,'Deep',(0.008,0.085,0.21,1),-900,-400)
white=helpers['vector'](sea,'Foam',(0.86,0.91,0.91,1),-900,-250)
foam=node(unreal.MaterialExpressionOneMinus,-800,-300); link(near,foam,'')
colour=blend(blend(shallow,middle,mid,-600,-600),far,deep,-400,-500)
colour=blend(colour,white,foam,-200,-400)
assert mel.connect_material_property(colour,'',unreal.MaterialProperty.MP_BASE_COLOR)
clear=node(unreal.MaterialExpressionConstant,-600,100,r=0.45)
solid=node(unreal.MaterialExpressionConstant,-600,200,r=0.94)
opacity=node(unreal.MaterialExpressionMax,-200,100); link(blend(clear,solid,mid,-400,100),opacity,'A'); link(foam,opacity,'B')
assert mel.connect_material_property(opacity,'',unreal.MaterialProperty.MP_OPACITY)
assert mel.connect_material_property(helpers['scalar'](sea,'Roughness',.05,-200,300),'',unreal.MaterialProperty.MP_ROUGHNESS)
assert mel.connect_material_property(helpers['scalar'](sea,'Specular',.5,-200,400),'',unreal.MaterialProperty.MP_SPECULAR)
mel.recompile_material(sea); assets.save_loaded_asset(sea)
assets.save_directory(root+'/Meshes',only_if_is_dirty=False,recursive=True)
assets.save_directory(root+'/Materials',only_if_is_dirty=False,recursive=True)
review=root+'/Review/IslandPreview'
if not assets.does_asset_exist(review) or '-CatnightRefreshIslandPreview' in unreal.SystemLibrary.get_command_line():
    world=unreal.EditorLoadingAndSavingUtils.new_blank_map(False)
    actor=unreal.get_editor_subsystem(unreal.EditorActorSubsystem).spawn_actor_from_class(unreal.CatnightIsland,unreal.Vector())
    assert actor, 'Could not create the editable island preview'
    assert unreal.EditorLoadingAndSavingUtils.save_map(world,review), 'Could not save the island preview map'
(project/'Saved/island-import.json').write_text(json.dumps(meshes,indent=2))
unreal.log('ISLAND IMPORT PASSED: six furnishings and ground detail')
