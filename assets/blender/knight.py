"""The player's knight for the 3D walk -> apps/web/public/models/knight.glb

  Knight       armature (root node) with skinned meshes on one skeleton:
    KnightBody     full plate: breast and back plate, gorget, pauldrons with lames, couters,
                   vambraces, gauntlets, faulds over a mail skirt and the arming coat's hem,
                   cuisses, poleyns, greaves and sabatons, a belt with a brass buckle
    KnightFace     the head (shown with an open helm or none; hair and beard are added in the game)
    HelmGreat, HelmArmet, HelmBascinet, HelmCrowned   the helm choices (one shown at a time)
    CapeShort, CapeLong                                the cape choices
  Bones: Hips, Spine, Head, Cape, Cape2 and, per side (L = +X, the knight's left; it faces -Y),
  Arm, ForeArm, Hand, Thigh, Shin, Foot.

Materials: "Steel" (polished plate and brass trims in vertex colour), "Dark" (leather, mail,
eye slits), "Cloth" (the outfit colour), "Owner" (cape and plume in the seat colour), "Skin".
Plates are rigid on their bones, as real plate is; only the mail and cloth skirts and the cape
blend between bones.
"""

from __future__ import annotations

import math

import bpy
from mathutils import Vector

from common import MeshBuilder, bake_ao, export_glb, material, mul, new_scene, rng, save_blend, smooth, srgb, stats, tube

C = srgb
M_STEEL, M_DARK, M_CLOTH, M_OWNER, M_SKIN = range(5)

STEEL = C('#c4cacd')
STEEL_DK = C('#8b9398')
BRASS = C('#c09a52')
LEATHER = C('#3b2a1f')
MAIL = C('#5d6266')
SLIT = C('#0c0c0d')
WHITE = (0.92, 0.92, 0.92)


def V(x, y, z) -> Vector:
    return Vector((x, y, z))


