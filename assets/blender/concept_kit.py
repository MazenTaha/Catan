"""Reusable village, harbour and room components from the owner's 24 concept sheets.

Metres, Z up, front -Y. No picture is pasted onto a 3D object: geometry is authored here.
Doors are separate hinge children. The original sheets and hashes are in assets/concepts/.
"""

import math
from mathutils import Vector

from common import export_glb, layout_row, new_scene, save_blend, srgb, stats
from props import Kit, T, cube, cyl, ico, lathe, prism, torus, mats
from props import M_WOOD, M_STONE, M_METAL, M_BRASS, M_CLOTH, M_LEAF

C = srgb
WOOD, TRIM, PLASTER = C('#a77343'), C('#694126'), C('#eedcba')
STONE, MORTAR, ROOF = C('#a4a08b'), C('#777368'), C('#b95432')
IRON, BRASS, CREAM, GREEN = C('#4a5056'), C('#c99a50'), C('#eddfbd'), C('#57733e')
RED, BLUE, GOLD = C('#a33e30'), C('#3b6181'), C('#b4782f')


def box(k, p, size, color=WOOD, mat=M_WOOD, bevel=0.025):
    k.add(cube(*size, bevel=bevel), T(p), color, mat)


def pole(k, p, radius, height, color=TRIM, mat=M_WOOD):
    k.add(cyl(radius, radius * 0.95, height, 10), T(p), color, mat)


def beam(k, a, b, width=0.12, depth=None, color=TRIM, mat=M_WOOD):
    a, b = Vector(a), Vector(b)
    rotation = (b - a).to_track_quat('Z', 'Y').to_matrix().to_4x4()
    from mathutils import Matrix
    k.add(cube(width, depth or width, (b - a).length, bevel=width * 0.12),
          Matrix.Translation(a) @ rotation, color, mat)


def roof(k, w, d, eave, peak, color=ROOF, thatch=False):
    """Front gable, shaped tile courses and timber verges; ridge runs toward the back."""
    half = w / 2 + 0.35
    front, back = -d / 2 - 0.38, d / 2 + 0.38
    for sign in (-1, 1):
        pts = [(0, front, peak), (sign * half, front, eave),
               (sign * half, back, eave), (0, back, peak)]
        if sign < 0:
            pts.reverse()
        k.b.poly(pts, color, mat=M_STONE if not thatch else M_CLOTH, smooth=False)
        rows = max(5, round(math.hypot(half, peak - eave) / 0.35))
        tiles = max(6, round((back - front) / (0.34 if not thatch else 0.5)))
        for row in range(rows):
            u = (row + 0.5) / rows
            x, z = sign * half * u, peak + (eave - peak) * u + 0.04
            angle = sign * math.atan2(peak - eave, half)
            for tile in range(tiles):
                y = front + (tile + 0.5 + 0.22 * (row % 2)) * (back - front) / tiles
                tint = tuple(v * (0.9 + 0.16 * k.r.random()) for v in color)
                k.add(cube(0.43, (back - front) / tiles * 0.98, 0.10 if not thatch else 0.16,
                           bevel=0.045), T((x, y, z), (0, angle, 0)), tint,
                      M_STONE if not thatch else M_CLOTH)
        beam(k, (sign * half, front - 0.025, eave - 0.03), (0, front - 0.025, peak + 0.05), 0.16, 0.16)
        beam(k, (sign * half, back, eave - 0.03), (0, back, peak + 0.05), 0.14, 0.14)
        beam(k, (sign * half, front, eave), (sign * half, back, eave), 0.16, 0.16)
    beam(k, (0, front - 0.08, peak + 0.08), (0, back + 0.08, peak + 0.08), 0.25, 0.25, color)


def planter(k, x, y, z, width=0.85):
    box(k, (x, y, z), (width, 0.28, 0.22), WOOD)
    for i in range(7):
        p = (x + (i / 6 - 0.5) * width * 0.85, y - 0.02, z + 0.28)
        k.add(ico(0.15, 1, (1, 0.8, 0.8)), T(p), C('#66863d'), M_LEAF)
        if i % 2 == 0:
            k.add(ico(0.06, 1), T((p[0], p[1] - 0.08, p[2] + 0.09)), C('#c85135'), M_CLOTH)


