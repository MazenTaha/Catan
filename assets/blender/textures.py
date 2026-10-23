"""Locally generated textures (numpy, fixed seeds): no downloaded art.

- flora atlas (1024): broadleaf leaf clusters, conifer needle sprays, bark, with alpha
- rock (512): tiling stone grain
- village atlas (1024): plaster, timber, stone courses, roof tiles, thatch, planks, sailcloth
- ground detail + normal maps (512, tiling): grass, soil, sand, rock, used directly by the game

Atlas layouts are mirrored by constants in the model scripts (UV rectangles).
"""

from __future__ import annotations

import math
import os

import numpy as np

from common import TEXTURES, TEXTURES_OUT, image_from_array, normal_map, spectral_noise, voronoi

# UV rectangles (u0, v0, u1, v1) with v measured from the BOTTOM, as Blender UVs are.
FLORA = {
    'leaves': (0.0, 0.5, 0.5, 1.0),
    'leaves2': (0.5, 0.5, 1.0, 1.0),
    'needles': (0.0, 0.0, 0.5, 0.5),
    'bark': (0.5, 0.0, 0.75, 0.5),
    'bark_birch': (0.75, 0.0, 1.0, 0.5),
}

VILLAGE = {
    'plaster': (0.0, 0.75, 0.25, 1.0),
    'timber': (0.25, 0.75, 0.5, 1.0),
    'stone': (0.5, 0.75, 0.75, 1.0),
    'cobble': (0.75, 0.75, 1.0, 1.0),
    'tiles': (0.0, 0.5, 0.25, 0.75),
    'thatch': (0.25, 0.5, 0.5, 0.75),
    'planks': (0.5, 0.5, 0.75, 0.75),
    'cloth': (0.75, 0.5, 1.0, 0.75),
    'door': (0.0, 0.25, 0.125, 0.5),
    'window': (0.125, 0.25, 0.25, 0.5),
    'slate': (0.25, 0.25, 0.5, 0.5),
    'wool': (0.5, 0.25, 0.75, 0.5),
    'iron': (0.75, 0.25, 1.0, 0.5),
    'white': (0.0, 0.0, 0.25, 0.25),
}


def _over(dst: np.ndarray, src_rgb: np.ndarray, src_a: np.ndarray, y0: int, x0: int):
    """Alpha-composites a patch onto dst (premultiplied over)."""
    h, w = src_a.shape
    H, W = dst.shape[:2]
    ys, xs = max(0, y0), max(0, x0)
    ye, xe = min(H, y0 + h), min(W, x0 + w)
    if ys >= ye or xs >= xe:
        return
    sa = src_a[ys - y0:ye - y0, xs - x0:xe - x0, None]
    sc = src_rgb[ys - y0:ye - y0, xs - x0:xe - x0]
    d = dst[ys:ye, xs:xe]
    da = d[..., 3:4]
    out_a = sa + da * (1 - sa)
    d[..., :3] = (sc * sa + d[..., :3] * da * (1 - sa)) / np.maximum(out_a, 1e-6)
    d[..., 3:4] = out_a


def _leaf(length: float, width: float, angle: float, tone: np.ndarray, rnd: np.random.Generator):
    """One leaf as an RGB patch + alpha: pointed ellipse, lit midrib, darker rim, a vein."""
    r = int(length * 0.6 + 3)
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1].astype(np.float32)
    ca, sa = math.cos(angle), math.sin(angle)
    u = (xx * ca + yy * sa) / length + 0.5  # 0 at the stalk, 1 at the tip
    v = (-xx * sa + yy * ca) / width
    prof = np.clip(np.sin(np.clip(u, 0, 1) * math.pi), 0, 1) ** 0.75 * (1 - 0.35 * np.clip(u, 0, 1))
    edge = prof - np.abs(v)
    a = np.clip(edge * width * 0.9, 0, 1) * ((u > 0) & (u < 1))
    side = np.sign(v)
    # Soft modelling: a lit half and a shaded half either side of the midrib, no dark rim.
    shade = 0.9 + 0.1 * (1 - np.abs(v) / np.maximum(prof, 1e-3)) + 0.05 * side + 0.05 * (1 - u)
    vein = np.exp(-(v * width / 0.9) ** 2) * (u > 0.05) * (u < 0.9)
    rgb = tone[None, None, :] * shade[..., None]
    rgb = rgb * (1 - 0.08 * vein[..., None]) + 0.08 * vein[..., None] * np.array([0.9, 0.95, 0.7])
    rgb *= 0.94 + 0.06 * rnd.random()
    return np.clip(rgb, 0, 1), a


