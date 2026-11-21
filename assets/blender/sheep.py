"""Original soft-fleece sheep. Joint names and origins match the live flock animator."""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from common import MeshBuilder, material, mul, rng, smooth, srgb, tube

C = srgb
UP = Vector((0, 0, 1))
WOOL, TIP, SHADOW = C('#e3dac5'), C('#fff3dc'), C('#b2aa98')
SKIN, NOSE, HOOF = C('#5b5148'), C('#29282a'), C('#302c2b')


def ellipsoid(b, centre, size, color, seg=12, rows=7):
    c = Vector(centre)
    ids = []
    for i in range(rows + 1):
        ph = math.pi * (0.001 + 0.998 * i / rows)
        row = []
        for j in range(seg):
            a = j * math.tau / seg
            q = Vector((math.sin(ph) * math.cos(a), math.sin(ph) * math.sin(a), math.cos(ph)))
            p = c + Vector((q.x * size[0], q.y * size[1], q.z * size[2]))
            n = Vector((q.x / size[0], q.y / size[1], q.z / size[2])).normalized()
            shade = 0.88 + 0.12 * smooth(-0.8, 0.7, q.z)
            row.append(b.vert(p, normal=n, color=mul(color, shade)))
        ids.append(row)
    for i in range(rows):
        for j in range(seg):
            k = (j + 1) % seg
            b.face([ids[i][j], ids[i + 1][j], ids[i + 1][k], ids[i][k]])


def build():
    r = rng(607)
    mats = [material('SheepFleece', rough=0.94)]
    root = MeshBuilder()
    ellipsoid(root, (0, 0.02, 0.77), (0.39, 0.61, 0.325), WOOL, 20, 12)
    ellipsoid(root, (0, -0.42, 0.79), (0.29, 0.25, 0.285), WOOL)
    # Dense rounded locks give the fleece a soft, irregular silhouette at game scale.
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1)
    bm.verts.ensure_lookup_table()
    units = [v.co.copy().normalized() for v in bm.verts]
    faces = [[v.index for v in f.verts] for f in bm.faces]
    bm.free()

    def tuft(b, c, n, size, tint=1):
        n = Vector(n).normalized()
        u = n.cross(UP if abs(n.z) < 0.9 else Vector((0, 1, 0))).normalized()
        v = n.cross(u).normalized()
        idx = []
        for q in units:
            off = u * q.x * size * 1.05 + v * q.y * size + n * q.z * size * 0.85
            col = tuple(SHADOW[k] * (1 - (q.z + 1) / 2) + TIP[k] * ((q.z + 1) / 2) for k in range(3))
            idx.append(b.vert(Vector(c) + off, normal=(u * q.x / 1.05 + v * q.y + n * q.z / .85).normalized(), color=mul(col, tint)))
        for f in faces:
            b.face([idx[i] for i in f])

    for i in range(112):
        z = 1 - 2 * (i + 0.5) / 112
        a = i * 2.3999632297
        rr = math.sqrt(1 - z * z)
        q = Vector((rr * math.cos(a), rr * math.sin(a), z))
        if q.z < -0.58:
            continue
        c = Vector((q.x * 0.365, q.y * 0.585 + 0.02, q.z * 0.3 + 0.77))
        n = Vector((q.x / 0.39, q.y / 0.61, q.z / 0.325))
        tuft(root, c, n, 0.095 + r.random() * 0.02, 0.94 + r.random() * 0.08)
    body = root.build('Sheep', mats)

    def part(name, b, origin):
        o = b.build(name, mats)
        o.data.transform(Matrix.Translation(-Vector(origin)))
        o.parent, o.location = body, origin
        return o

    for name, x, y in [('LegFL', -0.2, -0.38), ('LegFR', 0.2, -0.38), ('LegBL', -0.2, 0.36), ('LegBR', 0.2, 0.36)]:
        b = MeshBuilder()
        rear = name.startswith('LegB')
        tube(b, [Vector((x, y, 0.62)), Vector((x, y + (0.035 if rear else -0.01), 0.43)), Vector((x, y, 0.065))],
             [0.077, 0.055, 0.042], 9, lambda t, s: mul(SKIN, 0.8 + t * 0.15), cap=True)
        ellipsoid(b, (x, y, 0.57), (0.092, 0.105, 0.125), WOOL)
        # Two cleft toes, with a small coronet above them.
        for side in (-1, 1):
            ellipsoid(b, (x + side * 0.027, y - 0.025, 0.048), (0.025, 0.068, 0.048), HOOF, 8, 5)
        part(name, b, (x, y, 0.62))

    b = MeshBuilder()
    ellipsoid(b, (0, -0.73, 0.945), (0.122, 0.215, 0.16), SKIN, 16, 10)
    ellipsoid(b, (0, -0.84, 0.86), (0.101, 0.14, 0.12), SKIN, 16, 10)
    ellipsoid(b, (0, -0.93, 0.78), (0.092, 0.072, 0.066), NOSE)
    for sx in (-1, 1):
        # Thick, gently drooping ears with a warm inner fold.
        ellipsoid(b, (sx * 0.205, -0.675, 1.005), (0.12, 0.054, 0.039), SKIN)
        ellipsoid(b, (sx * 0.218, -0.7, 1.017), (0.083, 0.025, 0.014), C('#a57d69'), 10, 5)
        eye = (sx * 0.104, -0.8, 0.965)
        ellipsoid(b, eye, (0.013, 0.028, 0.018), C('#99805b'), 10, 6)
        ellipsoid(b, (sx * 0.113, -0.81, 0.967), (0.006, 0.018, 0.013), NOSE, 10, 6)
        ellipsoid(b, (sx * 0.118, -0.819, 0.974), (0.003, 0.005, 0.005), C('#fff4dd'), 8, 4)
        ellipsoid(b, (sx * 0.039, -0.99, 0.794), (0.015, 0.009, 0.008), C('#121519'), 8, 4)
    for i in range(9):
        a = i * 2.4
        tuft(b, (math.cos(a) * 0.075, -0.67 + math.sin(a) * 0.08, 1.09 + r.random() * 0.015), (0, -0.2, 1), 0.075)
    tube(b, [Vector((-0.065, -0.954, 0.752)), Vector((0, -0.984, 0.743)), Vector((0.065, -0.954, 0.752))],
         [0.004] * 3, 5, lambda t, s: C('#17191b'))
    part('Head', b, (0, -0.58, 0.96))
    b = MeshBuilder()
    for i in range(3):
        tuft(b, (0, 0.62 + i * 0.04, 0.86 - i * 0.045), (0, 1, 0.2), 0.073 - i * 0.014)
    part('Tail', b, (0, 0.62, 0.86))
    return body


def build_far(root):
    """Keep animated pivots/materials, simplify the fleece when it occupies few pixels."""
    def clone(src, parent=None):
        ob = src.copy()
        ob.data = src.data.copy()
        ob.name = src.name + 'Far'
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = parent
        dec = ob.modifiers.new('Distant silhouette', 'DECIMATE')
        dec.ratio = 0.22
        mesh = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
        old = ob.data
        ob.modifiers.clear()
        ob.data = mesh
        bpy.data.meshes.remove(old)
        for p in mesh.polygons:
            p.use_smooth = True
        for child in src.children:
            clone(child, ob)
        return ob
    return clone(root)
