"""Enterable buildings for the 3D walk, part of village.glb:

  Cottage   the settlement: timber, plaster and stone, one finished room (bed nook, hearth,
            table, bench, dresser, chest), four window openings, a hinged door
  Hall      the city: a stone hall with a corner tower and a porch; a long table, benches,
            chests, shelves, a big hearth and owner-coloured banners; double doors
  Mill      the windmill: an enterable stone ground floor (millstone, sacks, ladder, bin) under
            the tapered tower, cap and turning sails

Every room comes from the shared plan in apps/web/src/components/world/buildings.json (sizes,
doors, windows, furniture boxes); the game reads the same file for collision, floors and doors,
so the model and what the walker bumps into can't drift apart.

Node layout per building: the shell (walls, floor, ceiling, roof) as the root; a child
"<Name>Interior" (furniture and props, which the game hides at a distance); one child
"<Name>Door" (the hall: "HallDoorA", "HallDoorB") per leaf, its origin on the hinge at floor
level, the leaf running along its local +X when closed. The mill's sails stay the child "Sails".

Materials: the village set plus "Interior" (inside faces: atlas x vertex colour, lit with extra
fill in the game). Inner and outer wall faces are separate one-sided faces with real thickness.
"""

from __future__ import annotations

import json
import math
import os

from mathutils import Vector

from common import MeshBuilder, lerp, mul, rng, srgb, tube
from textures import VILLAGE as V
from village import (IRON, M_IRON, M_ROOF, M_TRIM, M_VILLAGE, PLANK, PLASTER, STONE, STONE_DK, THATCH, TIMBER, TIMBER_LT,
                     UP, WHITE, X, Y, aquad, beam, box, chimney, gable_roof, sub, tower)

M_INTERIOR = 6

HERE = os.path.dirname(os.path.abspath(__file__))
PLAN_PATH = os.path.normpath(os.path.join(HERE, '..', '..', 'apps', 'web', 'src', 'components', 'world', 'buildings.json'))

C = srgb
# Warm, saturated material family: honey timber, cream plaster, warm grey stone.
WALL_IN = C('#efe1c4')
FLOOR = C('#b98a5c')
CEIL = C('#c79b6c')
CLOTH_RED = C('#b8473a')
CLOTH_BLUE = C('#3f6ea8')
CLOTH_GREEN = C('#4f8a46')
STRAW = C('#e6c76f')
CERAMIC = C('#c9774a')
COPPER = C('#b8733d')
FLOWERS = [C('#e8483b'), C('#f3c641'), C('#f4f1e8'), C('#9a6ad0')]


def load_plan():
    with open(PLAN_PATH, encoding='utf-8') as f:
        return json.load(f)


def P(x: float, z: float, y: float = 0.0) -> Vector:
    """Plan coordinates (x right, z towards the front, y up) to Blender (front facing -Y)."""
    return Vector((x, -z, y))


def quad(b: MeshBuilder, pts, want: Vector, rect, color, mat):
    """A quad whose corners are reordered so its face normal points along `want`."""
    n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
    if n.dot(want) < 0:
        pts = list(reversed(pts))
    u0, v0, u1, v1 = rect
    b.poly(pts, color, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], mat=mat, smooth=False)


def face(b: MeshBuilder, origin: Vector, u: Vector, w: float, h: float, want: Vector, rect, tile, color, mat, jitter=0.0, r=None):
    """aquad spanning u*w by UP*h from origin, flipped (origin moved to the far end) if needed so
    the face looks along `want`."""
    if u.cross(UP).dot(want) >= 0:
        aquad(b, origin, u, UP, w, h, rect, tile, color, mat, jitter, r)
    else:
        aquad(b, origin + u * w, -u, UP, w, h, rect, tile, color, mat, jitter, r)


def solid_spans(H: float, holes):
    """[0, H] minus the given (y0, y1) holes, as a list of spans."""
    spans = []
    y = 0.0
    for y0, y1 in sorted(holes):
        if y0 > y + 1e-4:
            spans.append((y, y0))
        y = max(y, y1)
    if y < H - 1e-4:
        spans.append((y, H))
    return spans


def wall_slab(b, r, base: Vector, u: Vector, n: Vector, Li: float, Lo: float, t: float, H: float, openings,
              outer_style, inner_mat=M_INTERIOR, inner_color=WALL_IN, inner_y0=0.0, inner_y1=None):
    """One wall: its inner face is centred on `base` along `u` (length Li), its outer face `t`
    further along the outward normal `n` (length Lo; with Lo - Li = 2t the ends meet the next
    wall in a mitre). Openings (s0, s1, y0, y1) cut through both faces and get reveals.
    `outer_style(y0, y1)` gives (rect, tile, color, mat) for a band of the outer face.
    The inner face only covers inner_y0..inner_y1 (floor to ceiling); above it is the loft."""
    inner_y1 = H if inner_y1 is None else inner_y1

    def faces(L: float, off: Vector, want: Vector, outer: bool):
        cuts = sorted({-L / 2, L / 2, *[max(-L / 2, min(L / 2, o[0])) for o in openings],
                       *[max(-L / 2, min(L / 2, o[1])) for o in openings]})
        for sa, sb in zip(cuts, cuts[1:]):
            if sb - sa < 1e-4:
                continue
            mid = (sa + sb) / 2
            holes = [(o[2], o[3]) for o in openings if o[0] <= mid <= o[1]]
            for y0, y1 in solid_spans(H, holes):
                if not outer:
                    y0, y1 = max(y0, inner_y0), min(y1, inner_y1)
                    if y1 - y0 < 1e-4:
                        continue
                    face(b, off + u * sa + UP * y0, u, sb - sa, y1 - y0, want, V['plaster'], (2.0, 2.0), inner_color, inner_mat)
                    continue
                # Outer face in horizontal bands (stone base, plaster above...).
                for ya, yb, rect, tile, color, mat in outer_style(y0, y1):
                    face(b, off + u * sa + UP * ya, u, sb - sa, yb - ya, want, rect, tile, color, mat, 0.05, r)

    faces(Li, base, -n, False)
    faces(Lo, base + n * t, n, True)
    # Reveals round each opening: jambs, head and (above the floor) a sill.
    for s0, s1, y0, y1 in openings:
        for s, want in ((s0, u), (s1, -u)):
            pts = [base + u * s + UP * y0, base + u * s + n * t + UP * y0, base + u * s + n * t + UP * y1, base + u * s + UP * y1]
            quad(b, pts, want, V['plaster'], mul(WALL_IN, 0.92), M_VILLAGE)
        pts = [base + u * s0 + UP * y1, base + u * s1 + UP * y1, base + u * s1 + n * t + UP * y1, base + u * s0 + n * t + UP * y1]
        quad(b, pts, -UP, V['plaster'], mul(WALL_IN, 0.85), M_VILLAGE)
        if y0 > 0.05:
            pts = [base + u * s0 + UP * y0, base + u * s1 + UP * y0, base + u * s1 + n * t + UP * y0, base + u * s0 + n * t + UP * y0]
            quad(b, pts, UP, V['timber'], TIMBER_LT, M_VILLAGE)
    # Wall top (seen only from the loft, closed anyway so shadows stay solid).
    pts = [base - u * (Li / 2) + UP * H, base + u * (Li / 2) + UP * H, base + n * t + u * (Lo / 2) + UP * H, base + n * t - u * (Lo / 2) + UP * H]
    quad(b, pts, UP, V['stone'], STONE_DK, M_VILLAGE)