def leaf_cluster(size: int, seed: int, palette, count: int, leaf_len: tuple[float, float]) -> np.ndarray:
    """A loose, ragged cluster of leaves filling a card (transparent around the outside)."""
    rnd = np.random.default_rng(seed)
    img = np.zeros((size, size, 4), np.float32)
    c = size / 2
    # A shaded inner mass first: the depth of the clump, seen through gaps between leaves.
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    ang = np.arctan2(yy - c, xx - c)
    rad = np.hypot(xx - c, yy - c) / (size * 0.5)
    rim = 0.62 + 0.08 * np.sin(ang * 5 + seed) + 0.05 * np.sin(ang * 11 + seed * 2)
    inner = np.clip((rim - rad) * 12, 0, 1)
    dark = np.array(palette[0], np.float32) * 0.5
    img[..., :3] = dark
    img[..., 3] = inner
    # Twigs next, so leaves cover them.
    for k in range(7):
        ang = rnd.random() * math.tau
        ln = size * (0.2 + rnd.random() * 0.22)
        for t in np.linspace(0, 1, int(ln)):
            x = int(c + math.cos(ang) * ln * t)
            y = int(c + math.sin(ang) * ln * t + size * 0.1)
            w = max(1, int(3 * (1 - t)))
            img[max(0, y - w):y + w, max(0, x - w):x + w] = (0.32, 0.24, 0.14, 1)
    for i in range(count):
        # Denser in the middle, a ragged rim; leaves point outward from the centre.
        rr = (rnd.random() ** 0.65) * size * 0.43
        th = rnd.random() * math.tau
        x = c + math.cos(th) * rr
        y = c + math.sin(th) * rr * 0.92
        L = rnd.uniform(*leaf_len) * size
        W = L * rnd.uniform(0.26, 0.36)
        angle = th + rnd.normal(0, 0.6)
        tone = np.array(palette[rnd.integers(len(palette))], np.float32)
        # Leaves at the back are darker: drawn first.
        tone = tone * (0.72 + 0.32 * (i / count))
        rgb, a = _leaf(L, W, angle, tone, rnd)
        h = a.shape[0] // 2
        _over(img, rgb, a, int(y) - h, int(x) - h)
    return img


