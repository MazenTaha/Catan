"""Hand-painted props for the 3D walk -> apps/web/public/models/props.glb

Built from the concept sheets in the owner's art pack (woodland worksite, desert ruins, farm
props, the weapon chest, equipment, kingdom decorations): chunky silhouettes, bevelled edges
and colour painted into the vertex colours (a lighter top, a darker foot, a little per-face
variation), with no textures at all.

Roots (each a variant node the game finds by name; front faces -Y, origin at ground contact):
  StumpA StumpB AxeStump Log LogPile Stakes Chips           woodland clearings
  MushRed MushBrown                                         forest floor
  DesertStones SandRidge Column Drums Lintel Ruin           desert
  FencePost FenceRail Gate TroughA TroughB BrickStack       farms and clay works
  WeaponChest (+ WeaponChestLid, origin on the rear hinge)  the weapon chest
  Sword Revolver Shield DummyA DummyB                       equipment (Sword/Revolver: grip origin)
  Antlers CandleWheel FloorPlant TablePlant ArmorStand Candles CrossedShields Tapestry Banner
  Bookshelf                                                 My kingdom furnishings

Materials: Wood, Stone, Metal, Brass, Cloth, Glow (flames, embers), Water, Foliage
(double-sided leaves), Owner_Field (light grey; the shield face, tinted in the seat colour) and
Tint_Cloth (light grey; tinted in the kingdom's furnishing colour).
"""

from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector, noise

from common import MeshBuilder, export_glb, layout_row, material, new_scene, rng, save_blend, smooth, srgb, stats

C = srgb
TAU = math.pi * 2
M_WOOD, M_STONE, M_METAL, M_BRASS, M_CLOTH, M_GLOW, M_WATER, M_LEAF, M_OWNER, M_TINT = range(10)

WOOD = C('#8a5a32')
WOOD_DK = C('#5e3b20')
WOOD_LT = C('#b17b46')
PLANK = C('#9a6538')
BARK = C('#5c3d27')
BARK_DK = C('#3f2a1b')
HEART = C('#dcae70')
RING = C('#b98550')
MOSS = C('#6f8f3a')
STEEL = C('#a7afb3')
STEEL_DK = C('#6f777c')
IRON = C('#565c61')
BRASS = C('#c9973f')
ROPE = C('#c9a663')
STRAW = C('#e0b84f')
STRAW_DK = C('#b58b33')
STONE = C('#9b9a94')
SAND = C('#d8b57c')
SAND_DK = C('#b88f58')
CLAY = C('#b5603a')
BRICK = C('#b2563a')
RED = C('#a8322c')
CREAM = C('#efe4c8')
LEATHER = C('#6b3f24')
LEATHER_DK = C('#4a2a17')
GREEN = C('#55703a')
LEAF = C('#4f8a3a')
LEAF_LT = C('#7fae4a')
WATER = C('#4f9fb0')
FLAME = C('#ffcf6e')
WAX = C('#efe6d2')
BONE = C('#e6d9bd')
POT = C('#b5663f')
GREY = C('#d9d9d9')


def mats():
    return [
        material('Wood', rough=0.88),
        material('Stone', rough=0.95),
        material('Metal', rough=0.42, metal=0.6),
        material('Brass', rough=0.4, metal=0.7),
        material('Cloth', rough=1.0, double=True),
        material('Glow', rough=1.0, emission=(1.0, 0.62, 0.25)),
        material('Water', rough=0.12),
        material('Foliage', rough=0.9, double=True),
        material('Owner_Field', rough=0.85),
        material('Tint_Cloth', rough=1.0, double=True),
    ]


# ------------------------------------------------------------------ primitives (bmesh)

def T(loc=(0, 0, 0), rot=(0, 0, 0), s=1.0) -> Matrix:
    sc = Matrix.Diagonal((*s, 1)) if isinstance(s, (tuple, list)) else Matrix.Scale(s, 4)
    return Matrix.Translation(Vector(loc)) @ Euler(rot).to_matrix().to_4x4() @ sc