def rect_walls(plan):
    """The four walls of a rectangular room: (name, base, u along +at, outward n, inner length)."""
    w, d = plan['inner']
    return [
        ('front', P(0, d / 2), X, -Y, w),
        ('back', P(0, -d / 2), X, Y, w),
        ('left', P(-w / 2, 0), -Y, -X, d),   # 'at' runs along +z (towards the front) = Blender -Y
        ('right', P(w / 2, 0), -Y, X, d),
    ]


def openings_on(plan, wall: str, floor: float):
    out = []
    for dr in plan['doors']:
        if dr['wall'] == wall:
            out.append((dr['at'] - dr['w'] / 2, dr['at'] + dr['w'] / 2, floor, floor + dr['h']))
    for wi in plan['windows']:
        if wi['wall'] == wall:
            out.append((wi['at'] - wi['w'] / 2, wi['at'] + wi['w'] / 2, floor + wi['sill'], floor + wi['sill'] + wi['h']))
    return out


# ------------------------------------------------------------------ details on walls

def window_dressing(b, base: Vector, u: Vector, n: Vector, t: float, wi, floor: float, shutters=True, box_flowers=False, r=None):
    """Outside: a timber surround, a mullion cross, owner-coloured shutters folded open and an
    optional flower box. Inside: a deep sill board. The opening itself stays open (light in)."""
    s0, s1 = wi['at'] - wi['w'] / 2, wi['at'] + wi['w'] / 2
    y0, y1 = floor + wi['sill'], floor + wi['sill'] + wi['h']
    o = base + n * (t + 0.02)
    mid = base + n * (t * 0.5)
    # Mullion and transom in the middle of the wall's thickness.
    beam(b, mid + u * ((s0 + s1) / 2) + UP * y0, mid + u * ((s0 + s1) / 2) + UP * y1, 0.05, 0.05, TIMBER, normal=n)
    beam(b, mid + u * s0 + UP * ((y0 + y1) / 2 + 0.08), mid + u * s1 + UP * ((y0 + y1) / 2 + 0.08), 0.05, 0.05, TIMBER, normal=n)
    # Surround.
    beam(b, o + u * (s0 - 0.12) + UP * (y1 + 0.07), o + u * (s1 + 0.12) + UP * (y1 + 0.07), 0.14, 0.1, TIMBER_LT, normal=n)
    beam(b, o + u * (s0 - 0.1) + UP * (y0 - 0.06), o + u * (s1 + 0.1) + UP * (y0 - 0.06), 0.12, 0.14, TIMBER_LT, normal=n)
    if shutters:
        sw = (s1 - s0) * 0.5
        for s, sgn in ((s0, -1), (s1, 1)):
            edge = o + n * 0.02 + u * s
            p0 = edge if sgn > 0 else edge - u * sw
            face(b, p0 + UP * y0, u, sw, y1 - y0, n, sub(V['planks'], 0, 0, 0.6, 1), (sw, y1 - y0), (0.9, 0.9, 0.9), M_TRIM)
            face(b, p0 + UP * y0 - n * 0.03, u, sw, y1 - y0, -n, sub(V['planks'], 0, 0, 0.6, 1), (sw, y1 - y0), mul(TIMBER_LT, 0.9), M_VILLAGE)
    if box_flowers and r is not None:
        bc = o + u * ((s0 + s1) / 2) + n * 0.16 + UP * (y0 - 0.32)
        box(b, bc, _axis_size(u, n, s1 - s0 + 0.1, 0.28, 0.24), V['planks'], (0.6, 0.3), mul(TIMBER_LT, 0.9))
        for k in range(7):
            p = bc + u * ((s1 - s0) * (k / 6 - 0.5)) + n * (r.random() - 0.5) * 0.1 + UP * 0.24
            col = FLOWERS[k % len(FLOWERS)]
            tube(b, [p, p + UP * 0.08, p + UP * 0.18], [0.07, 0.1, 0.05], 5, lambda t_, s_, c=col: lerp(C('#3f7f35'), c, t_ ** 0.6),
                 mat=M_VILLAGE, cap=True)
    # Inside sill board.
    ins = base - n * 0.06
    sill = [ins + u * (s0 - 0.05) + UP * y0, ins + u * (s1 + 0.05) + UP * y0, base + n * t + u * (s1 + 0.05) + UP * y0,
            base + n * t + u * (s0 - 0.05) + UP * y0]
    quad(b, [p + UP * 0.03 for p in sill], UP, V['timber'], TIMBER_LT, M_INTERIOR)


def _axis_size(u: Vector, n: Vector, su: float, sn: float, h: float):
    """Box size (x, y, z) for a box with su along the wall direction u and sn along n."""
    if abs(u.x) > 0.5:
        return (su, sn, h)
    return (sn, su, h)


def door_frame(b, base: Vector, u: Vector, n: Vector, t: float, dr, floor: float):
    s0, s1 = dr['at'] - dr['w'] / 2, dr['at'] + dr['w'] / 2
    o = base + n * (t + 0.03)
    top = floor + dr['h']
    for s in (s0 - 0.08, s1 + 0.08):
        beam(b, o + u * s + UP * floor, o + u * s + UP * (top + 0.1), 0.16, 0.12, TIMBER_LT, normal=n)
    beam(b, o + u * (s0 - 0.2) + UP * (top + 0.12), o + u * (s1 + 0.2) + UP * (top + 0.12), 0.2, 0.16, TIMBER, normal=n)
    # Threshold stone across the wall.
    th = [base + u * s0 + UP * (floor + 0.02), base + u * s1 + UP * (floor + 0.02), base + n * (t + 0.05) + u * s1 + UP * (floor + 0.02),
          base + n * (t + 0.05) + u * s0 + UP * (floor + 0.02)]
    quad(b, th, UP, V['stone'], STONE_DK, M_VILLAGE)


def door_leaf(name: str, mats, dr, base: Vector, u: Vector, n: Vector, t: float, floor: float, wide_iron=True):
    """A plank door as its own node, origin on the hinge at floor level, the leaf along local +X."""
    w, h = dr['w'] - 0.04, dr['h'] - 0.03
    th = 0.07
    lb = MeshBuilder()
    rect = V['door']
    # Front (outside) and back (inside) faces, edges.
    for want, y in ((Vector((0, -1, 0)), -th / 2), (Vector((0, 1, 0)), th / 2)):
        pts = [Vector((0, y, 0)), Vector((w, y, 0)), Vector((w, y, h)), Vector((0, y, h))]
        quad(lb, pts, want, rect, (1, 1, 1) if want.y < 0 else (0.86, 0.8, 0.74), M_VILLAGE)
    for pts, want in (([Vector((0, -th / 2, 0)), Vector((0, th / 2, 0)), Vector((0, th / 2, h)), Vector((0, -th / 2, h))], Vector((-1, 0, 0))),
                      ([Vector((w, -th / 2, 0)), Vector((w, th / 2, 0)), Vector((w, th / 2, h)), Vector((w, -th / 2, h))], Vector((1, 0, 0))),
                      ([Vector((0, -th / 2, h)), Vector((w, -th / 2, h)), Vector((w, th / 2, h)), Vector((0, th / 2, h))], Vector((0, 0, 1)))):
        quad(lb, pts, want, V['timber'], TIMBER, M_VILLAGE)
    # Iron strap hinges and a ring handle on both sides.
    for z in (0.35, h - 0.4) if wide_iron else (0.4,):
        for y in (-th / 2 - 0.012, th / 2 + 0.012):
            want = Vector((0, -1 if y < 0 else 1, 0))
            pts = [Vector((0.02, y, z)), Vector((w * 0.7, y, z)), Vector((w * 0.7, y, z + 0.07)), Vector((0.02, y, z + 0.07))]
            quad(lb, pts, want, V['iron'], IRON, M_IRON)
    for y in (-th / 2 - 0.03, th / 2 + 0.03):
        tube(lb, [Vector((w - 0.14, y, 1.0)), Vector((w - 0.14, y * 1.4, 1.0))], [0.035, 0.035], 6, lambda t_, s_: IRON, mat=M_IRON, cap=True)
    ob = lb.build(name, mats)
    # Place: hinge end of the opening, on the inner third of the wall, leaf along the wall.
    s_h = dr['at'] - dr['w'] / 2 + 0.02 if dr['hinge'] == 'a' else dr['at'] + dr['w'] / 2 - 0.02
    along = u if dr['hinge'] == 'a' else -u
    p = base + u * s_h + n * (t * 0.3) + UP * (floor + 0.01)
    ob.location = p
    ob.rotation_euler = (0, 0, math.atan2(along.y, along.x))
    return ob


