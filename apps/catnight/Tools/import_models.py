"""Imports the prepared models and makes the board's materials (run inside Unreal).

    UnrealEditor-Cmd.exe Catnight.uproject -run=pythonscript -script=<this file>

Reads SourceArt/Models/<family>.glb (from split_models.py) and writes everything under
/Game/Generated (git-ignored, rebuilt by `pnpm catnight:import`):
  /Game/Generated/Models/<family>/SM_<Model>   one static mesh per model
  /Game/Generated/Materials/M_Tint             Color, Roughness, Metallic parameters
  /Game/Generated/Materials/M_VertexColor      vertex colour as base colour (procedural tiles)
  /Game/Generated/Materials/M_Glow             unlit translucent Color and Opacity (targets)
  /Game/Generated/Materials/M_Water            sea with a moving ripple
  /Game/Generated/Materials/M_Model            texture x vertex colour x Color (every model)
"""

from pathlib import Path
import json

import unreal

FAMILIES = ["village", "flora", "rocks", "props", "supplies"]
ROOT = "/Game/Generated"

tools = unreal.AssetToolsHelpers.get_asset_tools()
assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
mel = unreal.MaterialEditingLibrary


def fresh(path: str):
    if assets.does_directory_exist(path):
        assets.delete_directory(path)
    assets.make_directory(path)


def scalar(mat, name, value, x, y):
    e = mel.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, x, y)
    e.set_editor_property("parameter_name", name)
    e.set_editor_property("default_value", value)
    return e


def vector(mat, name, value, x, y):
    e = mel.create_material_expression(mat, unreal.MaterialExpressionVectorParameter, x, y)
    e.set_editor_property("parameter_name", name)
    e.set_editor_property("default_value", unreal.LinearColor(*value))
    return e


def material(name, build):
    mat = tools.create_asset(name, f"{ROOT}/Materials", unreal.Material, unreal.MaterialFactoryNew())
    build(mat)
    # The board scatters scenery with instanced meshes; without this usage flag a game build
    # silently draws them with the default grid material.
    mat.set_editor_property("used_with_instanced_static_meshes", True)
    mel.recompile_material(mat)
    assets.save_loaded_asset(mat)
    return mat