def cube(sx, sy, sz, bevel=0.0, seg=1, z0=True) -> bmesh.types.BMesh:
    """A box sx * sy * sz standing on z = 0 (or centred with z0=False), edges bevelled."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if z0:
        bmesh.ops.translate(bm, vec=(0, 0, sz / 2), verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(bevel, sx / 2.2, sy / 2.2, sz / 2.2), segments=seg,
                        affect='EDGES', profile=0.5, clamp_overlap=True)
    return bm


def lathe(prof, n=12, cap_top=True, cap_bot=False, mod=None) -> bmesh.types.BMesh:
    """Revolves (radius, z) points about Z. `mod(i, j)` scales vertex i of ring j (organic
    wobble, flutes). A radius of 0 closes the ring to a point."""
    bm = bmesh.new()
    rings = []
    for j, (rad, z) in enumerate(prof):
        if rad <= 1e-6:
            rings.append([bm.verts.new((0, 0, z))] * n)
            continue
        ring = []
        for i in range(n):
            a = TAU * i / n
            k = mod(i, j) if mod else 1.0
            ring.append(bm.verts.new((math.cos(a) * rad * k, math.sin(a) * rad * k, z)))
        rings.append(ring)
    for j in range(len(rings) - 1):
        for i in range(n):
            q = [rings[j][i], rings[j][(i + 1) % n], rings[j + 1][(i + 1) % n], rings[j + 1][i]]
            uq = []
            for v in q:
                if v not in uq:
                    uq.append(v)
            if len(uq) >= 3:
                bm.faces.new(uq)
    if cap_top and prof[-1][0] > 1e-6:
        bm.faces.new(rings[-1])
    if cap_bot and prof[0][0] > 1e-6:
        bm.faces.new(list(reversed(rings[0])))
    bm.normal_update()
    return bm


def cyl(r1, r2, h, n=12, caps=True, mod=None) -> bmesh.types.BMesh:
    return lathe([(r1, 0.0), (r2, h)], n, caps, caps, mod)


def torus(R, r, n=16, m=5) -> bmesh.types.BMesh:
    bm = bmesh.new()
    rings = []
    for i in range(n):
        a = TAU * i / n
        c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new(((R + r * math.cos(TAU * k / m)) * c, (R + r * math.cos(TAU * k / m)) * s,
                                    r * math.sin(TAU * k / m))) for k in range(m)])
    for i in range(n):
        for k in range(m):
            bm.faces.new((rings[i][k], rings[(i + 1) % n][k], rings[(i + 1) % n][(k + 1) % m], rings[i][(k + 1) % m]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def ico(r, sub=1, squash=(1, 1, 1), wobble=0.0, seed=0) -> bmesh.types.BMesh:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        k = 1 + wobble * noise.noise(v.co * 3.1 + Vector((seed, seed * 0.7, 0)))
        v.co = Vector((v.co.x * squash[0], v.co.y * squash[1], v.co.z * squash[2])) * k
    bm.normal_update()
    return bm


def prism(outline, y0, y1) -> bmesh.types.BMesh:
    """An outline in the XZ plane (x, z) extruded from y = y0 (front) to y1 (back)."""
    bm = bmesh.new()
    f = [bm.verts.new((x, y0, z)) for x, z in outline]
    b = [bm.verts.new((x, y1, z)) for x, z in outline]
    bm.faces.new(f)
    bm.faces.new(list(reversed(b)))
    n = len(outline)
    for i in range(n):
        bm.faces.new((f[i], f[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def grid(nx, ny, w, d, hfn) -> bmesh.types.BMesh:
    """A height field w * d centred on the origin; hfn(x, y) -> z."""
    bm = bmesh.new()
    vs = [[bm.verts.new((-w / 2 + w * i / nx, -d / 2 + d * j / ny, 0)) for i in range(nx + 1)] for j in range(ny + 1)]
    for row in vs:
        for v in row:
            v.co.z = hfn(v.co.x, v.co.y)
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    bm.normal_update()
    return bm


# ------------------------------------------------------------------ painter

class Kit:
    """Collects painted parts into one MeshBuilder. Colour per corner: the part's colour (or
    `cfn(p, n)`), a lighter top and darker underside, a little per-face variation, and a soft
    ground occlusion by height (`ao`, for things that stand on the ground)."""

    def __init__(self, seed: int, ao: float = 0.45, ao_h: float = 0.5):
        self.b = MeshBuilder()
        self.r = rng(seed)
        self.ao = ao
        self.ao_h = ao_h

    def shade(self, base, p: Vector, n: Vector, k: float, ao: bool):
        a = 1.0
        if ao and self.ao:
            a = 1 - self.ao + self.ao * smooth(-0.05, self.ao_h, p.z)
        lit = 0.9 + 0.14 * n.z
        return tuple(c * k * lit * a for c in base)

    def add(self, bm, M: Matrix | None = None, color=WOOD, mat=M_WOOD, flat=True, jit=0.06, ao=True, cfn=None):
        M = M or Matrix.Identity(4)
        R = M.to_3x3().inverted().transposed()
        if not flat:
            idx = {}
            for v in bm.verts:
                p = M @ v.co
                n = (R @ v.normal).normalized()
                base = cfn(p, n) if cfn else color
                idx[v] = self.b.vert(p, normal=None, color=self.shade(base, p, n, 1.0, ao))
            for f in bm.faces:
                k = 1 + (self.r.random() * 2 - 1) * jit * 0.5
                ids = [idx[v] for v in f.verts]
                cols = [tuple(c * k for c in self.b.vcol[i]) for i in ids]
                self.b.face(ids, cols, mat=mat, smooth=True)
        else:
            for f in bm.faces:
                pts = [M @ v.co for v in f.verts]
                n = (R @ f.normal).normalized()
                cen = sum(pts, Vector()) / len(pts)
                base = cfn(cen, n) if cfn else color
                k = 1 + (self.r.random() * 2 - 1) * jit
                self.b.poly(pts, [self.shade(base, p, n, k, ao) for p in pts], mat=mat, smooth=False)
        bm.free()

    def build(self, name: str, materials, parent=None, loc=(0, 0, 0)):
        ob = self.b.build(name, materials)
        if parent is not None:
            ob.parent = parent
            ob.location = loc
        return ob


def tri_wedge(w, h, d) -> bmesh.types.BMesh:
    """An axe or chip wedge: thick back (x = 0) to a sharp edge at x = w."""
    return prism([(0, -h / 2), (w, -h / 2 * 1.15), (w, h / 2 * 1.15), (0, h / 2)], -d / 2, d / 2)


def flame(k: Kit, p: Vector, s=1.0):
    k.add(lathe([(0.001, 0), (0.018 * s, 0.015 * s), (0.014 * s, 0.035 * s), (0.001, 0.06 * s)], 6), T(p),
          FLAME, M_GLOW, ao=False, jit=0)


def candle(k: Kit, p: Vector, h: float, holder=True):
    if holder:
        k.add(lathe([(0.05, 0), (0.055, 0.01), (0.018, 0.02), (0.016, 0.08), (0.03, 0.09), (0.03, 0.1)], 10, True, True),
              T(p), BRASS, M_BRASS, ao=False)
        p = p + Vector((0, 0, 0.1))
    drip = lambda i, j: 1.0 + (0.18 if (i % 3 == 0 and j == 1) else 0)  # noqa: E731
    k.add(lathe([(0.024, 0), (0.024, h * 0.6), (0.023, h)], 8, True, False, drip), T(p), WAX, M_CLOTH, ao=False, jit=0.02)
    flame(k, p + Vector((0, 0, h)))


# ------------------------------------------------------------------ woodland

def stump_body(k: Kit, r: float, h: float, seed: int, jag=0.0):
    rr = rng(seed)
    wob = [1 + rr.uniform(-0.07, 0.07) for _ in range(14)]
    tops = [h + (rr.uniform(0, jag) if jag else 0) for _ in range(14)]
    bm = bmesh.new()
    rings = []
    prof = [(1.34, 0.0), (1.14, 0.08), (1.02, 0.28), (1.0, 1.0)]
    for j, (s, z) in enumerate(prof):
        ring = []
        for i in range(14):
            a = TAU * i / 14
            zz = tops[i] if j == 3 else z
            ring.append(bm.verts.new((math.cos(a) * r * s * wob[i], math.sin(a) * r * s * wob[i], zz)))
        rings.append(ring)
    for j in range(3):
        for i in range(14):
            bm.faces.new((rings[j][i], rings[j][(i + 1) % 14], rings[j + 1][(i + 1) % 14], rings[j + 1][i]))
    bm.normal_update()

    def bark(p, n):
        c = BARK if noise.noise(p * 4 + Vector((seed, 0, 0))) > -0.15 else BARK_DK
        if n.z > -0.2 and p.z > h * 0.4 and noise.noise(p * 3.1 + Vector((0, seed, 3))) > 0.45:
            c = MOSS
        return c
    top_ring = [v.co.copy() for v in rings[3]]
    k.add(bm, None, BARK, M_WOOD, cfn=bark)
    # Cut top: rings of heartwood (a jagged stump keeps its splinters bark-dark).
    top = bmesh.new()
    if jag:
        c = top.verts.new((0, 0, h + jag * 0.35))
        ring = [top.verts.new(top_ring[i]) for i in range(14)]
        for i in range(14):
            top.faces.new((c, ring[i], ring[(i + 1) % 14]))
        top.normal_update()
        k.add(top, None, HEART, M_WOOD, cfn=lambda p, n: HEART if p.z < h + jag * 0.5 else RING)
    else:
        fr = [0.96, 0.72, 0.5, 0.28, 0.0]
        rs = []
        for s in fr:
            if s == 0:
                rs.append([top.verts.new((0, 0, h + 0.005))] * 14)
            else:
                rs.append([top.verts.new((math.cos(TAU * i / 14) * r * s * wob[i], math.sin(TAU * i / 14) * r * s * wob[i], h + 0.005)) for i in range(14)])
        for j in range(4):
            for i in range(14):
                q = [rs[j][i], rs[j][(i + 1) % 14], rs[j + 1][(i + 1) % 14], rs[j + 1][i]]
                q = list(dict.fromkeys(q))
                top.faces.new(q)
        top.normal_update()
        k.add(top, None, HEART, M_WOOD, jit=0.02,
              cfn=lambda p, n: RING if int(Vector((p.x, p.y)).length / r * 7) % 2 else HEART)
    # Buttress roots.
    for i in range(5):
        a = TAU * i / 5 + rr.uniform(-0.3, 0.3)
        # A buttress fin running from the trunk down into the ground.
        q = r / 0.5
        fin = prism([(0, 0), (0.42 * q, -0.02), (0.05 * q, 0.3 * q), (-0.02, 0.28 * q)], -0.07 * q, 0.07 * q)
        k.add(fin, T((math.cos(a) * r * 0.8, math.sin(a) * r * 0.8, 0), (0, 0, a)), BARK, M_WOOD)


def axe(k: Kit, M: Matrix):
    k.add(cyl(0.032, 0.026, 0.82, 8), M, C('#a06a3a'), M_WOOD, flat=False)
    k.add(cyl(0.036, 0.036, 0.16, 8), M @ T((0, 0, 0.56)), RED, M_CLOTH)
    head = tri_wedge(0.2, 0.13, 0.05)
    k.add(head, M @ T((0.02, 0, 0.02), (math.pi / 2, 0, 0)), STEEL, M_METAL,
          cfn=lambda p, n: STEEL if True else STEEL)
    k.add(cube(0.07, 0.07, 0.12, 0.01), M @ T((0, 0, -0.04)), IRON, M_METAL)


def build_stumps(M):
    out = []
    k = Kit(11)
    stump_body(k, 0.5, 0.55, 3)
    out.append(k.build('StumpA', M))
    k = Kit(12)
    stump_body(k, 0.4, 0.75, 5, jag=0.45)
    out.append(k.build('StumpB', M))
    k = Kit(13)
    stump_body(k, 0.48, 0.5, 7)
    # The axe bitten into the cut, handle leaning back.
    axe(k, T((0.08, 0.02, 0.5), (0.0, -0.95, 0.3)) @ T((0, 0, -0.08)))
    out.append(k.build('AxeStump', M))
    return out


def log(k: Kit, M: Matrix, L: float, r: float, seed: int):
    rr = rng(seed)
    wob = [1 + rr.uniform(-0.06, 0.06) for _ in range(12)]
    body = lathe([(r, -L / 2), (r * 1.02, 0), (r * 0.98, L / 2)], 12, False, False, lambda i, j: wob[i])

    def bark(p, n):
        q = M.inverted() @ p
        c = BARK if noise.noise(q * 5 + Vector((seed, 0, 0))) > -0.2 else BARK_DK
        if (M.to_3x3() @ Vector((0, 0, 1))).length and n.z > 0.45 and noise.noise(q * 2.5 + Vector((seed, 1, 0))) > 0.2:
            c = MOSS
        return c
    k.add(body, M, BARK, M_WOOD, cfn=bark)
    for zc, sgn in ((-L / 2, -1), (L / 2, 1)):
        cap = bmesh.new()
        rs = []
        for s in (1.0, 0.66, 0.33, 0.0):
            if s == 0:
                rs.append([cap.verts.new((0, 0, zc))] * 12)
            else:
                rs.append([cap.verts.new((math.cos(TAU * i / 12) * r * s * wob[i], math.sin(TAU * i / 12) * r * s * wob[i], zc)) for i in range(12)])
        for j in range(3):
            for i in range(12):
                q = list(dict.fromkeys([rs[j][i], rs[j][(i + 1) % 12], rs[j + 1][(i + 1) % 12], rs[j + 1][i]]))
                cap.faces.new(q if sgn < 0 else list(reversed(q)))
        cap.normal_update()
        k.add(cap, M, HEART, M_WOOD, jit=0.02,
              cfn=lambda p, n: RING if int(((M.inverted() @ p).xy.length) / r * 6) % 2 else HEART)


def build_logs(M):
    out = []
    k = Kit(21)
    log(k, T((0, 0, 0.27), (0, math.pi / 2, 0)), 1.8, 0.27, 4)
    out.append(k.build('Log', M))
    # Six logs stacked 3-2-1 between two lashed stakes per side.
    k = Kit(22)
    r = 0.25
    rows = [(3, 0.0), (2, 1.0), (1, 2.0)]
    s = 0
    for count, row in rows:
        for i in range(count):
            y = (i - (count - 1) / 2) * r * 2.02
            z = r + row * r * 1.74
            log(k, T((0.04 * ((i + row) % 2) - 0.02, y, z), (0, math.pi / 2, 0.03 * (i - 1))), 2.0 + 0.1 * ((i + row) % 2), r, 30 + s)
            s += 1
    for x in (-0.62, 0.62):
        for sy in (-1, 1):
            st = T((x, sy * 0.82, 0), (sy * 0.12, 0, 0))
            k.add(cyl(0.065, 0.055, 1.25, 7), st, WOOD, M_WOOD)
            k.add(lathe([(0.055, 1.25), (0.001, 1.42)], 7, False), st, WOOD_LT, M_WOOD)
            for zr in (0.75, 1.05):
                k.add(torus(0.075, 0.018, 10, 4), st @ T((0, 0, zr)), ROPE, M_CLOTH)
    out.append(k.build('LogPile', M))
    # Two spare stakes, pointed and banded.
    k = Kit(23)
    for x, lean in ((-0.16, 0.05), (0.16, -0.08)):
        st = T((x, 0, 0), (lean, 0, 0))
        k.add(cyl(0.07, 0.06, 1.2, 7), st, WOOD, M_WOOD)
        k.add(lathe([(0.06, 1.2), (0.001, 1.42)], 7, False), st, WOOD_LT, M_WOOD)
        k.add(torus(0.075, 0.02, 10, 4), st @ T((0, 0, 0.9)), ROPE, M_CLOTH)
    out.append(k.build('Stakes', M))
    k = Kit(24)
    rr = rng(5)
    for i in range(9):
        a = rr.uniform(0, TAU)
        d = rr.uniform(0.05, 0.55)
        k.add(tri_wedge(rr.uniform(0.08, 0.16), rr.uniform(0.03, 0.05), rr.uniform(0.04, 0.07)),
              T((math.cos(a) * d, math.sin(a) * d, 0.02), (math.pi / 2, 0, rr.uniform(0, TAU))), HEART, M_WOOD)
    out.append(k.build('Chips', M))
    return out


def mushroom(k: Kit, p: Vector, h: float, r: float, cap, spots: bool, seed: int, tilt=0.0):
    M = T(p, (tilt, 0, 0))
    k.add(lathe([(r * 0.32, 0), (r * 0.26, h * 0.5), (r * 0.3, h * 0.85)], 8, True, False), M, CREAM, M_CLOTH, flat=False)
    k.add(lathe([(r * 0.3, h * 0.82), (r, h * 0.8)], 12, False), M, C('#e9d9b4'), M_CLOTH)  # gills
    rr = rng(seed)
    dots = {(rr.randrange(12), rr.randrange(1, 3)) for _ in range(6)}

    def cfn(q, n):
        lq = M.inverted() @ q
        a = int(round(math.atan2(lq.y, lq.x) / TAU * 12)) % 12
        ring = 1 if lq.z < h * 1.05 else 2
        return CREAM if spots and (a, ring) in dots else cap
    k.add(lathe([(r, h * 0.8), (r * 0.95, h * 0.95), (r * 0.7, h * 1.12), (r * 0.3, h * 1.2), (0.0, h * 1.22)], 12, False),
          M, cap, M_CLOTH, flat=False, cfn=cfn)


def build_mushrooms(M):
    out = []
    k = Kit(31)
    mushroom(k, Vector((0, 0, 0)), 0.2, 0.13, RED, True, 1)
    mushroom(k, Vector((0.16, 0.05, 0)), 0.12, 0.08, RED, True, 2, -0.2)
    mushroom(k, Vector((-0.12, 0.08, 0)), 0.08, 0.06, RED, True, 3, 0.25)
    out.append(k.build('MushRed', M))
    k = Kit(32)
    brown = C('#8a5e3a')
    mushroom(k, Vector((0, 0, 0)), 0.18, 0.12, brown, False, 4)
    mushroom(k, Vector((0.13, -0.04, 0)), 0.12, 0.085, brown, False, 5, 0.2)
    mushroom(k, Vector((-0.11, 0.06, 0)), 0.09, 0.07, brown, False, 6, -0.2)
    mushroom(k, Vector((0.02, 0.13, 0)), 0.06, 0.045, brown, False, 7)
    out.append(k.build('MushBrown', M))
    return out


# ------------------------------------------------------------------ desert

def stone(k: Kit, M: Matrix, r: float, seed: int, color=SAND, squash=(1, 0.85, 0.7)):
    rr = rng(seed)
    bm = ico(r, 1, squash, 0.18, seed)
    for v in bm.verts:
        v.co.z = max(v.co.z, -r * squash[2] * 0.55)
    bm.normal_update()
    k.add(bm, M, color, M_STONE,
          cfn=lambda p, n: color if n.z > 0.3 else tuple(c * 0.86 for c in color), jit=0.08)
    _ = rr


def fluted(r: float, h: float, n=20, depth=0.08):
    return lambda i, j: 1.0 - (depth if i % 2 else 0.0)


def column_shaft(k: Kit, M: Matrix, r: float, h: float, seed: int, broken=True):
    rr = rng(seed)
    n = 20
    bm = lathe([(r, 0), (r * 0.97, h * 0.5), (r * 0.93, h)], n, False, True, fluted(r, h, n))
    if broken:
        tops = [h - rr.uniform(0, 0.35) - (0.3 if i in (3, 4, 5) else 0) for i in range(n)]
        for v in bm.verts:
            if v.co.z > h - 1e-4:
                i = int(round(math.atan2(v.co.y, v.co.x) / TAU * n)) % n
                v.co.z = tops[i]
        ring = [v for v in bm.verts if v.co.z > h * 0.5]
        ring.sort(key=lambda v: math.atan2(v.co.y, v.co.x))
        c = bm.verts.new((0, 0, h - 0.2))
        for i in range(len(ring)):
            bm.faces.new((c, ring[(i + 1) % len(ring)], ring[i]))
    else:
        bm.faces.new([v for v in sorted([v for v in bm.verts if v.co.z > h - 1e-4], key=lambda v: math.atan2(v.co.y, v.co.x))])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    k.add(bm, M, SAND, M_STONE, cfn=lambda p, n: C('#e2c48e') if n.z > 0.5 else SAND)


def plinth(k: Kit, M: Matrix, w: float, r: float):
    k.add(cube(w, w, 0.34, 0.04), M, SAND_DK, M_STONE)
    k.add(cube(w * 0.86, w * 0.86, 0.16, 0.03), M @ T((0, 0, 0.34)), SAND, M_STONE)
    k.add(lathe([(r * 1.25, 0.5), (r * 1.3, 0.56), (r * 1.15, 0.64), (r * 1.05, 0.7)], 20, False), M, SAND, M_STONE)


def drum(k: Kit, M: Matrix, r: float, h: float):
    k.add(lathe([(r, 0), (r, h)], 20, True, True, fluted(r, h)), M, SAND, M_STONE,
          cfn=lambda p, n: C('#e2c48e') if n.z > 0.5 else SAND)


def block(k: Kit, M: Matrix, sx, sy, sz, color=SAND):
    k.add(cube(sx, sy, sz, 0.045), M, color, M_STONE,
          cfn=lambda p, n: tuple(c * (1.06 if n.z > 0.5 else 1) for c in color))


def lintel(k: Kit, M: Matrix, L=2.4):
    segs = [(-L / 2, -L / 6), (-L / 6 + 0.03, L / 6), (L / 6 + 0.03, L / 2)]
    for i, (a, b) in enumerate(segs):
        block(k, M @ T(((a + b) / 2, 0, 0), (0, 0.02 * (i - 1), 0.015 * (i - 1))), b - a - 0.02, 0.55, 0.42)
        k.add(cube(b - a - 0.06, 0.6, 0.06, 0.02), M @ T(((a + b) / 2, 0, 0.3)), SAND_DK, M_STONE)


def build_desert(M):
    out = []
    k = Kit(41)
    stone(k, T((0, 0, 0.35), (0.2, 0.1, 0.4)), 0.55, 1, C('#c99a63'))
    stone(k, T((0.7, 0.2, 0.22), (0, 0.3, 1.2)), 0.38, 2, C('#c18e58'))
    stone(k, T((-0.55, -0.15, 0.12), (0, 0, 2)), 0.2, 3, SAND_DK)
    stone(k, T((0.3, -0.5, 0.08), (0, 0, 0.4)), 0.13, 4, SAND_DK)
    out.append(k.build('DesertStones', M))
    k = Kit(42, ao=0.2)

    def dune(x, y):
        crest = 0.95 * math.exp(-((x / 2.1) ** 2) - ((y + 0.25 * x / 2.2) / 0.9) ** 2 * (1.6 if y > 0 else 0.8))
        return max(0.0, crest - 0.02)
    k.add(grid(16, 8, 4.8, 2.6, dune), None, SAND, M_STONE, flat=False,
          cfn=lambda p, n: C('#e9c88c') if math.sin(p.x * 6 + p.y * 3) > 0.55 else C('#dcb479'))
    out.append(k.build('SandRidge', M))
    k = Kit(43)
    plinth(k, Matrix.Identity(4), 1.0, 0.3)
    column_shaft(k, T((0, 0, 0.7)), 0.3, 1.9, 6)
    out.append(k.build('Column', M))
    k = Kit(44)
    drum(k, T((0, 0, 0)), 0.38, 0.5)
    drum(k, T((0.03, 0, 0.5), (0, 0, 0.4)), 0.36, 0.44)
    drum(k, T((0.85, 0.15, 0.36), (math.pi / 2, 0, 0.5)) @ T((0, 0, -0.24)), 0.36, 0.48)
    out.append(k.build('Drums', M))
    k = Kit(45)
    block(k, T((-0.85, 0, 0)), 0.55, 0.55, 0.45)
    block(k, T((0.85, 0, 0)), 0.55, 0.55, 0.38)
    lintel(k, T((0, 0, 0.42), (0, 0.03, 0)))
    out.append(k.build('Lintel', M))
    # The assembled ruin: a stepped platform, broken wall, a standing column and a fallen beam.
    k = Kit(46)
    rr = rng(9)
    for tier in range(3):
        w = 4.2 - tier * 0.7
        d = 3.4 - tier * 0.5
        y0 = -tier * 0.25
        x = -w / 2
        while x < w / 2 - 0.1:
            bw = min(rr.uniform(0.6, 1.0), w / 2 - x)
            block(k, T((x + bw / 2, y0 + tier * 0.1, tier * 0.3)), bw - 0.03, d, 0.3, SAND if (tier + int(x * 3)) % 2 else C('#cfa871'))
            x += bw
    plinth(k, T((-1.15, 0.6, 0.9)), 0.8, 0.24)
    column_shaft(k, T((-1.15, 0.6, 1.46)), 0.24, 1.6, 11)
    for i, (x, z) in enumerate(((0.0, 0.9), (0.55, 0.9), (0.0, 1.32), (1.1, 0.9))):
        block(k, T((x, 1.05, z), (0, 0, rr.uniform(-0.08, 0.08))), 0.52, 0.5, 0.4, C('#d1ab74') if i % 2 else SAND)
    lintel(k, T((0.6, 0.35, 1.25), (0, -0.35, 0.25)) @ T((0, 0, -0.2)), 2.0)
    drum(k, T((1.25, -0.6, 1.05), (math.pi / 2, 0, -0.3)) @ T((0, 0, -0.2)), 0.3, 0.42)
    for i in range(6):
        stone(k, T((rr.uniform(-2.2, 2.2), rr.uniform(-2.0, -1.4), 0.06)), rr.uniform(0.1, 0.2), 20 + i, SAND_DK)
    out.append(k.build('Ruin', M))
    return out


# ------------------------------------------------------------------ farm

def rail_log(k: Kit, M: Matrix, L: float, r: float, seed: int):
    rr = rng(seed)
    k.add(lathe([(r, -L / 2), (r * 1.06, -L / 6), (r * 0.96, L / 6), (r, L / 2)], 7, True, True,
                lambda i, j: 1 + rr.uniform(-0.08, 0.08)), M, WOOD, M_WOOD,
          cfn=lambda p, n: WOOD_LT if n.z > 0.4 else WOOD)


def build_farm(M):
    out = []
    k = Kit(51)
    k.add(cyl(0.1, 0.085, 1.15, 8, mod=lambda i, j: 1 + 0.05 * math.sin(i * 2.1)), None, WOOD, M_WOOD)
    k.add(lathe([(0.085, 1.15), (0.06, 1.2)], 8), None, HEART, M_WOOD)
    for z in (0.45, 0.85):
        k.add(torus(0.105, 0.022, 10, 4), T((0, 0, z)), ROPE, M_CLOTH)
        k.add(torus(0.105, 0.022, 10, 4), T((0, 0, z + 0.06)), ROPE, M_CLOTH)
    out.append(k.build('FencePost', M))
    # Rails one metre long along X (the game stretches them between posts).
    k = Kit(52)
    rail_log(k, T((0, 0, 0.47), (0, math.pi / 2, 0)), 1.0, 0.06, 1)
    rail_log(k, T((0, 0, 0.88), (0, math.pi / 2, 0.02)), 1.0, 0.055, 2)
    out.append(k.build('FenceRail', M))
    # A farm gate: two posts, a braced leaf on iron hinges, and a pennant.
    k = Kit(53)
    for x in (-0.95, 0.95):
        k.add(cube(0.2, 0.2, 1.45, 0.03), T((x, 0, 0)), WOOD, M_WOOD)
        k.add(lathe([(0.13, 1.45), (0.001, 1.6)], 4), T((x, 0, 0), (0, 0, math.pi / 4)), WOOD_LT, M_WOOD)
    leaf = T((-0.82, 0, 0.18))
    for z in (0.05, 0.5, 0.95):
        k.add(cube(1.62, 0.07, 0.12, 0.015), leaf @ T((0.81, 0, z)), PLANK, M_WOOD)
    for x in (0.04, 1.58):
        k.add(cube(0.1, 0.08, 1.1, 0.015), leaf @ T((x, 0, 0)), WOOD, M_WOOD)
    k.add(cube(1.85, 0.06, 0.1, 0.015), leaf @ T((0.81, 0, 0.55), (0, -0.6, 0)) @ T((0, 0, -0.05)), WOOD_LT, M_WOOD)
    for z in (0.15, 0.95):
        k.add(cube(0.34, 0.09, 0.07, 0.01), leaf @ T((0.12, 0, z)), IRON, M_METAL)
    k.add(cyl(0.015, 0.015, 0.5, 6), T((-0.95, 0, 1.45), (0, math.pi / 2, 0)), BRASS, M_BRASS)
    k.add(prism([(-0.95, 1.92), (-0.55, 1.88), (-0.66, 1.78), (-0.55, 1.68), (-0.95, 1.66)], -0.01, 0.01), None,
          C('#d9822b'), M_CLOTH)
    k.add(cyl(0.02, 0.02, 0.5, 6), T((-0.95, 0, 1.45)), WOOD, M_WOOD)
    out.append(k.build('Gate', M))
    # Trough A: a hollowed log on two chocks with iron bands; Trough B: dressed stone.
    k = Kit(54)
    L = 1.6
    body = lathe([(0.32, -L / 2), (0.33, 0), (0.32, L / 2)], 14, True, True)
    bmesh.ops.bisect_plane(body, geom=body.verts[:] + body.edges[:] + body.faces[:], plane_co=(0, 0.2, 0),
                           plane_no=(0, 1, 0), clear_outer=True)
    k.add(body, T((0, 0, 0.42), (0, math.pi / 2, 0)), BARK, M_WOOD)
    k.add(cube(L - 0.12, 0.42, 0.04), T((0, 0, 0.55)), WATER, M_WATER, ao=False)
    k.add(cube(L - 0.04, 0.5, 0.04), T((0, 0, 0.6)), HEART, M_WOOD)
    for x in (-0.5, 0.5):
        k.add(cube(0.24, 0.8, 0.22, 0.03), T((x, 0, 0)), WOOD_DK, M_WOOD)
        k.add(torus(0.335, 0.025, 14, 4), T((x, 0, 0.42), (0, math.pi / 2, 0)), IRON, M_METAL)
    out.append(k.build('TroughA', M))
    k = Kit(55)
    for i, (x, w) in enumerate(((-0.62, 0.36), (0.62, 0.36))):
        block(k, T((x, 0, 0)), w, 0.8, 0.62, STONE if i else C('#a6a39b'))
    block(k, T((0, 0.31, 0)), 0.9, 0.18, 0.62, C('#a29f98'))
    block(k, T((0, -0.31, 0)), 0.9, 0.18, 0.62, STONE)
    block(k, T((0, 0, 0)), 0.9, 0.46, 0.2, C('#8f8d86'))
    k.add(cube(0.9, 0.46, 0.04), T((0, 0, 0.5)), WATER, M_WATER, ao=False)
    for x in (-0.4, 0.5):
        k.add(cube(0.2, 0.03, 0.15), T((x, -0.405, 0.4)), MOSS, M_STONE)
    out.append(k.build('TroughB', M))
    # Brick stack: a pallet, three courses of bricks laid crosswise, two rope straps.
    k = Kit(56)
    for y in (-0.42, 0, 0.42):
        k.add(cube(1.25, 0.14, 0.1, 0.01), T((0, y, 0)), WOOD_DK, M_WOOD)
    for x in (-0.56, -0.18, 0.18, 0.56):
        k.add(cube(0.24, 1.0, 0.05, 0.01), T((x, 0, 0.1)), PLANK, M_WOOD)
    rr = rng(3)
    for c in range(3):
        z = 0.15 + c * 0.13
        for i in range(4):
            for j in range(2):
                if c % 2 == 0:
                    pos, size = (-0.45 + i * 0.3, -0.22 + j * 0.44, z), (0.28, 0.42, 0.12)
                else:
                    pos, size = (-0.33 + j * 0.66, -0.36 + i * 0.24, z), (0.62, 0.22, 0.12)
                col = BRICK if rr.random() > 0.3 else C('#c46a45')
                k.add(cube(*size, 0.02), T(pos), col, M_STONE, cfn=lambda p, n, col=col: tuple(x * (1.12 if n.z > 0.5 else 1) for x in col))
    for x in (-0.32, 0.32):
        for side in (-1, 1):
            k.add(cube(0.05, 0.03, 0.4), T((x, side * 0.46, 0.15)), ROPE, M_CLOTH)
        k.add(cube(0.05, 0.94, 0.03), T((x, 0, 0.55)), ROPE, M_CLOTH)
    k.add(cube(0.28, 0.13, 0.11, 0.02), T((0.85, -0.3, 0), (0, 0, 0.4)), BRICK, M_STONE)
    k.add(cube(0.28, 0.13, 0.11, 0.02), T((0.8, -0.05, 0.11), (0.1, 0, 1.1)), C('#c46a45'), M_STONE)
    out.append(k.build('BrickStack', M))
    return out


# ------------------------------------------------------------------ the weapon chest

CW, CD, CH, LH = 0.86, 0.54, 0.44, 0.17


def build_chest(M):
    k = Kit(61, ao=0.3, ao_h=0.3)
    t = 0.045
    # Floor and four walls of planks (two tones), a dark inside.
    k.add(cube(CW, CD, 0.06, 0.01), None, WOOD_DK, M_WOOD)
    for i in range(4):
        z = 0.06 + i * 0.095
        col = PLANK if i % 2 else WOOD
        for y in (-CD / 2 + t / 2, CD / 2 - t / 2):
            k.add(cube(CW - 0.02, t, 0.09, 0.012), T((0, y, z)), col, M_WOOD)
        for x in (-CW / 2 + t / 2, CW / 2 - t / 2):
            k.add(cube(t, CD - 2 * t, 0.09, 0.012), T((x, 0, z)), col, M_WOOD)
    k.add(cube(CW - 2 * t - 0.01, CD - 2 * t - 0.01, 0.01), T((0, 0, 0.062)), C('#2e1d12'), M_WOOD, ao=False)
    for x in (-CW / 2 + t + 0.003, CW / 2 - t - 0.003):
        k.add(cube(0.004, CD - 2 * t, CH - 0.08), T((x, 0, 0.065)), C('#3a2516'), M_WOOD, ao=False)
    for y in (-CD / 2 + t + 0.003, CD / 2 - t - 0.003):
        k.add(cube(CW - 2 * t, 0.004, CH - 0.08), T((0, y, 0.065)), C('#3a2516'), M_WOOD, ao=False)
    # Iron: corner brackets, two vertical bands front and back, feet.
    for x in (-CW / 2, CW / 2):
        for y in (-CD / 2, CD / 2):
            k.add(cube(0.085, 0.085, CH - 0.01, 0.01), T((x * 0.985, y * 0.975, 0.005)), IRON, M_METAL)
            k.add(cube(0.12, 0.12, 0.06, 0.012), T((x * 0.96, y * 0.95, -0.0)), WOOD_DK, M_WOOD)
    for x in (-0.25, 0.25):
        for y in (-CD / 2 - 0.006, CD / 2 + 0.006):
            k.add(cube(0.07, 0.014, CH - 0.04), T((x, y, 0.02)), IRON, M_METAL)
            for z in (0.08, 0.22, 0.36):
                k.add(ico(0.012, 1), T((x, y * 1.02, z)), BRASS, M_BRASS, ao=False)
    # The sword emblem and hasp on the front.
    f = -CD / 2 - 0.012
    k.add(cube(0.025, 0.01, 0.2, 0.004), T((0, f, 0.06)), BRASS, M_BRASS, ao=False)
    k.add(cube(0.12, 0.012, 0.025, 0.004), T((0, f, 0.24)), BRASS, M_BRASS, ao=False)
    k.add(cube(0.035, 0.012, 0.05, 0.004), T((0, f, 0.265)), BRASS, M_BRASS, ao=False)
    k.add(prism([(-0.02, 0.06), (0.0, 0.025), (0.02, 0.06)], f - 0.005, f + 0.005), None, BRASS, M_BRASS, ao=False)
    k.add(cube(0.1, 0.016, 0.09, 0.01), T((0, f - 0.004, CH - 0.1)), BRASS, M_BRASS, ao=False)
    k.add(cube(0.05, 0.02, 0.03, 0.006), T((0, f - 0.01, CH - 0.075)), C('#5c4a2a'), M_METAL, ao=False)
    root = k.build('WeaponChest', M)
    # Lid: hinged at the top of the back wall; local frame has the hinge at the origin, the
    # lid reaching forward (-Y) and up. Planks on top, iron edging, the hasp hanging in front.
    k = Kit(62, ao=0)
    for i in range(4):
        y = -CD / 2 + (i + 0.5) * CD / 4
        k.add(cube(CW, CD / 4 - 0.008, 0.06, 0.012), T((0, y - CD / 2, LH - 0.06)), PLANK if i % 2 else WOOD, M_WOOD)
    k.add(cube(CW, CD, LH - 0.06, 0.012), T((0, -CD / 2, 0)), WOOD, M_WOOD,
          cfn=lambda p, n: C('#3a2516') if n.z < -0.5 else WOOD)
    for x in (-CW / 2, CW / 2):
        for y in (-CD, 0.0):
            k.add(cube(0.09, 0.09, LH + 0.004, 0.01), T((x * 0.985, y * 0.975 + (0.04 if y else -0.0) - (0 if y else 0.0), -0.002)), IRON, M_METAL)
    for x in (-0.25, 0.25):
        k.add(cube(0.07, CD + 0.02, 0.014), T((x, -CD / 2, LH - 0.002)), IRON, M_METAL)
        k.add(cube(0.07, 0.014, LH), T((x, -CD - 0.007, 0)), IRON, M_METAL)
        k.add(cube(0.07, 0.014, LH), T((x, 0.007, 0)), IRON, M_METAL)
        k.add(cube(0.06, 0.03, 0.05, 0.008), T((x, 0.02, -0.02)), BRASS, M_BRASS)
    k.add(cube(0.09, 0.016, 0.12, 0.008), T((0, -CD - 0.012, -0.04)), BRASS, M_BRASS)
    k.build('WeaponChestLid', M, root, (0, CD / 2, CH))
    return [root]


# ------------------------------------------------------------------ equipment

def build_sword(M):
    """Sword A: a long straight blade with a fuller, down-curved brass guard with ball ends and
    a sprig emblem, a leather-wrapped grip and a round sprig pommel. Grip centre at the origin,
    the blade along +Y (the game's -Z), its flat facing -Y/+Y... flats face +-Z."""
    k = Kit(71, ao=0)
    L0, L1 = 0.12, 0.98
    w = 0.03
    th = 0.007
    pts = []
    for y, hw in ((L0, w), (0.55, w * 0.92), (0.86, w * 0.7), (L1, 0.001)):
        pts.append((y, hw))
    bm = bmesh.new()
    top, bot, ridgeT, ridgeB = [], [], [], []
    for y, hw in pts:
        top.append((bm.verts.new((-hw, y, 0)), bm.verts.new((hw, y, 0))))
        ridgeT.append(bm.verts.new((0, y, th)))
        ridgeB.append(bm.verts.new((0, y, -th)))
    for i in range(len(pts) - 1):
        (l0, r0), (l1, r1) = top[i], top[i + 1]
        bm.faces.new((l0, ridgeT[i], ridgeT[i + 1], l1) if l1 is not r1 else (l0, ridgeT[i], ridgeT[i + 1]))
        bm.faces.new((ridgeT[i], r0, r1, ridgeT[i + 1]) if l1 is not r1 else (ridgeT[i], r0, ridgeT[i + 1]))
        bm.faces.new((ridgeB[i], l0, l1, ridgeB[i + 1]))
        bm.faces.new((r0, ridgeB[i], ridgeB[i + 1], r1))
    bm.faces.new((top[0][0], top[0][1], ridgeT[0]))
    bm.faces.new((top[0][1], top[0][0], ridgeB[0]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    k.add(bm, None, STEEL, M_METAL, jit=0.03,
          cfn=lambda p, n: STEEL_DK if abs(p.x) < w * 0.28 and p.y < 0.8 else STEEL)
    # Guard: a bar curving down towards the grip at both ends, brass balls on the tips.
    gp = [Vector((x, 0.1 - 0.05 * (x / 0.15) ** 2, 0)) for x in (-0.15, -0.1, -0.05, 0.0, 0.05, 0.1, 0.15)]
    for a, b in zip(gp, gp[1:]):
        d = b - a
        k.add(cyl(0.012, 0.012, d.length, 8), T(a, Vector((0, 0, 1)).rotation_difference(d).to_euler()), BRASS, M_BRASS)
    for s in (-1, 1):
        k.add(ico(0.02, 1), T((s * 0.155, 0.1 - 0.054, 0)), BRASS, M_BRASS)
    k.add(prism([(-0.03, 0), (0, 0.035), (0.03, 0), (0, -0.035)], -0.016, 0.016), T((0, 0.105, 0), (math.pi / 2, 0, 0)), BRASS, M_BRASS)
    # Grip: alternating leather bands; ferrules.
    for i in range(6):
        k.add(cyl(0.02, 0.02, 0.031, 8), T((0, 0.085 - i * 0.031, 0), (math.pi / 2, 0, 0)), LEATHER if i % 2 else LEATHER_DK, M_CLOTH)
    k.add(cyl(0.024, 0.024, 0.02, 10), T((0, 0.1, 0), (math.pi / 2, 0, 0)), BRASS, M_BRASS)
    k.add(cyl(0.023, 0.023, 0.02, 10), T((0, -0.1, 0), (math.pi / 2, 0, 0)), BRASS, M_BRASS)
    k.add(cyl(0.045, 0.045, 0.026, 14), T((0, -0.15, -0.013)), BRASS, M_BRASS, cfn=lambda p, n: C('#a87a2c') if abs(n.z) > 0.9 and Vector((p.x, p.y + 0.15)).length < 0.018 else BRASS)
    return [k.build('Sword', M)]


def build_revolver(M):
    """Revolver A: a steel frame and fluted cylinder, round barrel with a front sight, a brass
    trigger guard and a walnut grip. Origin where the hand closes (top of the grip); barrel
    along +Y."""
    k = Kit(72, ao=0)
    blued = C('#5d666c')
    k.add(cube(0.036, 0.13, 0.07, 0.008), T((0, 0.04, 0.02)), blued, M_METAL)
    k.add(lathe([(0.032, 0), (0.032, 0.075)], 12, True, True, lambda i, j: 0.88 if i % 2 else 1.0),
          T((0, 0.04, 0.05), (-math.pi / 2, 0, 0)) @ T((0, 0, -0.035)), STEEL_DK, M_METAL)
    k.add(cyl(0.014, 0.013, 0.17, 10), T((0, 0.11, 0.065), (-math.pi / 2, 0, 0)), blued, M_METAL)
    k.add(cube(0.024, 0.15, 0.01, 0.003), T((0, 0.175, 0.07)), blued, M_METAL)
    k.add(cube(0.006, 0.012, 0.016, 0.002), T((0, 0.27, 0.075)), STEEL, M_METAL)
    k.add(cube(0.014, 0.025, 0.035, 0.004), T((0, -0.03, 0.06), (0.5, 0, 0)), STEEL_DK, M_METAL)
    k.add(torus(0.026, 0.005, 12, 4), T((0, 0.02, -0.025), (0, math.pi / 2, 0)), BRASS, M_BRASS)
    k.add(cube(0.006, 0.012, 0.03, 0.002), T((0, 0.022, -0.035)), STEEL_DK, M_METAL)
    grip = T((0, -0.02, 0.0), (0.38, 0, 0))
    k.add(cube(0.034, 0.05, 0.12, 0.012), grip @ T((0, 0, -0.12)), C('#7a3a22'), M_WOOD)
    k.add(cyl(0.006, 0.006, 0.038, 6), grip @ T((-0.019, 0, -0.07), (0, math.pi / 2, 0)), BRASS, M_BRASS)
    k.add(cube(0.036, 0.054, 0.012, 0.004), grip @ T((0, 0, -0.13)), blued, M_METAL)
    return [k.build('Revolver', M)]


def heater(w=0.56, h=0.68, n=10):
    """The heater shield outline (x, z), point at the bottom, top edge at z = h/2."""
    pts = [(-w / 2, h / 2), (w / 2, h / 2)]
    for i in range(1, n + 1):
        t = i / n
        pts.append((w / 2 * math.cos(t * math.pi / 2) ** 0.8, h / 2 - h * 0.35 - h * 0.65 * math.sin(t * math.pi / 2)))
    pts[-1] = (0.0, -h / 2)
    for i in range(n - 1, 0, -1):
        x, z = pts[1 + i]
        pts.append((-x, z))
    return pts


def build_shield(M):
    """Shield A: a heater of planks with a steel rim and rivets, the face in the seat colour
    with a cream sprig crest; leather straps and a grip on the back. Origin at the centre of the
    back (the forearm); the face looks -Y."""
    k = Kit(73, ao=0)
    out = heater(0.56, 0.68)
    face = prism(out, -0.05, -0.02)
    k.add(face, None, GREY, M_OWNER, jit=0.03,
          cfn=lambda p, n: (C('#c9c9c9') if int((p.x + 1) * 11) % 2 else GREY) if n.y < -0.5 else C('#8a6a4a'))
    k.add(prism(out, -0.02, 0.0), None, PLANK, M_WOOD,
          cfn=lambda p, n: PLANK if int((p.x + 1) * 11) % 2 else WOOD)
    # Rim: a slightly larger outline behind, showing round the edge.
    big = [(x * 1.07, z * 1.06 + 0.003) for x, z in out]
    k.add(prism(big, -0.045, -0.005), None, STEEL, M_METAL)
    for x, z in out[::2]:
        k.add(ico(0.011, 1), T((x * 0.93, -0.054, z * 0.93)), BRASS, M_BRASS)
    # Crest: a five-petal flower on a stem with two leaves.
    fy = -0.058
    for i in range(5):
        a = TAU * i / 5 + math.pi / 2
        k.add(cyl(0.032, 0.032, 0.008, 8), T((math.cos(a) * 0.038, fy, 0.09 + math.sin(a) * 0.038), (math.pi / 2, 0, 0)), CREAM, M_CLOTH)
    k.add(cyl(0.022, 0.022, 0.01, 8), T((0, fy - 0.002, 0.09), (math.pi / 2, 0, 0)), C('#c98a3a'), M_CLOTH)
    k.add(cube(0.014, 0.008, 0.16, 0.002), T((0, fy, -0.09)), CREAM, M_CLOTH)
    for s in (-1, 1):
        k.add(prism([(0, 0), (s * 0.07, 0.04), (s * 0.08, 0.0), (s * 0.03, -0.02)], fy - 0.004, fy + 0.004),
              T((0, 0, -0.05)), CREAM, M_CLOTH)
    for z in (0.12, -0.08):
        k.add(cube(0.36, 0.012, 0.045, 0.006), T((0, 0.006, z)), LEATHER, M_CLOTH)
        for x in (-0.15, 0.15):
            k.add(cube(0.04, 0.016, 0.05, 0.005), T((x, 0.012, z - 0.003)), BRASS, M_BRASS)
    k.add(cube(0.05, 0.04, 0.16, 0.012), T((0, 0.03, -0.06)), LEATHER_DK, M_CLOTH)
    return [k.build('Shield', M)]


def build_dummies(M):
    out = []
    for name, arms in (('DummyA', True), ('DummyB', False)):
        k = Kit(81 + arms, ao=0.35, ao_h=0.4)
        for a in (0, math.pi / 2):
            k.add(cube(0.9, 0.12, 0.1, 0.02), T((0, 0, 0), (0, 0, a)), WOOD, M_WOOD)
        for i in range(4):
            a = TAU * i / 4
            k.add(cube(0.08, 0.3, 0.06, 0.01), T((math.cos(a) * 0.18, math.sin(a) * 0.18, 0.1), (0.7, 0, a + math.pi / 2)), WOOD_DK, M_WOOD)
        k.add(cube(0.1, 0.1, 1.15, 0.015), T((0, 0, 0.1)), WOOD, M_WOOD)
        rr = rng(7 + arms)
        straw = lambda i, j: 1 + (0.14 if (i + j) % 3 == 0 else 0) * rr.uniform(0.5, 1)  # noqa: E731
        body_z = 0.65
        k.add(lathe([(0.12, body_z), (0.23, body_z + 0.08), (0.25, body_z + 0.35), (0.22, body_z + 0.6), (0.12, body_z + 0.7)],
                    12, True, True, straw), None, STRAW, M_WOOD, cfn=lambda p, n: STRAW if noise.noise(p * 9) > -0.3 else STRAW_DK)
        k.add(lathe([(0.1, 1.38), (0.15, 1.45), (0.14, 1.6), (0.02, 1.72)], 10, False, True, straw), None, STRAW, M_WOOD,
              cfn=lambda p, n: STRAW if noise.noise(p * 9 + Vector((3, 0, 0))) > -0.3 else STRAW_DK)
        for z in (0.82, 1.18, 1.42):
            k.add(torus(0.21 if z < 1.3 else 0.115, 0.018, 12, 4), T((0, 0, z)), ROPE, M_CLOTH)
        k.add(torus(0.245, 0.03, 12, 4), T((0, 0, 1.0)), RED, M_CLOTH)
        k.add(cube(0.08, 0.02, 0.28), T((0.12, -0.24, 0.74), (0, 0.2, 0)), RED, M_CLOTH)
        if arms:
            k.add(cyl(0.05, 0.05, 1.2, 8), T((-0.6, 0, 1.18), (0, math.pi / 2, 0)), WOOD, M_WOOD)
            for s in (-1, 1):
                k.add(lathe([(0.07, 0), (0.1, 0.12), (0.09, 0.3), (0.06, 0.36)], 9, True, True, straw),
                      T((s * 0.25, 0, 1.18), (0, s * math.pi / 2, 0)), STRAW, M_WOOD)
        out.append(k.build(name, M))
    return out


# ------------------------------------------------------------------ kingdom furnishings

def build_decor(M):
    out = []
    # Antler trophy: a shield-shaped plaque, the skull cap and two branching antlers.
    k = Kit(91, ao=0)
    plaque = [(-0.17, 0.2), (0.17, 0.2), (0.17, -0.05), (0.0, -0.22), (-0.17, -0.05)]
    k.add(prism(plaque, -0.04, 0.0), None, WOOD, M_WOOD, cfn=lambda p, n: WOOD_LT if n.y < -0.5 and int((p.x + 1) * 18) % 2 else WOOD)
    k.add(ico(0.07, 1, (1, 0.8, 0.8)), T((0, -0.06, 0.06)), BONE, M_CLOTH)
    k.add(cube(0.24, 0.02, 0.05, 0.006), T((0, -0.045, 0.02)), BRASS, M_BRASS)
    for s in (-1, 1):
        prev = Vector((s * 0.05, -0.08, 0.08))
        for i, (dx, dz) in enumerate(((0.1, 0.04), (0.08, 0.1), (0.03, 0.12), (-0.02, 0.1))):
            nxt = prev + Vector((s * dx, -0.01, dz))
            d = nxt - prev
            rot = Vector((0, 0, 1)).rotation_difference(d).to_euler()
            k.add(cyl(0.022 - i * 0.003, 0.018 - i * 0.003, d.length, 6), T(prev, rot), BONE, M_CLOTH)
            if i in (1, 2):
                tip = Vector((s * 0.02, -0.01, 0.09))
                k.add(cyl(0.013, 0.004, tip.length, 5), T(nxt, Vector((0, 0, 1)).rotation_difference(tip).to_euler()), BONE, M_CLOTH)
            prev = nxt
    out.append(k.build('Antlers', M))
    # Candle wheel: an iron ring on four chains, six candles. Origin at the ring.
    k = Kit(92, ao=0)
    k.add(torus(0.42, 0.03, 20, 5), None, IRON, M_METAL)
    k.add(torus(0.36, 0.012, 20, 4), T((0, 0, -0.04)), IRON, M_METAL)
    for i in range(6):
        a = TAU * i / 6
        p = Vector((math.cos(a) * 0.42, math.sin(a) * 0.42, 0.02))
        k.add(cyl(0.035, 0.035, 0.02, 8), T(p), BRASS, M_BRASS)
        candle(k, p + Vector((0, 0, 0.02)), 0.12, holder=False)
    for i in range(4):
        a = TAU * i / 4 + math.pi / 4
        base = Vector((math.cos(a) * 0.4, math.sin(a) * 0.4, 0.02))
        top = Vector((0, 0, 0.5))
        d = top - base
        k.add(cyl(0.008, 0.008, d.length, 4), T(base, Vector((0, 0, 1)).rotation_difference(d).to_euler()), IRON, M_METAL)
    k.add(torus(0.04, 0.01, 8, 4), T((0, 0, 0.52), (math.pi / 2, 0, 0)), IRON, M_METAL)
    out.append(k.build('CandleWheel', M))
    # Potted plants: a floor pot with broad leaves; a table pot with a bushy sprig.
    for name, s, pot_band, broad in (('FloorPlant', 1.0, 'zig', True), ('TablePlant', 0.55, 'band', False)):
        k = Kit(93 + broad, ao=0.25, ao_h=0.2)
        prof = [(0.12 * s, 0), (0.17 * s, 0.08 * s), (0.18 * s, 0.22 * s), (0.15 * s, 0.32 * s), (0.17 * s, 0.35 * s), (0.15 * s, 0.36 * s)]

        def potc(p, n, s=s, zig=(pot_band == 'zig')):
            if zig:
                z = p.z / s
                a = math.atan2(p.y, p.x)
                return CREAM if abs(z - 0.2 - 0.03 * math.sin(a * 12) * 1.0) < 0.018 else POT
            return C('#b84a3a') if 0.15 < p.z / s < 0.2 else C('#e5d4b0')
        k.add(lathe(prof, 14, False, True), None, POT, M_STONE, flat=False, cfn=potc)
        k.add(cyl(0.15 * s, 0.15 * s, 0.01, 12), T((0, 0, 0.33 * s)), C('#4a3424'), M_STONE)
        rr = rng(5 + broad)
        count = 9 if broad else 14
        for i in range(count):
            a = TAU * i / count + rr.uniform(-0.2, 0.2)
            L = (rr.uniform(0.35, 0.55) if broad else rr.uniform(0.12, 0.22)) * (1 if broad else 1.6) * s
            wdt = (0.09 if broad else 0.05) * s * (1.2 if broad else 1.3)
            tilt = rr.uniform(0.35, 0.9) if broad else rr.uniform(0.2, 0.9)
            leaf = bmesh.new()
            vs = [leaf.verts.new(v) for v in ((0, 0, 0), (-wdt, 0, L * 0.45), (0, -0.015, L), (wdt, 0, L * 0.45), (0, 0.02, L * 0.5))]
            leaf.faces.new((vs[0], vs[1], vs[4]))
            leaf.faces.new((vs[1], vs[2], vs[4]))
            leaf.faces.new((vs[2], vs[3], vs[4]))
            leaf.faces.new((vs[3], vs[0], vs[4]))
            leaf.normal_update()
            k.add(leaf, T((0, 0, 0.32 * s), (0, 0, a)) @ T((0, 0, 0), (0, tilt, 0)), LEAF, M_LEAF,
                  cfn=lambda p, n: LEAF_LT if p.z > 0.5 * s else LEAF, ao=False)
        out.append(k.build(name, M))
    # Armour stand: a cross foot, a post, cuirass with pauldrons and faulds, armet, green tabard.
    k = Kit(95, ao=0.3, ao_h=0.3)
    for a in (0, math.pi / 2):
        k.add(cube(0.6, 0.1, 0.08, 0.015), T((0, 0, 0), (0, 0, a)), WOOD, M_WOOD)
    k.add(cube(0.07, 0.07, 1.25, 0.01), T((0, 0, 0.08)), WOOD, M_WOOD)
    k.add(lathe([(0.16, 0.95), (0.2, 1.05), (0.21, 1.25), (0.19, 1.4), (0.14, 1.46)], 14, True, True,
                lambda i, j: 1.0 if i < 7 else 0.8), None, STEEL, M_METAL, flat=False)
    k.add(lathe([(0.21, 0.8), (0.2, 0.96)], 14, False), None, STEEL_DK, M_METAL)
    k.add(lathe([(0.23, 0.68), (0.22, 0.82)], 14, False), None, STEEL, M_METAL)
    for s in (-1, 1):
        for i in range(3):
            k.add(ico(0.11 - i * 0.012, 1, (1, 1.1, 0.55)), T((s * (0.24 + i * 0.012), 0, 1.39 - i * 0.07), (0, s * 0.35, 0)),
                  STEEL if i % 2 == 0 else STEEL_DK, M_METAL)
    k.add(lathe([(0.06, 1.46), (0.11, 1.52), (0.125, 1.62), (0.11, 1.74), (0.04, 1.8)], 12, True, True), None, STEEL, M_METAL, flat=False)
    k.add(cube(0.17, 0.02, 0.02), T((0, -0.12, 1.63)), C('#20252a'), M_METAL)
    k.add(lathe([(0.24, 0.42), (0.26, 0.72)], 14, True, True,
                lambda i, j: 1.0 + (0.08 if (i % 3 == 0 and j == 0) else 0)), None, GREEN, M_CLOTH,
          cfn=lambda p, n: C('#b48f3f') if p.z < 0.46 else GREEN)
    k.add(torus(0.215, 0.02, 14, 4), T((0, 0, 0.83)), LEATHER, M_CLOTH)
    k.add(cube(0.05, 0.02, 0.05, 0.005), T((0, -0.235, 0.81)), BRASS, M_BRASS)
    out.append(k.build('ArmorStand', M))
    # Candles: three brass holders, three heights.
    k = Kit(96, ao=0)
    for x, y, h in ((0, 0, 0.2), (0.11, 0.06, 0.13), (-0.1, 0.07, 0.1)):
        candle(k, Vector((x, y, 0)), h)
    out.append(k.build('Candles', M))
    # Crossed shields on a wall rail, two spears behind; the left field takes the furnishing colour.
    k = Kit(97, ao=0)
    k.add(cube(0.95, 0.05, 0.14, 0.015), T((0, 0.0, -0.07)), WOOD, M_WOOD)
    for s in (-1, 1):
        k.add(cyl(0.012, 0.012, 1.1, 6), T((0, -0.04, 0), (0, s * 0.85, 0)) @ T((0, 0, -0.55)), WOOD, M_WOOD)
        k.add(ico(0.025, 1), T((s * math.sin(0.85) * 0.55, -0.04, -math.cos(0.85) * 0.55 * -1 - 0.0)), BRASS, M_BRASS)
    for s in (-1, 1):
        out_l = heater(0.42, 0.52, 8)
        M2 = T((s * 0.15, -0.06 - (0.02 if s > 0 else 0), 0), (0, s * 0.25, 0))
        k.add(prism([(x * 1.07, z * 1.06) for x, z in out_l], -0.03, 0.0), M2, STEEL_DK, M_METAL)
        k.add(prism(out_l, -0.04, -0.01), M2, GREY if s < 0 else C('#4f7a3a'), M_TINT if s < 0 else M_CLOTH,
              cfn=(lambda p, n: GREY) if s < 0 else (lambda p, n: C('#e8dcc0') if n.y < -0.5 and (M2.inverted() @ p).z < -0.05 else C('#4f7a3a')))
        # A pine on each field.
        k.add(prism([(-0.07, -0.12), (0.07, -0.12), (0.0, 0.12)], -0.048, -0.04), M2,
              CREAM if s < 0 else C('#2f5a2a'), M_CLOTH)
    out.append(k.build('CrossedShields', M))
    # Tapestry: a painted landscape (sky, hills, wheat, a village) with a border in the
    # furnishing colour, hung from a rod with brass finials.
    k = Kit(98, ao=0)
    W, H = 1.3, 0.9

    def scene_col(p, n):
        x, z = p.x / W + 0.5, p.z / H + 0.5
        if x < 0.07 or x > 0.93 or z < 0.08 or z > 0.92:
            return None
        hill = 0.55 + 0.08 * math.sin(x * 7 + 1) + 0.04 * math.sin(x * 15)
        if z > hill + 0.12:
            return C('#9cc6d8') if (int(x * 9 + z * 3) % 5) else C('#f1ece0')
        if z > hill:
            return C('#5f8a46')
        if 0.55 < x < 0.72 and z > hill - 0.12:
            return C('#b0503a') if z > hill - 0.05 else C('#e8dcc0')
        return C('#d8b13e') if math.sin(z * 40 + x * 6) > -0.4 else C('#b98f2c')
    # The picture (Cloth) in front of a border panel (Tint_Cloth).
    pic = grid(24, 16, W * 0.86, H * 0.84, lambda x, y: 0.0)
    bmesh.ops.rotate(pic, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'), verts=pic.verts)
    pic.normal_update()
    k.add(pic, T((0, -0.032, -0.48)), CREAM, M_CLOTH, jit=0.02, cfn=lambda p, n: scene_col(p - Vector((0, 0, -0.48)), n) or CREAM)
    k.add(cube(W, 0.012, H, 0.004, z0=False), T((0, -0.022, -0.48)), GREY, M_TINT, jit=0.02)
    k.add(cyl(0.022, 0.022, W + 0.22, 8), T((-(W + 0.22) / 2, -0.03, 0.0), (0, math.pi / 2, 0)), WOOD_DK, M_WOOD)
    for s in (-1, 1):
        k.add(ico(0.035, 1, (1.4, 1, 1)), T((s * (W / 2 + 0.13), -0.03, 0)), BRASS, M_BRASS)
    for i in range(9):
        k.add(cyl(0.012, 0.004, 0.08, 5), T((-W / 2 + 0.08 + i * (W - 0.16) / 8, -0.03, -0.93), (math.pi, 0, 0)), C('#e8dcc0'), M_CLOTH)
    out.append(k.build('Tapestry', M))
    # Wall banner: a swallowtailed cloth in the furnishing colour with a cream border and sprig.
    k = Kit(99, ao=0)
    bw, bh = 0.62, 1.15
    tail = [(-bw / 2, 0), (bw / 2, 0), (bw / 2, -bh), (0, -bh + 0.22), (-bw / 2, -bh)]
    k.add(prism(tail, -0.02, -0.01), T((0, 0, 0.58)), GREY, M_TINT, jit=0.02)
    inner = [(x * 0.84, z * 0.9 - 0.04) for x, z in tail]
    k.add(prism(inner, -0.024, -0.02), T((0, 0, 0.58)), GREY, M_TINT, jit=0.02,
          cfn=lambda p, n: GREY)
    edge = [(x * 0.9, z * 0.95 - 0.02) for x, z in tail]
    k.add(prism(edge, -0.022, -0.019), T((0, 0, 0.58)), CREAM, M_CLOTH)
    for i in range(5):
        a = TAU * i / 5 + math.pi / 2
        k.add(cyl(0.04, 0.04, 0.006, 8), T((math.cos(a) * 0.045, -0.026, 0.12 + math.sin(a) * 0.045), (math.pi / 2, 0, 0)), CREAM, M_CLOTH)
    k.add(cube(0.016, 0.006, 0.2), T((0, -0.026, -0.12)), CREAM, M_CLOTH)
    k.add(cyl(0.02, 0.02, 0.82, 8), T((-0.41, -0.02, 0.6), (0, math.pi / 2, 0)), WOOD_DK, M_WOOD)
    for s in (-1, 1):
        k.add(ico(0.03, 1), T((s * 0.43, -0.02, 0.6)), BRASS, M_BRASS)
    out.append(k.build('Banner', M))
    # Bookshelf: open frame, four shelves of leaning books, a small box.
    k = Kit(100, ao=0.3, ao_h=0.4)
    k.add(cube(0.64, 0.3, 0.04, 0.01), None, WOOD_DK, M_WOOD)
    for x in (-0.3, 0.3):
        k.add(cube(0.04, 0.3, 1.62, 0.01), T((x, 0, 0)), WOOD, M_WOOD)
    k.add(cube(0.66, 0.32, 0.05, 0.01), T((0, 0, 1.6)), WOOD, M_WOOD)
    k.add(cube(0.58, 0.02, 1.58, 0), T((0, 0.14, 0.02)), WOOD_DK, M_WOOD)
    rr = rng(17)
    books = [C(h) for h in ('#7a2a2a', '#2f4f6a', '#4a5a2a', '#8a6a2a', '#5a3a5a', '#a0522d', '#3f5f4f')]
    for sh in range(4):
        z = 0.04 + sh * 0.4
        k.add(cube(0.56, 0.28, 0.025, 0.004), T((0, 0, z)), PLANK, M_WOOD)
        x = -0.26
        while x < 0.22:
            w = rr.uniform(0.035, 0.06)
            h = rr.uniform(0.2, 0.3)
            if sh == 3 and x > 0.0:
                k.add(cube(0.2, 0.18, 0.12, 0.01), T((0.12, 0, z + 0.025)), WOOD_LT, M_WOOD)
                break
            lean = 0.12 if rr.random() < 0.12 else 0
            k.add(cube(w - 0.004, 0.2, h, 0.006), T((x + w / 2, -0.02, z + 0.025), (0, lean, 0)), rr.choice(books), M_CLOTH)
            x += w
    out.append(k.build('Bookshelf', M))
    return out


# ------------------------------------------------------------------ build

def build():
    sc = new_scene('Props')
    M = mats()
    roots = []
    roots += build_stumps(M)
    roots += build_logs(M)
    roots += build_mushrooms(M)
    roots += build_desert(M)
    roots += build_farm(M)
    roots += build_chest(M)
    roots += build_sword(M)
    roots += build_revolver(M)
    roots += build_shield(M)
    roots += build_dummies(M)
    roots += build_decor(M)
    layout_row(roots, gap=0.8)
    export_glb(roots, 'props.glb')
    save_blend(sc, 'props.blend')
    return stats(roots)
