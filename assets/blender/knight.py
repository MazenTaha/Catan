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

STEEL = C('#879eac')
STEEL_DK = C('#435c70')
BRASS = C('#c9a65d')
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
                  ring(1.27, 0.211, 0.175, 0.138, cy=-0.01, keel=0.016), ring(1.37, 0.218, 0.169, 0.132, cy=-0.01, keel=0.01),
                  ring(1.45, 0.172, 0.12, 0.11), ring(1.5, 0.105, 0.088, 0.082)], sides=20, edge_dark=0.1)
    band(torso, V(0, -0.002, 1.495), V(0, -0.002, 1.505), 0.108)
    # Gorget round the neck.
    shell(torso, [ring(1.47, 0.1, 0.095, 0.09), ring(1.53, 0.085, 0.082, 0.08), ring(1.575, 0.074, 0.07, 0.07)], sides=22)
    # Fluting fanning up the breastplate (00-knight-turnaround), the brass sprig medallion.
    for k in range(-3, 4):
        a = math.radians(k * 11)
        lo = V(math.sin(a) * 0.09, -0.150 - 0.008 * math.cos(a), 1.12)
        hi = V(math.sin(a * 1.25) * 0.19, -0.175 * math.cos(a * 1.25) - 0.028, 1.36)
        mid = lo.lerp(hi, 0.5) + V(0, -0.016, 0)
        tube(torso, [lo, mid, hi], [0.004, 0.006, 0.004], 5, lambda t, s: STEEL_DK, mat=M_STEEL)
    tube(torso, [V(0.075, -0.15, 1.41), V(0.077, -0.168, 1.412)], [0.03, 0.03], 14, lambda t, s: BRASS, mat=M_STEEL, cap=True)
    # Raised collar edging and a small heraldic sun: readable without a noisy texture map.
    for sx in (-1, 1):
        tube(torso, [V(sx * .03, -.112, 1.48), V(sx * .14, -.143, 1.4), V(sx * .17, -.147, 1.32)],
             [.008, .009, .006], 6, lambda t, s: BRASS, mat=M_STEEL)
    centre = V(0, -.216, 1.29)
    tube(torso, [centre, centre + V(0, -.012, 0)], [.033, .029], 12, lambda t, s: BRASS, cap=True)
    for k in range(8):
        a = k * math.pi / 4
        direction = V(math.sin(a), 0, math.cos(a))
        tube(torso, [centre + direction * .043, centre + direction * .059], [.006, .003], 5, lambda t, s: BRASS, cap=True)
    pieces.append((torso, rigid('Spine')))
    # A cloth cowl draped round the gorget, lower at the front.
    cowl = MeshBuilder()
    shell(cowl, [ring(1.46, 0.185, 0.13, 0.13), ring(1.47, 0.17, 0.13, 0.13), ring(1.5, 0.165, 0.128, 0.13),
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

    # Close mail skirt and split tailored tabard: legs and hip plates remain legible in a run.
    mail = MeshBuilder()
    shell(mail, [ring(.9,.18,.14,.135), ring(.78,.19,.15,.15)], mat=M_DARK, color=MAIL, sides=24, edge_dark=0)
    pieces.append((mail, rigid('Hips')))
    for rear in (False, True):
        for sx in (-1, 1):
            cloth = MeshBuilder()
            ids=[]
            for i in range(6):
                t=i/5
                z=mix(.91,.56,t)
                row=[]
                for j in range(9):
                    u=j/8
                    x=sx*(.018+u*mix(.115,.15,t))
                    y=(1 if rear else -1)*(.153+.018*t+math.sin(u*math.pi)*.018)
                    row.append(cloth.vert(V(x,y,z+.025*math.sin(u*math.pi)*t*t), color=mul(WHITE,.9+.1*math.sin(u*math.pi))))
                ids.append(row)
            for i in range(5):
                for j in range(8):
                    border=j==7 or i==4
                    cloth.face([ids[i][j],ids[i+1][j],ids[i+1][j+1],ids[i][j+1]], mat=M_DARK if border else M_CLOTH, colors=BRASS if border else None)
            def skirt(p):
                t=smooth(.93,.55,p.z)*.55
                return {'Hips':1-t, f'Thigh{"L" if p.x>0 else "R"}':t}
            pieces.append((cloth,skirt))

    for sx, side in ((1, 'L'), (-1, 'R')):
        # Pauldron: a dome over the shoulder, a brass rim and two lames down the arm.
        arm = MeshBuilder()
        sh = J('shoulder', sx)
        shell(arm, [ring(sh.z-.035,.153,.154,.14,cx=sh.x+sx*.035),
                    ring(sh.z+.035,.178,.154,.145,cx=sh.x+sx*.035),
                    ring(sh.z+.105,.115,.112,.105,cx=sh.x+sx*.015)], sides=12,cap_top=True,edge_dark=.12)
        for j in range(3):
            c=sh+V(sx*(.08+j*.025),-.13, .018-j*.018)
            tube(arm,[c,c+V(0,-.008,0)],[.009,.009],8,lambda t,s: BRASS,cap=True)
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
        limb(fore, el + V(0, 0, -0.02), wr + V(0, 0, 0.02), [0.058, 0.064, 0.047])
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
        limb(thigh, hp + V(0, 0, 0.02), kn + V(0, 0, 0.04), [0.092, 0.098, 0.083, 0.066], sides=16)
        dome(thigh, kn + V(0, -0.025, 0.0), 0.066, 0.06, 0.07, down=150, sides=16, rows=7)
        # The poleyn's side wing.
        wing = kn + V(sx * 0.055, -0.01, 0.0)
        shell(thigh, [ring(wing.z - 0.035, 0.012, 0.035, 0.035, cx=wing.x, cy=wing.y), ring(wing.z + 0.035, 0.012, 0.035, 0.035, cx=wing.x, cy=wing.y)],
              sides=12, cap_top=True, cap_bottom=True, edge_dark=0)
        pieces.append((thigh, rigid(f'Thigh{side}')))
        shin = MeshBuilder()
        an = J('ankle', sx)
        limb(shin, kn + V(0, 0, -0.03), an + V(0, 0, 0.03), [0.06, 0.078, 0.07, 0.052, 0.046], sides=16)
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
    # A swept, thick feather crest; readable from the third-person camera behind it.
    tube(b,[top,top+V(0,0,.035)],[.022,.018],10,lambda t,s: BRASS,cap=True)
    for k in range(9):
        u=k/8
        base=top+V((u-.5)*.07,0,.02)
        points=[base,base+V(0,.015,.095),base+V((u-.5)*.02,.10,.18),base+V((u-.5)*.04,.22,.15)]
        tube(b,points,[.018,.025,.022,.0015],7,lambda t,s: mul(WHITE,.7+.25*t),mat=M_OWNER,cap=True)


def great_helm(r, crowned=False):
    b=MeshBuilder()
    # Faceted cheek plates, a proud brow, a vaulted crown and a tapered chin.
    rings=[ring(1.535,.09,.105,.10),ring(1.59,.112,.12,.115,keel=.025),
           ring(1.665,.13,.131,.129,keel=.035),ring(1.735,.133,.139,.134,keel=.018),
           ring(1.805,.122,.115,.13),ring(1.867,.078,.073,.09),ring(1.899,.008,.01,.012)]
    shell(b,rings,sides=16,cap_top=True,edge_dark=.1)
    # Deep sight beneath the projecting brow and a sculpted visor ridge.
    shell(b,[ring(1.697,.134,.14,.134,keel=.037),ring(1.724,.136,.145,.134,keel=.03)],mat=M_DARK,color=SLIT,sides=14,arc=(-72,72),edge_dark=0)
    shell(b,[ring(1.726,.138,.149,.136,keel=.026),ring(1.743,.136,.144,.135,keel=.02)],color=C('#d5e2e9'),sides=16,arc=(-82,82),edge_dark=0)
    shell(b,[ring(1.545,.094,.113,.104),ring(1.56,.102,.118,.11)],color=BRASS,sides=16,edge_dark=0)
    # Comb and rear flutes make the helmet distinct even when viewed from behind.
    tube(b,[V(0,-.13,1.75),V(0,-.08,1.85),V(0,.01,1.905),V(0,.11,1.83),V(0,.137,1.7)],
         [.009,.011,.012,.01,.007],6,lambda t,s: BRASS,cap=True)
    for sx in (-1,1):
        for k in range(3):
            c=V(sx*(.045+k*.021),-.13+(k*.011),1.63)
            tube(b,[c,c+V(0,-.018,0)],[.006,.006],6,lambda t,s: SLIT,mat=M_DARK,cap=True)
        c=V(sx*.134,0,1.716)
        tube(b,[c,c+V(sx*.01,0,0)],[.019,.016],10,lambda t,s: BRASS,cap=True)
        tube(b,[V(sx*.075,.107,1.77),V(sx*.055,.13,1.66)],[.006,.004],5,lambda t,s: STEEL_DK)
    if crowned:
        shell(b,[ring(1.81,.125,.121,.136),ring(1.84,.116,.11,.12)],color=BRASS,sides=16,edge_dark=0)
        for k in range(5):
            a=k*math.tau/5
            c=V(math.sin(a)*.12,-math.cos(a)*.12,1.835)
            tube(b,[c,c+V(0,0,.05)],[.018,.003],6,lambda t,s: BRASS,cap=True)
    else:
        plume(b,V(0,.015,1.902),r)
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
    bottom = 0.20 if long else 0.53
    rows, cols = 22, 20
    ids = []
    for i in range(rows + 1):
        t = i / rows
        z = mix(1.47, bottom, t)
        half = mix(0.225, 0.39 if long else 0.33, smooth(0, 1, t))
        row = []
        for j in range(cols + 1):
            u = j / cols * 2 - 1
            # Wrapped round the back; deeper folds lower down.
            fold = math.cos(u * math.pi * 4) * (0.008 + 0.025 * t)
            y = 0.195 + 0.13 * t - 0.07 * u * u * (1 - 0.5 * t) + fold
            hem = 0.045 * abs(u) ** 1.5 * t ** 9
            row.append(b.vert(V(u * half, y, z + hem), color=(0.97 - 0.16 * t + fold * 1.2,) * 3))
        ids.append(row)
    for i in range(rows):
        for j in range(cols):
            border = j in (0, cols - 1) or i == rows - 1
            b.face([ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]],
                   colors=BRASS if border else None, mat=M_DARK if border else M_OWNER)
    for sx in (1, -1):
        tube(b, [V(sx * 0.15, 0.06, 1.47), V(sx * 0.15, 0.03, 1.47)], [0.022, 0.022], 10, lambda t, s: BRASS, cap=True)
    span = 1.47 - bottom
    # Sewn heraldic sun on the outside, following the same folds as the cloth beneath it.
    def surface(x, z):
        t = (1.47 - z) / span
        half = mix(.225, .39 if long else .33, smooth(0, 1, t))
        u = x / half
        y = .195 + .13 * t - .07 * u * u * (1 - .5 * t) + math.cos(u * math.pi * 4) * (.008 + .025 * t)
        return V(x, y + .007, z)
    centre = surface(0, 1.13)
    for k in range(16):
        a, c = k * math.pi / 8, (k + 1) * math.pi / 8
        r0, r1 = (.09 if k % 2 == 0 else .045), (.045 if k % 2 == 0 else .09)
        b.poly([centre, surface(math.sin(a) * r0, 1.13 + math.cos(a) * r0),
                surface(math.sin(c) * r1, 1.13 + math.cos(c) * r1)], BRASS, mat=M_DARK)

    def weights(p):
        t = max(0.0, min(1.0, (1.47 - p.z) / span))
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
        material('Steel', rough=0.38, metal=0.78),
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