def mix(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


# ------------------------------------------------------------------ shapes

def shell(b: MeshBuilder, rings, mat=M_STEEL, color=STEEL, sides=28, cap_top=False, cap_bottom=False, arc=None, edge_dark=0.25):
    """A lofted body through horizontal rings (z, cx, cy, rx, ry_front, ry_back[, keel]): the
    front (-Y) can bulge and carry a keel ridge, like a breastplate. `arc` limits it to an
    angle range in degrees (0 = front), for open pieces such as a helm's face opening.
    Plate edges are shaded darker so each piece reads as a separate plate."""
    a0, a1 = arc if arc else (0.0, 360.0)
    closed = arc is None
    cols = sides if closed else sides + 1
    ids = []
    for i, r in enumerate(rings):
        z, cx, cy, rx, ryf, ryb = r[:6]
        keel = r[6] if len(r) > 6 else 0.0
        edge = min(i, len(rings) - 1 - i)
        shade = 1 - edge_dark * (1 - min(1.0, edge / 1.0)) if len(rings) > 2 else 1.0
        row = []
        for s in range(cols):
            a = math.radians(a0 + (a1 - a0) * s / sides)
            ca, sa = math.cos(a), math.sin(a)
            ry = ryf if ca > 0 else ryb
            y = cy - ca * ry - keel * max(0.0, ca) ** 12
            p = V(cx + sa * rx, y, z)
            row.append(b.vert(p, color=mul(color, shade)))
        ids.append(row)
    for i in range(len(rings) - 1):
        for s in range(sides):
            s1 = (s + 1) % cols if closed else s + 1
            b.face([ids[i][s], ids[i][s1], ids[i + 1][s1], ids[i + 1][s]], mat=mat)
    if cap_bottom and closed:
        b.face(list(reversed(ids[0])), mat=mat)
    if cap_top and closed:
        b.face(ids[-1], mat=mat)
    return ids


def ring(z, rx, ryf, ryb=None, cx=0.0, cy=0.0, keel=0.0):
    return (z, cx, cy, rx, ryf, ryb if ryb is not None else ryf, keel)


def dome(b: MeshBuilder, c: Vector, rx, ry, rz, mat=M_STEEL, color=STEEL, down=100, sides=20, rows=8):
    """An ellipsoid cap from the top down to `down` degrees from its pole."""
    ids = []
    for i in range(rows + 1):
        t = math.radians(down * i / rows)
        row = []
        for s in range(sides):
            a = 2 * math.pi * s / sides
            p = c + V(math.sin(t) * math.cos(a) * rx, math.sin(t) * math.sin(a) * ry, math.cos(t) * rz)
            row.append(b.vert(p, color=mul(color, 1 - 0.25 * smooth(0.75, 1.0, i / rows))))
        ids.append(row)
    for i in range(rows):
        for s in range(sides):
            s1 = (s + 1) % sides
            b.face([ids[i][s], ids[i + 1][s], ids[i + 1][s1], ids[i][s1]], mat=mat)


def limb(b: MeshBuilder, a: Vector, z: Vector, radii, color=STEEL, mat=M_STEEL, sides=14, cap=False):
    """A tapered plate tube from `a` to `z` through len(radii) rings, darker at both rims."""
    n = len(radii)
    pts = [a.lerp(z, i / (n - 1)) for i in range(n)]
    tube(b, pts, radii, sides, lambda t, s: mul(color, 1 - 0.22 * (smooth(0.2, 0, t) + smooth(0.8, 1, t))), mat=mat, cap=cap)


def band(b: MeshBuilder, a: Vector, z: Vector, r: float, color=BRASS, sides=14):
    tube(b, [a, z], [r, r], sides, lambda t, s: color, mat=M_STEEL)


# ------------------------------------------------------------------ the body

JOINTS = {
    'shoulder': (0.2, 0.0, 1.42), 'elbow': (0.235, 0.02, 1.16), 'wrist': (0.25, 0.0, 0.92), 'hand': (0.255, -0.012, 0.8),
    'hip': (0.1, 0.0, 0.9), 'knee': (0.11, -0.01, 0.49), 'ankle': (0.11, 0.02, 0.09), 'toe': (0.115, -0.17, 0.03),
}


def J(name, sx):
    x, y, z = JOINTS[name]
    return V(x * sx, y, z)


def body_pieces():
    """(builder, weights) pairs that make up the armoured body."""
    pieces = []

    def rigid(bone):
        return lambda p: {bone: 1.0}

    # Torso: one shell from the waist to the collar, a keel down the breastplate.
    torso = MeshBuilder()
    shell(torso, [ring(0.98, 0.165, 0.12, 0.115), ring(1.05, 0.17, 0.125, 0.12), ring(1.15, 0.186, 0.142, 0.126, cy=-0.005),
                  ring(1.27, 0.2, 0.158, 0.13, cy=-0.01, keel=0.016), ring(1.37, 0.205, 0.15, 0.126, cy=-0.01, keel=0.01),
                  ring(1.45, 0.172, 0.12, 0.11), ring(1.5, 0.105, 0.088, 0.082)], sides=32, edge_dark=0.15)
    band(torso, V(0, -0.002, 1.495), V(0, -0.002, 1.505), 0.108)
    # Gorget round the neck.
    shell(torso, [ring(1.47, 0.1, 0.095, 0.09), ring(1.53, 0.085, 0.082, 0.08), ring(1.575, 0.074, 0.07, 0.07)], sides=22)
    # Fluting fanning up the breastplate (00-knight-turnaround), the brass sprig medallion.
    for k in range(-3, 4):
        a = math.radians(k * 11)
        lo = V(math.sin(a) * 0.09, -0.136 - 0.008 * math.cos(a), 1.12)
        hi = V(math.sin(a * 1.25) * 0.19, -0.152 * math.cos(a * 1.25) - 0.012, 1.36)
        mid = lo.lerp(hi, 0.5) + V(0, -0.016, 0)
        tube(torso, [lo, mid, hi], [0.004, 0.006, 0.004], 5, lambda t, s: STEEL_DK, mat=M_STEEL)
    tube(torso, [V(0.075, -0.15, 1.41), V(0.077, -0.168, 1.412)], [0.03, 0.03], 14, lambda t, s: BRASS, mat=M_STEEL, cap=True)
    pieces.append((torso, rigid('Spine')))
    # A cloth cowl draped round the gorget, lower at the front.
    cowl = MeshBuilder()
    shell(cowl, [ring(1.4, 0.215, 0.165, 0.15), ring(1.44, 0.2, 0.15, 0.142), ring(1.5, 0.165, 0.128, 0.13),
                 ring(1.555, 0.118, 0.1, 0.105)], mat=M_CLOTH, color=C('#e6e6e6'), sides=26, edge_dark=0.2)
    pieces.append((cowl, rigid('Spine')))

    hips = MeshBuilder()
    # Belt with a brass buckle.
    shell(hips, [ring(1.02, 0.176, 0.13, 0.125), ring(1.05, 0.176, 0.13, 0.125)], mat=M_DARK, color=LEATHER, sides=28, edge_dark=0)
    shell(hips, [ring(1.018, 0.03, 0.142, 0.142, cx=0), ring(1.052, 0.03, 0.142, 0.142)], color=BRASS, sides=4, arc=(-25, 25), edge_dark=0)
    # Faulds: three overlapping hoops.
    for k in range(3):
        top = 1.0 - k * 0.05
        shell(hips, [ring(top, 0.172 + k * 0.012, 0.13 + k * 0.01, 0.124 + k * 0.01),
                     ring(top - 0.07, 0.182 + k * 0.012, 0.14 + k * 0.01, 0.132 + k * 0.01)], sides=28, edge_dark=0)
        shell(hips, [ring(top - 0.071, 0.183 + k * 0.012, 0.141 + k * 0.01, 0.133 + k * 0.01),
                     ring(top - 0.064, 0.183 + k * 0.012, 0.141 + k * 0.01, 0.133 + k * 0.01)], color=BRASS, sides=28, edge_dark=0)
    # The sword belt slung from the right hip down to the left, and the scabbard hanging off it.
    pts = []
    for i in range(9):
        t = i / 8
        a = math.radians(-70 + 150 * t)
        z = 1.0 - 0.13 * t
        rx = 0.19 + 0.012 * t
        pts.append(V(math.sin(a) * rx, -math.cos(a) * 0.155, z))
    tube(hips, pts, [0.016] * 9, 6, lambda t, s: mul(LEATHER, 1.25), mat=M_DARK)
    tube(hips, [pts[4] + V(0, -0.012, 0.0), pts[4] + V(0, -0.02, 0.0)], [0.022, 0.022], 4, lambda t, s: BRASS, mat=M_STEEL)
    top = V(0.215, 0.07, 0.9)
    tip = V(0.245, 0.26, 0.3)
    tube(hips, [top, top.lerp(tip, 0.5), tip], [0.03, 0.026, 0.016], 8, lambda t, s: C('#6a3a22'), mat=M_DARK, cap=True)
    tube(hips, [top + V(0, 0, 0.02), top + V(0, 0, -0.04)], [0.034, 0.034], 8, lambda t, s: BRASS, mat=M_STEEL)
    tube(hips, [tip + (top - tip).normalized() * 0.07, tip], [0.022, 0.006], 8, lambda t, s: BRASS, mat=M_STEEL, cap=True)
    tube(hips, [top + V(0.0, 0.0, -0.08), top + V(0.0, 0.0, -0.1)], [0.034, 0.034], 8, lambda t, s: C('#a83a32'), mat=M_DARK)
    tube(hips, [top + V(0.03, -0.01, -0.09), top + V(0.05, -0.02, -0.2)], [0.008, 0.004], 4, lambda t, s: C('#a83a32'), mat=M_DARK)
    pieces.append((hips, rigid('Hips')))

    # Mail skirt, and the arming coat's hem below it in the outfit colour: they follow the
    # thighs more the lower they hang, so a stride doesn't push a leg through them.
    for mat, color, rings in ((M_DARK, MAIL, [ring(0.9, 0.176, 0.138, 0.13), ring(0.8, 0.19, 0.15, 0.15)]),
                              (M_CLOTH, WHITE, [ring(0.8, 0.185, 0.145, 0.145), ring(0.74, 0.196, 0.155, 0.16), ring(0.67, 0.205, 0.16, 0.175),
                                                ring(0.58, 0.212, 0.165, 0.185)])):
        sk = MeshBuilder()
        ids = shell(sk, rings, mat=mat, color=color, sides=32, edge_dark=0)
        if mat == M_CLOTH:
            # A worn, tattered hem: a darker band whose lower edge is torn into points.
            band_ids = shell(sk, [ring(0.58, 0.212, 0.165, 0.185), ring(0.5, 0.216, 0.168, 0.19)], mat=M_CLOTH,
                             color=C('#9c8a5c'), sides=32, edge_dark=0)
            r = rng(77)
            for s_ in range(32):
                v = sk.verts[band_ids[1][s_]]
                v.z += (0.045 if s_ % 3 == 0 else 0.0) + r.uniform(-0.012, 0.012)
            _ = ids

        def skirt(p):
            t = smooth(0.92, 0.66, p.z) * 0.75
            side = 'L' if p.x > 0 else 'R'
            k = min(1.0, abs(p.x) / 0.08)
            return {'Hips': 1 - t * k, f'Thigh{side}': t * k}
        pieces.append((sk, skirt))

    for sx, side in ((1, 'L'), (-1, 'R')):
        # Pauldron: a dome over the shoulder, a brass rim and two lames down the arm.
        arm = MeshBuilder()
        sh = J('shoulder', sx)
        dome(arm, sh + V(sx * 0.02, 0, 0.01), 0.15, 0.155, 0.125, down=108)
        band(arm, sh + V(sx * 0.035, 0, -0.03), sh + V(sx * 0.035, 0, -0.021), 0.146)
        for k, (z, r) in enumerate(((-0.07, 0.112), (-0.11, 0.1), (-0.15, 0.088))):
            c = sh + V(sx * 0.02, 0, z)
            tube(arm, [c + V(0, 0, 0.03), c], [r, r * 1.02], 18, lambda t, s: mul(STEEL, 0.85 + 0.15 * t), cap=False)
        # Rerebrace and couter.
        el = J('elbow', sx)
        limb(arm, sh + V(sx * 0.01, 0, -0.14), el + V(0, 0, 0.03), [0.058, 0.056, 0.052])
        dome(arm, el + V(0, 0.01, -0.02), 0.066, 0.07, 0.07, down=150, sides=16, rows=7)
        pieces.append((arm, rigid(f'Arm{side}')))
        fore = MeshBuilder()
        wr = J('wrist', sx)
        limb(fore, el + V(0, 0, -0.02), wr + V(0, 0, 0.02), [0.05, 0.05, 0.044])
        pieces.append((fore, rigid(f'ForeArm{side}')))
        hand = MeshBuilder()
        hd = J('hand', sx)
        # Gauntlet: a flared cuff, the back of the hand and the fingers' lames.
        tube(hand, [wr + V(0, 0, 0.035), wr + V(0, 0, -0.03)], [0.047, 0.066], 16, lambda t, s: mul(STEEL, 0.8 + 0.2 * t))
        limb(hand, wr + V(0, -0.004, -0.02), hd, [0.043, 0.047, 0.04, 0.026], color=STEEL_DK, sides=12, cap=True)
        pieces.append((hand, rigid(f'Hand{side}')))

        # Cuisse, poleyn, greave and sabaton.
        thigh = MeshBuilder()
        hp, kn = J('hip', sx), J('knee', sx)
        limb(thigh, hp + V(0, 0, 0.02), kn + V(0, 0, 0.04), [0.086, 0.084, 0.074, 0.062], sides=16)
        dome(thigh, kn + V(0, -0.025, 0.0), 0.066, 0.06, 0.07, down=150, sides=16, rows=7)
        # The poleyn's side wing.
        wing = kn + V(sx * 0.055, -0.01, 0.0)
        shell(thigh, [ring(wing.z - 0.035, 0.012, 0.035, 0.035, cx=wing.x, cy=wing.y), ring(wing.z + 0.035, 0.012, 0.035, 0.035, cx=wing.x, cy=wing.y)],
              sides=12, cap_top=True, cap_bottom=True, edge_dark=0)
        pieces.append((thigh, rigid(f'Thigh{side}')))
        shin = MeshBuilder()
        an = J('ankle', sx)
        limb(shin, kn + V(0, 0, -0.03), an + V(0, 0, 0.03), [0.056, 0.062, 0.058, 0.05, 0.045], sides=16)
        pieces.append((shin, rigid(f'Shin{side}')))
        foot = MeshBuilder()
        to = J('toe', sx)
        pts = [an + V(0, 0.06, -0.03), an + V(0, 0.0, -0.02), an.lerp(to, 0.5) + V(0, 0, -0.01), to + V(0, 0.02, 0.0), to]
        tube(foot, pts, [0.05, 0.056, 0.05, 0.034, 0.008], 14, lambda t, s: mul(STEEL, 0.78 + 0.22 * ((t * 6) % 1)), cap=True)
        # Leather sole.
        shell(foot, [ring(0.0, 0.05, 0.13, 0.06, cx=an.x, cy=(an.y + to.y) / 2 + 0.02), ring(0.022, 0.052, 0.135, 0.064, cx=an.x, cy=(an.y + to.y) / 2 + 0.02)],
              mat=M_DARK, color=LEATHER, sides=16, cap_bottom=True, edge_dark=0)
        pieces.append((foot, rigid(f'Foot{side}')))
    return pieces


# ------------------------------------------------------------------ head, helms, capes

HEAD_C = V(0, -0.005, 1.665)


def face_pieces():
    b = MeshBuilder()
    skin = (0.95, 0.95, 0.95)
    # Skull and jaw: rings of an egg, narrower at the chin.
    rings = []
    for i in range(11):
        t = i / 10
        z = 1.555 + t * 0.215
        w = math.sin(math.pi * min(1.0, 0.12 + t * 0.95)) ** 0.7
        rings.append(ring(z, 0.088 * w + 0.005, 0.1 * w + 0.004, 0.1 * w + 0.004, cy=-0.005))
    shell(b, rings, mat=M_SKIN, color=skin, sides=22, cap_top=True, edge_dark=0)
    # Neck.
    tube(b, [V(0, 0.005, 1.48), V(0, 0.0, 1.58)], [0.055, 0.052], 12, lambda t, s: skin, mat=M_SKIN)
    # Nose, brows and ears.
    tube(b, [V(0, -0.1, 1.69), V(0, -0.118, 1.655), V(0, -0.112, 1.64)], [0.012, 0.016, 0.006], 8, lambda t, s: skin, mat=M_SKIN, cap=True)
    for sx in (1, -1):
        tube(b, [V(sx * 0.088, 0.0, 1.66), V(sx * 0.1, 0.01, 1.665)], [0.018, 0.012], 8, lambda t, s: mul(skin, 0.9), mat=M_SKIN, cap=True)
        eye = V(sx * 0.036, -0.094, 1.685)
        tube(b, [eye + V(0, 0.006, 0), eye + V(0, -0.004, 0)], [0.011, 0.009], 8, lambda t, s: SLIT, mat=M_DARK, cap=True)
        tube(b, [eye + V(-0.022, -0.004, 0.024), eye + V(0.022, -0.004, 0.026)], [0.006, 0.006], 6, lambda t, s: C('#3a2a20'), mat=M_DARK)
    return [(b, lambda p: {'Head': 1.0} if p.z > 1.56 else {'Head': 0.5, 'Spine': 0.5})]


def plume(b: MeshBuilder, top: Vector, r):
    """A crest of feathers in the seat colour, rising and falling back."""
    for k in range(7):
        a = (k / 6 - 0.5)
        root = top + V(a * 0.04, 0.02 + abs(a) * 0.02, 0)
        pts = [root, root + V(a * 0.05, -0.03, 0.09), root + V(a * 0.1, 0.07, 0.15), root + V(a * 0.14, 0.2, 0.11 - 0.02 * r.random()),
               root + V(a * 0.16, 0.3, 0.02)]
        side = Vector((1, 0, 0))
        ids = []
        widths = [0.03, 0.055, 0.06, 0.045, 0.008]
        for i, p in enumerate(pts):
            c = (0.95 - 0.15 * (i / 4),) * 3
            ids.append((b.vert(p - side * widths[i] / 2, color=c), b.vert(p + side * widths[i] / 2, color=c)))
        for i in range(len(pts) - 1):
            b.face([ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]], mat=M_OWNER)
    tube(b, [top + V(0, 0, -0.01), top + V(0, 0, 0.03)], [0.016, 0.012], 8, lambda t, s: BRASS)


