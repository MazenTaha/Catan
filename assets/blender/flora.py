"""Flora for the 3D walk -> apps/web/public/models/flora.glb

One file, one leaf/bark atlas, a few shared materials, one root node per variant:
  WheatA WheatB WheatC (near) WheatMid WheatFar  wheat clumps by distance, `_wphase` per stalk for wind
  Stook                                         sheaves stood up on a harvested plot
  GrassA GrassB                                 meadow tufts (tinted per placement)
  Daisy Poppy Buttercup Lavender                wildflower clusters
  Oak Lime Spruce Fir Sapling ShrubA ShrubB     trees and undergrowth (alpha-tested cards)

Materials: "Plant" (vertex colours, double-sided; the game swaps in its wind shader),
"Leaf" (atlas, alpha clip), "Bark" (atlas).
"""

from __future__ import annotations

import math

from mathutils import Vector

from common import (MeshBuilder, Vector, bpy, layout_row, lerp, material, mul, new_scene, rng, save_blend,
                    smooth, srgb, stats, tube, export_glb)
from textures import FLORA

UP = Vector((0, 0, 1))
C = srgb


def soft_normal(off: Vector, up: float = 0.9, out: float = 0.55) -> Vector:
    """Thin plant parts: a normal between 'away from the stem' and 'up', so they light softly."""
    return (off.normalized() * out + UP * up).normalized()


# ------------------------------------------------------------------ wheat

STEM_LO = C('#a0aa4e')
STEM_MID = C('#d6b452')
STEM_HI = C('#efd682')
HEAD_LO = C('#d8a33e')
HEAD_HI = C('#fde39a')
AWN = C('#f6e7b0')
LEAF_LO = C('#93983f')
LEAF_HI = C('#d9c46c')
TONES = [(1, 1, 1), (1, 1, 1), (1.0, 0.9, 0.74), (1.04, 1.02, 0.94), (0.9, 1.0, 0.78)]


def _spine(s, t):
    bend = s['lean'] * t * t
    return Vector((s['x'] + math.cos(s['dir']) * bend, s['y'] + math.sin(s['dir']) * bend, s['h'] * t))


def wheat_near(b: MeshBuilder, s):
    tone = s['tone']
    t0 = 1 - s['head'] / s['h']
    ph = s['phase']

    def stem_col(t, side):
        k = t / t0
        c = lerp(STEM_LO, STEM_MID, smooth(0, 0.55, k)) if k < 0.55 else lerp(STEM_MID, STEM_HI, smooth(0.55, 1, k))
        return mul(c, tone)

    pts = [_spine(s, t0 * k / 2) for k in range(3)]
    tube(b, pts, [0.0095, 0.008, 0.0068], 3, lambda t, side: stem_col(t * t0, side), phase=ph,
         twist=0.3, normal_fn=lambda t, off: soft_normal(off))
    # A narrow leaf arching out and drooping (the upper ones have withered on ripe wheat).
    for t_at, side in ((0.18 + 0.12 * s['phase'], 0.0),):
        base = _spine(s, t_at)
        a = s['rot'] + side
        d = Vector((math.cos(a), math.sin(a), 0))
        perp = Vector((-d.y, d.x, 0))
        L = 0.26 + (s['h'] - 1.0) * 0.25
        rows = []
        for k in range(4):
            u = k / 3
            w = 0.013 * math.sin(math.pi * (0.12 + u * 0.8))
            c = base + d * (L * u) + UP * (L * (0.5 * u - 0.85 * u * u))
            col = mul(lerp(LEAF_LO, LEAF_HI, u), tone)
            nrm = (UP * 0.9 + d * 0.2).normalized()
            if k == 3:
                rows.append([b.vert(c, ph, nrm, col)] * 2)
            else:
                rows.append([b.vert(c - perp * w, ph, nrm, col), b.vert(c + perp * w, ph, nrm, col)])
        for k in range(3):
            if k == 2:
                b.face([rows[k][0], rows[k][1], rows[k + 1][0]])
            else:
                b.face([rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0]])
    # The ear: spikelets stacked alternately left and right of the rachis, so it reads as a
    # flat, beaded spike rather than a smooth spindle.
    RAD, RINGS = 4, 4
    plane = Vector((math.cos(s['rot']), math.sin(s['rot']), 0))
    across = plane.cross(UP).normalized()
    rings = []
    for j in range(RINGS + 1):
        u = j / RINGS
        c = _spine(s, t0 + (1 - t0) * u * 0.95)
        swell = math.sin(math.pi * min(1.0, 0.1 + u * 0.95)) ** 0.45
        zig = (0.0065 if j % 2 else -0.0065) * swell
        c = c + plane * zig
        r = 0.0165 * swell * (1.18 if j % 2 else 0.8)
        shade = 1.08 if j % 2 else 0.86
        col = mul(lerp(HEAD_LO, HEAD_HI, smooth(0, 1, u * 1.15)), shade)
        ring = []
        for i in range(RAD):
            ang = -2 * math.pi * i / RAD + 0.4
            off = plane * (math.cos(ang) * r) + across * (math.sin(ang) * r * 0.58)
            face_light = 1.05 if abs(math.cos(ang)) > 0.5 else 0.92
            ring.append(b.vert(c + off, ph, soft_normal(off, 0.9, 0.6), mul(mul(col, face_light), tone)))
        rings.append(ring)
    for j in range(RINGS):
        for i in range(RAD):
            i1 = (i + 1) % RAD
            b.face([rings[j][i], rings[j][i1], rings[j + 1][i1], rings[j + 1][i]])
    tip = b.vert(_spine(s, 1.0), ph, UP, mul(HEAD_HI, tone))
    for i in range(RAD):
        b.face([rings[RINGS][i], rings[RINGS][(i + 1) % RAD], tip])
    # Awns: long fine bristles sweeping up from the spikelets (bearded wheat).
    r = s['rng']
    head_dir = (_spine(s, 1.0) - _spine(s, t0)).normalized()
    for k in range(4):
        j = 1 + k % 3
        i = (k * 3 + j) % RAD
        root = rings[j][i]
        p = b.verts[root]
        sidev = (p - _spine(s, t0 + (1 - t0) * j / RINGS * 0.95)).normalized()
        L = 0.08 + r.random() * 0.05
        top = p + (head_dir * 0.92 + sidev * 0.38).normalized() * L
        p2 = p + head_dir * 0.008 + sidev * 0.0035
        a1 = b.vert(p2, ph, UP, mul(HEAD_HI, tone))
        a2 = b.vert(top, ph, UP, mul(AWN, tone))
        b.face([root, a1, a2])


