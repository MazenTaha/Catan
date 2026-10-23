"""Shared helpers for the Catan Night asset scripts (run inside Blender 4.2+ / 5.x).

Everything is built from code so the sources stay small, reviewable and reproducible: the
same script always produces the same meshes, vertex colours and textures (fixed seeds).

Conventions (see docs/BLENDER_ASSET_PIPELINE.md):
- 1 unit = 1 metre, Z up, a model's front faces -Y (glTF +Z after export).
- Origin at the centre of the ground contact; transforms applied before export.
- Colour lives mostly in vertex colours ("Color", sRGB-authored, exported as COLOR_0) multiplied
  by a small shared texture per family. Materials whose names start with "Owner" are tinted in
  the player's colour at runtime; "Leaf" materials are alpha-tested foliage.
"""

from __future__ import annotations

import math
import os
import random

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
MODELS = os.path.join(ROOT, 'apps', 'web', 'public', 'models')
TEXTURES_OUT = os.path.join(ROOT, 'apps', 'web', 'public', 'textures')
TEXTURES = os.path.join(HERE, 'textures')
PREVIEWS = os.path.join(ROOT, 'design', 'blender-previews')

for d in (MODELS, TEXTURES_OUT, TEXTURES, PREVIEWS):
    os.makedirs(d, exist_ok=True)


# ------------------------------------------------------------------ colour

def srgb(hexstr: str) -> tuple[float, float, float]:
    """'#rrggbb' -> linear RGB (Blender colour attributes and Principled inputs are linear)."""
    h = hexstr.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)  # type: ignore[return-value]


def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def mul(a, k):
    if isinstance(k, (int, float)):
        return tuple(x * k for x in a)
    return tuple(x * y for x, y in zip(a, k))


def smooth(a: float, b: float, x: float) -> float:
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ scenes

