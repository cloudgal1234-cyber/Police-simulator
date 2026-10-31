"""
Precinct 12 - first-launch project setup (runs automatically when the editor starts).

1. Imports the PBR textures from RawAssets/Textures into /Game/PT/Textures.
2. Builds the master material /Game/PT/Materials/M_PT_Surface:
   triplanar world-space texturing (no stretching on scaled meshes), tint,
   per-instance colour (instanced meshes), roughness/metal, emission.
3. Copies Epic's animated mannequins (Manny / Quinn + animation blueprint)
   from the engine's Third Person template into /Game/Characters.

Everything is skipped when it already exists, so it is safe to run every launch.
"""
import os
import shutil

import unreal

LOG = "[Precinct12 setup]"
TEX_DIR = "/Game/PT/Textures"
MAT_DIR = "/Game/PT/Materials"
MASTER = MAT_DIR + "/M_PT_Surface"

eal = unreal.EditorAssetLibrary
mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
project = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())


def log(msg):
    unreal.log("{} {}".format(LOG, msg))


# --------------------------------------------------------------------------- textures
def import_textures():
    raw = os.path.join(project, "RawAssets", "Textures")
    if not os.path.isdir(raw):
        unreal.log_warning("{} texture folder missing: {}".format(LOG, raw))
        return
    tasks = []
    for f in sorted(os.listdir(raw)):
        if not f.lower().endswith(".png"):
            continue
        name = f[:-4]
        if eal.does_asset_exist("{}/{}".format(TEX_DIR, name)):
            continue
        t = unreal.AssetImportTask()
        t.set_editor_property("filename", os.path.join(raw, f))
        t.set_editor_property("destination_path", TEX_DIR)
        t.set_editor_property("automated", True)
        t.set_editor_property("replace_existing", True)
        t.set_editor_property("save", False)
        tasks.append(t)
    if not tasks:
        return
    log("importing {} textures...".format(len(tasks)))
    tools.import_asset_tasks(tasks)
    for t in tasks:
        name = os.path.splitext(os.path.basename(t.get_editor_property("filename")))[0]
        path = "{}/{}".format(TEX_DIR, name)
        tex = eal.load_asset(path)
        if not tex:
            continue
        if name.endswith("_N") or name.endswith("_R"):
            tex.set_editor_property("srgb", False)
            tex.set_editor_property("compression_settings", unreal.TextureCompressionSettings.TC_DEFAULT)
        eal.save_asset(path, only_if_is_dirty=False)


# --------------------------------------------------------------------------- material
TRI = """
float3 w = abs(N); w = w*w*w*w; w /= max(w.x + w.y + w.z, 1e-4);
float4 a = Texture2DSample(Tex, TexSampler, WP.yz * S);
float4 b = Texture2DSample(Tex, TexSampler, WP.xz * S);
float4 c = Texture2DSample(Tex, TexSampler, WP.xy * S);
float4 t = a * w.x + b * w.y + c * w.z;
"""

BASE_CODE = TRI + "return lerp(float3(1,1,1), t.rgb, Use) * Tint.rgb * float3(C0, C1, C2);"
NORMAL_CODE = TRI + "float3 n = t.rgb * 2 - 1; n.xy *= Str; return lerp(float3(0,0,1), normalize(n), saturate(Use));"
ROUGH_CODE = TRI + "return saturate(lerp(1.0, t.r, Use) * R);"
EMIS_CODE = "return E.rgb * Str * float3(C0, C1, C2);"


def custom(mat, code, out_type, names, x, y):
    node = mel.create_material_expression(mat, unreal.MaterialExpressionCustom, x, y)
    node.set_editor_property("code", code)
    node.set_editor_property("output_type", out_type)
    inputs = []
    for n in names:
        ci = unreal.CustomInput()
        ci.set_editor_property("input_name", n)
        inputs.append(ci)
    node.set_editor_property("inputs", inputs)
    return node


def scalar(mat, name, value, x, y):
    n = mel.create_material_expression(mat, unreal.MaterialExpressionScalarParameter, x, y)
    n.set_editor_property("parameter_name", name)
    n.set_editor_property("default_value", value)
    return n


def vector(mat, name, value, x, y):
    n = mel.create_material_expression(mat, unreal.MaterialExpressionVectorParameter, x, y)
    n.set_editor_property("parameter_name", name)
    n.set_editor_property("default_value", value)
    return n


def tex_param(mat, name, default_path, sampler, x, y):
    n = mel.create_material_expression(mat, unreal.MaterialExpressionTextureObjectParameter, x, y)
    n.set_editor_property("parameter_name", name)
    default = eal.load_asset(default_path)
    if default:
        n.set_editor_property("texture", default)
    n.set_editor_property("sampler_type", sampler)
    return n