def wheat_far(b: MeshBuilder, s):
    tone = s['tone']
    t0 = 1 - s['head'] / s['h']
    ph = s['phase']
    base = _spine(s, 0)
    top = _spine(s, t0)
    tip = _spine(s, 1.0) + UP * 0.035
    ax = Vector((math.cos(s['rot']), math.sin(s['rot']), 0)) * 0.012
    n = (UP * 1.0).normalized()
    v = [b.vert(base - ax, ph, n, mul(STEM_LO, tone)), b.vert(base + ax, ph, n, mul(STEM_LO, tone)),
         b.vert(top + ax, ph, n, mul(STEM_HI, tone)), b.vert(top - ax, ph, n, mul(STEM_HI, tone))]
    b.face(v)
    for a in (s['rot'], s['rot'] + math.pi / 2):
        w = Vector((math.cos(a), math.sin(a), 0)) * 0.022
        q = [b.vert(top - w, ph, n, mul(HEAD_LO, tone)), b.vert(top + w, ph, n, mul(HEAD_LO, tone)),
             b.vert(tip + w * 0.35, ph, n, mul(HEAD_HI, tone)), b.vert(tip - w * 0.35, ph, n, mul(HEAD_HI, tone))]
        b.face(q)


def wheat_mid(b: MeshBuilder, s):
    """Mid distance: a bent stem ribbon, a crossed-card ear with an awn tuft, one leaf (~15 tris)."""
    tone = s['tone']
    t0 = 1 - s['head'] / s['h']
    ph = s['phase']
    ax = Vector((math.cos(s['rot']), math.sin(s['rot']), 0))
    n = UP
    rows = []
    for k in range(4):
        t = t0 * k / 3
        c = _spine(s, t)
        w = 0.011 * (1 - 0.3 * t)
        col = mul(lerp(STEM_LO, STEM_HI, k / 3), tone)
        rows.append((b.vert(c - ax * w, ph, n, col), b.vert(c + ax * w, ph, n, col)))
    for k in range(3):
        b.face([rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0]])
    top = _spine(s, t0)
    tip = _spine(s, 1.0)
    awn = tip + (tip - top).normalized() * 0.07
    for a in (s['rot'], s['rot'] + math.pi / 2):
        w = Vector((math.cos(a), math.sin(a), 0)) * 0.02
        mid = _spine(s, t0 + (1 - t0) * 0.45)
        half = mul(lerp(HEAD_LO, HEAD_HI, 0.5), tone)
        q = [b.vert(top - w * 0.5, ph, n, mul(HEAD_LO, tone)), b.vert(top + w * 0.5, ph, n, mul(HEAD_LO, tone)),
             b.vert(mid + w, ph, n, half), b.vert(mid - w, ph, n, half),
             b.vert(tip, ph, n, mul(HEAD_HI, tone)), b.vert(awn + w * 0.6, ph, n, mul(AWN, tone)),
             b.vert(awn - w * 0.6, ph, n, mul(AWN, tone))]
        b.face([q[0], q[1], q[2], q[3]])
        b.face([q[3], q[2], q[4]])
        b.face([q[4], q[5], q[6]])
    base = _spine(s, 0.2 + 0.12 * s['phase'])
    d = Vector((math.cos(s['rot'] + 0.9), math.sin(s['rot'] + 0.9), 0))
    perp = Vector((-d.y, d.x, 0)) * 0.012
    L = 0.26
    p1 = base + d * (L * 0.5) + UP * (L * 0.12)
    p2 = base + d * L - UP * (L * 0.15)
    lv = [b.vert(base - perp, ph, n, mul(LEAF_LO, tone)), b.vert(base + perp, ph, n, mul(LEAF_LO, tone)),
          b.vert(p1 + perp, ph, n, mul(LEAF_HI, tone)), b.vert(p1 - perp, ph, n, mul(LEAF_HI, tone)),
          b.vert(p2, ph, n, mul(LEAF_HI, tone))]
    b.face([lv[0], lv[1], lv[2], lv[3]])
    b.face([lv[3], lv[2], lv[4]])