def window(k, x, y, z, owner, width=0.8, height=1.0):
    box(k, (x, y, z), (width, 0.09, height), C('#78a4ac'), M_STONE, 0.015)
    for dx in (-width / 2 - 0.06, 0, width / 2 + 0.06):
        box(k, (x + dx, y - 0.065, z - 0.06), (0.09, 0.12, height + 0.12), TRIM)
    for zz in (z - 0.06, z + height * 0.47, z + height + 0.02):
        box(k, (x, y - 0.065, zz), (width + 0.22, 0.13, 0.10), WOOD)
    for sign in (-1, 1):
        xx = x + sign * (width * 0.76 + 0.13)
        box(k, (xx, y - 0.02, z), (width * 0.38, 0.09, height), owner, M_CLOTH)
        for zz in (z + 0.16, z + height - 0.2):
            box(k, (xx, y - 0.08, zz), (width * 0.4, 0.04, 0.07), TRIM)
    planter(k, x, y - 0.17, z - 0.32, width + 0.1)


def house(name, materials, width, depth, eave, peak, owner=RED, roof_color=ROOF, hall=False):
    k = Kit(sum(map(ord, name)), ao=0.18, ao_h=0.8)
    floor = 0.28
    # Real front doorway. The rest is a solid shell for this static design kit.
    box(k, (0, 0, 0), (width + 0.18, depth + 0.18, floor), MORTAR, M_STONE)
    rows = 3 if hall else 2
    for row in range(rows):
        h = 0.22
        for i in range(max(4, round(width / 0.5))):
            x = -width / 2 + (i + 0.5) * width / max(4, round(width / 0.5))
            if abs(x) < 0.7:
                continue
            box(k, (x, -depth / 2 - 0.05, floor + row * h), (0.45, 0.32, h * 0.93), STONE, M_STONE)
    for sign in (-1, 1):
        box(k, (sign * (width / 2 - 0.12), 0, floor), (0.24, depth, eave - floor), PLASTER, M_STONE)
    box(k, (0, depth / 2 - 0.12, floor), (width, 0.24, eave - floor), PLASTER, M_STONE)
    door_width, door_height = 1.15, 2.15
    side_width = (width - door_width) / 2
    for sign in (-1, 1):
        box(k, (sign * (door_width / 2 + side_width / 2), -depth / 2 + 0.12, floor),
            (side_width, 0.24, eave - floor), PLASTER, M_STONE)
    box(k, (0, -depth / 2 + 0.12, floor + door_height),
        (door_width, 0.24, eave - floor - door_height), PLASTER, M_STONE)
    for sign in (-1, 1):
        yy = sign * depth / 2
        k.b.poly([(-width / 2, yy, eave), (width / 2, yy, eave), (0, yy, peak - 0.1)],
                 PLASTER, mat=M_STONE, smooth=False)
        if sign < 0:
            # Gable faces must point outward; the other winding faces into the loft.
            k.b.poly([(0, yy - 0.012, peak - 0.1), (width / 2, yy - 0.012, eave),
                      (-width / 2, yy - 0.012, eave)], PLASTER, mat=M_STONE, smooth=False)
    for sign in (-1, 1):
        xx = sign * (width / 2 + 0.03)
        for yy in (-depth / 2, 0, depth / 2):
            beam(k, (xx, yy, floor), (xx, yy, eave), 0.17, 0.17)
        for zz in (floor + 0.55, eave - 0.12):
            beam(k, (xx, -depth / 2, zz), (xx, depth / 2, zz), 0.16, 0.16)
        beam(k, (xx, -depth / 2 + 0.1, eave - 0.4), (xx, -depth / 2 + 1.1, eave - 1.2), 0.12)
    for xx in (-width / 2, -door_width / 2 - 0.13, door_width / 2 + 0.13, width / 2):
        beam(k, (xx, -depth / 2 - 0.06, floor), (xx, -depth / 2 - 0.06, eave), 0.17, 0.17)
    beam(k, (-width / 2, -depth / 2 - 0.07, eave - 0.13), (width / 2, -depth / 2 - 0.07, eave - 0.13), 0.2)
    beam(k, (0, -depth / 2 - 0.1, eave), (0, -depth / 2 - 0.1, peak - 0.15), 0.14)
    for sign in (-1, 1):
        window(k, sign * (width * 0.31), -depth / 2 - 0.14, 1.05, owner, 0.68 if width < 5 else 0.9)
    if peak - eave > 1.5:
        window(k, 0, -depth / 2 - 0.14, eave + 0.18, owner, 0.65, 0.75)
    roof(k, width, depth, eave, peak, roof_color)
    for row in range(6):
        box(k, (width * 0.31, depth * 0.18, peak - 1.15 + row * 0.24),
            (0.62 + (0.12 if row == 5 else 0), 0.62 + (0.12 if row == 5 else 0), 0.22), STONE, M_STONE)
    box(k, (0, -depth / 2 - 0.48, 0), (1.65, 0.8, floor * 0.55), STONE, M_STONE)
    box(k, (0, -depth / 2 - 0.3, floor * 0.55), (1.45, 0.48, floor * 0.45), STONE, M_STONE)
    # A bracket banner and brass fastenings, matching the heraldry sheet.
    beam(k, (-width / 2 - 0.22, -depth / 2 + 0.3, 2.65), (-width / 2 - 0.22, -depth / 2 - 0.7, 2.65), 0.07)
    box(k, (-width / 2 - 0.22, -depth / 2 - 0.45, 1.8), (0.025, 0.45, 0.78), owner, M_CLOTH)
    root = k.build(name, materials)
    door = Kit(922, ao=0.0)
    for i in range(6):
        box(door, ((i + 0.5) * door_width / 6, 0, 0), (door_width / 6 * 0.97, 0.10, door_height), WOOD)
    for zz in (0.35, 1.6):
        box(door, (door_width / 2, -0.07, zz), (door_width * 0.9, 0.045, 0.09), IRON, M_METAL)
    door.add(torus(0.085, 0.016, 12, 5), T((door_width * 0.8, -0.105, 0.95), (math.pi / 2, 0, 0)), IRON, M_METAL)
    door.build(f'{name}_Door', materials, parent=root,
               loc=(-door_width / 2, -depth / 2 - 0.04, floor))
    return root