def needle_spray(size: int, seed: int) -> np.ndarray:
    """A drooping conifer bough: a main twig with side twigs, each fringed with needles."""
    rnd = np.random.default_rng(seed)
    img = np.zeros((size, size, 4), np.float32)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)

    def line(x0, y0, x1, y1, w, col, a=1.0):
        x_min, x_max = int(max(0, min(x0, x1) - w - 2)), int(min(size, max(x0, x1) + w + 2))
        y_min, y_max = int(max(0, min(y0, y1) - w - 2)), int(min(size, max(y0, y1) + w + 2))
        if x_min >= x_max or y_min >= y_max:
            return
        X = xx[y_min:y_max, x_min:x_max]
        Y = yy[y_min:y_max, x_min:x_max]
        vx, vy = x1 - x0, y1 - y0
        l2 = vx * vx + vy * vy + 1e-6
        t = np.clip(((X - x0) * vx + (Y - y0) * vy) / l2, 0, 1)
        d = np.hypot(X - (x0 + vx * t), Y - (y0 + vy * t))
        al = np.clip(w - d + 0.5, 0, 1) * a
        rgb = np.broadcast_to(np.array(col, np.float32), al.shape + (3,))
        _over(img, rgb, al, y_min, x_min)

    greens = [(0.36, 0.56, 0.36), (0.30, 0.50, 0.33), (0.42, 0.62, 0.40), (0.26, 0.44, 0.30)]
    # Main twig from the bottom centre up to the top, curving.
    pts = []
    for t in np.linspace(0, 1, 40):
        pts.append((size * 0.5 + math.sin(t * 2.4) * size * 0.06, size * (0.98 - 0.92 * t)))
    sides = []
    for i in range(len(pts) - 1):
        line(*pts[i], *pts[i + 1], 2.2 * (1 - i / 60), (0.38, 0.28, 0.17))
        if i % 2 == 1 and i < 37:
            for s in (-1, 1):
                L = size * (0.44 - 0.34 * i / 40) * rnd.uniform(0.85, 1.1)
                ang = math.radians(-90 + s * rnd.uniform(52, 66))
                x1 = pts[i][0] + math.cos(ang) * L
                y1 = pts[i][1] + math.sin(ang) * L
                sides.append((pts[i][0], pts[i][1], x1, y1))
                line(pts[i][0], pts[i][1], x1, y1, 1.4, (0.36, 0.27, 0.17))
    # Needles along every twig, angled forward.
    twigs = sides + [(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) for i in range(0, len(pts) - 1)]
    for (x0, y0, x1, y1) in twigs:
        L = math.hypot(x1 - x0, y1 - y0)
        n = int(L / 1.8)
        ang = math.atan2(y1 - y0, x1 - x0)
        for k in range(n):
            t = k / max(1, n)
            px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for s in (-1, 1):
                a2 = ang + s * rnd.uniform(0.5, 1.05)
                nl = size * rnd.uniform(0.045, 0.07) * (1 - 0.35 * t)
                col = greens[rnd.integers(len(greens))]
                col = tuple(c * (0.85 + 0.25 * t) for c in col)
                line(px, py, px + math.cos(a2) * nl, py + math.sin(a2) * nl, 1.05, col)
    return img


def bark(w: int, h: int, seed: int, birch: bool = False) -> np.ndarray:
    """Vertical ridged bark (or pale birch with dark lenticels); tiles vertically."""
    n1 = spectral_noise(max(w, h), 1.6, seed)[:h, :w]
    n2 = spectral_noise(max(w, h), 1.1, seed + 1)[:h, :w]
    x = np.linspace(0, 1, w, endpoint=False)[None, :]
    y = np.linspace(0, 1, h, endpoint=False)[:, None]
    out = np.ones((h, w, 4), np.float32)
    if birch:
        base = np.array([0.93, 0.91, 0.86])
        marks = (np.sin((y * 34 + n1 * 2.5) * math.tau) > 0.86) * (np.abs(n2) > 0.25)
        v = 0.92 + 0.08 * n1
        out[..., :3] = base * v[..., None]
        out[..., :3] = np.where(marks[..., None], np.array([0.18, 0.16, 0.14]), out[..., :3])
    else:
        ridges = np.abs(np.sin((x * 9 + n1 * 0.7 + n2 * 0.15) * math.pi))
        v = 0.55 + 0.45 * ridges ** 0.6 + 0.1 * n2
        base = np.array([0.52, 0.40, 0.29])
        out[..., :3] = np.clip(base * v[..., None] * 1.25, 0, 1)
    return out


def _rect(img: np.ndarray, rect, tile: np.ndarray):
    """Writes `tile` into the atlas rectangle (UVs, v from the bottom)."""
    H, W = img.shape[:2]
    u0, v0, u1, v1 = rect
    x0, x1 = int(u0 * W), int(u1 * W)
    y0, y1 = int((1 - v1) * H), int((1 - v0) * H)
    th, tw = y1 - y0, x1 - x0
    t = tile
    if t.shape[0] != th or t.shape[1] != tw:
        ys = (np.arange(th) * t.shape[0] / th).astype(int)
        xs = (np.arange(tw) * t.shape[1] / tw).astype(int)
        t = t[ys][:, xs]
    img[y0:y1, x0:x1] = t


