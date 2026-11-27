"""Original human-scale island furnishings, guided by concept sheets 11–16.

Run Blender -b -P assets/blender/native_island.py. The editable .blend and GLB are
generated under Catnight/SourceArt/Island; nothing in the browser art is replaced.
"""
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import new_scene, srgb, spectral_noise, image_from_array
from props import Kit, T, cube, cyl, ico, torus, mats, M_WOOD, M_STONE, M_METAL, M_CLOTH, M_LEAF
from concept_kit import box, beam, pole, roof

OUT = Path(__file__).resolve().parents[2] / 'apps/catnight/SourceArt/Island'
C = srgb
WOOD, DARK, STONE = C('#a47748'), C('#65462e'), C('#aaac9c')
IRON, CLOTH, LEAF = C('#4d5558'), C('#b84b38'), C('#6d8a43')


def make(name, materials):
    k = Kit(sum(map(ord, name)), ao=.12)
    if name == 'Well':
        for row in range(3):
            for i in range(16):
                a = (i + .5 * (row % 2)) * np.pi / 8
                k.add(cube(.35, .24, .23, .035), T((np.cos(a)*.78, np.sin(a)*.78, .12+row*.23), (0,0,a)), STONE, M_STONE)
        for side in (-1, 1):
            pole(k, (side*.96, 0, 0), .09, 2.25)
        beam(k, (-1, 0, 1.45), (1, 0, 1.45), .13, color=WOOD)
        roof(k, 2.05, 1.65, 2.15, 2.85)
        beam(k, (0, 0, .3), (0, 0, 1.45), .025, color=C('#b8a580'))
        k.add(cyl(.16, .22, .32, 12), T((.25, -.65, .7)), WOOD, M_WOOD)
    elif name == 'MarketStall':
        for x in (-1.45, 1.45):
            for y in (-.85, .85): pole(k, (x,y,0), .075, 2.65)
        box(k, (0,0,.9), (3,1.65,.12), WOOD)
        for i in range(12): box(k, (-1.4+i*.25,-.84,.12), (.21,.08,.85), WOOD)
        for i in range(10):
            color = CLOTH if i%2 else C('#ead8a7')
            for j in range(4):
                y=-1.05+j*.7
                box(k, (-1.5+i*.33,y,2.4 + .25*np.cos(y)), (.33,.75,.06), color, M_CLOTH, .01)
        for i in range(20):
            k.add(ico(.11,1), T((k.r.uniform(-1.3,1.3),k.r.uniform(-.55,.55),1.1)), C('#c4a34a') if i%2 else C('#bc563b'), M_LEAF)
    elif name == 'Waystone':
        box(k, (0,0,.22), (.9,.7,.42), STONE, M_STONE, .10)
        pole(k, (0,0,.32), .095, 1.8)
        box(k, (.27,0,1.72), (1.15,.10,.23), WOOD)
        box(k, (-.23,0,1.35), (.95,.10,.22), DARK)
        for x in (-.18,.43):
            k.add(cyl(.025,.025,.12,8), T((x,-.065,1.81),(np.pi/2,0,0)), IRON, M_METAL)
    elif name == 'Handcart':
        box(k, (0,0,.55), (1.1,1.7,.12), DARK)
        for side in (-1,1):
            for row in range(3): box(k,(side*.55,0,.75+row*.16),(.08,1.75,.14),WOOD)
            beam(k,(side*.4,.65,.6),(side*.4,2.6,.3),.08)
            k.add(torus(.39,.055,20,6),T((side*.7,-.2,.43),(0,np.pi/2,0)),DARK,M_WOOD)
            for i in range(8):
                a=i*np.pi/4
                beam(k,(side*.7,-.2,.43),(side*.7,-.2+np.cos(a)*.38,.43+np.sin(a)*.38),.035)
        for i in range(5): k.add(ico(.18,1,(1,1,1.4)),T((k.r.uniform(-.35,.35),k.r.uniform(-.6,.5),.8)),C('#c5b28a'),M_CLOTH)
    elif name == 'LanternPost':
        pole(k,(0,0,0),.075,3)
        beam(k,(0,0,2.9),(.6,0,2.9),.09)
        box(k,(.52,0,2.48),(.27,.25,.38),C('#e8bd68'),M_CLOTH)
        for x in (.36,.68):
            for y in (-.14,.14): beam(k,(x,y,2.3),(x,y,2.7),.025,color=IRON)
        box(k,(.52,0,2.75),(.4,.36,.08),IRON,M_METAL)
    elif name == 'Flowerbed':
        for i in range(14):
            x,y=k.r.uniform(-.6,.6),k.r.uniform(-.55,.55)
            h=k.r.uniform(.22,.5)
            beam(k,(x,y,0),(x+.05,y,h),.018,color=LEAF)
            for j in range(5):
                a=j*np.pi*2/5
                k.add(ico(.045,1,(1.4,.7,.4)),T((x+.05+np.cos(a)*.055,y+np.sin(a)*.055,h)),C('#eedcbc') if i%3 else C('#9773b0'),M_LEAF)
    return k.build(name,materials)


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    scene=new_scene('Native island furnishings')
    materials=mats()
    objects=[make(n,materials) for n in ('Well','MarketStall','Waystone','Handcart','LanternPost','Flowerbed')]
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/'island.glb'),export_format='GLB',use_selection=True,use_active_scene=True,
        export_animations=False,export_vertex_color='ACTIVE',export_all_vertex_colors=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'island.blend'))
    # Painted turf: soft mottling plus small light and dark dabs (tufts, pebbles), tiling.
    noise=spectral_noise(512,2.8,73)
    fine=spectral_noise(512,1.2,19)
    grain=.93 + (noise-.5)*.14 + (fine-.5)*.09
    rng=np.random.default_rng(41)
    yy,xx=np.mgrid[-4:5,-4:5]
    for _ in range(5200):
        cx,cy=rng.integers(0,512,2); r=rng.uniform(1.2,3.6); tone=rng.choice((-.09,-.06,.05,.08))
        dab=np.clip(1-(xx**2+(yy*rng.uniform(.6,1.6))**2)/(r*r),0,1)*tone
        grain[np.ix_((cy+yy[:,0])%512,(cx+xx[0])%512)]+=dab
    grain=np.clip(grain,0,1)
    rgba=np.dstack([grain,grain,grain,np.ones_like(grain)])
    image_from_array('Island ground detail',rgba,str(OUT/'ground.png'))
    print('ISLAND BLENDER: 6 original furnishings, editable source and ground texture exported')


if __name__ == '__main__': main()