def tint(mat):
    mel.connect_material_property(vector(mat, "Color", (1, 1, 1, 1), -500, 0), "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(scalar(mat, "Roughness", 0.6, -500, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(scalar(mat, "Metallic", 0.0, -500, 300), "", unreal.MaterialProperty.MP_METALLIC)


def vertex_color(mat):
    mat.set_editor_property("two_sided", True)
    vc = mel.create_material_expression(mat, unreal.MaterialExpressionVertexColor, -500, 0)
    mel.connect_material_property(vc, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(scalar(mat, "Roughness", 0.85, -500, 200), "", unreal.MaterialProperty.MP_ROUGHNESS)


def glow(mat):
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_UNLIT)
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_TRANSLUCENT)
    mel.connect_material_property(vector(mat, "Color", (1, 0.9, 0.5, 1), -500, 0), "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.connect_material_property(scalar(mat, "Opacity", 0.6, -500, 200), "", unreal.MaterialProperty.MP_OPACITY)


def model(mat):
    """glTF's rule (base colour = factor x texture x COLOR_0), which Unreal's glTF material skips:
    the Blender models are vertex painted. Color also tints owner parts at runtime."""
    tex = mel.create_material_expression(mat, unreal.MaterialExpressionTextureSampleParameter2D, -900, -100)
    tex.set_editor_property("parameter_name", "Base")
    tex.set_editor_property("texture", unreal.load_asset("/Engine/EngineResources/WhiteSquareTexture"))
    # Vertex paint round-trips exactly: the glTF reader decodes COLOR_0 as sRGB and the mesh
    # build encodes it back, and the VertexColor node reads the stored bytes as they are.
    vc = mel.create_material_expression(mat, unreal.MaterialExpressionVertexColor, -900, 150)
    color = vector(mat, "Color", (1, 1, 1, 1), -900, 300)
    a = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -600, 0)
    mel.connect_material_expressions(tex, "RGB", a, "A")
    mel.connect_material_expressions(vc, "", a, "B")
    b = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -400, 100)
    mel.connect_material_expressions(a, "", b, "A")
    mel.connect_material_expressions(color, "", b, "B")
    mel.connect_material_property(b, "", unreal.MaterialProperty.MP_BASE_COLOR)
    glow = scalar(mat, "Emissive", 0.0, -600, 350)
    e = mel.create_material_expression(mat, unreal.MaterialExpressionMultiply, -300, 300)
    mel.connect_material_expressions(b, "", e, "A")
    mel.connect_material_expressions(glow, "", e, "B")
    mel.connect_material_property(e, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    mel.connect_material_property(scalar(mat, "Roughness", 0.85, -300, 450), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(scalar(mat, "Metallic", 0.0, -300, 550), "", unreal.MaterialProperty.MP_METALLIC)
    mat.set_editor_property("two_sided", True)  # leaves and sails are single planes
    return tex


def model_masked(mat):
    """M_Model for glTF alphaMode MASK (leaf cards): cut out where the texture's alpha is low."""
    tex = model(mat)
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
    mat.set_editor_property("opacity_mask_clip_value", 0.5)
    mel.connect_material_property(tex, "A", unreal.MaterialProperty.MP_OPACITY_MASK)
    mat.set_editor_property("shading_model", unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
    painted=mel.get_material_property_input_node(mat,unreal.MaterialProperty.MP_BASE_COLOR)
    transmission=mel.create_material_expression(mat,unreal.MaterialExpressionMultiply,-200,700)
    assert mel.connect_material_expressions(painted,'',transmission,'A')
    assert mel.connect_material_expressions(scalar(mat,'FoliageTransmission',.35,-500,850),'',transmission,'B')
    assert mel.connect_material_property(transmission,'',unreal.MaterialProperty.MP_SUBSURFACE_COLOR)
    assert mel.connect_material_property(scalar(mat,'FoliageDensity',.6,-200,900),'',unreal.MaterialProperty.MP_OPACITY)



def construction(mat):
    """Preserve the model's paint while revealing foundation, walls and roof by world height."""
    model(mat)
    mat.set_editor_property("blend_mode", unreal.BlendMode.BLEND_MASKED)
    position = mel.create_material_expression(mat, unreal.MaterialExpressionWorldPosition, -900, 700)
    z = mel.create_material_expression(mat, unreal.MaterialExpressionComponentMask, -700, 700)
    z.set_editor_property("r", False)
    z.set_editor_property("g", False)
    z.set_editor_property("b", True)
    assert mel.connect_material_expressions(position, "", z, ""), "World-height mask input did not connect"
    clip = mel.create_material_expression(mat, unreal.MaterialExpressionSubtract, -300, 700)
    assert mel.connect_material_expressions(scalar(mat, "BuildHeight", 1000000.0, -700, 850), "", clip, "A"), "Build-height parameter did not connect"
    assert mel.connect_material_expressions(z, "", clip, "B"), "World-height subtraction did not connect"
    assert mel.connect_material_property(clip, "", unreal.MaterialProperty.MP_OPACITY_MASK), "Construction opacity did not connect"


def alpha_modes(glb: Path) -> dict:
    """Material name -> glTF alphaMode, read from the GLB's JSON chunk."""
    data = glb.read_bytes()
    length = int.from_bytes(data[12:16], "little")
    doc = json.loads(data[20 : 20 + length])
    return {m.get("name", ""): m.get("alphaMode", "OPAQUE") for m in doc.get("materials", [])}


def rematerial(family: str, meshes: dict, parent, masked_parent, modes: dict):
    """Gives every imported mesh slot an instance of M_Model with the glTF texture and factors."""
    folder = f"{ROOT}/Models/{family}/Shading"
    made = {}
    for model_name, mesh_path in meshes.items():
        mesh = unreal.load_asset(mesh_path)
        slots = mesh.get_editor_property("static_materials")
        for index, slot in enumerate(slots):
            original = slot.get_editor_property("material_interface")
            if original is None:
                continue
            key = original.get_path_name()
            if key not in made:
                name = original.get_name().replace("MI_", "")
                mic = tools.create_asset(f"MI_{name}", folder, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
                mel.set_material_instance_parent(mic, masked_parent if modes.get(name) == "MASK" else parent)
                texture = None
                for pname in mel.get_texture_parameter_names(original):
                    if "basecolor" in str(pname).lower() or "diffuse" in str(pname).lower():
                        texture = mel.get_material_instance_texture_parameter_value(original, pname)
                        if texture:
                            break
                if texture:
                    mel.set_material_instance_texture_parameter_value(mic, "Base", texture)
                for pname in mel.get_scalar_parameter_names(original):
                    low = str(pname).lower()
                    value = mel.get_material_instance_scalar_parameter_value(original, pname)
                    if "roughness" in low and "texture" not in low:
                        mel.set_material_instance_scalar_parameter_value(mic, "Roughness", value)
                    elif "metallic" in low and "texture" not in low:
                        mel.set_material_instance_scalar_parameter_value(mic, "Metallic", value)
                vectors = [str(p) for p in mel.get_vector_parameter_names(original)]
                unreal.log(f"Catnight import: material {name}, texture {texture.get_name() if texture else None}")
                for pname in vectors:
                    if pname.lower().replace(" ", "").replace("_", "") in ("basecolorfactor", "basecolor"):
                        mel.set_material_instance_vector_parameter_value(mic, "Color", mel.get_material_instance_vector_parameter_value(original, pname))
                if "glow" in name.lower():
                    mel.set_material_instance_scalar_parameter_value(mic, "Emissive", 3.0)
                assets.save_loaded_asset(mic)
                made[key] = mic
            mesh.set_material(index, made[key])
        assets.save_loaded_asset(mesh)
    return len(made)


def custom_input(name):
    item=unreal.CustomInput()
    item.set_editor_property('input_name',name)
    return item


def water_ripples(mat):
    # Three crossing swells, scrolled in time: broad enough to read on the table, fine enough
    # to break the sun into glints instead of one mirror-like streak.
    world=mel.create_material_expression(mat,unreal.MaterialExpressionWorldPosition,-1200,700)
    time=mel.create_material_expression(mat,unreal.MaterialExpressionTime,-1200,850)
    size=scalar(mat,'RippleScale',0.0045,-1200,950)
    lift=scalar(mat,'RippleStrength',0.11,-1200,1050)
    wave=mel.create_material_expression(mat,unreal.MaterialExpressionCustom,-600,700)
    wave.set_editor_property('output_type',unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    wave.set_editor_property('inputs',[custom_input('P'),custom_input('T'),custom_input('K'),custom_input('A')])
    wave.set_editor_property('code',"float2 q=P.xy*K; float x=sin(q.x+T*.75)+.45*sin(q.y*1.6-T*.9)+.3*sin((q.x+q.y)*2.9+T*1.3); float y=cos(q.y+T*.6)+.35*sin(q.x*1.4+T)+.3*cos((q.x-q.y)*3.3-T*1.1); return normalize(float3(x*A,y*A,1));")
    for node,pin in ((world,'P'),(time,'T'),(size,'K'),(lift,'A')):
        assert mel.connect_material_expressions(node,'',wave,pin)
    assert mel.connect_material_property(wave,'',unreal.MaterialProperty.MP_NORMAL)


def water(mat):
    # The table's sea: friendly turquoise shallows round the island that deepen to blue toward
    # the rim, with broad slow colour drift (no fine noise: that read as carpet, not water).
    deep = vector(mat, "Deep", (0.003, 0.022, 0.115, 1), -900, -100)
    shallow = vector(mat, "Shallow", (0.012, 0.115, 0.25, 1), -900, 100)
    world = mel.create_material_expression(mat, unreal.MaterialExpressionWorldPosition, -1300, 300)
    centre = mel.create_material_expression(mat, unreal.MaterialExpressionObjectPositionWS, -1300, 400)
    time = mel.create_material_expression(mat, unreal.MaterialExpressionTime, -1300, 500)
    near = scalar(mat, "ShoreRadius", 3800.0, -1300, 600)
    far = scalar(mat, "DeepRadius", 7600.0, -1300, 700)
    tone = mel.create_material_expression(mat, unreal.MaterialExpressionCustom, -700, 0)
    tone.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    tone.set_editor_property('inputs', [custom_input(n) for n in ('P', 'O', 'T', 'S', 'D', 'R0', 'R1')])
    tone.set_editor_property('code', "float d=length(P.xy-O.xy); float drift=sin(P.x*.00042+T*.05)*sin(P.y*.00051-T*.037); float t=saturate(smoothstep(R0,R1,d)+drift*.07); return lerp(S,D,t);")
    for node, pin in ((world, 'P'), (centre, 'O'), (time, 'T'), (shallow, 'S'), (deep, 'D'), (near, 'R0'), (far, 'R1')):
        assert mel.connect_material_expressions(node, '', tone, pin)
    mel.connect_material_property(tone, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(scalar(mat, "Roughness", 0.16, -500, 250), "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(scalar(mat, "Specular", 0.5, -500, 350), "", unreal.MaterialProperty.MP_SPECULAR)

    water_ripples(mat)


def import_family(source: Path, family: str):
    folder = f"{ROOT}/Models/{family}"
    task = unreal.AssetImportTask()
    task.filename = str(source)
    task.destination_path = folder
    task.automated = True
    task.replace_existing = True
    task.save = True
    tools.import_asset_tasks([task])
    meshes = {}
    for path in assets.list_assets(folder, recursive=True, include_folder=False):
        data = assets.find_asset_data(path)
        if data.asset_class_path.asset_name != "StaticMesh":
            continue
        name = str(data.asset_name)
        model = name[3:] if name.startswith("SM_") else name
        target = f"{folder}/SM_{model}"
        if path.split(".")[0] != target:
            assets.rename_asset(path, target)
        meshes[model] = target
    return meshes


def main():
    project = Path(unreal.Paths.project_dir()).resolve()
    source = project / "SourceArt" / "Models"
    fresh(ROOT)
    assets.make_directory(f"{ROOT}/Materials")
    material("M_Tint", tint)
    material("M_VertexColor", vertex_color)
    material("M_Glow", glow)
    material("M_Water", water)
    base = material("M_Model", model)
    masked = material("M_ModelMasked", model_masked)
    material("M_Construction", construction)
    report = {}
    for family in FAMILIES:
        glb = source / f"{family}.glb"
        if not glb.is_file():
            raise RuntimeError(f"Missing {glb}: run split_models.py first (pnpm catnight:import does both)")
        report[family] = import_family(glb, family)
        shaded = rematerial(family, report[family], base, masked, alpha_modes(glb))
        unreal.log(f"Catnight import: {family}: {len(report[family])} meshes, {shaded} materials")
    assets.save_directory(ROOT, only_if_is_dirty=False, recursive=True)
    out = project / "Saved" / "catnight-import.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    unreal.log(f"Catnight import: {sum(len(m) for m in report.values())} meshes, report {out}")


if __name__ == "__main__":
    main()