def flora_atlas():
    S = 1024
    img = np.zeros((S, S, 4), np.float32)
    # Leaves are painted light and only gently green: vertex colours give each tree its hue.
    oak = [(0.62, 0.78, 0.42), (0.55, 0.72, 0.38), (0.70, 0.84, 0.48), (0.50, 0.66, 0.36)]
    lime = [(0.72, 0.86, 0.46), (0.64, 0.80, 0.40), (0.78, 0.90, 0.52), (0.58, 0.74, 0.36)]
    _rect(img, FLORA['leaves'], leaf_cluster(512, 11, oak, 300, (0.1, 0.15)))
    _rect(img, FLORA['leaves2'], leaf_cluster(512, 23, lime, 360, (0.085, 0.12)))
    _rect(img, FLORA['needles'], needle_spray(512, 31))
    _rect(img, FLORA['bark'], bark(256, 512, 41))
    _rect(img, FLORA['bark_birch'], bark(256, 512, 43, birch=True))
    # Bleed colour into transparent texels so mipmaps don't darken leaf edges.
    rgb = img[..., :3].copy()
    a = img[..., 3]
    for _ in range(6):
        blur = (np.roll(rgb, 1, 0) + np.roll(rgb, -1, 0) + np.roll(rgb, 1, 1) + np.roll(rgb, -1, 1)) / 4
        rgb = np.where(a[..., None] > 0.02, img[..., :3], blur)
    img[..., :3] = rgb
    return image_from_array('flora_atlas', img, os.path.join(TEXTURES, 'flora_atlas.png'))


def rock_texture():
    S = 512
    n = spectral_noise(S, 1.9, 101)
    f1, f2, cid = voronoi(S, 4, 102)
    # Only a few thin, broken cracks: they read as fractures, not a pattern of cells.
    crack_noise = spectral_noise(S, 1.5, 105)
    cracks = np.clip((f2 - f1) * 14 + np.clip(crack_noise * 3 + 0.4, 0, 1), 0, 1)
    grain = spectral_noise(S, 0.6, 103)
    speck = spectral_noise(S, 0.15, 106)
    v = 0.86 + 0.09 * n + 0.05 * grain + 0.03 * speck - 0.16 * (1 - cracks) ** 4 + 0.03 * (cid - 0.5)
    img = np.ones((S, S, 4), np.float32)
    tint = np.stack([v * 1.0, v * 0.99, v * 0.97], -1)
    # Faint lichen and iron stains.
    lichen = np.clip(spectral_noise(S, 1.4, 104) * 2 - 0.9, 0, 1)
    tint = tint * (1 - 0.25 * lichen[..., None]) + 0.25 * lichen[..., None] * np.array([0.80, 0.84, 0.60])
    img[..., :3] = np.clip(tint, 0, 1)
    return image_from_array('rock_tex', img, os.path.join(TEXTURES, 'rock.png'))


def _tile_pattern(w, h, rows, cols, seed, mortar=0.06, stagger=True, base=(0.9, 0.9, 0.9), jitter=0.08, bevel=0.25):
    rnd = np.random.default_rng(seed)
    y = np.linspace(0, rows, h, endpoint=False)[:, None] * np.ones((1, w))
    x = np.linspace(0, cols, w, endpoint=False)[None, :] * np.ones((h, 1))
    row = np.floor(y)
    xs = x + (row % 2) * 0.5 * stagger
    fx = xs - np.floor(xs)
    fy = y - row
    cell = (np.floor(xs) % cols) + row * cols
    tones = 1 + (rnd.random(int(rows * cols) + cols + 2) - 0.5) * 2 * jitter
    t = tones[cell.astype(int)]
    edge = np.minimum(np.minimum(fx, 1 - fx) * 1.0, np.minimum(fy, 1 - fy) * (cols / rows) * (h / w) * (w / h))
    m = np.clip((edge - mortar) / bevel, 0, 1)
    v = t * (0.55 + 0.45 * m ** 0.5)
    out = np.ones((h, w, 4), np.float32)
    out[..., :3] = np.array(base) * v[..., None]
    return out, fx, fy