def wheat_stalks(seed: int, n: int, hmin: float, hmax: float, spread: float, green: float = 0.0):
    r = rng(seed)
    common_dir = r.random() * math.tau
    out = []
    for i in range(n):
        a = i / n * math.tau + r.random() * 0.9
        rr = 0.035 + r.random() * spread
        tone = TONES[r.randrange(len(TONES))]
        if r.random() < green:
            tone = (0.86, 1.0, 0.72)
        out.append({
            'x': math.cos(a) * rr, 'y': math.sin(a) * rr,
            'h': hmin + r.random() * (hmax - hmin),
            'lean': 0.04 + r.random() * 0.13,
            'dir': common_dir + (r.random() - 0.5) * 1.8,
            'rot': r.random() * math.tau,
            'head': 0.11 + r.random() * 0.035,
            'tone': tone,
            'phase': r.random(),
            'rng': r,
        })
    return out


def build_wheat(mats):
    plant = mats['Plant']
    objs = []
    variants = {'WheatA': (101, 6, 0.95, 1.2, 0.11, 0.0), 'WheatB': (102, 7, 1.0, 1.25, 0.13, 0.0),
                'WheatC': (103, 6, 0.88, 1.15, 0.12, 0.25)}
    for name, (seed, n, h0, h1, spread, green) in variants.items():
        b = MeshBuilder()
        for s in wheat_stalks(seed, n, h0, h1, spread, green):
            wheat_near(b, s)
        objs.append(b.build(name, [plant], phase_attr=True))
    b = MeshBuilder()
    for s in wheat_stalks(101, 6, 0.95, 1.2, 0.11):
        wheat_mid(b, s)
    objs.append(b.build('WheatMid', [plant], phase_attr=True))
    b = MeshBuilder()
    for s in wheat_stalks(101, 6, 0.95, 1.2, 0.11):
        wheat_far(b, s)
    objs.append(b.build('WheatFar', [plant], phase_attr=True))
    return objs


STRAW = C('#d9b866')
STRAW_DK = C('#9c7a3c')
TIE = C('#7a5a2e')


def build_stook(mats):
    """A stook: six tied sheaves leaning together in a tent, ears fringing the top."""
    r = rng(111)
    b = MeshBuilder()
    n = 6
    for k in range(n):
        a = k / n * math.tau + r.random() * 0.2
        d = Vector((math.cos(a), math.sin(a), 0))
        foot = d * (0.36 + r.random() * 0.06)
        top = d * 0.05 + UP * (1.0 + r.random() * 0.12)
        axis = (top - foot)
        ax = axis.normalized()
        u = ax.cross(UP).normalized()
        v = ax.cross(u).normalized()
        tie = foot + axis * 0.58
        # A bundle of straw ribbons, flared at the cut foot, pinched at the tie, fanned at the top.
        for i in range(18):
            th = i / 18 * math.tau + r.random() * 0.3
            radial = u * math.cos(th) + v * math.sin(th)
            tone = 0.82 + 0.3 * r.random()
            inner = 0.75 if radial.dot(-d) > 0.3 else 1.0
            pts = [foot + radial * (0.15 + r.random() * 0.03), tie + radial * 0.045, pts_top := (foot + axis * (1.0 + r.random() * 0.06) + radial * (0.1 + r.random() * 0.05))]
            side = radial.cross(ax).normalized() * 0.018
            nrm = (radial * 0.8 + UP * 0.4).normalized()
            row = []
            for k, (p, t) in enumerate(zip(pts, (0.0, 0.58, 1.0))):
                c = mul(lerp(STRAW_DK, STRAW, 0.3 + 0.7 * t), tone * inner)
                row.append((b.vert(p - side, r.random(), nrm, c), b.vert(p + side, r.random(), nrm, c)))
            for k in range(2):
                b.face([row[k][0], row[k][1], row[k + 1][1], row[k + 1][0]])
        tube(b, [tie - ax * 0.03, tie + ax * 0.03], [0.055, 0.055], 8, lambda t, s: TIE, phase=0.0)
        pts = [tie, tie + axis * 0.42]
        # Ears fanning out and drooping from the top of the sheaf.
        ax = axis.normalized()
        for e in range(9):
            ea = e / 9 * math.tau + r.random() * 0.4
            side = Vector((math.cos(ea), math.sin(ea), 0))
            dirv = (ax * 0.55 + side * 0.7 - UP * 0.1).normalized()
            base = pts[-1] + side * 0.06
            ear = [base, base + dirv * 0.08 + UP * 0.02, base + dirv * 0.16]
            tube(b, ear, [0.013, 0.02, 0.005], 4, lambda t, s: lerp(HEAD_LO, HEAD_HI, t),
                 phase=r.random(), normal_fn=lambda t, off: soft_normal(off))
    return b.build('Stook', [mats['Plant']], phase_attr=True)


