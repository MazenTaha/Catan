"""Original inexpensive cloud sky for the native island (run by import_island)."""
import unreal
assets=unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
tools=unreal.AssetToolsHelpers.get_asset_tools()
mel=unreal.MaterialEditingLibrary
root='/Game/Generated/Island'


def custom(mat,code,bindings):
    e=mel.create_material_expression(mat,unreal.MaterialExpressionCustom,-300,500)
    e.set_editor_property('output_type',unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    e.set_editor_property('code',code)
    e.set_editor_property('inputs',[helpers['custom_input'](n) for n in bindings])
    for name,node in bindings.items(): assert mel.connect_material_expressions(node,'',e,name),name
    return e


# Plant wind lives in import_island's M_IslandCover / M_IslandCoverMasked, together with the
# distance shrink and foliage shading, so every plant has one material.

path=root+'/M_LivingSky'
sky=unreal.load_asset(path)
if not sky: sky=tools.create_asset('M_LivingSky',root,unreal.Material,unreal.MaterialFactoryNew())
mel.delete_all_material_expressions(sky)
sky.set_editor_property('shading_model',unreal.MaterialShadingModel.MSM_UNLIT)
sky.set_editor_property('two_sided',True)
sky.set_editor_property('is_sky',True)
ray=mel.create_material_expression(sky,unreal.MaterialExpressionCameraVectorWS,-900,0)
time=mel.create_material_expression(sky,unreal.MaterialExpressionTime,-900,150)
cloud=custom(sky,"""
float3 r=-normalize(D); float h=saturate(r.z);
float3 color=lerp(float3(.48,.68,.86),float3(.055,.25,.65),pow(h,.55));
float2 q=r.xy/(.3+max(0,r.z))*1.15+float2(T*.006,T*.002);
float n=0,amp=.55;
for(int o=0;o<4;o++) {
 float2 i=floor(q),f=frac(q); f=f*f*(3-2*f);
 float a=frac(sin(dot(i,float2(127.1,311.7)))*43758.5453);
 float b=frac(sin(dot(i+float2(1,0),float2(127.1,311.7)))*43758.5453);
 float c=frac(sin(dot(i+float2(0,1),float2(127.1,311.7)))*43758.5453);
 float d=frac(sin(dot(i+1,float2(127.1,311.7)))*43758.5453);
 n+=lerp(lerp(a,b,f.x),lerp(c,d,f.x),f.y)*amp; q=q*2.03+7.1; amp*=.5;
}
float clouds=smoothstep(.51,.72,n)*smoothstep(.03,.20,h);
return lerp(color,float3(.97,.955,.91),clouds*.9)*8000;
""",{'D':ray,'T':time})
assert mel.connect_material_property(cloud,'',unreal.MaterialProperty.MP_EMISSIVE_COLOR)
mel.recompile_material(sky); assets.save_loaded_asset(sky)
unreal.log('LIVING WORLD MATERIALS PASSED: drifting clouds')
