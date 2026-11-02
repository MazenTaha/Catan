"""The saddled horse for the 3D walk -> apps/web/public/models/horse.glb

  Horse        armature (root node) with one skinned mesh: a sculpted body (metaballs, so the
               neck, shoulders, haunches and legs flow into each other), ears, mane, forelock
               and tail hair, hooves and eyes, a saddle on its blanket, girth, stirrups, bridle
               and reins. Bones: Body, Neck, Head, Tail, Tail2 and, per leg (FL FR HL HR),
               Upper, Cannon, Pastern. L is the horse's left (+X); it faces -Y.

Materials: "Coat" and "Hair" (white x vertex colour; the game tints them per coat), "Tack"
(leather, iron, hooves and eyes in vertex colour), "Owner_Blanket" (the rider's colour).
The tack conforms to the body by ray casts, so it never floats or sinks in.
"""

from __future__ import annotations

import math

import bpy
from mathutils import Euler, Vector, noise
from mathutils.bvhtree import BVHTree

from common import MeshBuilder, bake_ao, export_glb, material, mul, new_scene, rng, save_blend, smooth, srgb, stats, tube

C = srgb
# Real proportions (withers about 1.5 m), scaled so the saddle's seat sits where the rider does.
S = 1.08
K = 0.575  # a metaball's visible radius per unit radius (stiffness 2, threshold 0.6)
M_COAT, M_HAIR, M_TACK, M_BLANKET = range(4)

LEATHER = C('#5b3a22')
LEATHER_DK = C('#3d2716')
IRON = C('#8c8b8f')
HOOF = C('#2c2420')
EYE = C('#0d0a09')


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def P(x, y, z) -> Vector:
    return Vector((x, y, z)) * S


# ------------------------------------------------------------------ body (metaballs)

class Sculpt:
    """Metaball elements in real metres: balls, ellipsoids and capsules by visible size."""

    def __init__(self, name: str):
        self.mb = bpy.data.metaballs.new(name)
        self.mb.resolution = self.mb.render_resolution = 0.011 * S
        self.mb.threshold = 0.6
        self.ob = bpy.data.objects.new(name, self.mb)
        bpy.context.scene.collection.objects.link(self.ob)

    def _el(self, kind: str, c: Vector, r: float):
        e = self.mb.elements.new(type=kind)
        e.co = c
        e.radius = r * S / K
        e.stiffness = 2.0
        return e

    def ball(self, c, r):
        self._el('BALL', P(*c), r)

    def ell(self, c, half, rot=(0, 0, 0)):
        e = self._el('ELLIPSOID', P(*c), 1.0)
        e.size_x, e.size_y, e.size_z = half
        e.rotation = Euler([math.radians(a) for a in rot]).to_quaternion()

    def cap(self, a, b, r):
        a, b = P(*a), P(*b)
        e = self._el('CAPSULE', (a + b) / 2, r)
        e.size_x = (b - a).length / 2
        e.rotation = Vector((1, 0, 0)).rotation_difference((b - a).normalized())

    def mesh(self, name: str, tris: int) -> bpy.types.Object:
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(self.ob.evaluated_get(dg))
        me.name = name
        bpy.data.objects.remove(self.ob, do_unlink=True)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        # Soften the marching-cube ripples, then thin to the budget.
        sm = ob.modifiers.new('smooth', 'SMOOTH')
        sm.factor, sm.iterations = 0.6, 4
        dec = ob.modifiers.new('decimate', 'DECIMATE')
        dec.ratio = min(1.0, tris / max(1, len(me.polygons)))
        dg = bpy.context.evaluated_depsgraph_get()
        out = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        ob.modifiers.clear()
        ob.data = out
        bpy.data.meshes.remove(me)
        out.name = name
        for p in out.polygons:
            p.use_smooth = True
        return ob


FRONT = [(0.17, 'L'), (-0.17, 'R')]
HIND = [(0.16, 'L'), (-0.16, 'R')]