# ------------------------------------------------------------------ furniture

def fbox(b, f, h=None, rect=None, color=PLANK, mat=M_INTERIOR, top=None, inset=0.0):
    """A plain box filling (part of) a plan furniture box."""
    c = P(f['x'], f['z'])
    sz = (f['w'] - inset, f['d'] - inset, f['h'] if h is None else h)
    box(b, c, sz, rect or V['planks'], (1.0, 1.0), color, mat, top=top)


def leg(b, p: Vector, h: float, s=0.08, color=TIMBER_LT):
    box(b, p, (s, s, h), V['timber'], (0.2, 1.0), color, M_INTERIOR, faces='fblr')


def table(b, f, floor, color=PLANK):
    x, z, w, d, h = f['x'], f['z'], f['w'], f['d'], f['h']
    top = P(x, z, floor + h - 0.06)
    box(b, top, (w, d, 0.06), V['planks'], (1.2, 1.2), color, M_INTERIOR)
    for sx in (-1, 1):
        for sz in (-1, 1):
            leg(b, P(x + sx * (w / 2 - 0.1), z + sz * (d / 2 - 0.1), floor), h - 0.06, 0.09)
    beam(b, P(x - w / 2 + 0.1, z, floor + 0.2), P(x + w / 2 - 0.1, z, floor + 0.2), 0.06, 0.06, TIMBER_LT)


def bench(b, f, floor):
    x, z, w, d, h = f['x'], f['z'], f['w'], f['d'], f['h']
    alongx = w >= d
    box(b, P(x, z, floor + h - 0.05), (w, d, 0.05), V['planks'], (1.2, 1.2), mul(PLANK, 1.05), M_INTERIOR)
    L = (w if alongx else d) / 2 - 0.12
    for s in (-1, 1):
        p = P(x + (s * L if alongx else 0), z + (0 if alongx else s * L), floor)
        box(b, p, (0.06 if alongx else d - 0.06, d - 0.06 if alongx else 0.06, h - 0.05), V['planks'], (0.5, 0.5), TIMBER_LT, M_INTERIOR)


def stool(b, f, floor):
    c = P(f['x'], f['z'], floor)
    tube(b, [c + UP * (f['h'] - 0.05), c + UP * f['h']], [f['w'] / 2, f['w'] / 2], 10, lambda t_, s_: PLANK, mat=M_INTERIOR, cap=True)
    for k in range(3):
        a = k * math.tau / 3
        leg(b, c + Vector((math.cos(a), math.sin(a), 0)) * (f['w'] * 0.32), f['h'] - 0.05, 0.05)


def bed(b, f, floor, r):
    x, z, w, d = f['x'], f['z'], f['w'], f['d']
    # Frame, straw mattress, a quilt in red and a pillow; a tall headboard against the back wall.
    box(b, P(x, z, floor), (w, d, 0.32), V['planks'], (1.0, 1.0), TIMBER_LT, M_INTERIOR)
    box(b, P(x, z, floor + 0.32), (w - 0.1, d - 0.1, 0.12), V['cloth'], (1.0, 1.0), STRAW, M_INTERIOR)
    box(b, P(x, z + 0.18, floor + 0.44), (w - 0.06, d - 0.6, 0.07), V['cloth'], (0.8, 0.8), CLOTH_RED, M_INTERIOR)
    box(b, P(x, z - d / 2 + 0.3, floor + 0.44), (w - 0.3, 0.32, 0.1), V['wool'], (0.5, 0.5), C('#f2ece0'), M_INTERIOR)
    box(b, P(x, z - d / 2 + 0.04, floor), (w, 0.08, 1.05), V['planks'], (1.0, 1.0), TIMBER, M_INTERIOR)
    box(b, P(x, z + d / 2 - 0.04, floor), (w, 0.08, 0.6), V['planks'], (1.0, 1.0), TIMBER, M_INTERIOR)


def hearth(b, f, floor, ceiling, r, big=False):
    """A stone hearth against a wall: raised base, firebox opening, mantel and a chimney breast
    up to the ceiling; a pot hangs in the fire, glowing embers (the Glow material)."""
    x, z, w, d = f['x'], f['z'], f['w'], f['d']
    deep_x = d > w  # against a side wall
    c = P(x, z, floor)
    box(b, c, (w, d, 0.18), V['stone'], (1.0, 1.0), STONE_DK, M_INTERIOR)
    # Two cheeks and a lintel make the firebox.
    if deep_x:
        cheek = (w, 0.24, f['h'])
        for s in (-1, 1):
            box(b, P(x, z + s * (d / 2 - 0.12), floor + 0.18), cheek, V['stone'], (0.8, 0.8), STONE, M_INTERIOR, jitter=0.08, r=r)
        box(b, P(x, z, floor + 0.18 + f['h'] - 0.3), (w, d, 0.3), V['stone'], (0.8, 0.8), STONE, M_INTERIOR)
        box(b, P(x, z, floor + f['h'] - 0.12 + 0.18), (w + 0.12, d + 0.1, 0.1), V['timber'], (1.0, 0.3), TIMBER, M_INTERIOR)
        brx = w * 0.85
        box(b, P(x + (w - brx) / 2 * (1 if x > 0 else -1), z, floor + 0.18 + f['h']), (brx, d * 0.8, ceiling - f['h'] - 0.18), V['plaster'], (1.5, 1.5), WALL_IN, M_INTERIOR)
    else:
        cheek = (0.24, d, f['h'])
        for s in (-1, 1):
            box(b, P(x + s * (w / 2 - 0.12), z, floor + 0.18), cheek, V['stone'], (0.8, 0.8), STONE, M_INTERIOR, jitter=0.08, r=r)
        box(b, P(x, z, floor + 0.18 + f['h'] - 0.3), (w, d, 0.3), V['stone'], (0.8, 0.8), STONE, M_INTERIOR)
        box(b, P(x, z + 0.04, floor + f['h'] - 0.12 + 0.18), (w + 0.12, d + 0.1, 0.1), V['timber'], (1.0, 0.3), TIMBER, M_INTERIOR)
        bry = d * 0.85
        box(b, P(x, z - (d - bry) / 2, floor + 0.18 + f['h']), (w * 0.8, bry, ceiling - f['h'] - 0.18), V['plaster'], (1.5, 1.5), WALL_IN, M_INTERIOR)
    # Back of the firebox (sooty), embers and logs.
    box(b, P(x, z, floor + 0.18), (w * 0.55 if not deep_x else w * 0.5, d * 0.5 if not deep_x else d * 0.55, 0.06), V['iron'], (0.5, 0.5), C('#2a201b'), M_INTERIOR)
    box(b, P(x, z, floor + 0.2), (0.45 if not deep_x else 0.3, 0.3 if not deep_x else 0.45, 0.05), V['white'], (0.5, 0.5), (1, 1, 1), 5)
    for k in range(3):
        a = k * 1.1 + 0.3
        p = P(x, z, floor + 0.27)
        q = Vector((math.cos(a), math.sin(a), 0)) * 0.22
        tube(b, [p - q, p + q], [0.05, 0.05], 6, lambda t_, s_: mul(TIMBER, 0.8), mat=M_INTERIOR, cap=True)
    # A pot on a chain.
    pc = P(x, z, floor + 0.62)
    tube(b, [pc, pc + UP * 0.12, pc + UP * 0.26, pc + UP * 0.3], [0.12, 0.17, 0.15, 0.12], 10, lambda t_, s_: mul(IRON, 1.3), mat=M_INTERIOR, cap=True)
    beam(b, pc + UP * 0.3, P(x, z, floor + 0.18 + f['h'] - 0.3), 0.02, 0.02, IRON, M_INTERIOR)
    if big:
        for s in (-1, 1):
            q = P(x, z + s * 0.5, floor + 0.18 + f['h'] + 0.06) if deep_x else P(x + s * 0.5, z, floor + 0.18 + f['h'] + 0.06)
            jug(b, q, CERAMIC)