def build_material():
    if eal.does_asset_exist(MASTER):
        return
    if not eal.does_asset_exist(TEX_DIR + "/T_Plaster_D"):
        unreal.log_warning("{} textures not imported - cannot build material".format(LOG))
        return
    log("building master material...")
    mat = tools.create_asset("M_PT_Surface", MAT_DIR, unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property("used_with_instanced_static_meshes", True)
    mat.set_editor_property("used_with_skeletal_mesh", True)

    wp = mel.create_material_expression(mat, unreal.MaterialExpressionWorldPosition, -1400, 0)
    nrm = mel.create_material_expression(mat, unreal.MaterialExpressionVertexNormalWS, -1400, 120)
    uv = scalar(mat, "UVScale", 0.0025, -1400, 240)
    use = scalar(mat, "UseTextures", 0.0, -1400, 340)
    tint = vector(mat, "Tint", unreal.LinearColor(1, 1, 1, 1), -1400, 440)
    rough = scalar(mat, "Roughness", 0.7, -1400, 600)
    metal = scalar(mat, "Metallic", 0.0, -1400, 700)
    nstr = scalar(mat, "NormalStrength", 1.0, -1400, 800)
    ecol = vector(mat, "EmissiveColor", unreal.LinearColor(0, 0, 0, 1), -1400, 900)
    estr = scalar(mat, "EmissiveStrength", 0.0, -1400, 1060)
    cds = []
    for i in range(3):
        cd = mel.create_material_expression(mat, unreal.MaterialExpressionPerInstanceCustomData, -1400, 1160 + i * 100)
        cd.set_editor_property("data_index", i)
        cd.set_editor_property("const_default_value", 1.0)
        cds.append(cd)

    base_tex = tex_param(mat, "BaseTex", TEX_DIR + "/T_Plaster_D", unreal.MaterialSamplerType.SAMPLERTYPE_COLOR, -1700, -400)
    norm_tex = tex_param(mat, "NormalTex", TEX_DIR + "/T_Plaster_N", unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR, -1700, -150)
    rough_tex = tex_param(mat, "RoughTex", TEX_DIR + "/T_Plaster_R", unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR, -1700, 100)

    F3 = unreal.CustomMaterialOutputType.CMOT_FLOAT3
    F1 = unreal.CustomMaterialOutputType.CMOT_FLOAT1
    base = custom(mat, BASE_CODE, F3, ["Tex", "WP", "N", "S", "Use", "Tint", "C0", "C1", "C2"], -700, -300)
    normal = custom(mat, NORMAL_CODE, F3, ["Tex", "WP", "N", "S", "Use", "Str"], -700, 0)
    roughn = custom(mat, ROUGH_CODE, F1, ["Tex", "WP", "N", "S", "Use", "R"], -700, 300)
    emis = custom(mat, EMIS_CODE, F3, ["E", "Str", "C0", "C1", "C2"], -700, 600)

    def link(src, dst, pin):
        if not mel.connect_material_expressions(src, "", dst, pin):
            unreal.log_warning("{} could not connect {} -> {}".format(LOG, src.get_name(), pin))

    for node, tex in ((base, base_tex), (normal, norm_tex), (roughn, rough_tex)):
        link(tex, node, "Tex")
        link(wp, node, "WP")
        link(nrm, node, "N")
        link(uv, node, "S")
        link(use, node, "Use")
    link(tint, base, "Tint")
    link(nstr, normal, "Str")
    link(rough, roughn, "R")
    link(ecol, emis, "E")
    link(estr, emis, "Str")
    for i, cd in enumerate(cds):
        link(cd, base, "C{}".format(i))
        link(cd, emis, "C{}".format(i))

    mel.connect_material_property(base, "", unreal.MaterialProperty.MP_BASE_COLOR)
    mel.connect_material_property(normal, "", unreal.MaterialProperty.MP_NORMAL)
    mel.connect_material_property(roughn, "", unreal.MaterialProperty.MP_ROUGHNESS)
    mel.connect_material_property(metal, "", unreal.MaterialProperty.MP_METALLIC)
    mel.connect_material_property(emis, "", unreal.MaterialProperty.MP_EMISSIVE_COLOR)

    mel.recompile_material(mat)
    eal.save_asset(MASTER, only_if_is_dirty=False)
    log("master material ready")


# --------------------------------------------------------------------------- mannequins
def copy_mannequins():
    dst = os.path.join(project, "Content", "Characters")
    if os.path.isdir(os.path.join(dst, "Mannequins")):
        return
    engine = unreal.Paths.convert_relative_path_to_full(unreal.Paths.engine_dir())
    root = os.path.normpath(os.path.join(engine, "..", "Templates"))
    for tpl in ("TP_ThirdPerson", "TP_ThirdPersonBP"):
        src = os.path.join(root, tpl, "Content", "Characters")
        if os.path.isdir(os.path.join(src, "Mannequins")):
            log("copying animated mannequins from {}".format(src))
            shutil.copytree(src, dst, dirs_exist_ok=True)
            unreal.AssetRegistryHelpers.get_asset_registry().scan_paths_synchronous(["/Game/Characters"], True)
            return
    unreal.log_warning("{} Third Person template not found - characters use the procedural look. "
                       "Add it via Content Browser > Add > Add Feature or Content Pack > Third Person.".format(LOG))


def main():
    try:
        import_textures()
        build_material()
        copy_mannequins()
        log("done - press Play (Alt+P) to start the game")
    except Exception as e:  # never block the editor
        unreal.log_error("{} failed: {}".format(LOG, e))


main()