# ------------------------------------------------------------------ grass

def blade(b: MeshBuilder, r, x, y, h, w, a, lean, ph, tipwarm=1.0):
    d = Vector((math.cos(a), math.sin(a), 0))
    perp = Vector((-d.y, d.x, 0))
    rows = []
    us = (0.0, 0.4, 0.75, 1.0)
    for k, u in enumerate(us):
        c = Vector((x, y, 0)) + d * (lean * u * u) + UP * (h * (u - 0.18 * (lean / max(h, 1e-3)) * u * u))
        ww = w * (1 - u) ** 0.6
        lum = 0.3 + 0.7 * u ** 0.8
        col = (lum * (1.0 + 0.04 * u * tipwarm), lum, lum * (0.92 - 0.08 * u * tipwarm))
        nrm = (UP + d * 0.35).normalized()
        if k == len(us) - 1:
            rows.append([b.vert(c, ph, nrm, col)])
        else:
            rows.append([b.vert(c - perp * ww, ph, nrm, col), b.vert(c + perp * ww, ph, nrm, col)])
    for k in range(len(us) - 1):
        if len(rows[k + 1]) == 1:
            b.face([rows[k][0], rows[k][1], rows[k + 1][0]])
        else:
            b.face([rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0]])


def build_grass(mats):
    plant = mats['Plant']
    objs = []
    for name, seed, n, hmin, hmax, spread in (('GrassA', 201, 14, 0.16, 0.38, 0.09), ('GrassB', 202, 13, 0.26, 0.56, 0.11)):
        r = rng(seed)
        b = MeshBuilder()
        for i in range(n):
            a = i / n * math.tau + r.random() * 0.7
            rr = r.random() * spread
            h = hmin + r.random() * (hmax - hmin)
            blade(b, r, math.cos(a) * rr, math.sin(a) * rr, h, 0.011 + r.random() * 0.008, a + (r.random() - 0.5) * 0.8,
                  h * (0.25 + r.random() * 0.45), r.random())
        if name == 'GrassB':
            # A couple of seed heads above the tuft.
            for k in range(2):
                a = r.random() * math.tau
                x, y = math.cos(a) * 0.04, math.sin(a) * 0.04
                h = hmax * (1.15 + r.random() * 0.2)
                top = Vector((x + math.cos(a) * 0.08, y + math.sin(a) * 0.08, h))
                pts = [Vector((x, y, 0)), Vector((x, y, h * 0.5)) + (top - Vector((x, y, h))) * 0.3, top]
                tube(b, pts, [0.004, 0.003, 0.002], 3, lambda t, s: (0.55 + 0.4 * t, 0.6 + 0.35 * t, 0.42 + 0.2 * t), phase=r.random())
                head = [top, top + Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, 0.07))]
                tube(b, [head[0], (head[0] + head[1]) / 2, head[1]], [0.006, 0.009, 0.002], 3,
                     lambda t, s: (1.05, 1.0, 0.78), phase=r.random())
        objs.append(b.build(name, [plant], phase_attr=True))
    return objs


# ------------------------------------------------------------------ flowers

def stem(b, base: Vector, top: Vector, bow: Vector, r0, col_lo, col_hi, ph=0.0):
    pts = [base, (base + top) / 2 + bow, top]
    tube(b, pts, [r0, r0 * 0.85, r0 * 0.7], 3, lambda t, s: lerp(col_lo, col_hi, t), phase=ph,
         normal_fn=lambda t, off: soft_normal(off))


def leaf_ribbon(b, base: Vector, a: float, L: float, w: float, lift: float, col_lo, col_hi, ph=0.0, droop=0.9):
    d = Vector((math.cos(a), math.sin(a), 0))
    perp = Vector((-d.y, d.x, 0))
    rows = []
    for k in range(4):
        u = k / 3
        c = base + d * (L * u) + UP * (L * (lift * u - droop * lift * u * u))
        ww = w * math.sin(math.pi * (0.15 + 0.8 * u))
        col = lerp(col_lo, col_hi, u)
        n = (UP + d * 0.2).normalized()
        if k == 3:
            rows.append([b.vert(c, ph, n, col)])
        else:
            rows.append([b.vert(c - perp * ww, ph, n, col), b.vert(c + perp * ww, ph, n, col)])
    for k in range(3):
        if k == 2:
            b.face([rows[k][0], rows[k][1], rows[k + 1][0]])
        else:
            b.face([rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0]])


GREEN_LO = C('#3f6a2a')
GREEN_HI = C('#78a446')