def masonry(w: int, h: int, rows: int, seed: int, widths=(0.12, 0.3), mortar=1.6, base=(0.9, 0.88, 0.84),
            jitter=0.16, round_px=5.0, rows_jitter=0.25) -> np.ndarray:
    """Hand-laid courses: stones of random widths per row (wrapping, so it tiles), each with its
    own tone and surface noise, softly rounded corners and recessed mortar."""
    rnd = np.random.default_rng(seed)
    surf = spectral_noise(max(w, h), 1.2, seed + 1)[:h, :w]
    big = spectral_noise(max(w, h), 2.0, seed + 2)[:h, :w]
    out = np.ones((h, w, 4), np.float32)
    lum = np.full((h, w), 0.68, np.float32)  # mortar, recessed but not black
    warmth = np.zeros((h, w), np.float32)
    # Row boundaries with slightly uneven heights.
    hs = np.array([1 + (rnd.random() - 0.5) * 2 * rows_jitter for _ in range(rows)])
    edges = np.concatenate([[0], np.cumsum(hs) / hs.sum() * h]).astype(int)
    xx = np.arange(w)[None, :].astype(np.float32)
    for r in range(rows):
        y0, y1 = edges[r], edges[r + 1]
        if y1 <= y0:
            continue
        yy = np.arange(y0, y1)[:, None].astype(np.float32)
        x = rnd.random() * w
        start = x
        while x < start + w:
            sw = rnd.uniform(*widths) * w
            x0, x1 = x, x + sw
            # Distance to the stone's own rectangle edges, wrapping horizontally.
            dx = np.minimum((xx - x0) % w, (x1 - xx) % w)
            inside = ((xx - x0) % w) < sw
            dy = np.minimum(yy - y0, y1 - 1 - yy)
            d = np.minimum(np.where(inside, dx, -1), dy)
            k = np.clip((d - mortar) / round_px, 0, 1)
            tone = 1 + (rnd.random() - 0.5) * 2 * jitter
            face = (0.78 + 0.22 * np.sqrt(k)) * tone
            region = lum[y0:y1]
            stone = inside & (d > mortar)
            lum[y0:y1] = np.where(stone, face, region)
            warmth[y0:y1] = np.where(stone, rnd.random() - 0.5, warmth[y0:y1])
            x = x1
    lum = lum * (0.92 + 0.08 * surf) + 0.05 * big
    col = np.array(base)[None, None, :] * lum[..., None]
    # Some stones warmer (sandstone), some cooler (grey): a quarried mix, not printed bricks.
    col = col * (1 + warmth[..., None] * np.array([0.12, 0.03, -0.1]))
    out[..., :3] = np.clip(col, 0, 1)
    return out


def shingles(w: int, h: int, rows: int, seed: int) -> np.ndarray:
    """Overlapping roof tiles with rounded lower edges, a shadow under each course and a light
    catch along each lip. Light grey: the owner's colour multiplies it."""
    rnd = np.random.default_rng(seed)
    noise = spectral_noise(max(w, h), 1.1, seed + 1)[:h, :w]
    yy = np.arange(h)[:, None] / h * rows
    xx = np.arange(w)[None, :] / w
    out = np.ones((h, w, 4), np.float32)
    lum = np.zeros((h, w), np.float32)
    row = np.floor(yy)
    fy = yy - row  # 0 at the top of a course, 1 at its lower edge
    cols = 7
    shift = (row % 2) * 0.5
    u = (xx * cols + shift) % 1
    cell = np.floor(xx * cols + shift) % cols + row * cols
    tones = 1 + (rnd.random(int(rows * cols) + cols) - 0.5) * 0.14
    # The rounded lower edge: the tile ends where fy passes a curve across its width.
    curve = 0.82 + 0.16 * np.sqrt(np.clip(1 - (2 * u - 1) ** 2, 0, 1))
    tile = fy < curve
    gap = (u < 0.04) | (u > 0.96)
    shade = 0.72 + 0.28 * fy  # covered top half darker, lip lit
    lip = np.exp(-((curve - fy) * 18) ** 2)
    lum = np.where(tile & ~gap, shade * tones[cell.astype(int)] + 0.12 * lip, 0.42)
    lum = lum * (0.95 + 0.05 * noise)
    out[..., :3] = np.clip(np.stack([lum, lum, lum], -1) * 0.95, 0, 1)
    return out


