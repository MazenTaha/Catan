"""Buildings, pieces and props for the 3D walk -> apps/web/public/models/village.glb

  Settlement   half-timbered house on a stone plinth, jettied upper floor (player roof + shutters)
  City         stone hall, round keep with a banner, a second house, a curtain wall and gate
  Windmill     tapered stone tower, shingled cap; node "Sails" turns (hub origin, faces -Y)
  Dock         plank jetty on posts, running from its origin (the shore) along -Y
  Boat         clinker-built hull, mast, yard and a sail ("Owner_Sail" takes the harbour colour)
  Road         one 14 m edge: cobbles between kerbs, timber rails in the owner's colour
  Robber       a hooded traveller with a staff on a stone pawn
  Sheep        fleece, dark face; nodes Head, LegFL, LegFR, LegBL, LegBR, Tail (joint origins)
  Barn         thatched timber byre, doors in the front gable
  Kiln         bottle kiln of sooty brick with a firing arch and a chimney
  HayBale      round bale on its side
  Mine         timbered adit with rails and an ore cart

Materials: "Village" (atlas x vertex colour), "Owner_Roof", "Owner_Trim", "Owner_Sail"
(tinted at runtime), "Iron" (small metal parts), "Glow" (the robber's eyes).
"""

from __future__ import annotations

import math

import bmesh
from mathutils import Matrix, Vector, noise

from common import (MeshBuilder, bake_ao, bpy, export_glb, layout_row, lerp, material, mul, new_scene, rng, save_blend,
                    smooth, srgb, stats, tube)
from textures import VILLAGE as V

C = srgb
UP = Vector((0, 0, 1))
X = Vector((1, 0, 0))
Y = Vector((0, 1, 0))

# Material slots, in the order every model's material list uses.
M_VILLAGE, M_ROOF, M_TRIM, M_IRON, M_SAIL, M_GLOW = range(6)

PLASTER = [C('#f1e6d0'), C('#f4ecdc'), C('#eadcc0')]
TIMBER = C('#5c3f28')
TIMBER_LT = C('#7a5638')
STONE = C('#bdb3a3')
STONE_DK = C('#9d9384')
PLANK = C('#a57d58')
THATCH = C('#e0bd72')
WHITE = (1.0, 1.0, 1.0)
IRON = C('#3e3d40')


def sub(rect, a0, b0, a1, b1):
    u0, v0, u1, v1 = rect
    return (u0 + (u1 - u0) * a0, v0 + (v1 - v0) * b0, u0 + (u1 - u0) * a1, v0 + (v1 - v0) * b1)


