"""Prepares the web game's Blender GLBs for Unreal.

Run with Blender (no UI):
    blender -b -P apps/catnight/Tools/split_models.py -- <models dir> <out dir>

For village/flora/rocks/props/supplies.glb it writes <out>/<file>.glb where every root object is
one mesh: its mesh children are joined into it, and it sits at the origin in its own space. Unreal
then imports exactly one static mesh per model, and each family keeps one shared atlas. The source
GLBs come from assets/blender/build.py (the web game's pipeline); nothing here changes them.
"""

import os
import sys

import bpy
from mathutils import Matrix

FILES = ["village", "flora", "rocks", "props", "supplies"]


def prepare(src_dir: str, out_dir: str) -> int:
    count = 0
    os.makedirs(out_dir, exist_ok=True)
    for name in FILES:
        path = os.path.join(src_dir, f"{name}.glb")
        if not os.path.isfile(path):
            print(f"[models] missing {path}")
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=path)
        roots = [o for o in bpy.context.scene.objects if o.parent is None]
        keep = []
        for root in roots:
            root_name = root.name
            meshes = [o for o in [root, *root.children_recursive] if o.type == "MESH"]
            if not meshes:
                continue
            to_root = root.matrix_world.inverted()
            bpy.ops.object.select_all(action="DESELECT")
            for o in meshes:
                if o.data.users > 1:
                    o.data = o.data.copy()  # never edit data another model shares
                o.select_set(True)
            bpy.context.view_layer.objects.active = meshes[0]
            if len(meshes) > 1:
                bpy.ops.object.join()
            joined = bpy.context.view_layer.objects.active
            world = joined.matrix_world.copy()
            joined.parent = None
            joined.data.transform(to_root @ world)
            joined.matrix_world = Matrix.Identity(4)
            keep.append((joined, root_name))
        # Drop empties and leftovers, then give each model its root's name.
        kept = {o for o, _ in keep}
        for o in list(bpy.context.scene.objects):
            if o not in kept:
                bpy.data.objects.remove(o, do_unlink=True)
        for o, root_name in keep:
            o.name = root_name
            o.data.name = root_name
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(out_dir, f"{name}.glb"),
            export_format="GLB",
            export_animations=False,
            export_skins=False,
            export_morph=False,
        )
        count += len(keep)
        print(f"[models] {name}: {len(keep)} models")
    return count


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(argv) != 2:
        raise SystemExit("usage: blender -b -P split_models.py -- <models dir> <out dir>")
    print(f"[models] wrote {prepare(*argv)} models")


if __name__ == "__main__":
    main()