def bloom_disc(b, centre: Vector, facing: Vector, petals: int, r_out: float, r_gap: float, r_in: float,
               petal_col, petal_tip, disc_col, cup: float = 0.0, ph=0.0):
    """A flat or cupped flower head: a raised disc and a star of petals around it."""
    facing = facing.normalized()
    a = UP if abs(facing.dot(UP)) < 0.95 else Vector((1, 0, 0))
    u = facing.cross(a).normalized()
    v = facing.cross(u).normalized()
    top = b.vert(centre + facing * (r_in * 0.6), ph, facing, disc_col)
    inner = []
    for i in range(6):
        ang = math.tau * i / 6
        inner.append(b.vert(centre + (u * math.cos(ang) + v * math.sin(ang)) * r_in, ph, facing, mul(disc_col, 0.85)))
    for i in range(6):
        b.face([inner[i], inner[(i + 1) % 6], top])
    ring_in = []
    ring_out = []
    n = petals * 2
    for i in range(n):
        ang = math.tau * i / n
        dirv = u * math.cos(ang) + v * math.sin(ang)
        rr = r_out if i % 2 == 0 else r_gap
        lift = cup * (rr / r_out)
        ring_in.append(b.vert(centre + dirv * r_in * 0.95, ph, facing, petal_col))
        ring_out.append(b.vert(centre + dirv * rr + facing * lift, ph, (facing + dirv * 0.3).normalized(),
                               petal_tip if i % 2 == 0 else petal_col))
    for i in range(n):
        i1 = (i + 1) % n
        b.face([ring_in[i], ring_out[i], ring_out[i1], ring_in[i1]])


def build_flowers(mats):
    plant = mats['Plant']
    objs = []
    # Daisies: white rays round a golden disc, on slender stems over a small rosette.
    r = rng(301)
    b = MeshBuilder()
    for k in range(4):
        a = r.random() * math.tau
        leaf_ribbon(b, Vector((0, 0, 0.005)), a, 0.08, 0.012, 0.25, GREEN_LO, GREEN_HI)
    for k in range(3):
        a = k / 3 * math.tau + r.random()
        base = Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, 0))
        h = 0.2 + r.random() * 0.12
        top = base + Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, h))
        ph = r.random()
        stem(b, base, top, Vector((0, 0, 0)), 0.0035, GREEN_LO, GREEN_HI, ph)
        face = (UP * 1.0 + Vector((math.cos(a), math.sin(a), 0)) * 0.45)
        bloom_disc(b, top, face, 9, 0.034, 0.02, 0.009, C('#f5f2ea'), C('#fdfcf8'), C('#f0b81e'), cup=0.004, ph=ph)
    objs.append(b.build('Daisy', [plant], phase_attr=True))

    # Poppies: four broad cupped scarlet petals, a dark crown, a nodding bud.
    r = rng(302)
    b = MeshBuilder()
    for k in range(3):
        leaf_ribbon(b, Vector((0, 0, 0.01)), r.random() * math.tau, 0.12, 0.018, 0.4, GREEN_LO, C('#6f9640'))
    for k in range(3):
        a = k / 3 * math.tau + r.random()
        base = Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, 0))
        h = 0.3 + r.random() * 0.14
        top = base + Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, h))
        ph = r.random()
        stem(b, base, top, Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, 0)), 0.0035, C('#4d7230'), C('#6c8f3c'), ph)
        if k == 2:
            bud = [top, top + Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, -0.025))]
            tube(b, [bud[0], (bud[0] + bud[1]) / 2, bud[1]], [0.008, 0.012, 0.004], 4, lambda t, s: C('#6f8f3e'), phase=ph)
            continue
        face = UP + Vector((math.cos(a), math.sin(a), 0)) * 0.35
        bloom_disc(b, top, face, 4, 0.045, 0.036, 0.008, C('#b51e12'), C('#ec4024'), C('#2c2420'), cup=0.022, ph=ph)
    objs.append(b.build('Poppy', [plant], phase_attr=True))

    # Buttercups: small glossy-yellow cups, many on branching stems.
    r = rng(303)
    b = MeshBuilder()
    for k in range(3):
        leaf_ribbon(b, Vector((0, 0, 0.005)), r.random() * math.tau, 0.07, 0.016, 0.2, GREEN_LO, GREEN_HI)
    for k in range(5):
        a = k / 5 * math.tau + r.random()
        base = Vector((math.cos(a) * 0.035, math.sin(a) * 0.035, 0))
        h = 0.18 + r.random() * 0.14
        top = base + Vector((math.cos(a) * 0.04, math.sin(a) * 0.04, h))
        ph = r.random()
        stem(b, base, top, Vector((0, 0, 0)), 0.0028, GREEN_LO, GREEN_HI, ph)
        bloom_disc(b, top, UP + Vector((math.cos(a), math.sin(a), 0)) * 0.3, 5, 0.017, 0.014, 0.005,
                   C('#f2c21a'), C('#ffd93a'), C('#d79a12'), cup=0.008, ph=ph)
    objs.append(b.build('Buttercup', [plant], phase_attr=True))

    # Lavender: grey-green leaves and violet spikes of tiny bumps.
    r = rng(304)
    b = MeshBuilder()
    for k in range(7):
        leaf_ribbon(b, Vector((0, 0, 0.01)), r.random() * math.tau, 0.1, 0.006, 0.9, C('#5f7a5a'), C('#9cb391'), droop=0.4)
    for k in range(7):
        a = k / 7 * math.tau + r.random() * 0.5
        lean = 0.03 + r.random() * 0.05
        base = Vector((math.cos(a) * 0.02, math.sin(a) * 0.02, 0))
        h = 0.3 + r.random() * 0.12
        top = base + Vector((math.cos(a) * lean, math.sin(a) * lean, h))
        ph = r.random()
        stem(b, base, top, Vector((0, 0, 0)), 0.0025, C('#5a7350'), C('#7e9470'), ph)
        sd = (top - base).normalized()
        spike = [top + sd * (0.022 * i) for i in range(5)]
        tube(b, spike, [0.008, 0.011, 0.01, 0.009, 0.003], 3,
             lambda t, s: lerp(C('#5b3f9e'), C('#a184df'), t) if s != 1 else lerp(C('#4a3388'), C('#8f6fd0'), t),
             phase=ph, twist=0.9, normal_fn=lambda t, off: soft_normal(off, 0.5, 0.9))
    objs.append(b.build('Lavender', [plant], phase_attr=True))
    return objs