def thatch(w: int, h: int, seed: int) -> np.ndarray:
    """Straw laid in courses down the roof: strands along v, ragged course ends."""
    rnd = np.random.default_rng(seed)
    n = spectral_noise(max(w, h), 1.4, seed)[:h, :w]
    xx = np.arange(w)[None, :] / w
    yy = np.arange(h)[:, None] / h
    strands = np.zeros((h, w), np.float32)
    for k in range(3):
        f = 60 + 40 * k
        ph = rnd.random() * 10
        strands += (np.sin((xx * f + n * (1.5 + k) + ph + yy * 3) * math.pi) * 0.5 + 0.5) ** 2 / 3
    course = (yy * 5 + 0.08 * np.sin(xx * 40) + 0.05 * n) % 1
    ends = np.clip((course - 0.86) * 8, 0, 1)
    lum = 0.74 + 0.26 * strands - 0.3 * ends + 0.04 * n
    out = np.ones((h, w, 4), np.float32)
    out[..., :3] = np.stack([lum, lum * 0.86, lum * 0.6], -1)
    return np.clip(out, 0, 1)


def planks(w: int, h: int, boards: int, seed: int) -> np.ndarray:
    """Weathered boards along u with grain, knots and dark seams."""
    rnd = np.random.default_rng(seed)
    n = spectral_noise(max(w, h), 1.3, seed)[:h, :w]
    xx = np.arange(w)[None, :] / w
    yy = np.arange(h)[:, None] / h * boards
    b = np.floor(yy)
    fy = yy - b
    tones = 0.88 + rnd.random(boards + 1) * 0.2
    grain = np.sin((fy * 7 + xx * 2 + n * 2.5 + b * 1.7) * math.pi) * 0.5 + 0.5
    seam = np.clip(np.minimum(fy, 1 - fy) * 14, 0, 1)
    lum = tones[b.astype(int)] * (0.82 + 0.18 * grain) * (0.45 + 0.55 * seam)
    out = np.ones((h, w, 4), np.float32)
    out[..., :3] = np.stack([lum, lum * 0.9, lum * 0.78], -1)
    return np.clip(out, 0, 1)