def great_helm(r, crowned=False):
    b = MeshBuilder()
    rings = [ring(1.53, 0.118, 0.13, 0.127), ring(1.6, 0.12, 0.132, 0.128, keel=0.012), ring(1.7, 0.12, 0.133, 0.128, keel=0.014),
             ring(1.78, 0.116, 0.128, 0.124, keel=0.01), ring(1.83, 0.108, 0.118, 0.115)]
    shell(b, rings, sides=30, edge_dark=0.12)
    # The flat top, slightly domed.
    shell(b, [ring(1.83, 0.108, 0.118, 0.115), ring(1.85, 0.07, 0.078, 0.076), ring(1.857, 0.001, 0.001, 0.001)], sides=30, edge_dark=0)
    # Eye slits either side of the brass cross, and breaths on the right cheek.
    for lo, hi in ((-62, -6), (6, 62)):
        shell(b, [ring(1.698, 0.122, 0.137, 0.13, keel=0.014), ring(1.716, 0.122, 0.137, 0.13, keel=0.014)], mat=M_DARK, color=SLIT, sides=10, arc=(lo, hi), edge_dark=0)
    shell(b, [ring(1.56, 0.123, 0.138, 0.13, keel=0.014), ring(1.8, 0.12, 0.134, 0.126, keel=0.012)], color=BRASS, sides=2, arc=(-3.5, 3.5), edge_dark=0)
    shell(b, [ring(1.722, 0.123, 0.138, 0.131, keel=0.014), ring(1.735, 0.123, 0.138, 0.131, keel=0.014)], color=BRASS, sides=24, arc=(-80, 80), edge_dark=0)
    for k in range(6):
        for j in range(2):
            a = math.radians(-40 - k * 7)
            p = V(math.sin(a) * 0.121, -math.cos(a) * 0.134, 1.6 + j * 0.035)
            n = V(math.sin(a), -math.cos(a), 0)
            tube(b, [p - n * 0.002, p + n * 0.004], [0.006, 0.006], 6, lambda t, s: SLIT, mat=M_DARK, cap=True)
    band(b, V(0, 0, 1.528), V(0, 0, 1.54), 0.125)
    if crowned:
        # A gold crown with five points round the top.
        shell(b, [ring(1.8, 0.121, 0.131, 0.128), ring(1.835, 0.122, 0.132, 0.129)], color=BRASS, sides=30, edge_dark=0)
        for k in range(5):
            a = 2 * math.pi * k / 5
            base = V(math.sin(a) * 0.12, -math.cos(a) * 0.13, 1.835)
            out = V(math.sin(a), -math.cos(a), 0)
            tube(b, [base, base + V(0, 0, 0.045) + out * 0.004], [0.022, 0.002], 6, lambda t, s: BRASS, cap=True)
    else:
        plume(b, V(0, 0.0, 1.856), r)
    return b