def aquad(b: MeshBuilder, origin: Vector, ux: Vector, uy: Vector, w: float, h: float, rect, tile, color, mat=M_VILLAGE,
          jitter: float = 0.0, r=None):
    """A flat quad spanning ux*w by uy*h (normal = ux x uy), cut into pieces of `tile` metres
    so the atlas rectangle keeps a steady texel density instead of stretching."""
    tw, th = tile
    nx = max(1, math.ceil(w / tw - 1e-6))
    ny = max(1, math.ceil(h / th - 1e-6))
    u0, v0, u1, v1 = rect
    for i in range(nx):
        x0, x1 = i * tw, min(w, (i + 1) * tw)
        for j in range(ny):
            y0, y1 = j * th, min(h, (j + 1) * th)
            pts = [origin + ux * x0 + uy * y0, origin + ux * x1 + uy * y0, origin + ux * x1 + uy * y1, origin + ux * x0 + uy * y1]
            uvs = [(u0 + (u1 - u0) * (x - i * tw) / tw, v0 + (v1 - v0) * (y - j * th) / th) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
            col = color
            if jitter and r:
                col = mul(color, 1 + (r.random() - 0.5) * jitter)
            b.poly(pts, col, uvs, mat=mat, smooth=False)


def box(b: MeshBuilder, c: Vector, size, rect, tile, color, mat=M_VILLAGE, top=None, faces='fblrt', jitter=0.0, r=None):
    """An axis-aligned box standing on c (bottom centre). `top` = (rect, tile, color) for the lid."""
    sx, sy, sz = size
    x0, x1 = c.x - sx / 2, c.x + sx / 2
    y0, y1 = c.y - sy / 2, c.y + sy / 2
    z0, z1 = c.z, c.z + sz
    if 'f' in faces:
        aquad(b, Vector((x0, y0, z0)), X, UP, sx, sz, rect, tile, color, mat, jitter, r)
    if 'b' in faces:
        aquad(b, Vector((x1, y1, z0)), -X, UP, sx, sz, rect, tile, color, mat, jitter, r)
    if 'l' in faces:
        aquad(b, Vector((x0, y1, z0)), -Y, UP, sy, sz, rect, tile, color, mat, jitter, r)
    if 'r' in faces:
        aquad(b, Vector((x1, y0, z0)), Y, UP, sy, sz, rect, tile, color, mat, jitter, r)
    if 't' in faces:
        tr, tt, tc = top if top else (rect, tile, color)
        aquad(b, Vector((x0, y0, z1)), X, Y, sx, sy, tr, tt, tc, mat, jitter, r)


def beam(b: MeshBuilder, a: Vector, c: Vector, w: float, d: float, color=TIMBER, mat=M_VILLAGE, normal=None):
    """A square timber from a to c, `w` wide across the wall and `d` deep out of it."""
    ax = (c - a)
    L = ax.length
    ax = ax / L
    n = (normal or (ax.cross(UP) if abs(ax.dot(UP)) < 0.9 else Y)).normalized()
    side = n.cross(ax).normalized()
    rect = V['timber']
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    ring_a = [a + side * (sx * w / 2) + n * (sy * d / 2) for sx, sy in corners]
    ring_c = [c + side * (sx * w / 2) + n * (sy * d / 2) for sx, sy in corners]
    for i in range(4):
        i1 = (i + 1) % 4
        pts = [ring_a[i], ring_a[i1], ring_c[i1], ring_c[i]]
        u0, v0, u1, v1 = rect
        vv = min(1.0, L / 2.5)
        b.poly(pts, color, [(u0, v0), (u0 + (u1 - u0) * 0.12, v0), (u0 + (u1 - u0) * 0.12, v0 + (v1 - v0) * vv), (u0, v0 + (v1 - v0) * vv)],
               mat=mat, smooth=False)
    b.poly(ring_c, color, [(u0, v0)] * 4, mat=mat, smooth=False)
    b.poly(list(reversed(ring_a)), color, [(u0, v0)] * 4, mat=mat, smooth=False)


def wall_frame(b: MeshBuilder, origin: Vector, ux: Vector, w: float, h: float, posts: int, braces: bool, out: Vector,
               color=TIMBER):
    """Half-timbering on a wall: sill, head, corner and intermediate posts, optional braces."""
    o = origin + out * 0.03
    t = 0.16
    beam(b, o + UP * (t / 2), o + ux * w + UP * (t / 2), t, 0.08, color, normal=out)
    beam(b, o + UP * (h - t / 2), o + ux * w + UP * (h - t / 2), t, 0.08, color, normal=out)
    for k in range(posts + 1):
        x = w * k / posts
        x = min(max(x, t / 2), w - t / 2)
        beam(b, o + ux * x, o + ux * x + UP * h, t, 0.08, color, normal=out)
    if braces:
        for k in (0, posts - 1):
            xa = w * k / posts + t / 2
            xb = w * (k + 1) / posts - t / 2
            if k == 0:
                beam(b, o + ux * xa + UP * t, o + ux * xb + UP * (h * 0.62), t * 0.8, 0.07, color, normal=out)
            else:
                beam(b, o + ux * xb + UP * t, o + ux * xa + UP * (h * 0.62), t * 0.8, 0.07, color, normal=out)


def window(b: MeshBuilder, centre: Vector, ux: Vector, out: Vector, w: float, h: float, shutters: bool = True):
    """A leaded window in a timber surround, with owner-coloured shutters folded open."""
    o = centre - ux * (w / 2) - UP * (h / 2) + out * 0.04
    aquad(b, o, ux, UP, w, h, V['window'], (w, h), WHITE)
    beam(b, o - ux * 0.06 - UP * 0.06 + out * 0.03, o + ux * (w + 0.06) - UP * 0.06 + out * 0.03, 0.12, 0.1, TIMBER_LT, normal=out)
    if shutters:
        for s in (-1, 1):
            edge = centre + ux * (s * (w / 2 + 0.03)) - UP * (h / 2) + out * 0.06
            sw = w * 0.52
            p0 = edge
            ux2 = ux * s
            aquad(b, p0 if s > 0 else p0 - ux * sw, ux, UP, sw, h, sub(V['planks'], 0, 0, 0.6, 1), (sw, h), (0.86, 0.86, 0.86), M_TRIM)


def door(b: MeshBuilder, base: Vector, ux: Vector, out: Vector, w: float, h: float):
    o = base - ux * (w / 2) + out * 0.03
    aquad(b, o, ux, UP, w, h, V['door'], (w, h), WHITE)
    beam(b, o - ux * 0.08, o - ux * 0.08 + UP * (h + 0.08), 0.14, 0.12, TIMBER_LT, normal=out)
    beam(b, o + ux * (w + 0.08), o + ux * (w + 0.08) + UP * (h + 0.08), 0.14, 0.12, TIMBER_LT, normal=out)
    beam(b, o - ux * 0.15 + UP * (h + 0.06), o + ux * (w + 0.15) + UP * (h + 0.06), 0.16, 0.14, TIMBER_LT, normal=out)


def gable_roof(b: MeshBuilder, c: Vector, w: float, d: float, z0: float, z1: float, over: float, mat=M_ROOF,
               rect=None, color=WHITE, thick: float = 0.14, gable_rect=None, gable_color=None, r=None):
    """A pitched roof with its ridge along X over a w x d footprint whose eaves are at z0, ridge
    at z1, overhanging by `over`; tiled top, timber underside and edges, plastered gables."""
    rect = rect or V['tiles']
    half = d / 2 + over
    slope = (z1 - z0) / (d / 2)
    ze = z0 - over * slope
    L = math.hypot(half, z1 - ze)
    xa, xb = c.x - w / 2 - over * 0.6, c.x + w / 2 + over * 0.6
    W = xb - xa
    for s in (-1, 1):
        eave = Vector((xa if s < 0 else xb, c.y + s * half, ze))
        ridge = Vector((xa if s < 0 else xb, c.y, z1))
        ux = X if s < 0 else -X
        uy = (ridge - eave).normalized()
        nrm = ux.cross(uy)
        lift = nrm * thick
        aquad(b, eave + lift, ux, uy, W, L, rect, (2.2, 2.2), color, mat, 0.08, r)
        # Underside and the tile edge along the eave.
        aquad(b, eave + ux * W, -ux, uy, W, L, V['planks'], (2.0, 2.0), mul(TIMBER_LT, 0.8), M_VILLAGE)
        aquad(b, eave, ux, nrm, W, thick, sub(rect, 0, 0, 1, 0.1), (2.2, thick), mul(color, 0.7), mat)
    # Ridge cap.
    beam(b, Vector((xa, c.y, z1 + thick * 0.7)), Vector((xb, c.y, z1 + thick * 0.7)), 0.26, 0.2, mul(color, 0.85), mat, normal=UP)
    # Barge boards along the verges.
    for xs in (xa, xb):
        for s in (-1, 1):
            beam(b, Vector((xs, c.y + s * half, ze + thick * 0.5)), Vector((xs, c.y, z1 + thick * 0.5)), 0.12, 0.28, TIMBER, normal=X)
    # Gable walls.
    gr = gable_rect or V['plaster']
    gc = gable_color or PLASTER[0]
    for s in (-1, 1):
        x = c.x + s * w / 2
        a = Vector((x, c.y - d / 2, z0))
        bb = Vector((x, c.y + d / 2, z0))
        t = Vector((x, c.y, z1 - 0.05))
        pts = [a, bb, t] if s < 0 else [bb, a, t]
        if s < 0:
            pts = [bb, a, t]
        else:
            pts = [a, bb, t]
        u0, v0, u1, v1 = gr
        b.poly(pts, gc, [(u0, v0), (u1, v0), ((u0 + u1) / 2, v1)], mat=M_VILLAGE, smooth=False)


def chimney(b, c: Vector, h: float, r=None):
    box(b, c, (0.7, 0.7, h), V['stone'], (1.2, 1.2), STONE, top=(V['iron'], (1, 1), mul(IRON, 0.6)), jitter=0.06, r=r)
    box(b, c + UP * h, (0.82, 0.82, 0.14), V['stone'], (1.2, 0.3), STONE_DK)


def house(b: MeshBuilder, r, c: Vector, w: float, d: float, plinth: float, floor1: float, floor2: float, roof_h: float,
          jetty: float = 0.22, plaster=0, door_side='f', windows_front=2, chim: bool = True, thatched: bool = False):
    """A half-timbered house standing on c, its front facing -Y."""
    pc = PLASTER[plaster % len(PLASTER)]
    # Stone plinth.
    box(b, c, (w + 0.16, d + 0.16, plinth), V['stone'], (1.6, 0.8), STONE, faces='fblrt',
        top=(V['stone'], (1.6, 1.6), STONE_DK), jitter=0.08, r=r)
    z1 = c.z + plinth
    # Ground floor: plaster walls with timber framing.
    box(b, Vector((c.x, c.y, z1)), (w, d, floor1), V['plaster'], (2.0, 2.0), pc, faces='fblr')
    for (o, ux, ww, out) in ((Vector((c.x - w / 2, c.y - d / 2, z1)), X, w, -Y),
                             (Vector((c.x + w / 2, c.y + d / 2, z1)), -X, w, Y),
                             (Vector((c.x - w / 2, c.y + d / 2, z1)), -Y, d, -X),
                             (Vector((c.x + w / 2, c.y - d / 2, z1)), Y, d, X)):
        wall_frame(b, o, ux, ww, floor1, 3, True, out)
    # Door and windows on the front.
    door(b, Vector((c.x - w * 0.18, c.y - d / 2, z1)), X, -Y, 0.95, 2.05)
    window(b, Vector((c.x + w * 0.24, c.y - d / 2, z1 + floor1 * 0.58)), X, -Y, 0.7, 0.85)
    window(b, Vector((c.x + w / 2, c.y, z1 + floor1 * 0.58)), Y, X, 0.6, 0.75)
    window(b, Vector((c.x - w / 2, c.y + d * 0.1, z1 + floor1 * 0.58)), -Y, -X, 0.6, 0.75)
    # Stone step at the door.
    box(b, Vector((c.x - w * 0.18, c.y - d / 2 - 0.35, c.z)), (1.3, 0.7, plinth * 0.6), V['stone'], (1.3, 0.7), STONE_DK)
    # Jettied upper floor.
    z2 = z1 + floor1
    w2, d2 = w + 0.1, d + jetty * 2
    box(b, Vector((c.x, c.y, z2)), (w2, d2, floor2), V['plaster'], (2.0, 2.0), pc, faces='fblr')
    # Joist ends under the jetty.
    for k in range(6):
        x = c.x - w2 / 2 + 0.3 + (w2 - 0.6) * k / 5
        for s in (-1, 1):
            beam(b, Vector((x, c.y + s * d / 2, z2 - 0.08)), Vector((x, c.y + s * d2 / 2 + 0.06, z2 - 0.08)), 0.12, 0.14, TIMBER, normal=UP)
    aquad(b, Vector((c.x - w2 / 2, c.y - d2 / 2, z2)), X, Y, w2, jetty, V['planks'], (2, 2), mul(TIMBER_LT, 0.8))
    aquad(b, Vector((c.x - w2 / 2, c.y + d / 2, z2)), X, Y, w2, jetty, V['planks'], (2, 2), mul(TIMBER_LT, 0.8))
    for (o, ux, ww, out) in ((Vector((c.x - w2 / 2, c.y - d2 / 2, z2)), X, w2, -Y),
                             (Vector((c.x + w2 / 2, c.y + d2 / 2, z2)), -X, w2, Y),
                             (Vector((c.x - w2 / 2, c.y + d2 / 2, z2)), -Y, d2, -X),
                             (Vector((c.x + w2 / 2, c.y - d2 / 2, z2)), Y, d2, X)):
        wall_frame(b, o, ux, ww, floor2, 4, False, out)
    for k in range(windows_front):
        x = c.x - w2 / 2 + w2 * (k + 0.5) / windows_front
        window(b, Vector((x, c.y - d2 / 2, z2 + floor2 * 0.52)), X, -Y, 0.62, 0.72)
    window(b, Vector((c.x, c.y + d2 / 2, z2 + floor2 * 0.52)), -X, Y, 0.62, 0.72)
    z3 = z2 + floor2
    if thatched:
        gable_roof(b, Vector((c.x, c.y, 0)), w2, d2, z3, z3 + roof_h, 0.45, M_VILLAGE, V['thatch'], THATCH, thick=0.3, r=r)
    else:
        gable_roof(b, Vector((c.x, c.y, 0)), w2, d2, z3, z3 + roof_h, 0.38, M_ROOF, V['tiles'], WHITE, r=r)
    if chim:
        chimney(b, Vector((c.x + w2 * 0.3, c.y + d2 * 0.18, z3 - 0.2)), roof_h + 0.8, r)
    return z3 + roof_h


def build_settlement(mats):
    r = rng(601)
    b = MeshBuilder()
    house(b, r, Vector((0, 0, 0)), 3.6, 3.4, 0.45, 2.45, 1.75, 2.15)
    # A lean-to woodshed and a barrel by the door.
    box(b, Vector((-2.35, 0.4, 0)), (1.0, 2.2, 1.6), V['planks'], (1.2, 1.2), PLANK, top=(V['planks'], (1.2, 1.2), PLANK))
    for k in range(4):
        tube(b, [Vector((-2.35 + (k % 2) * 0.3 - 0.15, -0.75 + 0.5 * (k // 2) * 0.0, 0.18 + 0.36 * (k // 2))),
                 Vector((-2.35 + (k % 2) * 0.3 - 0.15, 1.55, 0.18 + 0.36 * (k // 2)))],
             [0.17, 0.17], 6, lambda t, s: mul(TIMBER_LT, 0.95 + 0.1 * (s % 2)), mat=M_VILLAGE)
    tube(b, [Vector((0.9, -2.05, 0)), Vector((0.9, -2.05, 0.45)), Vector((0.9, -2.05, 0.9))], [0.3, 0.34, 0.3], 10,
         lambda t, s: mul(PLANK, 0.9 + 0.12 * (s % 2)), mat=M_VILLAGE, cap=True)
    ob = b.build('Settlement', mats)
    return ob


def tower(b: MeshBuilder, r, c: Vector, radius: float, h: float, roof_h: float, sides: int = 12, crenel: bool = True,
          banner: bool = True):
    """A round stone keep with a conical owner-tiled roof, arrow slits and a banner."""
    for i in range(sides):
        a0 = math.tau * i / sides
        a1 = math.tau * (i + 1) / sides
        p0 = c + Vector((math.cos(a0), math.sin(a0), 0)) * radius
        p1 = c + Vector((math.cos(a1), math.sin(a1), 0)) * radius
        ux = (p1 - p0)
        w = ux.length
        aquad(b, p0, ux.normalized(), UP, w, h, V['stone'], (1.6, 1.6), STONE, jitter=0.06, r=r)
        if i % 3 == 0:
            mid = (p0 + p1) / 2
            out = Vector((math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0))
            aquad(b, mid - ux.normalized() * 0.09 + UP * (h * 0.55) + out * 0.02, ux.normalized(), UP, 0.18, 0.7,
                  V['iron'], (1, 1), (0.08, 0.08, 0.09))
    # Corbelled parapet.
    top = c + UP * h
    pr = radius + 0.25
    for i in range(sides):
        a0 = math.tau * i / sides
        a1 = math.tau * (i + 1) / sides
        p0 = top + Vector((math.cos(a0), math.sin(a0), 0)) * pr
        p1 = top + Vector((math.cos(a1), math.sin(a1), 0)) * pr
        ux = (p1 - p0)
        aquad(b, p0, ux.normalized(), UP, ux.length, 0.9, V['stone'], (1.6, 0.9), STONE_DK)
        q0 = c + UP * (h - 0.35) + Vector((math.cos(a0), math.sin(a0), 0)) * radius
        q1 = c + UP * (h - 0.35) + Vector((math.cos(a1), math.sin(a1), 0)) * radius
        b.poly([q0, q1, p1, p0], STONE_DK, [(V['stone'][0], V['stone'][1])] * 4, mat=M_VILLAGE, smooth=False)
        if crenel and i % 2 == 0:
            mid = (p0 + p1) / 2
            out = Vector((math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0))
            box(b, mid + UP * 0.9 - out * 0.15, (0.5, 0.5, 0.45), V['stone'], (0.5, 0.45), STONE)
    # Conical roof.
    apex = c + UP * (h + 0.6 + roof_h)
    base_r = radius + 0.05
    for i in range(sides):
        a0 = math.tau * i / sides
        a1 = math.tau * (i + 1) / sides
        p0 = c + UP * (h + 0.6) + Vector((math.cos(a0), math.sin(a0), 0)) * base_r
        p1 = c + UP * (h + 0.6) + Vector((math.cos(a1), math.sin(a1), 0)) * base_r
        u0, v0, u1, v1 = V['tiles']
        k = 1 + (r.random() - 0.5) * 0.08
        b.poly([p0, p1, apex], (k, k, k), [(u0, v0), (u1, v0), ((u0 + u1) / 2, v1)], mat=M_ROOF, smooth=False)
    # Finial and banner.
    beam(b, apex - UP * 0.2, apex + UP * 1.6, 0.08, 0.08, IRON, M_IRON)
    if banner:
        fl = apex + UP * 1.5
        aquad(b, fl + Vector((0.04, 0, -0.65)), X, UP, 1.1, 0.62, V['white'], (1.2, 1.2), WHITE, M_TRIM)
        aquad(b, fl + Vector((1.14, 0, -0.65)), -X, UP, 1.1, 0.62, V['white'], (1.2, 1.2), WHITE, M_TRIM)


def curtain_wall(b: MeshBuilder, r, a: Vector, c: Vector, h: float, thick: float = 0.8):
    d = (c - a)
    L = d.length
    ux = d.normalized()
    out = ux.cross(UP)
    o = a - out * (thick / 2)
    aquad(b, a + out * (thick / 2), ux, UP, L, h, V['stone'], (1.6, 1.6), STONE, jitter=0.06, r=r)
    aquad(b, c - out * (thick / 2), -ux, UP, L, h, V['stone'], (1.6, 1.6), STONE_DK, jitter=0.06, r=r)
    aquad(b, a + out * (thick / 2) + UP * h, ux, -out, L, thick, V['cobble'], (1, 1), STONE_DK)
    n = int(L / 0.9)
    for k in range(n):
        if k % 2:
            continue
        p = a + ux * (L * (k + 0.5) / n) + out * (thick * 0.3) + UP * h
        box(b, p, (0.5, 0.3, 0.5), V['stone'], (0.5, 0.5), STONE)


def build_city(mats):
    r = rng(602)
    b = MeshBuilder()
    # The keep behind, the hall in front of it, a house to the side, a wall with a gate.
    tower(b, r, Vector((1.6, 1.6, 0)), 1.75, 8.0, 3.4)
    # Stone hall: ground floor of stone, timbered upper floor, owner roof.
    hc = Vector((-0.9, 0.3, 0))
    box(b, hc, (5.2, 4.0, 0.5), V['stone'], (1.6, 0.8), STONE_DK, top=(V['stone'], (1.6, 1.6), STONE_DK))
    box(b, hc + UP * 0.5, (5.0, 3.8, 3.0), V['stone'], (1.6, 1.6), STONE, faces='fblr', jitter=0.06, r=r)
    door(b, hc + Vector((-0.6, -1.9, 0.5)), X, -Y, 1.2, 2.3)
    for x in (-1.9, 0.9, 1.9):
        window(b, hc + Vector((x, -1.9, 2.1)), X, -Y, 0.6, 1.0, shutters=False)
    w2, d2, z2 = 5.2, 4.1, 3.5
    box(b, hc + UP * z2, (w2, d2, 2.0), V['plaster'], (2.0, 2.0), PLASTER[1], faces='fblr')
    for (o, ux, ww, out) in ((hc + Vector((-w2 / 2, -d2 / 2, z2)), X, w2, -Y), (hc + Vector((w2 / 2, d2 / 2, z2)), -X, w2, Y),
                             (hc + Vector((-w2 / 2, d2 / 2, z2)), -Y, d2, -X), (hc + Vector((w2 / 2, -d2 / 2, z2)), Y, d2, X)):
        wall_frame(b, o, ux, ww, 2.0, 5, True, out)
    for x in (-1.6, 0.0, 1.6):
        window(b, hc + Vector((x, -d2 / 2, z2 + 1.05)), X, -Y, 0.6, 0.75)
    gable_roof(b, hc, w2, d2, z2 + 2.0, z2 + 4.4, 0.4, M_ROOF, V['tiles'], WHITE, r=r)
    chimney(b, hc + Vector((-1.6, 0.6, z2 + 1.8)), 3.2, r)
    # A smaller house to the east.
    house(b, r, Vector((3.0, -1.7, 0)), 2.4, 2.6, 0.4, 2.2, 1.5, 1.7, plaster=2, windows_front=1, chim=False)
    # Curtain wall round the back with a gatehouse at the front-left.
    curtain_wall(b, r, Vector((-4.3, -2.6, 0)), Vector((-4.3, 3.4, 0)), 2.6)
    curtain_wall(b, r, Vector((-4.3, 3.4, 0)), Vector((4.2, 3.6, 0)), 2.6)
    for p in (Vector((-4.3, -2.6, 0)), Vector((-4.3, 3.4, 0)), Vector((4.2, 3.6, 0))):
        tower(b, r, p, 0.75, 3.6, 1.3, sides=8, crenel=False, banner=False)
    ob = b.build('City', mats)
    return ob


def build_windmill(mats):
    r = rng(603)
    b = MeshBuilder()
    # Tapered stone tower, 8 sides.
    sides = 8
    H = 6.2
    r0, r1 = 1.75, 1.3
    for i in range(sides):
        a0 = math.tau * (i + 0.5) / sides
        a1 = math.tau * (i + 1.5) / sides
        p0, p1 = Vector((math.cos(a0) * r0, math.sin(a0) * r0, 0)), Vector((math.cos(a1) * r0, math.sin(a1) * r0, 0))
        q0, q1 = Vector((math.cos(a0) * r1, math.sin(a0) * r1, H)), Vector((math.cos(a1) * r1, math.sin(a1) * r1, H))
        rows = 4
        for k in range(rows):
            t0, t1 = k / rows, (k + 1) / rows
            a = p0.lerp(q0, t0)
            bb = p1.lerp(q1, t0)
            cc = p1.lerp(q1, t1)
            d = p0.lerp(q0, t1)
            u0, v0, u1, v1 = V['stone']
            b.poly([a, bb, cc, d], mul(STONE, 0.95 + 0.1 * r.random()), [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], mat=M_VILLAGE, smooth=False)
    # Door on the front (-Y), small windows.
    door(b, Vector((0, -1.72, 0)), X, -Y, 0.9, 1.95)
    window(b, Vector((0, -1.5, 3.9)), X, Vector((0, -1, 0.07)).normalized(), 0.5, 0.6, shutters=False)
    window(b, Vector((1.45, 0, 2.6)), Y, X, 0.45, 0.55, shutters=False)
    # Gallery ring and the turning cap, shingled.
    tube(b, [Vector((0, 0, H - 0.05)), Vector((0, 0, H + 0.2))], [r1 + 0.35, r1 + 0.35], 12, lambda t, s: mul(TIMBER, 1.0),
         mat=M_VILLAGE, cap=True)
    cap_pts = [Vector((0, 0, H + 0.2)), Vector((0, 0, H + 1.0)), Vector((0, 0, H + 1.8)), Vector((0, 0, H + 2.45))]
    tube(b, cap_pts, [r1 + 0.25, r1 + 0.05, 0.75, 0.05], 12, lambda t, s: mul(THATCH, 0.95 + 0.08 * (s % 2)),
         mat=M_VILLAGE, uv_rect=V['thatch'], uv_repeat=(1.0, 1.0))
    # Windshaft housing at the front of the cap.
    box(b, Vector((0, -1.2, H + 0.55)), (0.7, 0.8, 0.7), V['planks'], (0.7, 0.7), TIMBER_LT)
    ob = b.build('Windmill', mats)
    # Sails: a separate child node with its origin at the hub, lying in the XZ plane, facing -Y.
    sb = MeshBuilder()
    tube(sb, [Vector((0, 0.5, 0)), Vector((0, -0.25, 0))], [0.16, 0.16], 8, lambda t, s: TIMBER, cap=True)
    for k in range(4):
        a = k * math.pi / 2 + 0.3
        d = Vector((math.cos(a), 0, math.sin(a)))
        side = Vector((-d.z, 0, d.x))
        beam(sb, Vector((0, -0.32, 0)), d * 4.4 + Vector((0, -0.32, 0)), 0.14, 0.12, TIMBER_LT, normal=-Y)
        # Lattice frame and cloth on one side of each stock.
        o = d * 0.9 + Vector((0, -0.36, 0))
        for j in range(5):
            p = o + d * (3.4 * j / 4)
            beam(sb, p, p + side * 0.95, 0.05, 0.05, TIMBER, normal=-Y)
        beam(sb, o + side * 0.95, o + d * 3.4 + side * 0.95, 0.05, 0.05, TIMBER, normal=-Y)
        cl = o + Vector((0, -0.02, 0))
        u0, v0, u1, v1 = V['cloth']
        sb.poly([cl, cl + d * 3.4, cl + d * 3.4 + side * 0.92, cl + side * 0.92], (0.95, 0.92, 0.84),
                [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], mat=M_VILLAGE, smooth=False)
        sb.poly([cl + side * 0.92, cl + d * 3.4 + side * 0.92, cl + d * 3.4, cl], (0.9, 0.87, 0.8),
                [(u0, v1), (u1, v1), (u1, v0), (u0, v0)], mat=M_VILLAGE, smooth=False)
    sails = sb.build('Sails', mats)
    sails.parent = ob
    sails.location = (0, -1.65, H + 0.6)
    return ob


def build_dock(mats):
    """A jetty 2.4 m wide and 8 m long, running from the origin (the shore) along -Y; the deck's
    top is at z = 0, posts reach down to the sea bed."""
    r = rng(604)
    b = MeshBuilder()
    L = 8.0
    y = 0.0
    k = 0
    while y < L - 0.1:
        w = 0.38
        x_off = (r.random() - 0.5) * 0.06
        box(b, Vector((x_off, -(y + w / 2), -0.12)), (2.4, w - 0.03, 0.12), V['planks'], (2.4, 0.4),
            mul(PLANK, 0.85 + r.random() * 0.25))
        y += w
        k += 1
    for s in (-1, 1):
        beam(b, Vector((s * 1.0, 0.2, -0.2)), Vector((s * 1.0, -L, -0.2)), 0.16, 0.14, TIMBER_LT, normal=UP)
    for j in range(5):
        yy = -0.6 - j * (L - 0.9) / 4
        for s in (-1, 1):
            tube(b, [Vector((s * 1.18, yy, -2.2)), Vector((s * 1.18, yy, 0.5 if j % 2 == 0 else 0.15))], [0.14, 0.13], 7,
                 lambda t, s2: mul(TIMBER, 0.85 + 0.2 * t), mat=M_VILLAGE, cap=True)
        beam(b, Vector((-1.25, yy, -0.32)), Vector((1.25, yy, -0.32)), 0.14, 0.14, TIMBER, normal=UP)
    # Coiled rope and a bollard at the end.
    tube(b, [Vector((0.75, -L + 0.5, 0)), Vector((0.75, -L + 0.5, 0.35))], [0.13, 0.11], 8, lambda t, s: C('#d8c08a'), cap=True)
    return b.build('Dock', mats)


def build_boat(mats):
    """A small clinker-built sailing boat; bow toward -Y, waterline at z = 0."""
    r = rng(605)
    b = MeshBuilder()
    L = 5.6
    ribs = 9
    sections = []
    for i in range(ribs + 1):
        t = i / ribs  # 0 stern ... 1 bow
        y = (0.5 - t) * L
        beam_w = 0.95 * math.sin(math.pi * (0.12 + 0.82 * t)) ** 0.7
        sheer = 0.55 + 0.35 * (abs(t - 0.45) * 2) ** 2
        keel = -0.55 * math.sin(math.pi * (0.05 + 0.9 * t)) ** 0.5
        pts = []
        for k in range(5):
            a = k / 4  # 0 at keel, 1 at gunwale
            x = beam_w * math.sin(a * math.pi / 2) ** 0.8
            z = keel + (sheer - keel) * (1 - math.cos(a * math.pi / 2)) ** 1.0
            pts.append((x, y, z))
        sections.append(pts)
    hull_c = [C('#6f4a2d'), C('#7d5634'), C('#5d3d25'), C('#8a6140')]
    for s in (-1, 1):
        for i in range(ribs):
            for k in range(4):
                p = [Vector((s * sections[i][k][0], sections[i][k][1], sections[i][k][2])),
                     Vector((s * sections[i + 1][k][0], sections[i + 1][k][1], sections[i + 1][k][2])),
                     Vector((s * sections[i + 1][k + 1][0], sections[i + 1][k + 1][1], sections[i + 1][k + 1][2])),
                     Vector((s * sections[i][k + 1][0], sections[i][k + 1][1], sections[i][k + 1][2]))]
                if s > 0:
                    p = [p[1], p[0], p[3], p[2]]
                col = hull_c[k] if k < 3 else C('#a8452f')
                u0, v0, u1, v1 = V['planks']
                b.poly(p, col, [(u0, v0 + (v1 - v0) * k / 4), (u1, v0 + (v1 - v0) * k / 4), (u1, v0 + (v1 - v0) * (k + 1) / 4),
                                (u0, v0 + (v1 - v0) * (k + 1) / 4)], mat=M_VILLAGE, smooth=False)
    # Gunwale rails, deck, thwarts, transom.
    for s in (-1, 1):
        for i in range(ribs):
            a = Vector((s * sections[i][4][0], sections[i][4][1], sections[i][4][2]))
            c = Vector((s * sections[i + 1][4][0], sections[i + 1][4][1], sections[i + 1][4][2]))
            beam(b, a, c, 0.1, 0.12, TIMBER, normal=UP)
    deck_z = 0.15
    for i in range(1, ribs - 1):
        y0, y1 = sections[i][0][1], sections[i + 1][0][1]
        w0 = sections[i][3][0] * 0.95
        w1 = sections[i + 1][3][0] * 0.95
        u0, v0, u1, v1 = V['planks']
        b.poly([Vector((-w1, y1, deck_z)), Vector((w1, y1, deck_z)), Vector((w0, y0, deck_z)), Vector((-w0, y0, deck_z))],
               mul(PLANK, 0.95), [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], mat=M_VILLAGE, smooth=False)
    for yy in (0.9, -0.6):
        box(b, Vector((0, yy, 0.45)), (1.6, 0.26, 0.08), V['planks'], (1.6, 0.3), TIMBER_LT)
    st = sections[0]
    b.poly(([Vector((-st[k][0], st[k][1], st[k][2])) for k in range(5)][::-1] + [Vector((st[k][0], st[k][1], st[k][2])) for k in range(1, 5)])[::-1],
           TIMBER, mat=M_VILLAGE, smooth=False)
    # Mast, yard and a square sail in the harbour colour.
    tube(b, [Vector((0, 0.3, 0)), Vector((0, 0.3, 4.6))], [0.09, 0.06], 7, lambda t, s: TIMBER_LT, cap=True)
    beam(b, Vector((-1.25, 0.25, 4.1)), Vector((1.25, 0.25, 4.1)), 0.08, 0.08, TIMBER, normal=Y)
    sail_top = 4.05
    sail_bot = 1.4
    rows = 4
    for j in range(rows):
        z0 = sail_top - (sail_top - sail_bot) * j / rows
        z1 = sail_top - (sail_top - sail_bot) * (j + 1) / rows
        bel0 = 0.35 * math.sin(math.pi * j / rows)
        bel1 = 0.35 * math.sin(math.pi * (j + 1) / rows)
        w0 = 1.2
        w1 = 1.2 + 0.1 * (j + 1) / rows
        u0, v0, u1, v1 = V['cloth']
        pts = [Vector((-w0, 0.2 - bel0, z0)), Vector((w0, 0.2 - bel0, z0)), Vector((w1, 0.2 - bel1, z1)), Vector((-w1, 0.2 - bel1, z1))]
        b.poly(pts, (0.95, 0.95, 0.95), [(u0, v1), (u1, v1), (u1, v0), (u0, v0)], mat=M_SAIL, smooth=False)
        b.poly(pts[::-1], (0.85, 0.85, 0.85), [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], mat=M_SAIL, smooth=False)
    # Cargo.
    for (x, y) in ((0.35, -1.4), (-0.3, -1.9)):
        box(b, Vector((x, y, deck_z)), (0.55, 0.55, 0.5), V['planks'], (0.55, 0.5), C('#b38552'))
    return b.build('Boat', mats)


def build_road(mats):
    """One road edge, 14 m along X centred on the origin: domed cobbles between stone kerbs,
    with timber rails and posts painted in the owner's colour."""
    r = rng(606)
    b = MeshBuilder()
    L = 14.0
    W = 1.9
    # Gravel bed sloping into the ground on both sides.
    for s in (-1, 1):
        aquad(b, Vector((-L / 2, s * (W / 2 + 0.25), -0.05)) if s < 0 else Vector((L / 2, s * (W / 2 + 0.25), -0.05)),
              X if s < 0 else -X, (Vector((0, -s * 0.25, 0.12))).normalized(), L, 0.28, V['cobble'], (1.2, 0.28), STONE_DK)
    # Cobbles: a slightly domed strip in three lengthwise bands.
    for k, (y0, y1, z0, z1) in enumerate(((-W / 2, -W / 6, 0.07, 0.11), (-W / 6, W / 6, 0.11, 0.11), (W / 6, W / 2, 0.11, 0.07))):
        u0, v0, u1, v1 = V['cobble']
        n = int(L / 1.4)
        for i in range(n):
            xa = -L / 2 + L * i / n
            xb = -L / 2 + L * (i + 1) / n
            tone = 0.92 + r.random() * 0.14
            b.poly([Vector((xa, y0, z0)), Vector((xb, y0, z0)), Vector((xb, y1, z1)), Vector((xa, y1, z1))],
                   mul((0.9, 0.88, 0.84), tone), [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], mat=M_VILLAGE, smooth=False)
    # Kerbs.
    for s in (-1, 1):
        box(b, Vector((0, s * (W / 2 + 0.08), -0.02)), (L - 0.6, 0.18, 0.16), V['stone'], (1.0, 0.16), STONE_DK)
    # Rails and posts in the owner's colour.
    for s in (-1, 1):
        y = s * (W / 2 + 0.3)
        beam(b, Vector((-L / 2 + 1.1, y, 0.48)), Vector((L / 2 - 1.1, y, 0.48)), 0.13, 0.13, (0.9, 0.9, 0.9), M_TRIM, normal=UP)
        for i in range(5):
            x = -L / 2 + 1.1 + (L - 2.2) * i / 4
            box(b, Vector((x, y, -0.1)), (0.18, 0.18, 0.72), V['white'], (0.2, 0.8), (0.72, 0.72, 0.72), M_TRIM,
                top=(V['white'], (0.2, 0.2), (0.95, 0.92, 0.85)))
    return b.build('Road', mats)


def build_robber(mats):
    """A hooded traveller in a weathered charcoal cloak, leaning on a staff, on a stone pawn."""
    b = MeshBuilder()
    # Pawn base.
    tube(b, [Vector((0, 0, 0)), Vector((0, 0, 0.18)), Vector((0, 0, 0.3))], [0.95, 0.92, 0.8], 16,
         lambda t, s: mul(STONE_DK, 0.9 + 0.1 * t), uv_rect=V['stone'], cap=True)
    # Cloak: a flared, folded skirt narrowing to the shoulders.
    prof = [(0.82, 0.3), (0.74, 0.8), (0.6, 1.4), (0.52, 1.85), (0.56, 2.15), (0.42, 2.35)]
    sides = 18
    rings = []
    for j, (rad, z) in enumerate(prof):
        ring = []
        for i in range(sides + 1):
            a = math.tau * i / sides
            fold = 1 + 0.07 * math.sin(a * 7 + j * 0.6) * (1 - j / len(prof))
            front = 1 - 0.12 * max(0, -math.sin(a))  # slightly flatter at the front
            p = Vector((math.cos(a) * rad * fold, math.sin(a) * rad * front * 0.9, z))
            shade = 0.8 + 0.25 * (z / 2.35) + 0.08 * math.sin(a * 7 + j * 0.6)
            ring.append(b.vert(p, 0, Vector((math.cos(a), math.sin(a), 0.25)), mul(C('#4b4f55'), shade),
                               (V['cloth'][0] + (V['cloth'][2] - V['cloth'][0]) * i / sides, V['cloth'][1] + (V['cloth'][3] - V['cloth'][1]) * j / 5)))
        rings.append(ring)
    for j in range(len(prof) - 1):
        for i in range(sides):
            b.face([rings[j][i], rings[j][i + 1], rings[j + 1][i + 1], rings[j + 1][i]])
    # Hood: a deep cowl with a dark opening facing -Y.
    hood_c = Vector((0, -0.02, 2.48))
    hs = 14
    hr = []
    for j in range(7):
        t = j / 6
        phi = math.pi * (0.04 + 0.86 * t)
        ring = []
        for i in range(hs + 1):
            a = math.tau * i / hs
            flare = 1 + 0.25 * smooth(0.55, 1.0, t)  # the cowl opens out over the shoulders
            p = Vector((math.cos(a) * math.sin(phi) * 0.5 * flare, math.sin(a) * math.sin(phi) * 0.54 * flare,
                        math.cos(phi) * 0.62))
            # A peak that rises and droops back.
            p.y += 0.3 * (1 - smooth(0.0, 0.45, t))
            p.z += 0.18 * (1 - smooth(0.0, 0.35, t))
            col = mul(C('#42464c'), 0.85 + 0.2 * (1 - t))
            ring.append(b.vert(hood_c + p, 0, p.normalized(), col, (0, 0)))
        hr.append(ring)
    for j in range(6):
        for i in range(hs):
            a = math.tau * (i + 0.5) / hs
            if j >= 2 and j <= 5 and math.sin(a) < -0.55:
                continue  # the opening
            b.face([hr[j][i + 1], hr[j][i], hr[j + 1][i], hr[j + 1][i + 1]])
    # The void inside the hood.
    void = []
    for i in range(10):
        a = math.tau * i / 10
        void.append(b.vert(hood_c + Vector((math.cos(a) * 0.3, -0.18, math.sin(a) * 0.36)), 0, -Y, (0.02, 0.02, 0.025), (0, 0)))
    for i in range(1, 9):
        b.face([void[0], void[i], void[i + 1]])
    # Eyes, faintly glowing.
    for s in (-1, 1):
        e = hood_c + Vector((s * 0.11, -0.2, 0.02))
        b.poly([e + Vector((-0.04, 0, -0.025)), e + Vector((0.04, 0, -0.025)), e + Vector((0.04, 0, 0.025)), e + Vector((-0.04, 0, 0.025))],
               (1, 1, 1), mat=M_GLOW, smooth=False)
    # A belt and the staff.
    tube(b, [Vector((0, 0, 1.4)), Vector((0, 0, 1.5))], [0.62, 0.62], 16, lambda t, s: C('#5a4636'))
    tube(b, [Vector((0.72, -0.25, 0.3)), Vector((0.78, -0.3, 1.9)), Vector((0.74, -0.28, 3.1))], [0.05, 0.045, 0.04], 6,
         lambda t, s: mul(TIMBER_LT, 0.9 + 0.2 * t), uv_rect=V['timber'], cap=True)
    return b.build('Robber', mats)


def build_sheep(mats):
    """Fleece body and a dark face; head, legs and tail are child nodes with joint origins."""
    r = rng(607)
    wool = C('#f3eee2')
    face = C('#3a3330')
    root = MeshBuilder()
    # Fleece: a lumpy, curly ellipsoid.
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    seed = Vector((3.1, 7.7, 1.3))
    verts = []
    for v in bm.verts:
        p = v.co.copy()
        k = 1 + 0.09 * noise.noise(p * 3.2 + seed) + 0.05 * noise.noise(p * 7 + seed)
        verts.append(Vector((p.x * 0.42 * k, p.y * 0.66 * k, p.z * 0.36 * k + 0.78)))
    bm.verts.ensure_lookup_table()
    for f in bm.faces:
        idx = []
        for v in f.verts:
            p = verts[v.index]
            n = (p - Vector((0, 0, 0.78)))
            shade = 0.82 + 0.18 * smooth(-0.3, 0.35, n.z)
            idx.append(root.vert(p, 0, n.normalized(), mul(wool, shade),
                                 (V['wool'][0] + (V['wool'][2] - V['wool'][0]) * (p.y / 1.4 + 0.5), V['wool'][1] + (V['wool'][3] - V['wool'][1]) * ((p.z - 0.42) / 0.75))))
        root.face(idx)
    bm.free()
    body = root.build('Sheep', mats)

    def part(name, builder_fn, origin: Vector):
        pb = MeshBuilder()
        builder_fn(pb)
        ob = pb.build(name, mats)
        # Geometry was built in sheep space; move the origin to the joint.
        ob.data.transform(Matrix.Translation(-origin))
        ob.parent = body
        ob.location = origin
        return ob

    def legs(pb, x, y):
        tube(pb, [Vector((x, y, 0.62)), Vector((x, y, 0.3)), Vector((x, y, 0.06))], [0.075, 0.06, 0.055], 6,
             lambda t, s: mul(face, 1.0))
        tube(pb, [Vector((x, y, 0.06)), Vector((x, y - 0.02, 0.0))], [0.065, 0.06], 6, lambda t, s: C('#26201d'), cap=True)

    for name, x, y in (('LegFL', -0.2, -0.38), ('LegFR', 0.2, -0.38), ('LegBL', -0.2, 0.36), ('LegBR', 0.2, 0.36)):
        part(name, lambda pb, x=x, y=y: legs(pb, x, y), Vector((x, y, 0.62)))

    def head(pb):
        # A tapered face, wool cap, ears.
        tube(pb, [Vector((0, -0.62, 0.98)), Vector((0, -0.76, 0.92)), Vector((0, -0.9, 0.8)), Vector((0, -0.98, 0.72))],
             [0.13, 0.135, 0.11, 0.075], 8, lambda t, s: mul(face, 1.0 + 0.15 * (s in (1, 2, 3))), cap=True)
        cap_c = Vector((0, -0.7, 1.06))
        tube(pb, [cap_c + Vector((0, 0.06, -0.05)), cap_c + Vector((0, -0.02, 0.04)), cap_c + Vector((0, -0.08, 0.06))],
             [0.13, 0.15, 0.06], 8, lambda t, s: wool, cap=True)
        for s in (-1, 1):
            e = Vector((s * 0.13, -0.68, 1.0))
            pb.poly([e, e + Vector((s * 0.2, 0.02, -0.06)), e + Vector((s * 0.18, 0.1, -0.02))], mul(face, 1.2), mat=M_VILLAGE, smooth=False)
            pb.poly([e + Vector((s * 0.18, 0.1, -0.02)), e + Vector((s * 0.2, 0.02, -0.06)), e], mul(face, 1.2), mat=M_VILLAGE, smooth=False)
            eye = Vector((s * 0.105, -0.83, 0.92))
            pb.poly([eye, eye + Vector((0, -0.02, 0.03)), eye + Vector((0, -0.05, 0.0)), eye + Vector((0, -0.02, -0.025))][::(1 if s > 0 else -1)],
                    (0.04, 0.035, 0.03), mat=M_VILLAGE, smooth=False)
    part('Head', head, Vector((0, -0.58, 0.96)))

    def tail(pb):
        tube(pb, [Vector((0, 0.62, 0.86)), Vector((0, 0.72, 0.76)), Vector((0, 0.74, 0.62))], [0.07, 0.07, 0.04], 6,
             lambda t, s: wool, cap=True)
    part('Tail', tail, Vector((0, 0.62, 0.86)))
    return body


BRICK = C('#b2583c')
BRICK_DK = C('#8c4330')


def build_barn(mats):
    """A thatched timber byre on a stone plinth, its big doors in the front gable (-Y)."""
    r = rng(608)
    b = MeshBuilder()
    # Built with the ridge along X and the doors at -X, then turned to face -Y.
    W, D, H = 6.4, 5.2, 3.0
    box(b, Vector((0, 0, 0)), (W + 0.2, D + 0.2, 0.45), V['stone'], (1.6, 0.8), STONE, top=(V['stone'], (1.6, 1.6), STONE_DK),
        jitter=0.08, r=r)
    z1 = 0.45
    # Vertical board walls with a heavy timber frame.
    box(b, Vector((0, 0, z1)), (W, D, H), V['planks'], (1.0, 3.0), mul(PLANK, 0.75), faces='fblr')
    for (o, ux, ww, out) in ((Vector((-W / 2, -D / 2, z1)), X, W, -Y), (Vector((W / 2, D / 2, z1)), -X, W, Y),
                             (Vector((-W / 2, D / 2, z1)), -Y, D, -X), (Vector((W / 2, -D / 2, z1)), Y, D, X)):
        wall_frame(b, o, ux, ww, H, 4, True, out, TIMBER)
    # The double doors in the -X gable, a hay-loft hatch above them.
    door_c = Vector((-W / 2 - 0.02, 0, z1))
    aquad(b, door_c + Vector((0, 1.15, 0)), -Y, UP, 2.3, 2.5, V['door'], (1.15, 2.5), (0.9, 0.86, 0.82))
    beam(b, door_c + Vector((-0.06, 1.3, 2.55)), door_c + Vector((-0.06, -1.3, 2.55)), 0.2, 0.16, TIMBER, normal=-X)
    for s in (-1, 1):
        beam(b, door_c + Vector((-0.06, 1.25 * s, 0)), door_c + Vector((-0.06, 1.25 * s, 2.55)), 0.18, 0.16, TIMBER, normal=-X)
        beam(b, door_c + Vector((-0.08, 1.1 * s, 0.15)), door_c + Vector((-0.08, 0.05 * s, 2.4)), 0.1, 0.06, TIMBER_LT, normal=-X)
    aquad(b, Vector((-W / 2 - 0.04, 0.45, z1 + H + 0.35)), -Y, UP, 0.9, 0.8, V['door'], (0.9, 0.8), (0.8, 0.76, 0.72))
    for s in (-1, 1):
        window(b, Vector((0.6 * s * 2, -D / 2, z1 + 1.9)), X, -Y, 0.6, 0.5, shutters=False)
    gable_roof(b, Vector((0, 0, 0)), W, D, z1 + H, z1 + H + 2.6, 0.55, M_VILLAGE, V['thatch'], THATCH, thick=0.32,
               gable_rect=V['planks'], gable_color=mul(PLANK, 0.72), r=r)
    # A weathervane on the ridge.
    beam(b, Vector((W * 0.3, 0, z1 + H + 2.7)), Vector((W * 0.3, 0, z1 + H + 3.6)), 0.06, 0.06, IRON, M_IRON)
    b.poly([Vector((W * 0.3, 0, z1 + H + 3.45)), Vector((W * 0.3 + 0.5, 0, z1 + H + 3.5)), Vector((W * 0.3 + 0.1, 0, z1 + H + 3.62))],
           (1, 1, 1), mat=M_IRON, smooth=False)
    b.poly([Vector((W * 0.3 + 0.1, 0, z1 + H + 3.62)), Vector((W * 0.3 + 0.5, 0, z1 + H + 3.5)), Vector((W * 0.3, 0, z1 + H + 3.45))],
           (1, 1, 1), mat=M_IRON, smooth=False)
    ob = b.build('Barn', mats)
    ob.data.transform(Matrix.Rotation(math.pi / 2, 4, 'Z'))
    return ob


def build_kiln(mats):
    """A bottle kiln of soot-darkened brick: beehive body, iron hoops, a firing arch at -Y,
    a square chimney."""
    r = rng(609)
    b = MeshBuilder()
    sides = 16
    prof = [(1.85, 0.0), (1.85, 0.45), (1.8, 1.1), (1.6, 1.8), (1.25, 2.4), (0.78, 2.85), (0.45, 3.05)]
    rings = []
    for j, (rad, z) in enumerate(prof):
        ring = []
        for i in range(sides + 1):
            a = math.tau * i / sides
            soot = smooth(1.5, 3.1, z) * 0.35
            col = mul(lerp(BRICK, BRICK_DK, 0.3 * r.random() + soot), 1.0)
            u0, v0, u1, v1 = V['stone']
            ring.append(b.vert(Vector((math.cos(a) * rad, math.sin(a) * rad, z)), 0, None, col,
                               (u0 + (u1 - u0) * (i / sides) * 3 % (u1 - u0), v0 + (v1 - v0) * (z / 3.05))))
        rings.append(ring)
    for j in range(len(prof) - 1):
        for i in range(sides):
            b.face([rings[j][i], rings[j][i + 1], rings[j + 1][i + 1], rings[j + 1][i]], smooth=False)
    # Iron hoops.
    for z in (1.0, 1.75):
        rr = 1.81 if z < 1.5 else 1.62
        tube(b, [Vector((rr, 0, z)), Vector((rr, 0, z))], [0.05, 0.05], 4, lambda t, s: IRON, mat=M_IRON)
        pts = [Vector((math.cos(a) * rr, math.sin(a) * rr, z)) for a in [k / 24 * math.tau for k in range(25)]]
        tube(b, pts, [0.045] * 25, 4, lambda t, s: IRON, mat=M_IRON)
    # Firing arch and its glow-dark mouth.
    box(b, Vector((0, -1.75, 0)), (1.3, 0.5, 1.25), V['stone'], (0.6, 0.6), BRICK_DK)
    aquad(b, Vector((-0.38, -2.01, 0.0)), X, UP, 0.76, 0.85, V['iron'], (1, 1), (0.05, 0.04, 0.04))
    # Chimney.
    box(b, Vector((0, 0.2, 2.8)), (0.7, 0.7, 1.6), V['stone'], (0.7, 0.7), BRICK, top=(V['iron'], (1, 1), (0.08, 0.07, 0.06)),
        jitter=0.08, r=r)
    box(b, Vector((0, 0.2, 4.4)), (0.86, 0.86, 0.16), V['stone'], (0.86, 0.16), BRICK_DK)
    # Firewood stacked beside the arch.
    for k in range(6):
        y = -1.6 + (k % 3) * 0.24
        tube(b, [Vector((1.1, y, 0.12 + 0.24 * (k // 3))), Vector((1.9, y, 0.12 + 0.24 * (k // 3)))], [0.11, 0.11], 6,
             lambda t, s: mul(TIMBER_LT, 0.9 + 0.15 * (s % 2)), cap=True)
    return b.build('Kiln', mats)


def build_haybale(mats):
    """A round hay bale lying on its side (axis along X), wrapped straw with two twine bands."""
    b = MeshBuilder()
    n = 16
    R0, L = 0.66, 1.1
    u0, v0, u1, v1 = V['thatch']
    ring = []
    for s in (-1, 1):
        row = []
        for i in range(n + 1):
            a = math.tau * i / n
            row.append(b.vert(Vector((s * L / 2, math.cos(a) * R0, R0 + math.sin(a) * R0)), 0,
                              Vector((0, math.cos(a), math.sin(a))), mul(THATCH, 0.95), (u0 + (u1 - u0) * i / n, v0 if s < 0 else v1)))
        ring.append(row)
    for i in range(n):
        b.face([ring[0][i], ring[0][i + 1], ring[1][i + 1], ring[1][i]])
    # The spiral-rolled ends, slightly domed.
    for s in (-1, 1):
        c = b.vert(Vector((s * (L / 2 + 0.04), 0, R0)), 0, Vector((s, 0, 0)), mul(THATCH, 0.8), ((u0 + u1) / 2, (v0 + v1) / 2))
        rim = [b.vert(Vector((s * L / 2, math.cos(math.tau * i / n) * R0, R0 + math.sin(math.tau * i / n) * R0)), 0,
                      Vector((s, 0, 0)), mul(THATCH, 0.88 - 0.1 * (i % 2)),
                      ((u0 + u1) / 2 + (u1 - u0) * 0.4 * math.cos(math.tau * i / n), (v0 + v1) / 2 + (v1 - v0) * 0.4 * math.sin(math.tau * i / n)))
               for i in range(n)]
        for i in range(n):
            f = [c, rim[i], rim[(i + 1) % n]]
            b.face(f if s > 0 else f[::-1], smooth=False)
    for x in (-0.28, 0.28):
        pts = [Vector((x, math.cos(a) * (R0 + 0.01), R0 + math.sin(a) * (R0 + 0.01))) for a in [k / 20 * math.tau for k in range(21)]]
        tube(b, pts, [0.025] * 21, 4, lambda t, s: C('#8a6a2a'))
    return b.build('HayBale', mats)


def build_mine(mats):
    """A timbered adit: posts, lintel and a sign over a dark mouth, plank cladding, rails running
    out along -Y to an ore cart. The mouth's back is at y = +0.3 (it is set into a rock face)."""
    r = rng(610)
    b = MeshBuilder()
    # The dark mouth and its cladding.
    aquad(b, Vector((-1.15, 0.3, 0)), X, UP, 2.3, 2.5, V['iron'], (1, 1), (0.03, 0.03, 0.035))
    for s in (-1, 1):
        aquad(b, Vector((s * 1.15, 0.3, 0)) if s < 0 else Vector((s * 1.15, -0.3, 0)), -Y if s < 0 else Y, UP, 0.6, 2.5,
              V['planks'], (0.6, 2.5), mul(PLANK, 0.6))
    aquad(b, Vector((1.15, -0.3, 2.5)), -X, -Y, 2.3, 0.6, V['planks'], (2.3, 0.6), mul(PLANK, 0.55))
    for s in (-1, 1):
        tube(b, [Vector((s * 1.25, -0.25, 0)), Vector((s * 1.25, -0.25, 2.75))], [0.17, 0.15], 7,
             lambda t, s2: mul(TIMBER, 0.85 + 0.2 * t), uv_rect=V['timber'], cap=True)
    beam(b, Vector((-1.6, -0.25, 2.8)), Vector((1.6, -0.25, 2.8)), 0.34, 0.36, TIMBER, normal=-Y)
    aquad(b, Vector((-0.45, -0.45, 2.9)), X, UP, 0.9, 0.45, V['planks'], (0.9, 0.45), C('#c9a46a'))
    # Rails and sleepers out to the cart.
    for k in range(9):
        y = -0.4 - k * 0.48
        box(b, Vector((0, y, 0)), (1.25, 0.2, 0.08), V['planks'], (1.25, 0.2), mul(TIMBER_LT, 0.8))
    for s in (-1, 1):
        beam(b, Vector((s * 0.42, 0.25, 0.1)), Vector((s * 0.42, -4.4, 0.1)), 0.07, 0.07, IRON, M_IRON, normal=UP)
    # The ore cart, heaped with dark iron ore.
    cy = -3.2
    box(b, Vector((0, cy, 0.25)), (1.0, 1.3, 0.6), V['planks'], (1.0, 0.6), mul(PLANK, 0.7))
    for sx in (-1, 1):
        for sy in (-1, 1):
            tube(b, [Vector((sx * 0.52, cy + sy * 0.4, 0.2)), Vector((sx * 0.58, cy + sy * 0.4, 0.2))], [0.19, 0.19], 10,
                 lambda t, s: IRON, mat=M_IRON, cap=True)
    for k in range(9):
        p = Vector(((r.random() - 0.5) * 0.7, cy + (r.random() - 0.5) * 0.95, 0.88 + r.random() * 0.12))
        q = 0.13 + r.random() * 0.06
        pts = [p + Vector((math.cos(a) * q, math.sin(a) * q, (r.random() - 0.4) * q)) for a in (0, 2.1, 4.2)]
        top = p + Vector((0, 0, q * 0.9))
        for i in range(3):
            b.poly([pts[i], pts[(i + 1) % 3], top], C('#4a525c'), mat=M_IRON if k % 3 == 0 else M_VILLAGE, smooth=False)
    return b.build('Mine', mats)


def build(atlas):
    sc = new_scene('Village')
    mats = [
        material('Village', image=atlas, rough=0.86),
        material('Owner_Roof', image=atlas, rough=0.72),
        material('Owner_Trim', image=atlas, rough=0.78),
        material('Iron', color=srgb('#3e3d40'), rough=0.45, metal=0.8),
        material('Owner_Sail', image=atlas, rough=0.95, double=True),
        material('Glow', color=(0, 0, 0), rough=1.0, emission=srgb('#ff7a3c')),
    ]
    objs = [build_settlement(mats), build_city(mats), build_windmill(mats), build_dock(mats), build_boat(mats),
            build_road(mats), build_robber(mats), build_sheep(mats), build_barn(mats), build_kiln(mats),
            build_haybale(mats), build_mine(mats)]
    layout_row(objs, gap=4.0)
    bake = [o for o in objs if o.name not in ('Road',)]
    bake_ao([*bake, *[c for o in bake for c in o.children]], strength=0.6, distance=1.6, samples=32)
    export_glb(objs, 'village.glb', images='JPEG')
    save_blend(sc, 'village.blend')
    return stats(objs)