def new_scene(name: str) -> bpy.types.Scene:
    """A fresh, empty scene of this name (an older one is removed with its objects). Headless
    (blender -b) there is no window to switch, so the current scene is emptied and renamed:
    operators such as bake and export only act on the context scene."""
    if not bpy.context.window:
        sc = bpy.context.scene
        for o in list(sc.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        for me in [m for m in bpy.data.meshes if m.users == 0]:
            bpy.data.meshes.remove(me)
        sc.name = name
        return sc
    old = bpy.data.scenes.get(name)
    if old:
        for o in list(old.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.scenes.remove(old)
    # Unused meshes from the previous build would push new ones to "Name.001".
    for me in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(me)
    sc = bpy.data.scenes.new(name)
    sc.unit_settings.system = 'METRIC'
    sc.unit_settings.scale_length = 1.0
    if bpy.context.window:
        bpy.context.window.scene = sc
    return sc


def purge_orphans():
    for _ in range(3):
        bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=False, do_recursive=True)


# ------------------------------------------------------------------ meshes

class MeshBuilder:
    """Collects polygons with colours and UVs (per vertex, overridable per corner), per-vertex
    wind phase and custom normals, and per-face material slots, then makes one mesh object.
    Reusing `vert` indices shares vertices (cheap instanced plants); `poly` makes fresh ones
    (crisp, flat-shaded parts)."""

    def __init__(self):
        self.verts: list[Vector] = []
        self.vcol: list[tuple] = []
        self.vuv: list[tuple] = []
        self.faces: list[tuple[int, ...]] = []
        self.colors: list[list[tuple]] = []
        self.uvs: list[list[tuple]] = []
        self.mat: list[int] = []
        self.smooth: list[bool] = []
        self.phase: list[float] = []
        self.normals: list[Vector | None] = []

    def vert(self, p, phase: float = 0.0, normal=None, color=(1, 1, 1), uv=(0.0, 0.0)) -> int:
        self.verts.append(Vector(p))
        self.phase.append(phase)
        self.normals.append(Vector(normal).normalized() if normal is not None else None)
        self.vcol.append(tuple(color[:3]))
        self.vuv.append(tuple(uv))
        return len(self.verts) - 1

    def face(self, idx, colors=None, uvs=None, mat: int = 0, smooth: bool = True):
        n = len(idx)
        if colors is None:
            colors = [self.vcol[i] for i in idx]
        elif len(colors) == 3 and isinstance(colors[0], (int, float)):
            colors = [colors] * n
        self.faces.append(tuple(idx))
        self.colors.append([tuple(c[:3]) for c in colors])
        self.uvs.append(list(uvs) if uvs else [self.vuv[i] for i in idx])
        self.mat.append(mat)
        self.smooth.append(smooth)

    def poly(self, pts, colors=None, uvs=None, mat=0, smooth=True, phase=0.0, normals=None):
        idx = [self.vert(p, phase, normals[i] if normals else None) for i, p in enumerate(pts)]
        self.face(idx, colors, uvs, mat, smooth)
        return idx

    def merge(self, other: 'MeshBuilder', matrix: Matrix | None = None):
        off = len(self.verts)
        m3 = matrix.to_3x3() if matrix else None
        for v, ph, nr, c, u in zip(other.verts, other.phase, other.normals, other.vcol, other.vuv):
            self.verts.append(matrix @ v if matrix else v.copy())
            self.phase.append(ph)
            self.normals.append((m3 @ nr).normalized() if (nr is not None and m3) else nr)
            self.vcol.append(c)
            self.vuv.append(u)
        for f, c, u, m, s in zip(other.faces, other.colors, other.uvs, other.mat, other.smooth):
            self.faces.append(tuple(i + off for i in f))
            self.colors.append(c)
            self.uvs.append(u)
            self.mat.append(m)
            self.smooth.append(s)

    @property
    def tris(self) -> int:
        return sum(len(f) - 2 for f in self.faces)

    def build(self, name: str, materials=(), collection=None, phase_attr: bool = False) -> bpy.types.Object:
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        me.validate(clean_customdata=False)
        col = me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
        uv = me.uv_layers.new(name='UVMap')
        flat_c = [c for fc in self.colors for c in fc]
        flat_u = [u for fu in self.uvs for u in fu]
        for li, loop in enumerate(me.loops):
            r, g, b = flat_c[li]
            col.data[li].color = (r, g, b, 1.0)
            uv.data[li].uv = flat_u[li]
        for i, p in enumerate(me.polygons):
            p.material_index = self.mat[i]
            p.use_smooth = self.smooth[i]
        me.color_attributes.active_color = col
        me.color_attributes.render_color_index = 0
        if phase_attr:
            a = me.attributes.new('_wphase', 'FLOAT', 'POINT')
            a.data.foreach_set('value', self.phase)
        if any(n is not None for n in self.normals):
            # Custom normals (foliage cards shaded like a soft volume).
            me.update()
            vn = [n if n is not None else v.normal for n, v in zip(self.normals, me.vertices)]
            me.normals_split_custom_set_from_vertices([tuple(n) for n in vn])
        for m in materials:
            me.materials.append(m)
        me.update()
        ob = bpy.data.objects.new(name, me)
        (collection or bpy.context.scene.collection).objects.link(ob)
        return ob


def tube(b: MeshBuilder, pts, radii, sides, color_fn, mat=0, phase=0.0, cap=False, twist=0.0,
         uv_rect=None, uv_repeat=(1.0, 1.0), phase_fn=None, normal_fn=None):
    """A tapered tube through `pts` (Vectors) with `radii`, rings sharing vertices.
    `color_fn(t, side)` colours each vertex (t: 0 at the start, 1 at the end). With `uv_rect`
    (an atlas rectangle) u runs around the tube and v along its length, `uv_repeat` times; a
    seam column is added so the texture wraps cleanly. Returns the ring centres' vertex rings."""
    n = len(pts)
    up = Vector((0, 0, 1))
    prev_u = None
    rings = []
    lens = [0.0]
    for i in range(1, n):
        lens.append(lens[-1] + (pts[i] - pts[i - 1]).length)
    total = lens[-1] or 1.0
    cols = sides + (1 if uv_rect else 0)
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev_u is None:
            a = up if abs(d.dot(up)) < 0.95 else Vector((1, 0, 0))
            u = d.cross(a).normalized()
        else:
            # Parallel transport keeps rings from twisting along a bent tube.
            u = (prev_u - d * prev_u.dot(d)).normalized()
        prev_u = u
        v = d.cross(u).normalized()
        t = lens[i] / total
        ring = []
        for s in range(cols):
            ang = 2 * math.pi * s / sides + twist * i
            off = (u * math.cos(ang) + v * math.sin(ang))
            q = p + off * radii[i]
            uv = (0.0, 0.0)
            if uv_rect:
                # Atlas regions can't repeat: the whole tube maps onto its rectangle once
                # (`uv_repeat` < 1 uses only part of it, keeping texel density even).
                u0, v0, u1, v1 = uv_rect
                uu = s / sides * min(1.0, uv_repeat[0])
                vv = min(1.0, t * uv_repeat[1])
                uv = (u0 + (u1 - u0) * uu, v0 + (v1 - v0) * vv)
            nrm = normal_fn(t, off) if normal_fn else None
            ring.append(b.vert(q, phase_fn(t) if phase_fn else phase, nrm, color_fn(t, s % sides), uv))
        rings.append(ring)
    for i in range(n - 1):
        for s in range(sides):
            s1 = s + 1 if uv_rect else (s + 1) % sides
            b.face([rings[i][s], rings[i][s1], rings[i + 1][s1], rings[i + 1][s]], mat=mat, smooth=True)
    if cap:
        b.face(list(rings[-1][:sides]), mat=mat, smooth=True)
    return rings


def bezier(p0, p1, p2, t):
    return p0 * (1 - t) ** 2 + p1 * 2 * (1 - t) * t + p2 * t * t


# ------------------------------------------------------------------ materials

def material(name: str, color=(1, 1, 1), rough: float = 0.85, metal: float = 0.0, image=None,
             alpha_clip: float | None = None, double: bool = False, emission=None) -> bpy.types.Material:
    """A Principled material that the glTF exporter maps cleanly: base colour = image (optional)
    x vertex colour, constant roughness/metallic, optional alpha clip from the image alpha."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (-300, 0)
    out.location = (0, 0)
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Color'
    vc.location = (-900, 200)
    if image is not None:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = image
        tex.location = (-900, -100)
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.location = (-600, 100)
        nt.links.new(tex.outputs['Color'], mix.inputs['A'])
        nt.links.new(vc.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        if alpha_clip is not None:
            gt = nt.nodes.new('ShaderNodeMath')
            gt.operation = 'GREATER_THAN'
            gt.inputs[1].default_value = alpha_clip
            gt.location = (-600, -250)
            nt.links.new(tex.outputs['Alpha'], gt.inputs[0])
            nt.links.new(gt.outputs[0], bsdf.inputs['Alpha'])
    else:
        nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    if emission is not None:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    m.use_backface_culling = not double
    if alpha_clip is not None:
        try:
            m.surface_render_method = 'DITHERED'
        except AttributeError:
            m.blend_method = 'CLIP'
    return m


def image_from_array(name: str, arr: np.ndarray, path: str | None = None, colorspace: str = 'sRGB',
                     quality: int = 0) -> bpy.types.Image:
    """arr: HxWx4 float in [0,1], row 0 at the TOP. Saved at `path` if given: PNG, or JPEG (at
    `quality`) when the path ends in .jpg."""
    h, w = arr.shape[:2]
    # Always a fresh image: an old one may point at a file that has since changed or gone.
    old = bpy.data.images.get(name)
    if old:
        old.name = f'{name}_old'
    img = bpy.data.images.new(name, w, h, alpha=True)
    if old:
        old.user_remap(img)
        bpy.data.images.remove(old)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(arr[::-1]).astype(np.float32).ravel())
    if path:
        img.filepath_raw = path
        if path.endswith('.jpg'):
            # Image.save writes the stored values as they are (no view transform).
            img.file_format = 'JPEG'
            img.save(filepath=path, quality=quality or 90)
        else:
            img.file_format = 'PNG'
            img.save()
        img.filepath = path
    img.update()
    return img


# ------------------------------------------------------------------ tileable noise (numpy)

def spectral_noise(size: int, beta: float, seed: int, lo: float = 0.0) -> np.ndarray:
    """Seamlessly tiling fractal noise by spectral synthesis: white noise filtered by 1/f^beta.
    `lo` suppresses the largest features (fraction of the lowest frequencies)."""
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((size, size))
    f = np.fft.fftfreq(size)
    fx, fy = np.meshgrid(f, f)
    r = np.sqrt(fx * fx + fy * fy)
    r[0, 0] = 1.0
    amp = 1.0 / r ** beta
    if lo:
        amp *= 1 - np.exp(-(r / lo) ** 2)
    amp[0, 0] = 0
    out = np.real(np.fft.ifft2(np.fft.fft2(white) * amp))
    out -= out.mean()
    out /= (np.abs(out).max() + 1e-9)
    return out  # [-1, 1]


def voronoi(size: int, cells: int, seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Tileable Worley noise: (F1, F2, cell id) on a `cells` x `cells` jittered grid."""
    rng = np.random.default_rng(seed)
    pts = (np.stack(np.meshgrid(np.arange(cells), np.arange(cells)), -1).reshape(-1, 2) + rng.random((cells * cells, 2))) / cells
    ids = rng.random(cells * cells)
    yy, xx = np.mgrid[0:size, 0:size] / size
    f1 = np.full((size, size), 9.0)
    f2 = np.full((size, size), 9.0)
    cid = np.zeros((size, size))
    for (px, py), i in zip(pts, ids):
        dx = np.abs(xx - px)
        dy = np.abs(yy - py)
        dx = np.minimum(dx, 1 - dx)
        dy = np.minimum(dy, 1 - dy)
        d = np.sqrt(dx * dx + dy * dy) * cells
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        cid = np.where(closer, i, cid)
        f1 = np.where(closer, d, f1)
    return f1, f2, cid


def normal_map(height: np.ndarray, strength: float) -> np.ndarray:
    """Tangent-space normal map (OpenGL convention, +Y up in the image) from a tiling height
    field; returns HxWx4 in [0,1]."""
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(height)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    out = np.ones(height.shape + (4,))
    out[..., :3] = n * 0.5 + 0.5
    return out


# ------------------------------------------------------------------ baking

def bake_ao(objs, strength: float = 0.6, distance: float = 1.0, samples: int = 48, floor: float = 0.0):
    """Bakes ambient occlusion into each object's vertex colours (multiplied in, so authored
    tints stay). A temporary ground plane at z = `floor` occludes from below like the terrain."""
    sc = bpy.context.scene
    prev_engine = sc.render.engine
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    try:
        sc.cycles.device = 'GPU'
    except Exception:
        pass
    sc.world = sc.world or bpy.data.worlds.new('BakeWorld')
    sc.world.light_settings.distance = distance
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, floor))
    ground = bpy.context.active_object
    ground.name = '_bake_ground'
    for ob in objs:
        me = ob.data
        base = me.color_attributes['Color']
        ao = me.color_attributes.get('AO') or me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = ao
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', margin=0)
        n = len(me.loops)
        a = np.empty(n * 4, np.float32)
        c = np.empty(n * 4, np.float32)
        ao.data.foreach_get('color', a)
        base.data.foreach_get('color', c)
        a = a.reshape(-1, 4)
        c = c.reshape(-1, 4)
        k = 1 - strength + strength * a[:, :1]
        c[:, :3] *= k
        base.data.foreach_set('color', c.ravel())
        me.color_attributes.remove(ao)
        me.color_attributes.active_color = me.color_attributes['Color']
    bpy.data.objects.remove(ground, do_unlink=True)
    sc.render.engine = prev_engine