def jug(b, p: Vector, color, s=1.0):
    tube(b, [p, p + UP * 0.05 * s, p + UP * 0.14 * s, p + UP * 0.2 * s, p + UP * 0.23 * s],
         [0.05 * s, 0.075 * s, 0.07 * s, 0.035 * s, 0.045 * s], 8, lambda t_, s_: mul(color, 0.85 + 0.25 * t_), mat=M_INTERIOR, cap=True)


def bowl(b, p: Vector, color):
    tube(b, [p, p + UP * 0.02, p + UP * 0.06], [0.04, 0.08, 0.1], 10, lambda t_, s_: color, mat=M_INTERIOR, cap=True)


def candle(b, p: Vector):
    tube(b, [p, p + UP * 0.02], [0.06, 0.06], 8, lambda t_, s_: COPPER, mat=M_INTERIOR, cap=True)
    tube(b, [p + UP * 0.02, p + UP * 0.16], [0.022, 0.022], 6, lambda t_, s_: C('#f3ead2'), mat=M_INTERIOR, cap=True)


def dresser(b, f, floor, r):
    """A dresser against the right wall: cupboard below, open plate shelves above."""
    x, z, w, d, h = f['x'], f['z'], f['w'], f['d'], f['h']
    box(b, P(x, z, floor), (w, d, 0.8), V['planks'], (1.0, 1.0), mul(TIMBER_LT, 1.05), M_INTERIOR)
    wall_x = x + w / 2 - 0.06
    box(b, P(wall_x, z, floor + 0.8), (0.06, d, h - 0.8), V['planks'], (1.0, 1.0), TIMBER_LT, M_INTERIOR)
    for k, y in enumerate((1.05, 1.35)):
        box(b, P(x + 0.1, z, floor + y), (w - 0.2, d, 0.04), V['planks'], (1.0, 1.0), TIMBER_LT, M_INTERIOR)
        for j in range(3):
            q = P(x + 0.12, z - d / 2 + 0.18 + j * (d - 0.36) / 2, floor + y + 0.04)
            (jug if (j + k) % 2 else bowl)(b, q, [CERAMIC, C('#d9cfb8'), CLOTH_BLUE][(j + k) % 3])
    for s in (-1, 1):
        box(b, P(x, z + s * (d / 2 - 0.03), floor + 0.8), (w * 0.4, 0.04, h - 0.8), V['planks'], (0.4, 1.0), TIMBER_LT, M_INTERIOR)


def chest(b, f, floor, color=TIMBER_LT):
    x, z, w, d, h = f['x'], f['z'], f['w'], f['d'], f['h']
    box(b, P(x, z, floor), (w, d, h - 0.12), V['planks'], (0.8, 0.8), color, M_INTERIOR)
    tube(b, [P(x - w / 2, z, floor + h - 0.12), P(x + w / 2, z, floor + h - 0.12)], [d / 2, d / 2], 8,
         lambda t_, s_: mul(color, 0.95), mat=M_INTERIOR, cap=True)
    for s in (-0.3, 0.3):
        box(b, P(x + s * w, z, floor), (0.05, d + 0.02, h - 0.1), V['iron'], (0.2, 0.2), IRON, M_INTERIOR)


def rug(b, f, floor, color):
    c = P(f['x'], f['z'], floor + 0.012)
    pts = [c + Vector((-f['w'] / 2, -f['d'] / 2, 0)), c + Vector((f['w'] / 2, -f['d'] / 2, 0)),
           c + Vector((f['w'] / 2, f['d'] / 2, 0)), c + Vector((-f['w'] / 2, f['d'] / 2, 0))]
    quad(b, pts, UP, V['cloth'], color, M_INTERIOR)
    inner = [c + (p - c) * 0.8 + UP * 0.002 for p in pts]
    quad(b, inner, UP, V['cloth'], mul(color, 0.75), M_INTERIOR)


def chair(b, f, floor):
    x, z, w, d = f['x'], f['z'], f['w'], f['d']
    box(b, P(x, z, floor + 0.42), (w, d, 0.06), V['planks'], (0.6, 0.6), TIMBER_LT, M_INTERIOR)
    for sx in (-1, 1):
        for sz in (-1, 1):
            leg(b, P(x + sx * (w / 2 - 0.06), z + sz * (d / 2 - 0.06), floor), 0.42, 0.07)
    # High back on the far side from the table (the -x side), with a red cushion.
    box(b, P(x - w / 2 + 0.04, z, floor + 0.48), (0.08, d, f['h'] - 0.48), V['planks'], (0.6, 1.0), TIMBER, M_INTERIOR)
    box(b, P(x, z, floor + 0.48), (w - 0.12, d - 0.12, 0.05), V['cloth'], (0.5, 0.5), CLOTH_RED, M_INTERIOR)


def barrels(b, f, floor):
    x, z, w, d = f['x'], f['z'], f['w'], f['d']
    for k, dz in enumerate((-d / 4, d / 4)):
        p = P(x, z + dz, floor)
        rr = min(w, d / 2) / 2 - 0.02
        tube(b, [p, p + UP * 0.2, p + UP * 0.5, p + UP * 0.8, p + UP * 0.86], [rr * 0.88, rr * 0.97, rr, rr * 0.97, rr * 0.88], 12,
             lambda t_, s_: mul(PLANK, 0.85 + 0.15 * (s_ % 2)), mat=M_INTERIOR, cap=True)
        for y in (0.15, 0.7):
            tube(b, [p + UP * y, p + UP * (y + 0.04)], [rr * 0.99, rr * 0.99], 12, lambda t_, s_: IRON, mat=M_INTERIOR)