def sculpt_body() -> bpy.types.Object:
    s = Sculpt('HorseSculpt')
    # Barrel, chest and belly.
    s.ell((0, -0.06, 1.13), (0.27, 0.5, 0.3))
    s.ell((0, -0.47, 1.08), (0.21, 0.19, 0.27))
    s.ell((0, 0.0, 0.96), (0.235, 0.4, 0.15))
    # Shoulders slope from the point of the shoulder up to the withers.
    for x, _ in FRONT:
        s.cap((x * 0.68, -0.56, 1.02), (x * 0.55, -0.34, 1.36), 0.11)
    s.ell((0, -0.33, 1.42), (0.08, 0.17, 0.08))
    # Back, loin and croup.
    s.cap((0, -0.22, 1.37), (0, 0.3, 1.37), 0.11)
    s.ell((0, 0.46, 1.37), (0.19, 0.25, 0.11))
    # Hindquarters and the thigh muscles.
    s.ell((0, 0.5, 1.19), (0.25, 0.29, 0.26))
    for x, _ in HIND:
        s.ell((x * 0.85, 0.57, 1.06), (0.13, 0.2, 0.25), (8, 0, 0))
        s.ball((x * 0.95, 0.38, 0.95), 0.09)
    s.ball((0, 0.76, 1.24), 0.11)
    # Neck: deep at the base, slim at the throat; the crest arches along the top.
    s.ell((0, -0.6, 1.33), (0.15, 0.19, 0.26), (32, 0, 0))
    s.ell((0, -0.71, 1.52), (0.12, 0.15, 0.21), (34, 0, 0))
    s.ell((0, -0.82, 1.68), (0.095, 0.12, 0.15), (36, 0, 0))
    s.cap((0, -0.42, 1.47), (0, -0.66, 1.72), 0.07)
    s.cap((0, -0.66, 1.72), (0, -0.88, 1.86), 0.055)
    s.ball((0, -0.9, 1.68), 0.085)
    # Head: broad forehead, round jowls, a tapering face and a soft muzzle.
    s.ell((0, -0.98, 1.81), (0.1, 0.11, 0.095), (-40, 0, 0))
    for sx in (1, -1):
        s.ball((sx * 0.045, -0.955, 1.665), 0.085)
        s.ball((sx * 0.04, -1.285, 1.485), 0.03)
    s.ell((0, -0.95, 1.7), (0.08, 0.1, 0.1), (-30, 0, 0))
    s.cap((0, -1.04, 1.75), (0, -1.22, 1.52), 0.064)
    s.ell((0, -1.255, 1.46), (0.074, 0.076, 0.084), (-40, 0, 0))
    s.ball((0, -1.21, 1.395), 0.04)
    # Forelegs: forearm, flat knee, slim cannon, fetlock, pastern.
    for x, _ in FRONT:
        s.ball((x * 0.9, -0.43, 0.97), 0.08)
        s.cap((x, -0.45, 0.96), (x, -0.46, 0.76), 0.074)
        s.cap((x, -0.46, 0.76), (x, -0.47, 0.57), 0.055)
        s.ell((x, -0.468, 0.535), (0.054, 0.05, 0.06))
        s.cap((x, -0.47, 0.5), (x, -0.47, 0.2), 0.04)
        s.ell((x, -0.465, 0.16), (0.045, 0.053, 0.048))
        s.cap((x, -0.47, 0.15), (x, -0.5, 0.075), 0.036)
    # Hind legs: gaskin, hock with its point, cannon, fetlock, pastern.
    for x, _ in HIND:
        s.cap((x, 0.46, 0.95), (x, 0.56, 0.72), 0.085)
        s.cap((x, 0.56, 0.72), (x, 0.63, 0.55), 0.056)
        s.ell((x, 0.64, 0.5), (0.05, 0.068, 0.068))
        s.ball((x, 0.695, 0.54), 0.034)
        s.cap((x, 0.64, 0.47), (x, 0.62, 0.2), 0.041)
        s.ell((x, 0.62, 0.16), (0.045, 0.053, 0.048))
        s.cap((x, 0.62, 0.15), (x, 0.59, 0.075), 0.036)
    # Dock of the tail.
    s.cap((0, 0.76, 1.36), (0, 0.87, 1.17), 0.048)
    return s.mesh('HorseBody', 7500)