def armet(r):
    b = MeshBuilder()
    # A rounded skull and a visor drawn to a point, with its sight.
    rings = [ring(1.53, 0.105, 0.11, 0.12), ring(1.58, 0.118, 0.13, 0.13, keel=0.04), ring(1.64, 0.124, 0.145, 0.133, keel=0.07),
             ring(1.69, 0.124, 0.142, 0.133, keel=0.05), ring(1.74, 0.12, 0.13, 0.13, keel=0.012), ring(1.79, 0.105, 0.112, 0.118),
             ring(1.83, 0.075, 0.08, 0.085), ring(1.852, 0.03, 0.032, 0.036), ring(1.858, 0.001, 0.001, 0.001)]
    shell(b, rings, sides=30, edge_dark=0.1)
    shell(b, [ring(1.706, 0.127, 0.146, 0.135, keel=0.045), ring(1.72, 0.127, 0.142, 0.135, keel=0.03)], mat=M_DARK, color=SLIT, sides=16, arc=(-70, 70), edge_dark=0)
    # A comb along the crown and a rondel at the back.
    shell(b, [ring(1.79, 0.004, 0.115, 0.12), ring(1.86, 0.004, 0.05, 0.07)], sides=12, edge_dark=0)
    plume(b, V(0, 0.03, 1.855), r)
    return b