def shelf(b, f, floor, r):
    x, z, w, d, h = f['x'], f['z'], f['w'], f['d'], f['h']
    for s in (-1, 1):
        box(b, P(x + s * (w / 2 - 0.03), z, floor), (0.06, d, h), V['planks'], (0.4, 1.0), TIMBER, M_INTERIOR)
    for k in range(4):
        y = 0.12 + k * (h - 0.2) / 3
        box(b, P(x, z, floor + y), (w, d, 0.04), V['planks'], (1.2, 0.4), TIMBER_LT, M_INTERIOR)
        if k == 0:
            continue
        for j in range(5):
            q = P(x - w / 2 + 0.2 + j * (w - 0.4) / 4, z, floor + y + 0.04)
            if (j + k) % 3 == 0:
                box(b, q, (0.24, 0.2, 0.18), V['planks'], (0.3, 0.3), mul(PLANK, 0.9), M_INTERIOR)
            else:
                jug(b, q, [CERAMIC, C('#7f9a62'), C('#d9cfb8')][(j + k) % 3], 1.2)


def banner(b, base: Vector, u: Vector, n: Vector, at: float, top: float, length=1.7, width=0.7):
    """An owner-coloured banner hanging on an inner wall from a pole, with a pale band."""
    c = base + u * at - n * 0.04
    beam(b, c - u * (width / 2 + 0.1) + UP * top, c + u * (width / 2 + 0.1) + UP * top, 0.04, 0.04, IRON, M_IRON)
    o = c - u * (width / 2) + UP * (top - length)
    face(b, o, u, width, length, -n, V['white'], (1.0, 2.0), WHITE, M_TRIM)
    # Swallow-tail and a stripe, painted on the cloth with vertex colour.
    face(b, o + UP * (length * 0.62) - n * 0.004, u, width, 0.12, -n, V['white'], (1.0, 1.0), C('#f2d27a'), M_INTERIOR)


def millstone(b, f, floor):
    c = P(f['x'], f['z'], floor)
    R = f['w'] / 2
    # Octagonal wooden dais, two stones, the hopper above and the main shaft to the ceiling.
    tube(b, [c, c + UP * 0.35], [R, R], 8, lambda t_, s_: TIMBER_LT, mat=M_INTERIOR, cap=True)
    tube(b, [c + UP * 0.35, c + UP * 0.5, c + UP * 0.66], [R * 0.78, R * 0.8, R * 0.76], 16, lambda t_, s_: mul(C('#a79a86'), 1.05 - 0.15 * t_),
         mat=M_INTERIOR, cap=True)
    tube(b, [c + UP * 0.9, c + UP * 1.25], [0.12, 0.45], 4, lambda t_, s_: PLANK, mat=M_INTERIOR, cap=True)
    for s in (-1, 1):
        beam(b, c + Vector((s * 0.4, 0, 0.66)), c + Vector((s * 0.4, 0, 1.2)), 0.06, 0.06, TIMBER)


def sacks(b, f, floor, r):
    x, z, w, d = f['x'], f['z'], f['w'], f['d']
    for k in range(5):
        px = x + (r.random() - 0.5) * (w - 0.35)
        pz = z + (k - 2) * (d - 0.3) / 4
        y = floor + (0.0 if k % 2 == 0 else 0.0)
        p = P(px, pz, y)
        tube(b, [p, p + UP * 0.12, p + UP * 0.42, p + UP * 0.58, p + UP * 0.66], [0.17, 0.24, 0.23, 0.15, 0.06], 8,
             lambda t_, s_: mul(C('#d8c79a'), 0.92 + 0.08 * (s_ % 2)), mat=M_INTERIOR, cap=True)
    p = P(x, z, floor + 0.62)
    tube(b, [p, p + UP * 0.1, p + UP * 0.3], [0.2, 0.22, 0.1], 8, lambda t_, s_: C('#d8c79a'), mat=M_INTERIOR, cap=True)


def ladder(b, f, floor, ceiling):
    x, z, w = f['x'], f['z'], f['w']
    lean = 0.25
    for s in (-1, 1):
        beam(b, P(x - lean, z + s * w / 2, floor), P(x + 0.05, z + s * w / 2, floor + ceiling), 0.06, 0.06, TIMBER_LT)
    for k in range(1, 9):
        t_ = k / 9
        beam(b, P(x - lean + (lean + 0.05) * t_, z - w / 2, floor + ceiling * t_), P(x - lean + (lean + 0.05) * t_, z + w / 2, floor + ceiling * t_),
             0.04, 0.04, TIMBER_LT)


def grain_bin(b, f, floor):
    fbox(b, f, rect=V['planks'], color=mul(PLANK, 0.95))
    box(b, P(f['x'], f['z'], floor + f['h'] - 0.08), (f['w'] - 0.12, f['d'] - 0.12, 0.06), V['thatch'], (0.4, 0.4), STRAW, M_INTERIOR)


# ------------------------------------------------------------------ rooms

def room_shell(b, r, plan, outer_style, knee: float, window_kw=None):
    """Floor, ceiling with beams, the four walls with their openings, door frames and window
    dressing. Returns the wall height (eaves)."""
    w, d = plan['inner']
    t = plan['wall']
    floor = plan['floor']
    ceil = floor + plan['ceiling']
    H = ceil + knee
    # Floor (inside) and the stone plinth all round, from the ground to the floor.
    aquad(b, P(-w / 2, d / 2, floor), X, Y, w, d, V['planks'], (1.6, 1.6), FLOOR, M_INTERIOR, 0.06, r)
    W, D = w + 2 * t + 0.16, d + 2 * t + 0.16
    box(b, P(0, 0, -0.25), (W, D, floor + 0.25), V['stone'], (1.4, 0.6), STONE_DK, faces='fblr', jitter=0.06, r=r)
    # Ceiling, looking down, and its beams.
    aquad(b, P(-w / 2, -d / 2, ceil), X, -Y, w, d, V['planks'], (1.6, 1.6), CEIL, M_INTERIOR, 0.05, r)
    n_beams = max(2, int(w / 1.4))
    for k in range(n_beams):
        xk = -w / 2 + w * (k + 0.5) / n_beams
        beam(b, P(xk, -d / 2, ceil - 0.09), P(xk, d / 2, ceil - 0.09), 0.16, 0.18, TIMBER, M_INTERIOR, normal=UP)
    beam(b, P(-w / 2, 0, ceil - 0.26), P(w / 2, 0, ceil - 0.26), 0.22, 0.2, TIMBER, M_INTERIOR, normal=UP)
    for name, base, u, n, L in rect_walls(plan):
        base = base + UP * 0.0
        ops = openings_on(plan, name, floor)
        wall_slab(b, r, base, u, n, L, L + 2 * t, t, H, ops, outer_style, inner_y0=floor, inner_y1=ceil)
        for dr in plan['doors']:
            if dr['wall'] == name:
                door_frame(b, base, u, n, t, dr, floor)
        for wi in plan['windows']:
            if wi['wall'] == name:
                window_dressing(b, base, u, n, t, wi, floor, **(window_kw or {}), r=r)
    return H


def cottage_style(floor):
    stone_top = floor + 0.55

    def style(y0, y1):
        bands = []
        if y0 < stone_top:
            bands.append((y0, min(y1, stone_top), V['stone'], (1.2, 0.7), STONE, M_VILLAGE))
        if y1 > stone_top:
            bands.append((max(y0, stone_top), y1, V['plaster'], (2.0, 2.0), PLASTER[0], M_VILLAGE))
        return bands
    return style