def village_atlas():
    S = 1024
    T = S // 4
    img = np.ones((S, S, 4), np.float32)
    nz = spectral_noise(T, 1.5, 201)
    nz2 = spectral_noise(T, 0.8, 202)
    # Plaster: warm limewash, faint stains, lighter patches.
    pl = np.ones((T, T, 4), np.float32)
    pv = 0.95 + 0.04 * nz + 0.02 * nz2
    pl[..., :3] = np.stack([pv, pv * 0.97, pv * 0.9], -1)
    _rect(img, VILLAGE['plaster'], pl)
    # Timber: oak beam grain along u.
    tb = np.ones((T, T, 4), np.float32)
    yy = np.linspace(0, 1, T)[:, None]
    g = np.sin((yy * 40 + nz * 1.8) * math.pi) * 0.5 + 0.5
    tv = 0.75 + 0.2 * g ** 2 + 0.06 * nz2
    tb[..., :3] = np.stack([tv, tv * 0.92, tv * 0.84], -1)
    _rect(img, VILLAGE['timber'], tb)
    xx = np.linspace(0, 1, T)[None, :]
    # Stone courses: hand-laid, uneven.
    _rect(img, VILLAGE['stone'], masonry(T, T, 7, 203, widths=(0.14, 0.32), base=(0.93, 0.91, 0.87)))
    _rect(img, VILLAGE['cobble'], masonry(T, T, 9, 204, widths=(0.08, 0.16), mortar=3.0, round_px=7, base=(0.9, 0.88, 0.84), jitter=0.16))
    # Roof tiles: light grey (owner colour multiplies).
    _rect(img, VILLAGE['tiles'], shingles(T, T, 9, 205))
    _rect(img, VILLAGE['thatch'], thatch(T, T, 210))
    _rect(img, VILLAGE['planks'], planks(T, T, 6, 206))
    cl = np.ones((T, T, 4), np.float32)
    weave = 0.96 + 0.02 * np.sin(xx * T * 1.2) * np.sin(yy * T * 1.2) + 0.03 * nz
    cl[..., :3] = weave[..., None]
    _rect(img, VILLAGE['cloth'], cl)
    # Door: vertical boards with iron straps.
    dw = T // 2
    door, fx, fy = _tile_pattern(dw, T, 1, 4, 207, mortar=0.05, stagger=False, base=(0.62, 0.42, 0.25), jitter=0.08)
    yyd = np.linspace(0, 1, T)[:, None]
    straps = ((np.abs(yyd - 0.25) < 0.025) | (np.abs(yyd - 0.75) < 0.025)) * np.ones((1, dw))
    door[..., :3] = np.where(straps[..., None] > 0, np.array([0.22, 0.2, 0.2]), door[..., :3])
    _rect(img, VILLAGE['door'], door)
    # Window: leaded glass panes (warm dark) in a timber frame.
    win = np.ones((T, dw, 4), np.float32)
    wy = np.linspace(0, 1, T)[:, None]
    wx = np.linspace(0, 1, dw)[None, :]
    frame = (wx < 0.1) | (wx > 0.9) | (wy < 0.07) | (wy > 0.93) | (np.abs(wx - 0.5) < 0.04) | (np.abs(wy - 0.5) < 0.03)
    lead = (np.abs(((wx * 4 + wy * 4) % 1) - 0.5) < 0.04) | (np.abs(((wx * 4 - wy * 4) % 1) - 0.5) < 0.04)
    glass = np.stack([0.24 + 0.1 * wy, 0.3 + 0.1 * wy, 0.34 + 0.08 * wy], -1) * np.ones((1, dw, 1))
    win[..., :3] = np.where(frame[..., None], np.array([0.5, 0.36, 0.22]), np.where(lead[..., None], np.array([0.12, 0.12, 0.13]), glass))
    _rect(img, VILLAGE['window'], win)
    # Slate (for the city's stone roofs).
    sl, _, _ = _tile_pattern(T, T, 10, 7, 208, mortar=0.03, base=(0.62, 0.66, 0.70), jitter=0.08, bevel=0.12)
    _rect(img, VILLAGE['slate'], sl)
    # Wool: curly fleece.
    wo = np.ones((T, T, 4), np.float32)
    f1, f2, _ = voronoi(T, 22, 209)
    curl = np.clip(f1 * 1.2, 0, 1)
    fine = spectral_noise(T, 0.7, 211)
    wv = 0.97 - 0.07 * curl ** 2 + 0.03 * nz + 0.03 * fine
    wo[..., :3] = np.stack([wv, wv * 0.98, wv * 0.94], -1)
    _rect(img, VILLAGE['wool'], wo)
    ir = np.ones((T, T, 4), np.float32)
    iv = 0.8 + 0.12 * nz
    ir[..., :3] = iv[..., None]
    _rect(img, VILLAGE['iron'], ir)
    _rect(img, VILLAGE['white'], np.ones((T, T, 4), np.float32))
    return image_from_array('village_atlas', img, os.path.join(TEXTURES, 'village_atlas.png'))