def bascinet():
    b = MeshBuilder()
    # A pointed skull open at the face, over a mail aventail on the shoulders.
    rings = []
    for i in range(8):
        t = i / 7
        z = 1.66 + t * 0.25
        w = math.cos(t * math.pi / 2) ** 0.8
        rings.append(ring(z, 0.12 * w + 0.002, 0.125 * w + 0.002, 0.135 * w + 0.002, cy=0.004 * i))
    shell(b, rings, sides=28, edge_dark=0.1)
    shell(b, [ring(1.56, 0.118, 0.13, 0.133), ring(1.66, 0.121, 0.127, 0.136)], sides=24, arc=(70, 290), edge_dark=0.1)
    band(b, V(0, 0, 1.655), V(0, 0, 1.668), 0.123)
    shell(b, [ring(1.45, 0.17, 0.13, 0.14), ring(1.53, 0.12, 0.11, 0.13), ring(1.6, 0.1, 0.1, 0.12)], mat=M_DARK, color=MAIL, sides=26, edge_dark=0)
    return b


def cape(long: bool):
    b = MeshBuilder()
    bottom = 0.5 if long else 0.95
    rows, cols = 10, 14
    ids = []
    for i in range(rows + 1):
        t = i / rows
        z = mix(1.47, bottom, t)
        half = mix(0.19, 0.3 if long else 0.25, t)
        row = []
        for j in range(cols + 1):
            u = j / cols * 2 - 1
            # Wrapped round the back; deeper folds lower down.
            y = 0.135 + 0.03 * t - 0.07 * u * u * (1 - 0.5 * t) + 0.018 * math.sin(u * 7.5) * t
            row.append(b.vert(V(u * half, y + 0.02 * t, z), color=(0.92 - 0.12 * t,) * 3))
        ids.append(row)
    for i in range(rows):
        for j in range(cols):
            b.face([ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]], mat=M_OWNER)
    for sx in (1, -1):
        tube(b, [V(sx * 0.15, 0.06, 1.47), V(sx * 0.15, 0.03, 1.47)], [0.022, 0.022], 10, lambda t, s: BRASS, cap=True)
    span = 1.47 - bottom

    def weights(p):
        t = (1.47 - p.z) / span
        return {'Spine': max(0.0, 1 - t * 6), 'Cape': min(1.0, t * 6) * (1 - smooth(0.4, 1.0, t)), 'Cape2': smooth(0.4, 1.0, t)}
    return [(b, weights)]


