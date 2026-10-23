"""Stone for the 3D walk -> apps/web/public/models/rocks.glb

  BoulderA BoulderB BoulderC     fractured field stones (~1 m radius, scaled per placement)
  CragA CragB CragC              mountain formations: fractured pillars round a summit, in
                                 strata, grass on low ledges, snow on high ones (~4 m radius)
  ClayA ClayB                    terraced terracotta banks with a grassy cap (~2.5 m radius)

One material, "Rock": the tiling stone grain x vertex colour (warm sunlit tops, cool slate,
lichen, moss, iron stains, baked occlusion in the cracks).
"""

from __future__ import annotations

import math

import bmesh
from mathutils import Matrix, Vector, noise

from common import (bake_ao, bpy, export_glb, layout_row, lerp, material, mul, new_scene, rng, save_blend, smooth,
                    srgb, stats)

C = srgb
UP = Vector((0, 0, 1))


def fractured(bm: bmesh.types.BMesh, r, centre: Vector, radius: float, cuts: int, depth=(0.55, 0.85), stretch=(1, 1, 1),
              tilt_bias: float = 0.0):
    """Adds a convex stone to `bm`: an icosphere sliced by random planes, so its faces read as
    fracture planes rather than a smooth lump."""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=2, radius=radius)
    for v in tmp.verts:
        v.co = Vector((v.co.x * stretch[0], v.co.y * stretch[1], v.co.z * stretch[2]))
    for k in range(cuts):
        th = r.random() * math.tau
        z = (r.random() * 2 - 1)
        z = z * (1 - tilt_bias) + tilt_bias * (1 if r.random() < 0.5 else -0.3)
        n = Vector((math.cos(th) * math.sqrt(1 - min(1, z * z)), math.sin(th) * math.sqrt(1 - min(1, z * z)), z)).normalized()
        ext = Vector((abs(n.x) * stretch[0], abs(n.y) * stretch[1], abs(n.z) * stretch[2])).length
        d = radius * ext * (depth[0] + r.random() * (depth[1] - depth[0]))
        geom = tmp.verts[:] + tmp.edges[:] + tmp.faces[:]
        res = bmesh.ops.bisect_plane(tmp, geom=geom, plane_co=n * d, plane_no=n, clear_outer=True)
        cut_edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if cut_edges:
            bmesh.ops.holes_fill(tmp, edges=cut_edges, sides=0)
    bmesh.ops.triangulate(tmp, faces=tmp.faces[:])
    # A little irregularity on the facets.
    seed = r.random() * 100
    for v in tmp.verts:
        p = v.co
        v.co = p + p.normalized() * noise.noise(p * 1.7 + Vector((seed, seed, seed))) * radius * 0.05
    bmesh.ops.dissolve_degenerate(tmp, dist=radius * 0.01, edges=tmp.edges[:])
    tmp.transform(Matrix.Translation(centre))
    me = bpy.data.meshes.new('_tmp')
    tmp.to_mesh(me)
    tmp.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