def paint_body(ob: bpy.types.Object):
    """Coat shading in vertex colour (the coat's hue comes from the material): darker lower
    legs and muzzle, nostrils and eye hollows, a lighter belly, faint mottling."""
    me = ob.data
    col = me.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
    muzzle = P(0, -1.3, 1.45)
    eyes = [P(x, -1.03, 1.76) for x in (0.1, -0.1)]
    nostrils = [P(x, -1.3, 1.47) for x in (0.045, -0.045)]
    seed = Vector((5.3, 1.7, 9.1))
    for loop in me.loops:
        p = me.vertices[loop.vertex_index].co
        c = 0.92
        c *= lerp(1.0, 0.45, smooth(0.62 * S, 0.3 * S, p.z))
        c *= lerp(1.0, 0.55, smooth(0.17 * S, 0.06 * S, (p - muzzle).length))
        for n in nostrils:
            c *= lerp(1.0, 0.3, smooth(0.035 * S, 0.012 * S, (p - n).length))
        for e in eyes:
            c *= lerp(1.0, 0.75, smooth(0.06 * S, 0.02 * S, (p - e).length))
        if p.z < 1.0 * S and abs(p.y) < 0.4 * S and p.z > 0.75 * S:
            c = min(1.0, c * 1.07)
        c *= 1 + 0.035 * noise.noise(p * 7 + seed)
        col.data[loop.index].color = (c, c, c, 1.0)
    me.color_attributes.active_color = col
    me.color_attributes.render_color_index = 0


# ------------------------------------------------------------------ conforming tack

class Surface:
    """Ray casts against the body, so straps and the saddle sit on it."""

    def __init__(self, ob):
        dg = bpy.context.evaluated_depsgraph_get()
        self.bvh = BVHTree.FromObject(ob, dg)

    def hit(self, centre: Vector, outward: Vector, reach: float = 1.0):
        loc, nrm, _, _ = self.bvh.ray_cast(centre + outward * reach, -outward, reach * 2)
        return (loc, nrm) if loc is not None else (None, None)


def barrel_dir(theta: float) -> Vector:
    """0 = straight up, +90 degrees = the horse's left (+X)."""
    t = math.radians(theta)
    return Vector((math.sin(t), 0, math.cos(t)))


def patch(b: MeshBuilder, surf: Surface, ys, thetas, offset, color, mat, axis_z=1.13, rim=0.0):
    """A sheet over the barrel between y values `ys` and angles `thetas` (degrees), lifted by
    `offset(y, theta)`; `rim` turns the edges down to the body so it reads as a thick pad."""
    grid = []
    for y in ys:
        row = []
        for th in thetas:
            d = barrel_dir(th)
            loc, nrm = surf.hit(P(0, y, axis_z), d)
            if loc is None:
                loc, nrm = P(0, y, axis_z) + d * 0.3 * S, d
            row.append((loc, nrm, loc + nrm * offset(y, th) * S))
        grid.append(row)
    vid = [[b.vert(top, normal=None, color=color) for (_, _, top) in row] for row in grid]
    for i in range(len(ys) - 1):
        for j in range(len(thetas) - 1):
            b.face([vid[i][j], vid[i][j + 1], vid[i + 1][j + 1], vid[i + 1][j]], mat=mat)
    if rim:
        edge = ([grid[0][j] for j in range(len(thetas))] + [grid[i][-1] for i in range(1, len(ys))] +
                [grid[-1][j] for j in reversed(range(len(thetas) - 1))] + [grid[i][0] for i in reversed(range(1, len(ys) - 1))])
        top = [b.vert(t, color=mul(color, 0.8)) for (_, _, t) in edge]
        low = [b.vert(l + n * rim * S, color=mul(color, 0.6)) for (l, n, _) in edge]
        for k in range(len(edge)):
            k1 = (k + 1) % len(edge)
            b.face([top[k], low[k], low[k1], top[k1]], mat=mat)


