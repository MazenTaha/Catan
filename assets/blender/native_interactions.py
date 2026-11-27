"""Original native animation kit. Reuses the original knight and chest geometry, not browser code."""
import json
import math
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
from mathutils import Quaternion, Vector, Matrix
from common import new_scene, save_blend
import props

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'apps/unreal/SourceArt/Animation'
FPS = 60
IDLE = {'ArmR':[-.55,0,-.14], 'ForeArmR':[-.65,0,0], 'HandR':[.1,0,0], 'ArmL':[-.4,0,.18], 'ForeArmL':[-1.25,0,0], 'Spine':[.02,0,0], 'Hips':[0,0,0], 'Head':[0,0,0]}
def pose(**values): return {**IDLE, **values}
CUT = [(0,IDLE),(.12,pose(ArmR=[-1.65,-.65,-.35],ForeArmR=[-1.05,0,0],Spine=[-.03,-.32,0],Hips=[0,.05,0],Head=[.04,.16,0])),(.21,pose(ArmR=[-1.35,.18,-.22],ForeArmR=[-.28,0,0],Spine=[.08,.12,0],Hips=[0,-.03,0])),(.29,pose(ArmR=[-.4,.85,-.3],ForeArmR=[-.3,0,0],Spine=[.1,.4,0],Hips=[0,-.04,0],Head=[-.04,-.16,0])),(.43,pose(ArmR=[-.48,.35,-.2],Spine=[.04,.16,0])),(.58,IDLE)]
FIST=pose(ArmR=[-.65,0,-.12],ForeArmR=[-1.35,0,0],ArmL=[-.7,0,.15],ForeArmL=[-1.5,0,0])
GUARD=pose(ArmR=[-1.25,-.65,-.25],ForeArmR=[-.9,0,0],ArmL=[-1,.05,.3],ForeArmL=[-1.3,0,0],Spine=[.06,-.04,0])
CLIPS = {
'Combat_Idle':(1.6,[(0,IDLE),(.8,pose(Spine=[.035,.025,0],ArmR=[-.57,0,-.14])),(1.6,IDLE)]),
'Sword_Cut_R':(.58,CUT),
'Sword_Cut_L':(.58,[(t,{n:[a[0],-a[1] if n in ['Hips','Spine','Head','ArmR'] else a[1],a[2]] for n,a in p.items()}) for t,p in CUT]),
'Fist_Jab':(.42,[(0,FIST),(.065,{**FIST,'ArmR':[-.35,-.16,-.2],'ForeArmR':[-1.65,0,0],'Spine':[-.02,-.14,0]}),(.12,{**FIST,'ArmR':[-1.48,.06,-.08],'ForeArmR':[-.06,0,0],'Spine':[.09,.14,0]}),(.17,{**FIST,'ArmR':[-1.5,.08,-.08],'ForeArmR':[-.1,0,0],'Spine':[.08,.18,0]}),(.42,FIST)]),
'Guard_Hold':(1.2,[(0,GUARD),(.6,{**GUARD,'Spine':[.075,-.04,0]}),(1.2,GUARD)]),
'Hit_React':(.3,[(0,IDLE),(.045,pose(Spine=[-.22,.1,.065],Head=[.14,-.07,0])),(.12,pose(Spine=[-.1,.055,.03],Head=[.06,0,0])),(.3,IDLE)]),
'Guard_Impact':(.24,[(0,GUARD),(.04,{**GUARD,'Spine':[-.1,-.12,0],'ArmL':[-1.2,.05,.3],'ForeArmL':[-1.5,0,0]}),(.24,GUARD)]),
'Respawn_Recover':(.45,[(0,pose(Spine=[.5,0,0],Head=[.12,0,0])),(.12,pose(Spine=[.35,0,0],Head=[.06,0,0])),(.45,IDLE)])}
CHEST = [(0,0,0),(.08,0,-.32),(.17,0,-1.05),(.27,-.10,-1.05),(.47,-.85,-1.05),(.64,-1.48,-.8),(.82,-1.88,-.2),(.96,-1.79,0),(1.1,-1.82,0)]

def interp(keys,t):
    for (a,pa),(b,pb) in zip(keys,keys[1:]):
        if t<=b:
            k=max(0,min(1,(t-a)/(b-a))); k=k*k*(3-2*k)
            return {n:[pa.get(n,[0,0,0])[i]*(1-k)+pb.get(n,[0,0,0])[i]*k for i in range(3)] for n in set(pa)|set(pb)}
    return keys[-1][1]

def select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]

def fbx(objects,path,animated=False):
    select(objects)
    bpy.ops.export_scene.fbx(filepath=str(OUT/path),use_selection=True,object_types={'ARMATURE','MESH'},
        add_leaf_bones=False,use_armature_deform_only=False,axis_forward='-Y',axis_up='Z',
        apply_scale_options='FBX_SCALE_UNITS',bake_anim=animated,bake_anim_use_all_actions=False,
        bake_anim_use_nla_strips=False,bake_anim_simplify_factor=0,mesh_smooth_type='FACE')