def ground_textures():
    """Tiling detail (values around 0.85-0.95, gently tinted) and normal maps for the game's
    ground. The ground's vertex colours carry the hue; these carry blades, crumbs and grain."""
    S = 512
    out = {}

    def save(name, rgb, height, strength):
        img = np.ones((S, S, 4), np.float32)
        img[..., :3] = np.clip(rgb, 0, 1)
        image_from_array(f'ground_{name}', img, os.path.join(TEXTURES_OUT, f'ground-{name}.jpg'), quality=88)
        image_from_array(f'ground_{name}_n', normal_map(height, strength), os.path.join(TEXTURES_OUT, f'ground-{name}-n.jpg'),
                         'Non-Color', quality=92)
        out[name] = True

    rnd = np.random.default_rng(300)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)

    # Grass: a dense mat of short blades in many directions, lighter tips, darker soil gaps.
    h = np.zeros((S, S), np.float32)
    col = np.zeros((S, S), np.float32)
    big = spectral_noise(S, 2.0, 301)
    for i in range(16000):
        x0, y0 = rnd.random() * S, rnd.random() * S
        ang = -math.pi / 2 + rnd.normal(0, 0.55)
        L = rnd.uniform(5, 12)
        steps = int(L)
        for k in range(steps):
            t = k / steps
            x = int(x0 + math.cos(ang) * k) % S
            y = int(y0 + math.sin(ang) * k) % S
            v = 0.45 + 0.55 * t
            if v > h[y, x]:
                h[y, x] = v
                col[y, x] = t
    blur = (h + np.roll(h, 1, 0) + np.roll(h, 1, 1) + np.roll(h, -1, 0) + np.roll(h, -1, 1)) / 5
    lum = 0.74 + 0.24 * blur + 0.05 * big
    rgb = np.stack([lum * (0.97 + 0.06 * col), lum * (1.0 + 0.02 * col), lum * (0.9 - 0.04 * col)], -1)
    save('grass', rgb, blur * 1.0 + big * 0.3, 2.5)

    # Soil: crumbs and clods, with a few pebbles.
    f1, f2, cid = voronoi(S, 22, 302)
    clods = np.clip(1 - f1 * 1.3, 0, 1)
    fine = spectral_noise(S, 0.9, 303)
    big = spectral_noise(S, 1.8, 304)
    hgt = clods * 0.6 + fine * 0.25 + big * 0.3
    lum = 0.8 + 0.1 * clods + 0.06 * fine + 0.05 * big
    rgb = np.stack([lum, lum * 0.97, lum * 0.93], -1)
    save('soil', rgb, hgt, 3.0)

    # Sand: wind ripples and fine grain.
    n = spectral_noise(S, 1.6, 305)
    ripples = np.sin((yy / S * 22 + n * 1.6) * math.tau) * 0.5 + 0.5
    grain = spectral_noise(S, 0.3, 306)
    hgt = ripples ** 1.5 * 0.7 + grain * 0.15
    lum = 0.88 + 0.06 * ripples + 0.05 * grain
    rgb = np.stack([lum, lum * 0.98, lum * 0.94], -1)
    save('sand', rgb, hgt, 2.0)

    # Rock ground: scree - angular gravel of mixed sizes over packed grit, no paving pattern.
    f1, f2, cid = voronoi(S, 26, 307)
    stones = np.clip(1 - f1 * 1.15, 0, 1) ** 0.7
    g1, g2, gid = voronoi(S, 60, 310)
    gravel = np.clip(1 - g1 * 1.3, 0, 1) ** 0.8
    n = spectral_noise(S, 1.7, 308)
    grit = spectral_noise(S, 0.4, 309)
    hgt = stones * 0.6 * (cid > 0.35) + gravel * 0.35 + n * 0.3 + grit * 0.1
    lum = 0.8 + 0.08 * stones * (cid - 0.3) + 0.05 * gravel * (gid - 0.5) + 0.06 * n + 0.04 * grit
    rgb = np.stack([lum, lum * 1.0, lum * 1.01], -1)
    save('rock', rgb, hgt, 2.2)
    return out


def build():
    return {
        'flora': flora_atlas().name,
        'rock': rock_texture().name,
        'village': village_atlas().name,
        'ground': ground_textures(),
    }