def band(b: MeshBuilder, surf: Surface, centre_fn, axis: Vector, angles, width: float, lift: float, color, mat=M_TACK):
    """A strap around a body part: `centre_fn(t)` for t in [0, 1] across its width, cast
    outward perpendicular to `axis` at each angle (degrees, 0 = up)."""
    u = Vector((1, 0, 0))
    w = axis.cross(u).normalized()
    if w.z < 0:
        w = -w
    rows = []
    for t in (0.0, 1.0):
        c = centre_fn(t)
        row = []
        for a in angles:
            r = math.radians(a)
            d = (w * math.cos(r) + u * math.sin(r)).normalized()
            loc, nrm = surf.hit(c, d, 0.6 * S)
            if loc is None:
                continue
            row.append(b.vert(loc + nrm * lift * S, color=color))
        rows.append(row)
    n = min(len(rows[0]), len(rows[1]))
    for k in range(n - 1):
        b.face([rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]], mat=mat)
    return rows


def ribbon(b: MeshBuilder, pts, widths, side: Vector, color_fn, mat=M_HAIR):
    """A flat, tapering strip of hair along `pts`, `side` setting its width direction."""
    ids = []
    for i, p in enumerate(pts):
        t = i / (len(pts) - 1)
        c = color_fn(t)
        ids.append((b.vert(p - side * widths[i] / 2, color=c), b.vert(p + side * widths[i] / 2, color=c)))
    for i in range(len(pts) - 1):
        b.face([ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]], mat=mat)