def build():
    OUT.mkdir(parents=True,exist_ok=True)
    sc=new_scene('NativeInteractions'); sc.render.fps=FPS
    with bpy.data.libraries.load(str(ROOT/'assets/blender/knight.blend'),link=False) as (src,dst):
        dst.objects=[n for n in src.objects if n in ['Knight','KnightBody','HelmArmet','CapeShort']]
    for ob in dst.objects:
        if ob: sc.collection.objects.link(ob)
    arm=next(o for o in sc.objects if o.type=='ARMATURE')
    arm.name='Knight'
    meshes=[o for o in sc.objects if o.type=='MESH']
    for ob in meshes: ob.parent=arm
    fbx([arm,*meshes],Path('Knight.fbx'))
    rest_axes={b.name:[b.matrix_local.to_quaternion().inverted()@Vector(v) for v in [(1,0,0),(0,0,1),(0,-1,0)]] for b in arm.data.bones}
    for name,(duration,keys) in list(CLIPS.items())+[('Walk',(.72,[])),('Run',(.56,[]))]:
        arm.animation_data_create(); action=bpy.data.actions.new(name); action.use_fake_user=True; arm.animation_data.action=action
        last=round(duration*FPS); sc.frame_start=0; sc.frame_end=last
        for frame in range(last+1):
            t=frame/FPS
            p=interp(keys,min(t,duration)) if keys else dict(IDLE)
            if not keys:
                run=name=='Run'; g=frame/last*2*math.pi
                for s,off in [('L',0),('R',math.pi)]:
                    c=math.cos(g+off); back=max(0,-math.sin(g+off)); thigh=-(.62 if run else .44)*c
                    knee=(1.35 if run else .8)*back*back
                    p['Thigh'+s]=[thigh,0,.02 if s=='L' else -.02]; p['Shin'+s]=[knee,0,0]; p['Foot'+s]=[-(thigh+knee)*.55,0,0]
                    p['Arm'+s]=[(.7 if run else .35)*c,0,.1 if s=='L' else -.1]; p['ForeArm'+s]=[-(.95 if run else .4),0,0]
                p['Spine']=[.16 if run else .04,.07*math.cos(g),0]
            for bone in arm.pose.bones:
                bone.rotation_mode='QUATERNION'; axes=rest_axes[bone.name]; q=Quaternion()
                for axis,angle in zip(axes,p.get(bone.name,[0,0,0])): q=q@Quaternion(axis,angle)
                bone.rotation_quaternion=q; bone.keyframe_insert('rotation_quaternion',frame=frame,group=bone.name)
        fbx([arm],Path(name+'.fbx'),True)
        arm.animation_data.action=None
        for bone in arm.pose.bones: bone.rotation_quaternion=Quaternion()
    # Rigged original gear shares the exact bind skeleton, so grip/forearm contact cannot drift.
    mats=props.mats()
    for label,maker,bone,at,rot in [('SwordRig',props.build_sword,'HandR',(-.252,-.01,.865),math.pi),('ShieldRig',props.build_shield,'ForeArmL',(.33,0,1.08),math.pi/2)]:
        ob=maker(mats)[0]; ob.name=label
        transform=Matrix.Translation(Vector(at))@Matrix.Rotation(rot,4,'Z')
        ob.data.transform(transform); ob.location=(0,0,0); ob.parent=arm
        ob.vertex_groups.new(name=bone).add(list(range(len(ob.data.vertices))),1,'REPLACE')
        mod=ob.modifiers.new('Armature','ARMATURE'); mod.object=arm
        fbx([arm,ob],Path(label+'.fbx'))
        ob.hide_set(True)
    chest=props.build_chest(mats, moving_latch=True)[0]
    lid=chest.children[0]
    # Split the visible hasp into its own hinged piece, rather than flexing a merged lid.
    k=props.Kit(163,ao=0); k.add(props.cube(.09,.016,.12,.008),props.T((0,0,-.10)),props.BRASS,props.M_BRASS)
    latch=k.build('WeaponChestLatch',mats,lid,(0,-props.CD-.016,.02))
    for ob,label in [(chest,'Chest_Body'),(lid,'Chest_Lid'),(latch,'Chest_Latch')]:
        clone=ob.copy(); clone.data=ob.data.copy(); sc.collection.objects.link(clone); clone.parent=None; clone.matrix_world=Matrix.Identity(4)
        fbx([clone],Path(label+'.fbx')); bpy.data.objects.remove(clone,do_unlink=True)
    for ob,idx in [(lid,1),(latch,2)]:
        ob.rotation_mode='XYZ'; ob.animation_data_create(); action=bpy.data.actions.new('Chest_Open_'+ob.name); ob.animation_data.action=action; action.use_fake_user=True
        for time,angle,latch_angle in CHEST:
            ob.rotation_euler.x=angle if idx==1 else latch_angle; ob.keyframe_insert('rotation_euler',frame=time*FPS)
    sc.frame_start=0; sc.frame_end=66; sc.frame_set(0)
    save_blend(sc,'native_interactions.blend')
    spec={'fps':FPS,'contact':{'fist':.12,'sword':.21},'duration':{'fist':.42,'sword':.58},'chest':{'reveal':.64,'finish':2.4,'keys':[{'time':t,'lid':a,'latch':l} for t,a,l in CHEST]},'clips':{n:{'duration':d,'loop':n in ['Combat_Idle','Guard_Hold','Walk','Run']} for n,(d,_) in CLIPS.items()}}
    (OUT/'animation-spec.json').write_text(json.dumps(spec,indent=2)+'\n')
    return {'clips':len(CLIPS)+2,'source':'assets/blender/native_interactions.blend'}

if __name__=='__main__': print(build())