# ------------------------------------------------------------------ trees

def inset(rect, k: float = 0.03):
    """An atlas rectangle shrunk by `k` of its size on each side: low mipmaps then never blend in
    the neighbouring region (pale birch bark showed as bright fringes round leaf cards)."""
    u0, v0, u1, v1 = rect
    du, dv = (u1 - u0) * k, (v1 - v0) * k
    return (u0 + du, v0 + dv, u1 - du, v1 - dv)


def card(b: MeshBuilder, centre: Vector, normal: Vector, spin: float, w: float, h: float, rect, color,
         nrm_fn, flip: bool = False, mat: int = 0, bend: float = 0.0):
    """A leaf card (quad) facing `normal`, spun about it, UV-mapped to an atlas rectangle."""
    normal = normal.normalized()
    a = UP if abs(normal.dot(UP)) < 0.95 else Vector((1, 0, 0))
    u = normal.cross(a).normalized()
    v = normal.cross(u).normalized()
    cu = u * math.cos(spin) + v * math.sin(spin)
    cv = -u * math.sin(spin) + v * math.cos(spin)
    u0, v0, u1, v1 = inset(rect)
    if flip:
        u0, u1 = u1, u0
    corners = [(-1, -1, u0, v0), (1, -1, u1, v0), (1, 1, u1, v1), (-1, 1, u0, v1)]
    idx = []
    for sx, sy, uu, vv in corners:
        p = centre + cu * (sx * w / 2) + cv * (sy * h / 2) + normal * (bend * (sx * sx))
        idx.append(b.vert(p, 0.0, nrm_fn(p), color(p) if callable(color) else color, (uu, vv)))
    b.face(idx, mat=mat)