def finish(bm: bmesh.types.BMesh, name: str, mat, colour, uv_scale: float = 0.6, crease: float | None = None) -> bpy.types.Object:
    """Flat-shaded mesh with box-projected UVs (the grain texture tiles) and per-corner colours
    from `colour(face_centre, face_normal, vertex)`."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    uv = me.uv_layers.new(name='UVMap')
    col = me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
    for p in me.polygons:
        p.use_smooth = crease is not None
        n = p.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            a, b = [(v.y, v.z), (v.x, v.z), (v.x, v.y)][ax]
            uv.data[li].uv = (a * uv_scale, b * uv_scale)
            c = colour(p.center, n, v)
            col.data[li].color = (*c, 1.0)
    me.color_attributes.active_color = col
    if crease is not None:
        # Smooth shading, split only along creases sharper than `crease` degrees.
        bm2 = bmesh.new()
        bm2.from_mesh(me)
        for e in bm2.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(crease):
                e.smooth = False
        bm2.to_mesh(me)
        bm2.free()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


SLATE_LIT = C('#a9aca8')
SLATE = C('#868d93')
SLATE_DK = C('#5e6670')
WARM = C('#b8a58c')
LICHEN = C('#a7ad7a')
MOSS = C('#5f8a3e')
GRASS = C('#6f9e48')
SNOW = C('#eef2f4')
IRON = C('#9a6a4a')


def stone_colour(r, top: float, moss: float = 0.25):
    """Facet colours: warm, lit stone on top, cool slate below, lichen and moss on upward faces."""
    seed = r.random() * 50

    def f(c: Vector, n: Vector, v: Vector):
        k = noise.noise(c * 0.9 + Vector((seed, 0, 0))) * 0.5 + 0.5
        base = lerp(SLATE_DK, SLATE, smooth(-0.5, 0.6, n.z + (k - 0.5)))
        base = lerp(base, SLATE_LIT, smooth(0.2, 0.9, n.z) * 0.6)
        base = lerp(base, WARM, 0.06 + 0.12 * k)
        base = mul(base, 0.92 + 0.16 * (noise.noise(c * 3.1 + Vector((0, seed, 0))) * 0.5 + 0.5))
        if n.z > 0.55:
            m = smooth(0.55, 0.95, n.z) * smooth(0.35, 0.7, noise.noise(c * 1.3 + Vector((0, 0, seed))) * 0.5 + 0.5)
            base = lerp(base, MOSS if c.z < top * 0.5 else LICHEN, m * moss * 2)
        if noise.noise(c * 2.2 + Vector((seed, seed, 0))) > 0.55:
            base = lerp(base, IRON, 0.25)
        return base
    return f


def build_boulders(mat):
    objs = []
    for name, seed, cuts, stretch in (('BoulderA', 501, 9, (1.1, 0.95, 0.72)), ('BoulderB', 502, 11, (1.25, 0.85, 0.6)),
                                      ('BoulderC', 503, 8, (0.95, 0.9, 0.95))):
        r = rng(seed)
        bm = bmesh.new()
        fractured(bm, r, Vector((0, 0, 0.32)), 1.0, cuts, depth=(0.5, 0.8), stretch=stretch, tilt_bias=0.3)
        # Sink the base a little so it beds into the ground.
        for v in bm.verts:
            if v.co.z < 0:
                v.co.z *= 0.4
        objs.append(finish(bm, name, mat, stone_colour(r, 1.0, 0.35)))
    return objs


def massif(bm: bmesh.types.BMesh, r, centre: Vector, radius: float, height: float, cliffs: int, lean: Vector):
    """One coherent rock mass: a tapering, noise-ridged body with stepped strata, cut by steep
    fracture planes (cliffs) and a few sloping ones near the top. Its base sits at z = 0."""
    tmp = bmesh.new()
    bmesh.ops.create_icosphere(tmp, subdivisions=3, radius=1.0)
    seed = Vector((r.random() * 50, r.random() * 50, r.random() * 50))
    for v in tmp.verts:
        p = v.co.copy()
        t = (p.z + 1) / 2  # 0 at the bottom, 1 at the top
        flat = Vector((p.x, p.y, 0))
        d = flat.normalized() if flat.length > 1e-5 else Vector((1, 0, 0))
        # Full width at the foot, tapering to the summit; ridged by noise, stepped into strata.
        # A broad foot with concave slopes up to the summit.
        taper = 1.25 * (1 - t) ** 1.25 + 0.12 * (1 - t)
        ridge = 1 + 0.32 * noise.noise(d * 1.3 + Vector((0, 0, t * 2.0)) + seed) + 0.12 * noise.noise(d * 3.3 + Vector((0, 0, t * 6)) + seed)
        step = 1 - 0.13 * smooth(0.45, 0.95, (t * 6 + 0.35 * noise.noise(d * 2 + seed)) % 1)
        rad = radius * taper * ridge * step * min(1.0, flat.length * 3.0 + 0.0001) ** 0.15
        v.co = Vector((d.x * rad, d.y * rad * 0.88, t * height)) + lean * (t * t)
    for k in range(cliffs):
        th = r.random() * math.tau
        nz = r.uniform(0.0, 0.35) if k < cliffs - 3 else r.uniform(0.5, 0.8)
        n = Vector((math.cos(th), math.sin(th), 0)) * math.sqrt(1 - nz * nz) + Vector((0, 0, nz))
        z0 = height * (0.15 + r.random() * 0.6 if nz < 0.45 else 0.65 + r.random() * 0.25)
        tt = z0 / height
        reach = radius * (1.25 * (1 - tt) ** 1.25 + 0.12 * (1 - tt))
        co = Vector((0, 0, z0)) + Vector((n.x, n.y, 0)).normalized() * reach * r.uniform(0.8, 0.95)
        geom = tmp.verts[:] + tmp.edges[:] + tmp.faces[:]
        res = bmesh.ops.bisect_plane(tmp, geom=geom, plane_co=co, plane_no=n, clear_outer=True)
        cut = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        if cut:
            bmesh.ops.holes_fill(tmp, edges=cut, sides=0)
    # Flatten and bed the base.
    geom = tmp.verts[:] + tmp.edges[:] + tmp.faces[:]
    res = bmesh.ops.bisect_plane(tmp, geom=geom, plane_co=Vector((0, 0, 0.0)), plane_no=Vector((0, 0, -1)), clear_outer=True)
    bmesh.ops.triangulate(tmp, faces=tmp.faces[:])
    bmesh.ops.dissolve_degenerate(tmp, dist=0.02, edges=tmp.edges[:])
    for v in tmp.verts:
        if v.co.z < 0.05:
            v.co.z = -0.3
    tmp.transform(Matrix.Translation(centre))
    me = bpy.data.meshes.new('_tmp')
    tmp.to_mesh(me)
    tmp.free()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)


def build_crags(mat):
    """A formation: one summit mass with a lower shoulder grown into its flank and a few fallen
    blocks at the foot; strata bands, ledges of grass low and snow high."""
    objs = []
    for name, seed, height, radius in (('CragA', 511, 12.0, 5.0), ('CragB', 512, 11.0, 4.8), ('CragC', 513, 12.5, 5.2)):
        r = rng(seed)
        bm = bmesh.new()
        lean = Vector((r.uniform(-1, 1), r.uniform(-1, 1), 0)) * 0.6
        massif(bm, r, Vector((0, 0, 0)), radius, height, 18, lean)
        a = r.random() * math.tau
        massif(bm, r, Vector((math.cos(a), math.sin(a), 0)) * radius * 0.7, radius * 0.6, height * 0.48, 12,
               Vector((math.cos(a), math.sin(a), 0)) * 0.4)
        for k in range(4):
            a2 = a + math.pi + r.uniform(-1.4, 1.4)
            d = radius * (0.85 + r.random() * 0.2)
            fractured(bm, r, Vector((math.cos(a2) * d, math.sin(a2) * d, radius * 0.08)), radius * (0.14 + r.random() * 0.1), 8,
                      stretch=(1.2, 1.0, 0.7))
        for v in bm.verts:
            if v.co.z < 0:
                v.co.z = min(v.co.z, v.co.z * 0.3 - 0.05)
        seed_n = r.random() * 40
        stone = stone_colour(r, height, 0.2)

        def colour(c: Vector, n: Vector, v: Vector, height=height, stone=stone, seed_n=seed_n):
            base = stone(c, n, v)
            band = math.sin(c.z * 2.4 + noise.noise(c * 0.4 + Vector((seed_n, 0, 0))) * 2.0)
            base = mul(base, 0.93 + 0.07 * band)
            t = c.z / height
            if n.z > 0.3 and t > 0.55:
                base = lerp(base, SNOW, smooth(0.55, 0.75, t) * smooth(0.3, 0.6, n.z))
            elif n.z > 0.45 and t < 0.4:
                base = lerp(base, GRASS, smooth(0.45, 0.8, n.z) * 0.85)
            return base
        objs.append(finish(bm, name, mat, colour, uv_scale=0.35))
    return objs


CLAY_LIT = C('#d98c58')
CLAY = C('#c06a3c')
CLAY_DK = C('#93492a')


def build_clay(mat):
    """Terraced banks of exposed clay: stacked, sliced slabs narrowing upward, a grassy cap."""
    objs = []
    for name, seed, radius, tiers in (('ClayA', 521, 2.6, 3), ('ClayB', 522, 2.2, 2)):
        r = rng(seed)
        bm = bmesh.new()
        z = 0.0
        for t in range(tiers):
            rr = radius * (1 - t * 0.24)
            th = 0.55 + r.random() * 0.25
            fractured(bm, r, Vector(((r.random() - 0.5) * 0.3, (r.random() - 0.5) * 0.3, z + th * 0.2)), rr, 10,
                      depth=(0.65, 0.92), stretch=(1.0, 0.9, th / rr * 1.4), tilt_bias=0.75)
            z += th * 0.75
        for v in bm.verts:
            if v.co.z < 0:
                v.co.z *= 0.3
        seed_n = r.random() * 40

        def colour(c: Vector, n: Vector, v: Vector, top=z, seed_n=seed_n):
            k = noise.noise(c * 1.2 + Vector((seed_n, 0, 0))) * 0.5 + 0.5
            band = math.sin(c.z * 9 + k * 2.0) * 0.5 + 0.5
            base = lerp(CLAY_DK, CLAY, smooth(-0.6, 0.4, n.z + k * 0.3))
            base = lerp(base, CLAY_LIT, band * 0.35 + smooth(0.3, 0.9, n.z) * 0.2)
            if n.z > 0.7:
                base = lerp(base, GRASS, smooth(0.7, 0.92, n.z) * smooth(0.2, 0.6, c.z / max(top, 0.1)) * 0.9)
            return base
        objs.append(finish(bm, name, mat, colour, uv_scale=0.8, crease=50))
    return objs


def build(rock_img):
    sc = new_scene('Rocks')
    mat = material('Rock', image=rock_img, rough=0.88)
    rows = [build_boulders(mat), build_crags(mat), build_clay(mat)]
    objs = [o for row in rows for o in row]
    # Spread out first so neighbours don't occlude each other in the bake.
    for i, row in enumerate(rows):
        layout_row(row, gap=6.0, y=i * 20.0)
    bake_ao(objs, strength=0.55, distance=2.5, samples=32)
    export_glb(objs, 'rocks.glb', images='JPEG')
    save_blend(sc, 'rocks.blend')
    return stats(objs)