def furniture(name, materials, kind, width, depth, height):
    k = Kit(1000 + sum(map(ord, name)), ao=0.15)
    if kind in ('table', 'bench', 'bed', 'chair', 'stool'):
        top = 0.42 if kind in ('bed', 'chair') else height - 0.10
        box(k, (0, 0, top), (width, depth, 0.1), WOOD)
        for x in (-width / 2 + 0.09, width / 2 - 0.09):
            for y in (-depth / 2 + 0.08, depth / 2 - 0.08):
                box(k, (x, y, 0), (0.11, 0.11, top), TRIM)
        beam(k, (-width / 2 + 0.09, 0, 0.17), (width / 2 - 0.09, 0, 0.17), 0.08)
        if kind == 'bed':
            box(k, (0, 0, 0.52), (width - 0.10, depth - 0.08, 0.18), CREAM, M_CLOTH, 0.06)
            box(k, (0, -0.22, 0.69), (width - 0.06, depth * 0.68, 0.08), GREEN, M_CLOTH)
            box(k, (0, depth * 0.32, 0.70), (width * 0.72, 0.4, 0.1), CREAM, M_CLOTH, 0.055)
            for yy, hh in ((depth / 2 - 0.05, 1.12), (-depth / 2 + 0.05, 0.72)):
                box(k, (0, yy, 0.45), (width, 0.13, hh - 0.45), WOOD)
                for xx in (-width / 2, width / 2):
                    pole(k, (xx, yy, 0), 0.07, hh)
                    k.add(ico(0.095, 1), T((xx, yy, hh)), WOOD)
        if kind == 'chair':
            box(k, (0, depth / 2 - 0.05, 0.52), (width, 0.10, height - 0.52), WOOD)
        if name == 'LongTable':
            box(k, (0, 0, height + 0.01), (width * 0.25, depth * 1.03, 0.015), RED, M_CLOTH, 0)
    elif kind in ('dresser', 'shelf', 'crate', 'bin'):
        if kind == 'dresser':
            box(k, (0, 0, 0.12), (width, depth, height - 0.12), TRIM)
            for row in range(3):
                zz = 0.17 + row * (height - 0.2) / 3
                box(k, (0, -depth / 2 - 0.03, zz), (width - 0.1, 0.06, (height - 0.2) / 3 - 0.06), WOOD)
                pole(k, (0, -depth / 2 - 0.09, zz + 0.12), 0.045, 0.04, BRASS, M_BRASS)
        else:
            levels = 3 if kind == 'shelf' else 1
            for level in range(levels + 1):
                box(k, (0, 0, level * height / levels), (width, depth, 0.09), WOOD)
            for sign in (-1, 1):
                box(k, (sign * (width / 2 - 0.04), 0, 0), (0.08, depth, height), TRIM)
            box(k, (0, depth / 2 - 0.035, 0), (width, 0.07, height), WOOD)
            if kind in ('crate', 'bin'):
                box(k, (0, -depth / 2 + 0.035, 0), (width, 0.07, height * (0.7 if kind == 'bin' else 1)), WOOD)
                beam(k, (-width / 2, -depth / 2 - 0.02, 0.08), (width / 2, -depth / 2 - 0.02, height - 0.08), 0.08)
    elif kind == 'barrel':
        profile = [(width * r, height * z) for r, z in ((0.36, 0), (0.46, 0.1), (0.50, 0.5), (0.46, 0.9), (0.36, 1))]
        k.add(lathe(profile, 16, True, True), color=WOOD)
        for z, r in ((0.12, 0.465), (0.5, 0.505), (0.88, 0.465)):
            k.add(torus(width * r, 0.025, 16, 4), T((0, 0, height * z)), IRON, M_METAL)
        for i in range(16):
            a = i * math.tau / 16
            beam(k, (math.cos(a) * width * 0.37, math.sin(a) * width * 0.37, 0.05),
                 (math.cos(a) * width * 0.37, math.sin(a) * width * 0.37, height - 0.05), 0.018, color=TRIM)
    elif kind == 'sack':
        k.add(lathe([(width * r, height * z) for r, z in ((0.35, 0), (0.5, 0.2), (0.47, 0.65), (0.2, 0.9), (0.17, 1))], 14, True, True), color=CREAM, mat=M_CLOTH)
        k.add(torus(width * 0.21, 0.025, 12, 4), T((0, 0, height * 0.88)), RED, M_CLOTH)
    elif kind == 'ladder':
        for sign in (-1, 1):
            beam(k, (sign * width / 2, -0.18, 0), (sign * width / 2, 0.18, height), 0.08)
        for i in range(1, 9):
            z = i * height / 9
            y = -0.18 + 0.36 * i / 9
            beam(k, (-width / 2, y, z), (width / 2, y, z), 0.075)
    elif kind == 'millstone':
        k.add(cyl(width / 2, width / 2, 0.24, 24), T((0, 0, height - 0.24)), STONE, M_STONE)
        box(k, (0, 0, 0), (width * 0.7, depth * 0.7, height - 0.24), TRIM)
        pole(k, (0, 0, height), 0.07, 0.8)
        beam(k, (0, 0, height + 0.65), (0.65, 0, height + 0.65), 0.08)
    return k.build(name, materials)


