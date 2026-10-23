"""Builds every Catan Night 3D asset from these scripts: textures, then flora, rocks and the
village. Writes editable sources (assets/blender/*.blend), the atlases (assets/blender/textures/),
the game's models (apps/web/public/models/*.glb) and ground textures (apps/web/public/textures/).

Headless, from the repository root:
    blender -b -P assets/blender/build.py                 # everything
    blender -b -P assets/blender/build.py -- flora rocks  # some families (textures are reused)

Inside a running Blender (Python console, or an MCP client):
    p = r'<repo>/assets/blender/build.py'
    exec(compile(open(p).read(), p, 'exec'), {'__file__': p, '__name__': '__main__'})

Everything is seeded, so a rebuild reproduces the same meshes and textures; only the baked
ambient occlusion carries a little sampling noise.
"""

import importlib
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import common  # noqa: E402
import flora  # noqa: E402
import rocks  # noqa: E402
import textures  # noqa: E402
import village  # noqa: E402

for m in (common, textures, flora, rocks, village):
    importlib.reload(m)

FAMILIES = ('textures', 'flora', 'rocks', 'village')


def image(name: str, png: str):
    """A built atlas from this session, or the saved one from an earlier build."""
    import bpy
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.load(os.path.join(common.TEXTURES, png))
        img.name = name
    return img


def main(which=FAMILIES):
    report = {}
    t0 = time.time()
    if 'textures' in which or not os.path.exists(os.path.join(common.TEXTURES, 'flora_atlas.png')):
        report['textures'] = textures.build()
    if 'flora' in which:
        report['flora'] = flora.build(image('flora_atlas', 'flora_atlas.png'))
    if 'rocks' in which:
        report['rocks'] = rocks.build(image('rock_tex', 'rock.png'))
    if 'village' in which:
        report['village'] = village.build(image('village_atlas', 'village_atlas.png'))
    for family, stats in report.items():
        if family == 'textures':
            continue
        print(f'[build] {family}: ' + ', '.join(f"{k} {v['tris']}" for k, v in stats.items()))
    print(f'[build] done in {time.time() - t0:.1f} s')
    return report


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    main(tuple(args) or FAMILIES)