def timber_frame(b, plan, H, floor, stone_top):
    """Half-timbering on the cottage's outer faces: sill and head beams, corner posts, posts
    beside every opening and a pair of braces on the solid stretches."""
    w, d = plan['inner']
    t = plan['wall']
    for name, base, u, n, L in rect_walls(plan):
        Lo = L + 2 * t
        o = base + n * (t + 0.035)
        # The sill beam stops either side of a door.
        cuts = [-Lo / 2]
        for dr in plan['doors']:
            if dr['wall'] == name:
                cuts += [dr['at'] - dr['w'] / 2 - 0.08, dr['at'] + dr['w'] / 2 + 0.08]
        cuts.append(Lo / 2)
        for sa, sb in zip(cuts[0::2], cuts[1::2]):
            beam(b, o + u * sa + UP * (stone_top + 0.07), o + u * sb + UP * (stone_top + 0.07), 0.15, 0.08, TIMBER, normal=n)
        beam(b, o - u * (Lo / 2) + UP * (H - 0.08), o + u * (Lo / 2) + UP * (H - 0.08), 0.16, 0.08, TIMBER, normal=n)
        posts = {-Lo / 2 + 0.08, Lo / 2 - 0.08}
        ops = openings_on(plan, name, floor)
        for s0, s1, y0, y1 in ops:
            posts.add(s0 - 0.16)
            posts.add(s1 + 0.16)
        for s in sorted(posts):
            beam(b, o + u * s + UP * (stone_top + 0.14), o + u * s + UP * (H - 0.16), 0.15, 0.08, TIMBER, normal=n)
        # Braces on the widest solid stretch.
        ps = sorted(posts)
        # Only solid stretches: a gap with a door or window in it gets no brace.
        solid = [(ps[i + 1] - ps[i], ps[i], ps[i + 1]) for i in range(len(ps) - 1)
                 if not any(o[0] < ps[i + 1] and o[1] > ps[i] for o in ops)]
        gaps = sorted(solid, reverse=True)
        for gl, a, c in gaps[:1]:
            if gl > 0.9:
                beam(b, o + u * (a + 0.08) + UP * (stone_top + 0.2), o + u * (c - 0.08) + UP * (H - 0.25), 0.12, 0.07, TIMBER, normal=n)


def build_cottage(mats, plan):
    r = rng(611)
    b = MeshBuilder()
    w, d = plan['inner']
    t = plan['wall']
    floor = plan['floor']
    knee = 0.42
    H = room_shell(b, r, plan, cottage_style(floor), knee, {'shutters': True, 'box_flowers': True})
    timber_frame(b, plan, H, floor, floor + 0.55)
    W, D = w + 2 * t, d + 2 * t
    # Steep owner-tiled roof, ridge along X; gables of plaster with a timber king post.
    gable_roof(b, Vector((0, 0, 0)), W, D, H, H + 2.55, 0.5, M_ROOF, V['tiles'], WHITE, thick=0.16, r=r)
    for s in (-1, 1):
        x = s * (W / 2 + 0.04)
        beam(b, Vector((x, 0, H)), Vector((x, 0, H + 2.4)), 0.14, 0.08, TIMBER, normal=Vector((s, 0, 0)))
        beam(b, Vector((x, -D / 2 + 0.2, H + 0.1)), Vector((x, 0, H + 2.3)), 0.1, 0.07, TIMBER, normal=Vector((s, 0, 0)))
        beam(b, Vector((x, D / 2 - 0.2, H + 0.1)), Vector((x, 0, H + 2.3)), 0.1, 0.07, TIMBER, normal=Vector((s, 0, 0)))
    # Chimney stack above the hearth, through the roof.
    hf = next(f for f in plan['furniture'] if f['kind'] == 'hearth')
    chimney(b, P(hf['x'], -d / 2 - t / 2, H + 0.6), 2.6, r)
    # Front step (the deep eaves shelter the door), a log pile and a water butt outside.
    dr = plan['doors'][0]
    hx = dr['at']
    hz = d / 2 + t
    box(b, P(hx, hz + 0.45, 0), (dr['w'] + 0.5, 0.7, floor - 0.04), V['stone'], (1.2, 0.7), STONE_DK)
    # Logs stacked against the left wall, two rows.
    lx = -w / 2 - t - 0.3
    for k in range(5):
        row = 0 if k < 3 else 1
        zz = -0.3 + 0.3 * (k % 3) + (0.15 if row else 0.0)
        y = 0.13 + 0.24 * row
        tube(b, [P(lx, zz - 0.5, y), P(lx, zz + 0.5, y)], [0.12, 0.12], 7,
             lambda t_, s_: mul(TIMBER_LT, 0.9 + 0.1 * (s_ % 2)), mat=M_VILLAGE, cap=True)
    bt = P(w / 2 + t + 0.4, d / 2 - 0.2, 0)
    tube(b, [bt, bt + UP * 0.4, bt + UP * 0.8], [0.3, 0.34, 0.31], 10, lambda t_, s_: mul(PLANK, 0.9 + 0.12 * (s_ % 2)), mat=M_VILLAGE, cap=True)
    shell = b.build('Cottage', mats)

    ib = MeshBuilder()
    for f in plan['furniture']:
        k = f['kind']
        if k == 'bed':
            bed(ib, f, floor, r)
        elif k == 'hearth':
            hearth(ib, f, floor, plan['ceiling'], r)
        elif k == 'table':
            table(ib, f, floor)
            top = floor + f['h']
            jug(ib, P(f['x'] - 0.3, f['z'] - 0.1, top), CERAMIC)
            bowl(ib, P(f['x'] + 0.15, f['z'] + 0.1, top), C('#d9cfb8'))
            bowl(ib, P(f['x'] + 0.4, f['z'] - 0.12, top), C('#d9cfb8'))
            candle(ib, P(f['x'] - 0.05, f['z'] - 0.15, top))
            box(ib, P(f['x'] + 0.25, f['z'] + 0.18, top), (0.3, 0.14, 0.1), V['planks'], (0.3, 0.3), C('#c8964e'), M_INTERIOR)
        elif k == 'bench':
            bench(ib, f, floor)
        elif k == 'stool':
            stool(ib, f, floor)
        elif k == 'dresser':
            dresser(ib, f, floor, r)
        elif k == 'chest':
            chest(ib, f, floor)
        elif k == 'rug':
            rug(ib, f, floor, C('#b5643c'))
    # A broom and a basket by the door, a coat on a peg.
    bp = P(-w / 2 + 0.25, d / 2 - 0.35, floor)
    beam(ib, bp, bp + Vector((0.12, 0, 1.3)), 0.03, 0.03, TIMBER_LT, M_INTERIOR)
    tube(ib, [bp + Vector((-0.02, 0, 0)), bp + Vector((0.0, 0, 0.32))], [0.09, 0.03], 6, lambda t_, s_: STRAW, mat=M_INTERIOR, cap=True)
    interior = ib.build('CottageInterior', mats)
    interior.parent = shell
    doors = [door_leaf('CottageDoor', mats, dr, base, u, n, t, floor)
             for dr in plan['doors'] for name, base, u, n, L in rect_walls(plan) if name == dr['wall']]
    for dl in doors:
        dl.parent = shell
    return shell


def hall_style(floor):
    def style(y0, y1):
        return [(y0, y1, V['stone'], (1.4, 1.4), STONE, M_VILLAGE)]
    return style