def build_broadleaf(name: str, seed: int, mats, height: float, trunk_h: float, crown_r: float, crown_h: float,
                    clusters: int, cards: int, card_size: tuple[float, float], leaf_rect, bark_rect,
                    leaf_lo, leaf_hi, bark_col, trunk_r: float, branches: int, lean: float = 0.2):
    r = rng(seed)
    b = MeshBuilder()
    # Trunk with a flared foot and a slight lean.
    lean_dir = Vector((math.cos(r.random() * math.tau), math.sin(r.random() * math.tau), 0))
    pts = []
    rad = []
    for i in range(7):
        t = i / 6
        z = trunk_h * t
        pts.append(Vector((0, 0, z)) + lean_dir * (lean * t * t))
        rad.append(trunk_r * (1.0 + 0.7 * (1 - smooth(0, 0.18, t)) - 0.35 * t))
    tube(b, pts, rad, 8, lambda t, s: mul(bark_col, 0.8 + 0.25 * t), mat=1, uv_rect=bark_rect,
         uv_repeat=(1.0, min(1.0, trunk_h / 3.2)))
    crown_c = Vector((0, 0, trunk_h + crown_h * 0.42)) + lean_dir * lean
    # Main limbs from the top of the trunk towards the crown's edge.
    limb_tips = []
    for k in range(branches):
        a = k / branches * math.tau + r.random() * 0.6
        start = pts[4 + (k % 2)]
        d = Vector((math.cos(a), math.sin(a), 0))
        tip = crown_c + d * crown_r * (0.55 + r.random() * 0.25) + UP * (crown_h * (r.random() * 0.4 - 0.05))
        mid = start.lerp(tip, 0.5) + UP * 0.25
        limb = [start, start.lerp(mid, 0.6), mid, tip]
        tube(b, limb, [trunk_r * 0.55, trunk_r * 0.42, trunk_r * 0.3, trunk_r * 0.12], 5,
             lambda t, s: mul(bark_col, 0.9), mat=1, uv_rect=bark_rect, uv_repeat=(0.6, 0.4))
        limb_tips.append(tip)
    # Leaf clusters: lumpy crown, denser on the outside, no two the same.
    centres = list(limb_tips)
    while len(centres) < clusters:
        th = r.random() * math.tau
        ph = math.acos(1 - 2 * r.random() * 0.92)
        rr = 0.55 + 0.45 * r.random() ** 0.5
        p = crown_c + Vector((math.sin(ph) * math.cos(th) * crown_r * rr,
                              math.sin(ph) * math.sin(th) * crown_r * rr,
                              math.cos(ph) * crown_h * 0.5 * rr))
        if all((p - q).length > crown_r * 0.42 for q in centres):
            centres.append(p)
        elif r.random() < 0.08:
            centres.append(p)
    scale = Vector((1 / crown_r, 1 / crown_r, 2 / crown_h))

    def crown_normal(p: Vector) -> Vector:
        q = p - crown_c
        q = Vector((q.x * scale.x, q.y * scale.y, q.z * scale.z))
        return (q.normalized() * 0.85 + UP * 0.35).normalized()

    def crown_color(p: Vector, tint):
        q = p - crown_c
        z = q.z / (crown_h * 0.5)
        out = min(1.0, Vector((q.x / crown_r, q.y / crown_r, z)).length)
        k = 0.5 + 0.38 * smooth(-0.9, 0.85, z) + 0.2 * smooth(0.45, 1.0, out)
        return mul(lerp(leaf_lo, leaf_hi, smooth(-0.6, 1.0, z)), k * tint)

    for ci, c in enumerate(centres):
        tint = 0.92 + r.random() * 0.16
        cr = crown_r * (0.36 + r.random() * 0.12)
        for k in range(cards):
            off = Vector((r.random() - 0.5, r.random() - 0.5, r.random() - 0.5)) * cr * 0.9
            p = c + off
            nrm = (Vector((r.random() - 0.5, r.random() - 0.5, r.random() - 0.5)) + (p - crown_c).normalized() * 0.6 + UP * 0.3)
            s = card_size[0] + r.random() * (card_size[1] - card_size[0])
            card(b, p, nrm, r.random() * math.tau, s, s, leaf_rect, lambda q, t=tint: crown_color(q, t), crown_normal,
                 flip=r.random() < 0.5, mat=0, bend=0.08 * s)
    return b.build(name, [mats['Leaf'], mats['Bark']])