def build_parts(surf: Surface):
    """Everything that isn't the sculpted body, grouped by the bone it rides on."""
    r = rng(1742)
    parts: dict[str, MeshBuilder] = {}

    def on(bone):
        return parts.setdefault(bone, MeshBuilder())

    # Ears: pointed, a little cupped and pricked forward.
    for sx in (1, -1):
        base = P(sx * 0.055, -0.925, 1.925)
        tip = P(sx * 0.075, -0.975, 2.075)
        mid = base.lerp(tip, 0.45) + Vector((sx * 0.006, -0.012, 0)) * S
        ear = MeshBuilder()
        tube(ear, [base, mid, tip], [0.034 * S, 0.03 * S, 0.003 * S], 8,
             lambda t, s: (0.55, 0.55, 0.55) if s in (5, 6, 7) and t > 0.2 else (0.88, 0.88, 0.88), mat=M_COAT, cap=True)
        on('Head').merge(ear)
    # Eyes: dark glossy domes set into the head.
    for sx in (1, -1):
        loc, nrm = surf.hit(P(0, -1.02, 1.76), Vector((sx, -0.25, 0.1)).normalized(), 0.4 * S)
        if loc is None:
            continue
        eye = MeshBuilder()
        c = loc - nrm * 0.008 * S
        tube(eye, [c - nrm * 0.02 * S, c, c + nrm * 0.014 * S], [0.012 * S, 0.026 * S, 0.004 * S], 10,
             lambda t, s: EYE, mat=M_TACK, cap=True)
        on('Head').merge(eye)
    # Hooves: a flared horn wall, darker at the coronet.
    for x, side in FRONT:
        h = MeshBuilder()
        c = P(x, -0.505, 0)
        tube(h, [c + P(0, 0, 0.0), c + P(0, 0.005, 0.045), c + P(0, 0.012, 0.085)], [0.063 * S, 0.055 * S, 0.044 * S], 12,
             lambda t, s: mul(HOOF, 1.1 - 0.4 * t), mat=M_TACK, cap=True)
        on(f'PasternF{side}').merge(h)
    for x, side in HIND:
        h = MeshBuilder()
        c = P(x, 0.585, 0)
        tube(h, [c, c + P(0, -0.005, 0.045), c + P(0, -0.012, 0.085)], [0.062 * S, 0.054 * S, 0.044 * S], 12,
             lambda t, s: mul(HOOF, 1.1 - 0.4 * t), mat=M_TACK, cap=True)
        on(f'PasternH{side}').merge(h)

    # Mane: strands from poll to withers falling to the right side, with the forelock.
    poll, withers = P(0, -0.9, 1.9), P(0, -0.38, 1.5)
    neck_axis = (withers - poll).normalized()
    n = 40
    for i in range(n):
        t = (i % 20) / 19 + (0.025 if i >= 20 else 0)
        root = poll.lerp(withers, t) + Vector((0, 0, 0.02 * S * math.sin(math.pi * t)))
        loc, nrm = surf.hit(root - Vector((0, 0, 0.15)) * S, Vector((0, 0.3, 1)).normalized(), 0.4 * S)
        if loc is not None:
            root = loc - nrm * 0.004 * S
        length = (0.2 + 0.08 * math.sin(math.pi * t) + r.random() * 0.05) * S
        fall = Vector((-0.55 - r.random() * 0.25, 0.1, -1)).normalized()
        out = Vector((-1, 0, 0.35)).normalized()
        if i >= 20:
            length *= 0.7
        up = Vector((0.012, 0, 1))
        pts = [root - up * 0.01 * S, root + up * 0.035 * S + out * 0.01 * S, root + out * 0.06 * S + fall * length * 0.3,
               root + out * 0.08 * S + fall * length * 0.7, root + out * 0.08 * S + fall * length + neck_axis * 0.02 * S * (r.random() - 0.5)]
        shade = 0.82 + 0.18 * r.random()
        ribbon(on('Neck'), pts, [0.055 * S, 0.06 * S, 0.06 * S, 0.045 * S, 0.006 * S], neck_axis,
               lambda u: (shade * (0.7 + 0.3 * u),) * 3)
    for k in range(5):
        root = P(0.012 * (k - 2), -0.945, 1.935)
        tip = P(0.02 * (k - 2), -1.07, 1.77 + 0.015 * r.random())
        mid = root.lerp(tip, 0.5) + P(0, -0.03, 0.02)
        ribbon(on('Head'), [root, mid, tip], [0.035 * S, 0.03 * S, 0.004 * S], Vector((1, 0, 0)),
               lambda u: (0.9 * (0.75 + 0.25 * u),) * 3)

    # Tail: a fall of hair from the dock, flaring and swept back a little.
    for k in range(28):
        a = (k % 14) / 13 - 0.5
        u = r.random()
        root = P(0, 0.775, 1.345).lerp(P(0, 0.87, 1.17), u) + P(a * 0.05, 0.02, 0)
        drop = 0.62 + 0.12 * r.random() - 0.25 * u
        pts = [root, root + P(a * 0.04, 0.09 + 0.04 * (1 - u), -0.12), root + P(a * 0.1, 0.13, -0.4 * drop / 0.62),
               root + P(a * 0.14, 0.1 + 0.05 * r.random(), -drop - 0.15 * (1 - u))]
        side = Vector((1, 0, 0.3 * a)) if k < 14 else Vector((0.3 * a, 1, 0.4))
        shade = 0.8 + 0.2 * r.random()
        ribbon(on('Tail2'), pts, [0.05 * S, 0.085 * S, 0.08 * S, 0.01 * S], side.normalized(),
               lambda u: (shade * (0.75 + 0.25 * u),) * 3)

    body = on('Body')
    # Saddle blanket (the rider's colour), a padded leather seat with pommel and cantle, and flaps.
    ys = [lerp(-0.3, 0.24, i / 10) for i in range(11)]
    patch(body, surf, ys, [lerp(-64, 64, j / 16) for j in range(17)], lambda y, th: 0.012, (0.9, 0.9, 0.9), M_BLANKET, rim=-0.008)
    ys = [lerp(-0.22, 0.17, i / 12) for i in range(13)]

    def seat(y, th):
        # Pommel and cantle: rounded rims across the seat, lower towards its edges.
        mid = 1 - 0.55 * smooth(0, 46, abs(th))
        return 0.035 + mid * (0.075 * smooth(-0.12, -0.21, y) + 0.065 * smooth(0.08, 0.17, y))
    patch(body, surf, ys, [lerp(-46, 46, j / 14) for j in range(15)], seat, LEATHER, M_TACK, rim=-0.02)
    for sx in (1, -1):
        th = [sx * lerp(40, 82, j / 6) for j in range(7)]
        patch(body, surf, [lerp(-0.17, 0.08, i / 5) for i in range(6)], th if sx > 0 else th[::-1],
              lambda y, t: 0.03, LEATHER_DK, M_TACK, rim=-0.008)
    # Girth under the belly.
    band(body, surf, lambda t: P(0, -0.27 + 0.065 * t, 1.1), Vector((0, 1, 0)), [lerp(60, 300, k / 24) for k in range(25)],
         0.065, 0.012, LEATHER_DK)
    # Stirrup leathers and irons.
    for sx in (1, -1):
        loc, nrm = surf.hit(P(0, -0.04, 1.13), barrel_dir(sx * 78))
        top = (loc if loc is not None else P(sx * 0.27, -0.04, 1.2)) + Vector((sx * 0.035 * S, 0, 0))
        bottom = Vector((top.x + sx * 0.06 * S, top.y, 0.82 * S))
        tube(body, [top, top.lerp(bottom, 0.5), bottom], [0.012 * S] * 3, 4, lambda t, s: LEATHER_DK, mat=M_TACK)
        ring = [bottom + P(0, 0.07 * math.cos(a), -0.05 - 0.055 * math.sin(a)) * 1 for a in
                [math.radians(d) for d in range(90, 451, 30)]]
        tube(body, ring, [0.009 * S] * len(ring), 5, lambda t, s: IRON, mat=M_TACK)
        tube(body, [bottom + P(0, -0.07, -0.105), bottom + P(0, 0.07, -0.105)], [0.016 * S] * 2, 4, lambda t, s: IRON, mat=M_TACK)

    # Bridle: crown piece behind the ears, browband, noseband, cheek pieces, bit rings.
    head = on('Head')
    head_axis = (P(0, -1.28, 1.44) - P(0, -0.94, 1.86)).normalized()
    along = lambda s: P(0, -0.94, 1.86).lerp(P(0, -1.28, 1.44), s)  # noqa: E731
    band(head, surf, lambda t: along(0.03 + 0.035 * t), head_axis, [lerp(-62, 62, k / 10) for k in range(11)], 0.03, 0.006, LEATHER)
    band(head, surf, lambda t: along(0.62 + 0.07 * t), head_axis, [lerp(-180, 180, k / 24) for k in range(25)], 0.03, 0.007, LEATHER)
    for sx in (1, -1):
        cheek = []
        for k in range(6):
            sk = lerp(0.06, 0.6, k / 5)
            loc, nrm = surf.hit(along(sk) + P(0, 0.02, 0), Vector((sx, 0, 0)), 0.4 * S)
            if loc is not None:
                cheek.append(loc + nrm * 0.008 * S)
        cheek.append(P(sx * 0.072, -1.215, 1.405))
        if len(cheek) > 1:
            tube(head, cheek, [0.011 * S] * len(cheek), 4, lambda t, s: LEATHER, mat=M_TACK)
        bit = P(sx * 0.07, -1.22, 1.4)
        ring = [bit + P(0, 0.025 * math.cos(math.radians(d)), 0.025 * math.sin(math.radians(d))) for d in range(0, 361, 45)]
        tube(head, ring, [0.006 * S] * len(ring), 4, lambda t, s: IRON, mat=M_TACK)

    # Reins: one loop from bit to bit, down each side of the neck and over the withers in
    # front of the saddle; weighted from the head back to the body.
    reins = MeshBuilder()
    side = []
    for y, z in ((-1.07, 1.6), (-0.86, 1.6), (-0.64, 1.5), (-0.46, 1.48)):
        loc, nrm = surf.hit(P(0, y, z), Vector((1, 0, 0)), 0.5 * S)
        side.append(loc + nrm * 0.03 * S if loc is not None else P(0.18, y, z))
    loc, nrm = surf.hit(P(0, -0.34, 1.3), Vector((0, 0, 1)), 0.5 * S)
    top = loc + nrm * 0.02 * S if loc is not None else P(0, -0.34, 1.55)
    mirror = lambda v: Vector((-v.x, v.y, v.z))  # noqa: E731
    pts = [P(0.075, -1.215, 1.4), *side, top + P(0.06, 0, -0.01), top, top + P(-0.06, 0, -0.01),
           *[mirror(v) for v in reversed(side)], P(-0.075, -1.215, 1.4)]
    tube(reins, pts, [0.009 * S] * len(pts), 4, lambda t, s: LEATHER, mat=M_TACK)
    parts['Reins'] = reins
    return parts


