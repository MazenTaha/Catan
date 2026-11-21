"""Neutral studio renders of the actual editable creatures, with the game's owner tint."""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
before = '--before' in sys.argv
SOURCE = ROOT / 'design/creature-redesign/source-before/assets/blender' if before else ROOT / 'assets/blender'
OUT = ROOT / 'design/creature-redesign' / ('before' if before else 'after')
OUT.mkdir(parents=True, exist_ok=True)


def tint(name, rgb):
    mat = bpy.data.materials.get(name)
    if not mat or not mat.use_nodes:
        return
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        return
    links = mat.node_tree.links
    socket = bsdf.inputs['Base Color']
    old = socket.links[0].from_socket if socket.links else None
    mix = mat.node_tree.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1
    mix.inputs[2].default_value = (*rgb, 1)
    if old:
        links.new(old, mix.inputs[1])
    links.new(mix.outputs[0], socket)


previews = [('knight', 'Knight', 2.35, 0.98), ('horse', 'Horse', 3.7, 1.02), ('village', 'Sheep', 1.85, 0.58)]
if not before:
    previews.append(('village', 'SheepFar', 1.85, 0.58))
for family, name, scale, target in previews:
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / f'{family}.blend'))
    scene = bpy.context.scene
    root = bpy.data.objects.get(name)
    if root is None:
        raise RuntimeError(f'Missing {name}')
    keep = {root, *root.children_recursive}
    for o in scene.objects:
        o.hide_render = o not in keep
    root.location = (0, 0, 0)
    if name == 'Knight':
        for n in ['KnightFace', 'HelmArmet', 'HelmBascinet', 'HelmCrowned', 'CapeShort']:
            bpy.data.objects[n].hide_render = True
        tint('Owner', (0.48, 0.035, 0.06))
        tint('Cloth', (0.055, 0.105, 0.17))
    if name == 'Horse':
        tint('Coat', (0.26, 0.115, 0.045))
        tint('Hair', (0.018, 0.013, 0.01))
        tint('Owner_Blanket', (0.48, 0.035, 0.06))
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('CreatureStudio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.18, 0.21, 0.27, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = 0.65
    bpy.ops.mesh.primitive_plane_add(size=200)
    floor = bpy.context.object
    floor.location.z = -0.012
    mat = bpy.data.materials.new('StudioFloor')
    mat.diffuse_color = (0.11, 0.14, 0.18, 1)
    floor.data.materials.append(mat)
    for pos, energy, size, color in [((-3, -4, 6), 600, 4, (1, 0.88, 0.72)), ((4, 1, 4), 850, 3, (0.7, 0.82, 1)), ((0, 4, 5), 500, 3, (1, 0.92, 0.8))]:
        bpy.ops.object.light_add(type='AREA', location=pos)
        light = bpy.context.object
        light.data.energy, light.data.shape, light.data.size = energy, 'DISK', size
        light.data.color = color
        light.rotation_euler = (Vector((0, 0, target)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(3.3, -5.8, 2.9))
    camera = bpy.context.object
    camera.data.type, camera.data.ortho_scale = 'ORTHO', scale
    scene.camera = camera
    for view, pos in [('front', (3.3, -5.8, 2.9)), ('back', (-3.8, 5.8, 2.6))]:
        if before and view == 'back':
            continue
        camera.location = pos
        camera.rotation_euler = (Vector((0, 0, target)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(OUT / f'{name.lower()}-{view}.png')
        bpy.ops.render.render(write_still=True)