def build_hall(mats, plan):
    r = rng(612)
    b = MeshBuilder()
    w, d = plan['inner']
    t = plan['wall']
    floor = plan['floor']
    H = room_shell(b, r, plan, hall_style(floor), 0.55, {'shutters': False})
    W, D = w + 2 * t, d + 2 * t
    # Buttresses along the sides and corners.
    for s in (-1, 1):
        for zz in (-d / 2 + 0.2, d / 2 - 0.2):
            box(b, P(s * (W / 2 + 0.22), zz, 0), (0.44, 0.7, H * 0.72), V['stone'], (0.8, 1.2), STONE_DK, jitter=0.06, r=r)
            box(b, P(s * (W / 2 + 0.14), zz, H * 0.72), (0.28, 0.6, 0.5), V['stone'], (0.8, 0.5), STONE_DK)
    # Timbered gable storey under a steep owner roof, ridge along X.
    z2 = H
    up_h = 1.2
    box(b, Vector((0, 0, z2)), (W, D, up_h), V['plaster'], (2.0, 2.0), PLASTER[1], faces='fblr')
    for (o, ux, ww, out) in ((Vector((-W / 2, -D / 2, z2)), X, W, -Y), (Vector((W / 2, D / 2, z2)), -X, W, Y),
                             (Vector((-W / 2, D / 2, z2)), -Y, D, -X), (Vector((W / 2, -D / 2, z2)), Y, D, X)):
        oo = o + out * 0.03
        beam(b, oo + UP * 0.08, oo + ux * ww + UP * 0.08, 0.16, 0.08, TIMBER, normal=out)
        beam(b, oo + UP * (up_h - 0.08), oo + ux * ww + UP * (up_h - 0.08), 0.16, 0.08, TIMBER, normal=out)
        n_posts = int(ww / 0.9)
        for k in range(n_posts + 1):
            p = oo + ux * (ww * k / n_posts) + UP * 0.08
            beam(b, p, p + UP * (up_h - 0.16), 0.13, 0.08, TIMBER, normal=out)
            if k < n_posts and k % 2 == 0:
                beam(b, p + UP * 0.1, oo + ux * (ww * (k + 1) / n_posts) + UP * (up_h - 0.12), 0.1, 0.07, TIMBER, normal=out)
    gable_roof(b, Vector((0, 0, 0)), W, D, z2 + up_h, z2 + up_h + 3.0, 0.55, M_ROOF, V['tiles'], WHITE, thick=0.18, r=r)
    # Corner tower at the back left with a banner; a chimney above the hearth.
    tower(b, r, P(-W / 2 - 0.9, -D / 2 - 0.7, 0), 1.35, H + up_h + 1.6, 2.8, sides=10)
    hf = next(f for f in plan['furniture'] if f['kind'] == 'hearth')
    chimney(b, P(w / 2 + t / 2, hf['z'], z2 + up_h + 1.4), 2.2, r)
    # A porch over the double doors: two posts and a lean-to owner roof.
    dz = d / 2 + t
    top = floor + plan['doors'][0]['h'] + 0.55
    for s in (-1, 1):
        beam(b, P(s * 1.25, dz + 1.25, 0), P(s * 1.25, dz + 1.25, top - 0.1), 0.16, 0.16, TIMBER)
        beam(b, P(s * 1.25, dz + 1.25, top - 0.15), P(s * 1.25, dz, top + 0.25), 0.12, 0.12, TIMBER)
    ldir = (P(0, -1.45, 0.55)).normalized()
    llen = math.hypot(1.45, 0.55)
    aquad(b, P(-1.65, dz + 1.45, top - 0.2), X, ldir, 3.3, llen, V['tiles'], (1.2, 1.2), WHITE, M_ROOF)
    aquad(b, P(1.65, dz + 1.45, top - 0.2), -X, ldir, 3.3, llen, V['planks'], (1.2, 1.2), TIMBER_LT, M_VILLAGE)
    box(b, P(0, dz + 0.65, 0), (3.0, 1.3, floor - 0.04), V['stone'], (1.4, 0.7), STONE_DK)
    # Owner banners on the façade either side of the porch.
    for s in (-1, 1):
        c = P(s * 2.3, dz + 0.05, H - 0.3)
        aquad(b, c - X * 0.4 - UP * 1.8 + Vector((0, -0.03, 0)), X, UP, 0.8, 1.8, V['white'], (1.0, 2.0), WHITE, M_TRIM)
        beam(b, c - X * 0.5, c + X * 0.5, 0.05, 0.05, IRON, M_IRON)
    shell = b.build('Hall', mats)

    ib = MeshBuilder()
    for f in plan['furniture']:
        k = f['kind']
        if k == 'longtable':
            table(ib, f, floor, mul(PLANK, 0.95))
            top = floor + f['h']
            for j in range(6):
                xx = f['x'] - f['w'] / 2 + 0.35 + j * (f['w'] - 0.7) / 5
                (jug if j % 2 else bowl)(ib, P(xx, f['z'] + (0.15 if j % 2 else -0.15), top), [CERAMIC, C('#d9cfb8')][j % 2])
            for xx in (-0.6, 0.6):
                candle(ib, P(xx, f['z'], top))
            box(ib, P(0.0, f['z'], top), (0.5, 0.3, 0.04), V['cloth'], (0.5, 0.5), CLOTH_RED, M_INTERIOR)
        elif k == 'bench':
            bench(ib, f, floor)
        elif k == 'chair':
            chair(ib, f, floor)
        elif k == 'hearth':
            hearth(ib, f, floor, plan['ceiling'], r, big=True)
        elif k == 'chest':
            chest(ib, f, floor, mul(TIMBER_LT, 0.9))
        elif k == 'barrels':
            barrels(ib, f, floor)
        elif k == 'shelf':
            shelf(ib, f, floor, r)
        elif k == 'rug':
            rug(ib, f, floor, CLOTH_GREEN)
    walls = {name: (base, u, n) for name, base, u, n, L in rect_walls(plan)}
    for bn in plan.get('banners', []):
        base, u, n = walls[bn['wall']]
        banner(ib, base, u, n, bn['at'], floor + plan['ceiling'] - 0.35)
    # An iron candle ring hanging over the table.
    cr = P(0, -0.35, floor + plan['ceiling'] - 1.0)
    for k in range(10):
        a0, a1 = k * math.tau / 10, (k + 1) * math.tau / 10
        beam(ib, cr + Vector((math.cos(a0), math.sin(a0), 0)) * 0.6, cr + Vector((math.cos(a1), math.sin(a1), 0)) * 0.6, 0.04, 0.04, IRON, M_INTERIOR)
        if k % 2 == 0:
            candle(ib, cr + Vector((math.cos(a0), math.sin(a0), 0.02)) * 0.6)
    for k in range(3):
        a = k * math.tau / 3
        beam(ib, cr + Vector((math.cos(a), math.sin(a), 0)) * 0.6, cr + UP * 1.0, 0.015, 0.015, IRON, M_INTERIOR)
    interior = ib.build('HallInterior', mats)
    interior.parent = shell
    names = iter(('HallDoorA', 'HallDoorB'))
    for dr in plan['doors']:
        for name, base, u, n, L in rect_walls(plan):
            if name == dr['wall']:
                dl = door_leaf(next(names), mats, dr, base, u, n, t, floor)
                dl.parent = shell
    return shell