# ------------------------------------------------------------------ skeleton and assembly

BONES = {
    'Hips': ((0, 0, 0.9), (0, 0, 1.05), None),
    'Spine': ((0, 0, 1.05), (0, 0, 1.45), 'Hips'),
    'Head': ((0, 0, 1.53), (0, 0, 1.78), 'Spine'),
    'Cape': ((0, 0.14, 1.46), (0, 0.16, 1.1), 'Spine'),
    'Cape2': ((0, 0.16, 1.1), (0, 0.2, 0.55), 'Cape'),
}
for _sx, _side in ((1, 'L'), (-1, 'R')):
    BONES[f'Arm{_side}'] = (J('shoulder', _sx)[:], J('elbow', _sx)[:], 'Spine')
    BONES[f'ForeArm{_side}'] = (J('elbow', _sx)[:], J('wrist', _sx)[:], f'Arm{_side}')
    BONES[f'Hand{_side}'] = (J('wrist', _sx)[:], J('hand', _sx)[:], f'ForeArm{_side}')
    BONES[f'Thigh{_side}'] = (J('hip', _sx)[:], J('knee', _sx)[:], 'Hips')
    BONES[f'Shin{_side}'] = (J('knee', _sx)[:], J('ankle', _sx)[:], f'Thigh{_side}')
    BONES[f'Foot{_side}'] = (J('ankle', _sx)[:], J('toe', _sx)[:], f'Shin{_side}')