def dock(name, materials, wide=False, stage=False):
    """A seaward platform reached by two landward ramps; +Y points back to land."""
    k = Kit(810 if wide else 811, ao=0.15)
    width, depth, z = (7.2 if wide else 5.6), (3.8 if wide else 3.2), 0.85
    if stage:
        width, depth = 2.4, 6.2
    planks = round(depth / 0.23)
    for i in range(planks):
        box(k, (0, -depth / 2 + (i + 0.5) * depth / planks, z),
            (width, depth / planks * 0.96, 0.13), WOOD)
    for x in (-width / 2 + 0.1, width / 2 - 0.1):
        beam(k, (x, -depth / 2, z - 0.12), (x, depth / 2, z - 0.12), 0.2)
        for y in (-depth / 2, 0, depth / 2):
            pole(k, (x, y, 0), 0.14, z + 0.7)
            for zz in (z + 0.32, z + 0.4):
                k.add(torus(0.15, 0.025, 12, 4), T((x, y, zz)), C('#c3a16b'), M_CLOTH)
        for ya, yb in ((-depth / 2, 0), (0, depth / 2)):
            for a, b in (((x, ya, z + 0.47), (x, (ya + yb) / 2, z + 0.26)),
                         ((x, (ya + yb) / 2, z + 0.26), (x, yb, z + 0.47))):
                beam(k, a, b, 0.05, color=C('#c3a16b'), mat=M_CLOTH)
    if not stage:
        for sign in (-1, 1):
            a = Vector((sign * width * 0.3, depth / 2 - 0.1, z))
            b = Vector((sign * (width * 0.3 + 1.9), depth / 2 + 4.0, z + 0.25))
            direction = (b - a).normalized()
            cross = Vector((direction.y, -direction.x, 0))
            for i in range(17):
                p = a.lerp(b, (i + 0.5) / 17)
                beam(k, p - cross * 0.7, p + cross * 0.7, 0.14, 0.26, WOOD)
            for edge in (-1, 1):
                beam(k, a + cross * edge * 0.73, b + cross * edge * 0.73, 0.12)
            # Roofed stone harbour markers, not pasted signs.
            box(k, b + Vector((0, 0, -0.45)), (1.5, 1.4, 0.45), STONE, M_STONE)
            box(k, b, (0.85, 0.65, 1.5), PLASTER, M_STONE)
            box(k, b + Vector((0, -0.35, 0.35)), (0.43, 0.04, 0.75), RED, M_CLOTH)
            for s in (-1, 1):
                beam(k, b + Vector((s * 0.56, -0.48, 1.48)), b + Vector((0, -0.48, 1.9)), 0.16, 0.16, ROOF, M_STONE)
                beam(k, b + Vector((s * 0.56, 0.48, 1.48)), b + Vector((0, 0.48, 1.9)), 0.16, 0.16, ROOF, M_STONE)
            k.b.poly([b + Vector(v) for v in ((-0.56, -0.48, 1.48), (0, -0.48, 1.9), (0, 0.48, 1.9), (-0.56, 0.48, 1.48))], ROOF, mat=M_STONE)
            k.b.poly([b + Vector(v) for v in ((0, -0.48, 1.9), (0.56, -0.48, 1.48), (0.56, 0.48, 1.48), (0, 0.48, 1.9))], ROOF, mat=M_STONE)
    return k.build(name, materials)