def mill_walls(plan):
    """The octagon's faces: (name, base, u, n, inner length, outer length), side 0 at the front."""
    a = plan['radius']
    t = plan['wall']
    k = plan['sides']
    half = math.tan(math.pi / k)
    out = []
    for i in range(k):
        ang = i * math.tau / k
        n = P(math.sin(ang), math.cos(ang))  # side 0 faces +z (Blender -Y)
        u = Vector((-n.y, n.x, 0))
        # 'at' runs left to right as seen from inside looking out = Blender ... keep u = n rotated +90°
        base = n * a
        out.append(('front' if i == 0 else f'side{i}', base, u, n, 2 * a * half, 2 * (a + t) * half))
    return out


def build_mill(mats, plan):
    r = rng(613)
    b = MeshBuilder()
    floor = plan['floor']
    ceil = floor + plan['ceiling']
    t = plan['wall']
    a = plan['radius']
    H = ceil + 0.35

    def style(y0, y1):
        return [(y0, y1, V['stone'], (1.2, 1.2), STONE, M_VILLAGE)]

    k = plan['sides']
    # Floor and ceiling as octagons.
    ring_f = [Vector((math.sin((i + 0.5) * math.tau / k), -math.cos((i + 0.5) * math.tau / k), 0)) * (a / math.cos(math.pi / k)) for i in range(k)]
    u0, v0, u1, v1 = V['planks']
    b.poly([p + UP * floor for p in ring_f][::-1] if (ring_f[1] - ring_f[0]).cross(ring_f[2] - ring_f[0]).z < 0 else [p + UP * floor for p in ring_f],
           FLOOR, [((u0 + u1) / 2 + (u1 - u0) / 2 * p.x / a, (v0 + v1) / 2 + (v1 - v0) / 2 * p.y / a) for p in ring_f], mat=M_INTERIOR, smooth=False)
    ceil_pts = [p + UP * ceil for p in ring_f]
    if (ceil_pts[1] - ceil_pts[0]).cross(ceil_pts[2] - ceil_pts[0]).z > 0:
        ceil_pts = ceil_pts[::-1]
    b.poly(ceil_pts, CEIL, [(u0, v0)] * k, mat=M_INTERIOR, smooth=False)
    for kk in (-1, 1):
        beam(b, P(-a, kk * 0.6, ceil - 0.1), P(a, kk * 0.6, ceil - 0.1), 0.16, 0.18, TIMBER, M_INTERIOR, normal=UP)
    # Plinth.
    rc = (a + t) / math.cos(math.pi / k)
    tube(b, [UP * -0.2, UP * floor], [rc + 0.1, rc + 0.1], 16, lambda t_, s_: STONE_DK, mat=M_VILLAGE)
    for name, base, u, n, Li, Lo in mill_walls(plan):
        ops = openings_on({'doors': plan['doors'], 'windows': plan['windows']}, name, floor)
        wall_slab(b, r, base, u, n, Li, Lo, t, H, ops, style, inner_y0=floor, inner_y1=ceil)
        for dr in plan['doors']:
            if dr['wall'] == name:
                door_frame(b, base, u, n, t, dr, floor)
        for wi in plan['windows']:
            if wi['wall'] == name:
                window_dressing(b, base, u, n, t, wi, floor, shutters=False, r=r)
    # The tapered tower above the room, its gallery, cap and the windshaft housing.
    R0 = (a + t) / math.cos(math.pi / k)
    R1 = R0 * 0.72
    T = 4.6
    for i in range(k):
        a0 = (i + 0.5) * math.tau / k
        a1 = (i + 1.5) * math.tau / k
        p0 = Vector((math.sin(a0) * R0, -math.cos(a0) * R0, H)), Vector((math.sin(a1) * R0, -math.cos(a1) * R0, H))
        q0 = Vector((math.sin(a0) * R1, -math.cos(a0) * R1, H + T)), Vector((math.sin(a1) * R1, -math.cos(a1) * R1, H + T))
        for j in range(3):
            t0, t1 = j / 3, (j + 1) / 3
            pts = [p0[0].lerp(q0[0], t0), p0[1].lerp(q0[1], t0), p0[1].lerp(q0[1], t1), p0[0].lerp(q0[0], t1)]
            mid = sum(pts, Vector()) / 4
            quad(b, pts, Vector((mid.x, mid.y, 0.3)), V['plaster'], mul(PLASTER[0], 0.96 + 0.06 * r.random()), M_VILLAGE)
    # Timber string course where the tower meets the stone room, and a small upper window.
    tube(b, [UP * (H - 0.05), UP * (H + 0.15)], [R0 + 0.12, R0 + 0.08], 16, lambda t_, s_: TIMBER, mat=M_VILLAGE, cap=False)
    top = H + T
    tube(b, [UP * (top - 0.05), UP * (top + 0.2)], [R1 + 0.45, R1 + 0.45], 12, lambda t_, s_: TIMBER, mat=M_VILLAGE, cap=True)
    cap_pts = [UP * (top + 0.2), UP * (top + 1.0), UP * (top + 1.8), UP * (top + 2.5)]
    tube(b, cap_pts, [R1 + 0.35, R1 + 0.12, 0.8, 0.05], 12, lambda t_, s_: mul(THATCH, 0.95 + 0.08 * (s_ % 2)),
         mat=M_VILLAGE, uv_rect=V['thatch'], uv_repeat=(1.0, 1.0))
    box(b, Vector((0, -R1 - 0.1, top + 0.45)), (0.75, 0.9, 0.75), V['planks'], (0.7, 0.7), TIMBER_LT)
    fw = 0.5
    wpos = Vector((0, 0, H + 2.4))
    nn = Vector((0, -1, 0.15)).normalized()
    rr = R0 + (R1 - R0) * (2.4 / T) + 0.03
    aquad(b, wpos + Vector((-fw / 2, -rr, -0.35)), X, UP, fw, 0.65, V['window'], (fw, 0.65), WHITE)
    # Sacks and a cart wheel by the door outside.
    sp = P(1.6, a + t + 0.5, 0)
    for j in range(3):
        p = sp + Vector((j * 0.42 - 0.4, 0, 0))
        tube(b, [p, p + UP * 0.12, p + UP * 0.42, p + UP * 0.58, p + UP * 0.66], [0.17, 0.24, 0.23, 0.15, 0.06], 8,
             lambda t_, s_: mul(C('#d8c79a'), 0.92 + 0.08 * (s_ % 2)), mat=M_VILLAGE, cap=True)
    shell = b.build('Mill', mats)

    ib = MeshBuilder()
    for f in plan['furniture']:
        kd = f['kind']
        if kd == 'millstone':
            millstone(ib, f, floor)
            c = P(f['x'], f['z'], floor)
            beam(ib, c + UP * 1.25, c + UP * plan['ceiling'] + UP * floor, 0.14, 0.14, TIMBER, M_INTERIOR)
        elif kd == 'sacks':
            sacks(ib, f, floor, r)
        elif kd == 'ladder':
            ladder(ib, f, floor, plan['ceiling'])
        elif kd == 'bin':
            grain_bin(ib, f, floor)
    interior = ib.build('MillInterior', mats)
    interior.parent = shell
    for dr in plan['doors']:
        for name, base, u, n, Li, Lo in mill_walls(plan):
            if name == dr['wall']:
                dl = door_leaf('MillDoor', mats, dr, base, u, n, t, floor)
                dl.parent = shell

    # The sails, as before: a child turning about its local axis at the hub.
    from village import build_sails
    sails = build_sails(mats)
    sails.parent = shell
    sails.location = (0, -R1 - 0.55, top + 0.6)
    return shell


def build(mats):
    plan = load_plan()
    return [build_cottage(mats, plan['cottage']), build_hall(mats, plan['hall']), build_mill(mats, plan['mill'])]