def build_conifer(name: str, seed: int, mats, height: float, base_r: float, trunk_r: float, whorls: int,
                  per_whorl: int, droop: float, leaf_lo, leaf_hi, bark_col, first: float = 0.9, upturn: float = 0.0):
    r = rng(seed)
    b = MeshBuilder()
    pts = [Vector((0, 0, height * t)) for t in (0, 0.15, 0.4, 0.7, 1.0)]
    tube(b, pts, [trunk_r * 1.5, trunk_r, trunk_r * 0.75, trunk_r * 0.4, 0.015], 7,
         lambda t, s: mul(bark_col, 0.85 + 0.2 * t), mat=1, uv_rect=FLORA['bark'], uv_repeat=(1.0, 1.0))
    rect = inset(FLORA['needles'])

    def nrm(p: Vector) -> Vector:
        q = Vector((p.x, p.y, 0))
        return ((q.normalized() if q.length > 1e-4 else UP) * 0.8 + UP * 0.55).normalized()

    for w in range(whorls * 2):
        # Two staggered layers per whorl: boughs drooping out, and shorter ones held higher,
        # so the cone reads as a dense mass from any side.
        upper = w % 2 == 1
        t = (w // 2 + (0.5 if upper else 0)) / (whorls - 1)
        if t > 1:
            continue
        z = first + (height - 0.6 - first) * t
        L = (base_r * (1 - t) ** 0.85 + 0.4) * (0.78 if upper else 1.0)
        rot = r.random() * math.tau
        n = max(4, int(per_whorl - t * 2))
        dark = (0.6 + 0.4 * t) * (1.06 if upper else 1.0)
        for k in range(n):
            a = rot + k / n * math.tau + (r.random() - 0.5) * 0.45
            d = Vector((math.cos(a), math.sin(a), 0))
            perp = Vector((-d.y, d.x, 0))
            dz = -droop * (0.6 + r.random() * 0.5) * (1 - 0.4 * t) + (0.35 if upper else 0.0)
            root = Vector((0, 0, z)) + d * 0.05
            mid = root + d * (L * 0.55) + UP * (dz * L * 0.35)
            tip = root + d * L + UP * (dz * L + upturn * L)
            w0, w1, w2 = L * 0.3, L * 0.68, L * 0.5
            u0, v0, u1, v1 = rect
            um = (u0 + u1) / 2
            vm = v0 + (v1 - v0) * 0.55
            cl = lambda p, f: mul(lerp(leaf_lo, leaf_hi, f), dark)
            tilt = UP * 0.12
            idx = [
                b.vert(root - perp * w0 + tilt * 0, 0, nrm(root), cl(root, 0.0), (um - (u1 - u0) * 0.2, v0)),
                b.vert(root + perp * w0, 0, nrm(root), cl(root, 0.0), (um + (u1 - u0) * 0.2, v0)),
                b.vert(mid + perp * w1 + tilt * L * 0.1, 0, nrm(mid), cl(mid, 0.6), (u1, vm)),
                b.vert(mid - perp * w1 + tilt * L * 0.1, 0, nrm(mid), cl(mid, 0.6), (u0, vm)),
                b.vert(tip + perp * w2, 0, nrm(tip), cl(tip, 1.0), (um + (u1 - u0) * 0.38, v1)),
                b.vert(tip - perp * w2, 0, nrm(tip), cl(tip, 1.0), (um - (u1 - u0) * 0.38, v1)),
            ]
            b.face([idx[0], idx[1], idx[2], idx[3]])
            b.face([idx[3], idx[2], idx[4], idx[5]])
    # The leader: three crossed upright sprays at the top.
    top = height
    for a in (0.0, math.pi / 3, 2 * math.pi / 3):
        d = Vector((math.cos(a), math.sin(a), 0))
        u0, v0, u1, v1 = rect
        q = [b.vert(Vector((0, 0, top - 1.4)) - d * 0.55, 0, nrm(Vector((0, 0, 1))), mul(leaf_lo, 0.85), (u0, v0)),
             b.vert(Vector((0, 0, top - 1.4)) + d * 0.55, 0, nrm(Vector((0, 0, 1))), mul(leaf_lo, 0.85), (u1, v0)),
             b.vert(Vector((0, 0, top + 0.1)) + d * 0.3, 0, UP, leaf_hi, (u1, v1)),
             b.vert(Vector((0, 0, top + 0.1)) - d * 0.3, 0, UP, leaf_hi, (u0, v1))]
        b.face(q)
    return b.build(name, [mats['Leaf'], mats['Bark']])


def build_trees(mats):
    objs = []
    objs.append(build_broadleaf('Oak', 401, mats, 6.4, 2.3, 2.5, 3.6, 12, 6, (1.55, 2.1), FLORA['leaves'], FLORA['bark'],
                                C('#2f6a2c'), C('#78b04a'), C('#8a6e52'), 0.24, 5, lean=0.25))
    objs.append(build_broadleaf('Lime', 402, mats, 7.4, 2.9, 1.9, 4.2, 11, 6, (1.3, 1.75), FLORA['leaves2'],
                                FLORA['bark_birch'], C('#3b782c'), C('#86b84e'), C('#d8d4cc'), 0.12, 4, lean=0.15))
    objs.append(build_conifer('Spruce', 403, mats, 7.6, 1.7, 0.16, 11, 6, 0.45, C('#1f4a2e'), C('#5d9a52'), C('#6a5240')))
    objs.append(build_conifer('Fir', 404, mats, 8.2, 1.3, 0.14, 12, 5, 0.25, C('#183f2a'), C('#4f8c4a'), C('#5f4a3a'),
                              first=1.4, upturn=0.08))
    objs.append(build_broadleaf('Sapling', 405, mats, 2.6, 1.1, 0.9, 1.4, 4, 5, (0.8, 1.1), FLORA['leaves2'], FLORA['bark'],
                                C('#3f7c30'), C('#8cc052'), C('#7a6048'), 0.06, 3, lean=0.1))
    for name, seed, rad, hh, rect, lo, hi in (('ShrubA', 406, 0.9, 1.0, FLORA['leaves'], '#2c5f2a', '#6aa245'),
                                              ('ShrubB', 407, 1.1, 0.8, FLORA['leaves2'], '#3a6e2c', '#86b84e')):
        objs.append(build_broadleaf(name, seed, mats, hh, 0.12, rad, hh * 1.4, 5, 5, (0.85, 1.15), rect, FLORA['bark'],
                                    C(lo), C(hi), C('#6a5240'), 0.03, 3, lean=0.0))
    return objs


# ------------------------------------------------------------------ build

def build(atlas):
    sc = new_scene('Flora')
    mats = {
        'Plant': material('Plant', rough=0.82, double=True),
        'Leaf': material('Leaf', image=atlas, alpha_clip=0.5, double=True, rough=0.8),
        'Bark': material('Bark', image=atlas, rough=0.92),
    }
    rows = [build_wheat(mats) + [build_stook(mats)], build_grass(mats), build_flowers(mats), build_trees(mats)]
    for i, row in enumerate(rows):
        layout_row(row, gap=0.6 if i < 3 else 1.5, y=i * 4.0 if i < 3 else 16.0)
    objs = [o for row in rows for o in row]
    export_glb(objs, 'flora.glb')
    save_blend(sc, 'flora.blend')
    return stats(objs)