def bridge(name, materials, arched):
    k = Kit(901, ao=0.1)
    length, width = 8.0, 2.2
    height = lambda x: 0.4 + (0.7 * (1 - (x / (length / 2)) ** 2) if arched else 0)
    for i in range(32):
        x = -length / 2 + (i + 0.5) * length / 32
        box(k, (x, 0, height(x)), (length / 32 * 0.96, width, 0.15), WOOD)
    for sign in (-1, 1):
        for i in range(5):
            x = -length / 2 + i * length / 4
            pole(k, (x, sign * (width / 2 - 0.1), 0), 0.12, height(x) + 1.0)
        for i in range(8):
            a, b = -length / 2 + i, -length / 2 + i + 1
            for lift in (0.5, 0.95):
                beam(k, (a, sign * (width / 2 - 0.1), height(a) + lift), (b, sign * (width / 2 - 0.1), height(b) + lift), 0.12)
    return k.build(name, materials)


def build():
    scene = new_scene('ConceptKit')
    materials = mats()
    roots = [
        house('CottageA', materials, 4.5, 4.0, 3.0, 5.6, RED),
        house('CottageB', materials, 3.9, 4.3, 3.2, 6.0, BLUE),
        house('CottageC', materials, 6.0, 3.6, 2.8, 4.6, GOLD),
        house('HallA', materials, 6.8, 5.0, 4.9, 8.0, RED, hall=True),
        house('HallB', materials, 5.8, 5.3, 5.5, 9.0, BLUE, hall=True),
        house('HallC', materials, 8.4, 4.6, 4.1, 6.1, GOLD, C('#66717c'), hall=True),
        house('BarnA', materials, 5.4, 5.0, 3.5, 5.6, RED),
        dock('DockA', materials), dock('DockB', materials, True), dock('LandingStage', materials, stage=True),
        bridge('BridgeA', materials, True), bridge('BridgeB', materials, False),
    ]
    for name, kind, w, d, h in [
        ('Bed', 'bed', 1.05, 2.05, 0.7), ('CottageTable', 'table', 1.3, 0.8, 0.76),
        ('LongTable', 'table', 2.8, 0.9, 0.8), ('Bench', 'bench', 1.2, 0.36, 0.45),
        ('HallBench', 'bench', 2.6, 0.4, 0.48), ('Chair', 'chair', 0.55, 0.55, 1.1),
        ('Stool', 'stool', 0.42, 0.42, 0.46), ('Dresser', 'dresser', 1.0, 0.5, 1.0),
        ('Shelf', 'shelf', 1.3, 0.3, 1.25), ('StorageCrate', 'crate', 0.8, 0.7, 0.65),
        ('MillBin', 'bin', 1.1, 0.8, 0.85), ('BarrelA', 'barrel', 0.7, 0.7, 1.0),
        ('BarrelB', 'barrel', 0.55, 0.55, 0.72), ('GrainSack', 'sack', 0.55, 0.55, 0.75),
        ('Ladder', 'ladder', 0.55, 0.4, 2.8), ('Millstone', 'millstone', 1.05, 1.05, 0.8),
    ]:
        roots.append(furniture(name, materials, kind, w, d, h))
    layout_row(roots, gap=3.0)
    export_glb(roots, 'concept_kit.glb')
    save_blend(scene, 'concept_kit.blend')
    result = stats(roots)
    import json
    from pathlib import Path
    Path(__file__).with_name('concept_kit.stats.json').write_text(json.dumps(result, indent=2))
    return result