def build_armature():
    arm = bpy.data.armatures.new('Knight')
    ob = bpy.data.objects.new('Knight', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    for name, (head, tail, parent) in BONES.items():
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = Vector(head), Vector(tail)
        eb.roll = 0
        if parent:
            eb.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def make(name, pieces, mats):
    """One object from (builder, weights) pieces: vertex groups set per piece, then joined."""
    objs = []
    for k, (b, weights) in enumerate(pieces):
        ob = b.build(f'{name}_{k}', mats)
        for v in ob.data.vertices:
            for bone, w in weights(v.co).items():
                if w > 1e-4:
                    (ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)).add([v.index], w, 'REPLACE')
        objs.append(ob)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = objs[0]
    ob.name = ob.data.name = name
    ob.data.validate()
    for uv in list(ob.data.uv_layers):
        ob.data.uv_layers.remove(uv)
    return ob


def build():
    sc = new_scene('Knight')
    r = rng(1415)
    mats = [
        material('Steel', rough=0.3, metal=0.88),
        material('Dark', rough=0.75),
        material('Cloth', rough=0.92, double=True),
        material('Owner', rough=0.85, double=True),
        material('Skin', rough=0.7),
    ]
    body = make('KnightBody', body_pieces(), mats)
    face = make('KnightFace', face_pieces(), mats)
    head = lambda p: {'Head': 1.0}  # noqa: E731
    helms = [make('HelmGreat', [(great_helm(r), head)], mats), make('HelmArmet', [(armet(r), head)], mats),
             make('HelmBascinet', [(bascinet(), lambda p: {'Head': 1.0} if p.z > 1.6 else {'Head': 0.4, 'Spine': 0.6})], mats),
             make('HelmCrowned', [(great_helm(r, crowned=True), head)], mats)]
    capes = [make('CapeShort', cape(False), mats), make('CapeLong', cape(True), mats)]
    everything = [body, face, *helms, *capes]
    # Occlusion per outfit: each helm and cape baked against the body alone.
    for group in ([body, capes[1]], [face], *[[h] for h in helms], [capes[0]]):
        for ob in everything:
            ob.hide_render = ob not in group and ob is not body
        bake_ao(group, strength=0.45, distance=0.12, samples=24)
    for ob in everything:
        ob.hide_render = False

    arm = build_armature()
    for ob in everything:
        ob.parent = arm
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm
    export_glb([arm], 'knight.glb', skins=True)
    save_blend(sc, 'knight.blend')
    return stats([arm])