# ------------------------------------------------------------------ skeleton and weights

BONES = {
    'Body': ((0, 0.25, 1.15), (0, -0.25, 1.15), None),
    'Neck': ((0, -0.5, 1.25), (0, -0.86, 1.8), 'Body'),
    'Head': ((0, -0.92, 1.86), (0, -1.28, 1.44), 'Neck'),
    'Tail': ((0, 0.78, 1.36), (0, 0.9, 1.12), 'Body'),
    'Tail2': ((0, 0.9, 1.12), (0, 0.95, 0.55), 'Tail'),
}
for x, side in FRONT:
    BONES[f'UpperF{side}'] = ((x, -0.45, 1.02), (x, -0.468, 0.54), 'Body')
    BONES[f'CannonF{side}'] = ((x, -0.468, 0.54), (x, -0.468, 0.16), f'UpperF{side}')
    BONES[f'PasternF{side}'] = ((x, -0.468, 0.16), (x, -0.505, 0.0), f'CannonF{side}')
for x, side in HIND:
    BONES[f'UpperH{side}'] = ((x, 0.44, 1.02), (x, 0.64, 0.5), 'Body')
    BONES[f'CannonH{side}'] = ((x, 0.64, 0.5), (x, 0.62, 0.16), f'UpperH{side}')
    BONES[f'PasternH{side}'] = ((x, 0.62, 0.16), (x, 0.585, 0.0), f'CannonH{side}')