# ------------------------------------------------------------------ export

def apply_transforms(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def export_glb(objs, filename: str, images: str = 'AUTO') -> str:
    """Exports the given root objects (and their children) to apps/web/public/models/<filename>.
    Each root keeps its own node name: the game finds variants by name inside one file."""
    # Selection is per view layer: clear it everywhere so other scenes' objects stay out.
    for sc in bpy.data.scenes:
        for vl in sc.view_layers:
            for o in sc.objects:
                o.select_set(False, view_layer=vl)
    for o in objs:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    path = os.path.join(MODELS, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        use_active_scene=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_attributes=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_image_format=images,
        export_image_quality=88,
        export_draco_mesh_compression_enable=False,
    )
    return path


def save_blend(scene: bpy.types.Scene, filename: str) -> str:
    """Writes just this scene (with its objects, meshes, materials and images) to
    assets/blender/<filename>, without touching the open file."""
    path = os.path.join(HERE, filename)
    blocks = {scene}
    for o in scene.objects:
        blocks.add(o)
    bpy.data.libraries.write(path, blocks, fake_user=True, compress=True)
    return path


def layout_row(objs, gap: float = 1.5, y: float = 0.0):
    """Spreads root objects along X for viewing in Blender (export ignores root translation)."""
    x = 0.0
    for o in objs:
        w = max((o.matrix_world @ Vector(c)).x for c in o.bound_box) - min((o.matrix_world @ Vector(c)).x for c in o.bound_box)
        o.location.x = x + w / 2
        o.location.y = y
        x += w + gap


def stats(objs) -> dict:
    out = {}
    for o in objs:
        tris = 0
        mats = set()
        for ob in [o, *o.children_recursive]:
            if ob.type == 'MESH':
                tris += sum(len(p.vertices) - 2 for p in ob.data.polygons)
                mats |= {m.name for m in ob.data.materials if m}
        out[o.name] = {'tris': tris, 'materials': sorted(mats)}
    return out


def rng(seed: int) -> random.Random:
    return random.Random(seed)


def preview(scene_name: str, filename: str, target=(0, 0, 0.5), dist: float = 6.0, height: float = 2.0,
            res=(1280, 720), lens: float = 50, yaw_deg: float = -90):
    """Renders a quick EEVEE preview of a scene under a warm afternoon sun into design/
    blender-previews/<filename> (supporting material only: the browser is the reference)."""
    sc = bpy.data.scenes[scene_name]
    if bpy.context.window:
        bpy.context.window.scene = sc
    for o in [o for o in sc.objects if o.name.startswith('_prev')]:
        bpy.data.objects.remove(o, do_unlink=True)
    sun = bpy.data.objects.new('_prev_sun', bpy.data.lights.get('_prev_sun') or bpy.data.lights.new('_prev_sun', 'SUN'))
    sun.data.energy = 4.0
    sun.data.color = (1.0, 0.9, 0.76)
    sun.data.angle = math.radians(2.5)
    sun.rotation_euler = (math.radians(55), 0, math.radians(-40))
    sc.collection.objects.link(sun)
    cam_data = bpy.data.cameras.get('_prev_cam') or bpy.data.cameras.new('_prev_cam')
    cam_data.lens = lens
    cam = bpy.data.objects.new('_prev_cam', cam_data)
    sc.collection.objects.link(cam)
    t = Vector(target)
    yaw = math.radians(yaw_deg)
    cam.location = t + Vector((math.cos(yaw) * dist, math.sin(yaw) * dist, height))
    d = (t - cam.location)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    world = bpy.data.worlds.get('_prev_world') or bpy.data.worlds.new('_prev_world')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs[0].default_value = (0.42, 0.62, 0.9, 1)
    bg.inputs[1].default_value = 0.9
    sc.world = world
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Punchy'
    path = os.path.join(PREVIEWS, filename)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True, scene=sc.name)
    return path