def build_armature() -> bpy.types.Object:
    arm = bpy.data.armatures.new('Horse')
    ob = bpy.data.objects.new('Horse', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail, parent) in BONES.items():
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = P(*head), P(*tail)
        eb.roll = 0
        if parent:
            eb.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def assign(ob, weights_fn):
    """Vertex groups from `weights_fn(position) -> {bone: weight}`."""
    groups = {}
    for v in ob.data.vertices:
        for bone, w in weights_fn(v.co).items():
            if w <= 0:
                continue
            g = groups.get(bone) or ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
            groups[bone] = g
            g.add([v.index], w, 'REPLACE')


def build():
    sc = new_scene('Horse')
    mats = [
        material('Coat', rough=0.72),
        material('Hair', rough=0.82, double=True),
        material('Tack', rough=0.6, double=True),
        material('Owner_Blanket', rough=0.92, double=True),
    ]
    body = sculpt_body()
    paint_body(body)
    body.data.materials.append(mats[M_COAT])
    surf = Surface(body)
    parts = build_parts(surf)
    extras = {bone: b.build(f'Horse_{bone}', mats) for bone, b in parts.items()}
    bake_ao([body, *extras.values()], strength=0.5, distance=0.35 * S, samples=32)

    arm = build_armature()
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')

    for bone, ob in extras.items():
        if bone == 'Reins':
            # Bit end follows the head, the middle the neck, the saddle end the body.
            def rein(p):
                t = smooth(-1.2 * S, -0.3 * S, p.y)
                return {'Head': max(0.0, 1 - 2 * t), 'Neck': 1 - abs(2 * t - 1), 'Body': max(0.0, 2 * t - 1)}
            assign(ob, rein)
        elif bone == 'Tail2':
            assign(ob, lambda p: {'Tail': smooth(0.95 * S, 1.15 * S, p.z), 'Tail2': 1 - smooth(0.95 * S, 1.15 * S, p.z)})
        else:
            assign(ob, lambda p, bone=bone: {bone: 1.0})
    bpy.ops.object.select_all(action='DESELECT')
    for ob in extras.values():
        ob.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = body.data.name = 'HorseBody'
    body.data.validate()
    # No textures on the horse: dropping the UVs saves an eighth of the file.
    for uv in list(body.data.uv_layers):
        body.data.uv_layers.remove(uv)

    export_glb([arm], 'horse.glb', skins=True)
    save_blend(sc, 'horse.blend')
    seat = max((arm.matrix_world @ v.co).z for v in body.data.vertices if abs(v.co.x) < 0.05 and -0.05 < v.co.y < 0.05)
    out = stats([arm])
    out['Horse']['seat'] = round(seat, 3)
    return out
