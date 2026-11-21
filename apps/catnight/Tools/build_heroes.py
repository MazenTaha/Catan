"""Rebuild the owner's knight/horse concepts as native skinned FBX assets and baked loops.

Run with Blender -b -P this_file. Only SourceArt/Heroes is written; browser assets stay intact.
Original parametric meshes from assets/blender are the source, not downloaded character packs.
"""
from pathlib import Path
import sys, math, json, hashlib
import bpy
from mathutils import Vector, Matrix

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / 'assets/blender'))
import common, knight, horse

OUT = REPO / 'apps/catnight/SourceArt/Heroes'
OUT.mkdir(parents=True, exist_ok=True)
FPS = 60
REPORT = {'schema': 1, 'units': 'metres in Blender; centimetres in Unreal', 'source': 'Original parametric meshes and owner-supplied concept sheets', 'models': {}}


def key(ob, frame):
    for bone in ob.pose.bones:
        bone.keyframe_insert('location', frame=frame, group=bone.name)
        bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)
        bone.keyframe_insert('scale', frame=frame, group=bone.name)


def reset(arm):
    for p in arm.pose.bones:
        p.rotation_mode = 'QUATERNION'
        p.matrix_basis = Matrix.Identity(4)


def pose_segment(arm, name, head, tail):
    """World-space bone placement; children are solved in parent order, without Euler flips."""
    p = arm.pose.bones[name]
    p.matrix = Matrix.LocRotScale(Vector(head), Vector((0, 1, 0)).rotation_difference(Vector(tail)-Vector(head)), Vector((1, 1, 1)))
    bpy.context.view_layer.update()


def chain(a, target, l1, l2, pole):
    a, target, pole = Vector(a), Vector(target), Vector(pole)
    delta = target-a
    d = max(.001, min(delta.length, l1+l2-.0001))
    n = delta.normalized()
    bend = (pole-a)-n*(pole-a).dot(n)
    bend.normalize()
    along = (l1*l1-l2*l2+d*d)/(2*d)
    joint = a+n*along+bend*math.sqrt(max(0, l1*l1-along*along))
    return joint, a+n*d


def limb(arm, upper, lower, end, target, pole):
    a = arm.pose.bones[upper].head.copy()
    knee, ankle = chain(a, target, arm.data.bones[upper].length, arm.data.bones[lower].length, pole)
    pose_segment(arm, upper, a, knee)
    pose_segment(arm, lower, knee, ankle)
    return ankle


def select(arm, meshes=True):
    bpy.ops.object.select_all(action='DESELECT')
    arm.select_set(True)
    if meshes:
        for child in arm.children:
            if child.type == 'MESH': child.select_set(True)
    bpy.context.view_layer.objects.active = arm


def fbx(arm, name, anim=False):
    select(arm, not anim)
    bpy.ops.export_scene.fbx(filepath=str(OUT / (name+'.fbx')), use_selection=True,
        object_types={'ARMATURE','MESH'} if not anim else {'ARMATURE'}, add_leaf_bones=False,
        axis_forward='-Y', axis_up='Z', apply_unit_scale=True, apply_scale_options='FBX_SCALE_UNITS',
        bake_anim=anim, bake_anim_use_all_actions=False, bake_anim_use_nla_strips=False,
        bake_anim_step=1, bake_anim_simplify_factor=0, path_mode='AUTO', mesh_smooth_type='FACE',
        colors_type='LINEAR')  # Unreal's skeletal FBX importer stores colour bytes without sRGB decoding.


def normalize_weights(mesh, arm):
    for v in mesh.data.vertices:
        groups = [(g.group, g.weight) for g in v.groups if mesh.vertex_groups[g.group].name in arm.data.bones and g.weight > .00001]
        groups = sorted(groups, key=lambda g: -g[1])[:4]
        total = sum(w for _,w in groups)
        if not total: raise RuntimeError(f'Unweighted vertex: {mesh.name}/{v.index}')
        for g in list(v.groups): mesh.vertex_groups[g.group].remove([v.index])
        for index, w in groups: mesh.vertex_groups[index].add([v.index], w/total, 'REPLACE')


def join(arm, objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]
    bpy.ops.object.join()
    mesh=objs[0]; mesh.name=name
    mesh.parent=arm
    for mod in list(mesh.modifiers): mesh.modifiers.remove(mod)
    mesh.modifiers.new('Skin','ARMATURE').object=arm
    normalize_weights(mesh, arm)
    mesh.data.validate()
    mesh.data.calc_loop_triangles()
    return mesh


def socket_bones(arm, points):
    select(arm,False); bpy.ops.object.mode_set(mode='EDIT')
    for name,(pos,parent) in points.items():
        bone=arm.data.edit_bones.new(name); bone.head=pos; bone.tail=Vector(pos)+Vector((0,0,.025)); bone.parent=arm.data.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')


def native_knight():
    common.new_scene('NativeKnight')
    mats=[common.material('Steel', rough=.37, metal=.72), common.material('Dark',rough=.85),
          common.material('Cloth',rough=.96,double=True),common.material('Owner',rough=.94,double=True),common.material('Skin',rough=.65)]
    parts=knight.body_pieces()
    # Art-pack armet: peaked crown, narrow eye opening, projecting visor and riveted cheek plates.
    b=common.MeshBuilder()
    knight.shell(b,[knight.ring(1.55,.092,.10,.10),knight.ring(1.61,.115,.125,.115),
        knight.ring(1.72,.13,.13,.12),knight.ring(1.80,.09,.08,.09),knight.ring(1.87,.012,.015,.025)],sides=12,cap_top=True)
    knight.shell(b,[knight.ring(1.57,.075,.13,.08,keel=.02),knight.ring(1.64,.12,.17,.105,keel=.025),
        knight.ring(1.685,.13,.16,.11,keel=.02)],sides=12,arc=(-95,95),edge_dark=.12)
    knight.shell(b,[knight.ring(1.69,.123,.153,.11),knight.ring(1.705,.13,.155,.11)],mat=knight.M_DARK,color=knight.SLIT,sides=12,arc=(-85,85))
    def visor_surface(x,z):
        rings=[(1.57,.075,.13,.02),(1.64,.12,.17,.025),(1.685,.13,.16,.02)]
        lo,hi=(rings[0],rings[1]) if z<=1.64 else (rings[1],rings[2])
        t=(z-lo[0])/(hi[0]-lo[0]); rx=lo[1]+(hi[1]-lo[1])*t; ry=lo[2]+(hi[2]-lo[2])*t; keel=lo[3]+(hi[3]-lo[3])*t
        c=math.sqrt(max(0,1-(x/rx)**2))
        return Vector((x,-ry*c-keel*c**12-.002,z))
    for side in (-1,1):
        for z in (1.60,1.625,1.65):
            p=visor_surface(side*.055,z)
            common.tube(b,[p,p+Vector((0,-.004,0))],[.005,.005],8,lambda t,s:knight.BRASS,cap=True)
        for j in range(4):
            p=visor_surface(side*(.025+j*.021),1.64)
            common.tube(b,[p,p+Vector((0,-.001,0))],[.003,.003],6,lambda t,s:knight.SLIT,mat=knight.M_DARK,cap=True)
        p=Vector((side*.127,0,1.70))
        common.tube(b,[p,p+Vector((side*.006,0,0))],[.015,.015],12,lambda t,s:knight.BRASS,cap=True)
    common.tube(b,[Vector((0,-.015,1.87)),Vector((0,-.08,1.80)),Vector((0,-.133,1.72))],[.004,.004,.004],6,lambda t,s:knight.STEEL_DK,cap=True)
    parts.append((b,lambda p:{'Head':1}))
    # Art-pack articulated fingers and brass knuckles, rather than rounded mitts.
    for side,sign in [('L',1),('R',-1)]:
        hand=common.MeshBuilder()
        for j in range(4):
            x=sign*(.232+j*.014)
            common.tube(hand,[Vector((x,-.045,.84)),Vector((x,-.052,.785)),Vector((x,-.022,.758))],
                [.009,.01,.007],6,lambda t,s:knight.STEEL,cap=True)
        parts.append((hand,lambda p,side=side:{'Hand'+side:1}))
    body=knight.make('KnightNative',parts,mats)
    cape=knight.make('CapeLong',knight.cape(True),mats)
    arm=knight.build_armature()
    # Longer, articulated cloth chain. Kinematic folds remain bounded in crouch and riding.
    select(arm,False); bpy.ops.object.mode_set(mode='EDIT')
    chain_names=['Cape','Cape2','Cape3','Cape4']
    for i,name in enumerate(chain_names):
        bone=arm.data.edit_bones.get(name) or arm.data.edit_bones.new(name)
        bone.head=(0,.19+i*.045,1.46-i*.30)
        bone.tail=(0,.235+i*.045,1.16-i*.30)
        bone.parent=arm.data.edit_bones['Spine' if i==0 else chain_names[i-1]]
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in cape.data.vertices:
        for g in list(v.groups): cape.vertex_groups[g.group].remove([v.index])
        t=max(0,min(3,(1.46-v.co.z)/.30))
        a=int(t); f=t-a
        for i,w in [(a,1-f),(min(3,a+1),f)]:
            if w: (cape.vertex_groups.get(chain_names[i]) or cape.vertex_groups.new(name=chain_names[i])).add([v.index],w,'ADD')
    socket_bones(arm,{'GripL':((.253,-.008,.836),'HandL'),'GripR':((-.253,-.008,.836),'HandR'),'Forward':((0,-.5,1),'Hips')})
    mesh=join(arm,[body,cape],'KnightNative')
    # Warm worn steel and olive cloth follow the owner's turnaround, retaining brass edging.
    col=mesh.data.color_attributes.active_color
    for poly in mesh.data.polygons:
        name=mesh.data.materials[poly.material_index].name
        for li in poly.loop_indices:
            c=col.data[li].color; rgb=list(c[:3])
            if name.startswith('Steel') and rgb[2]>rgb[0]*1.04:
                lum=sum(rgb)/3; rgb=[lum*1.02,lum*.98,lum*.90]
            elif name.startswith('Cloth'): rgb=[rgb[0]*.32,rgb[1]*.39,rgb[2]*.17]
            elif name.startswith('Owner'): rgb=[rgb[0]*.45,rgb[1]*.035,rgb[2]*.055]
            col.data[li].color=(*rgb,1)
    return arm,mesh


def native_horse():
    common.new_scene('NativeHorse')
    mats=[common.material('Coat',rough=.68),common.material('Hair',rough=.85,double=True),common.material('Tack',rough=.62,double=True),common.material('Owner_Blanket',rough=.95,double=True)]
    body=horse.sculpt_body(); horse.paint_body(body); body.data.materials.append(mats[0])
    parts=horse.build_parts(horse.Surface(body), stirrup_height=1.025)
    arm=horse.build_armature()
    # Deterministic anatomical skinning: avoid Blender heat-weight variations and crossover feet.
    def weights(p):
        z=p.z/horse.S; x=p.x/horse.S; y=p.y/horse.S
        if z<.97 and abs(y)>.27:
            front=y<0; side='L' if x>=0 else 'R'; suffix=('F' if front else 'H')+side
            if z>.59: return {'Upper'+suffix:1}
            if z>.19: return {'Cannon'+suffix:1}
            return {'Pastern'+suffix:1}
        t=common.smooth(-.45,-.95,y)
        return {'Body':1-t,'Neck':t*(1-common.smooth(-.88,-1.05,y)),'Head':t*common.smooth(-.88,-1.05,y)}
    horse.assign(body,weights)
    objs=[body]
    for name,b in parts.items():
        if name=='Reins': continue  # runtime hand-to-bit straps; no duplicate resting loop
        ob=b.build('Horse_'+name,mats)
        horse.assign(ob,lambda p,name=name:{name:1})
        objs.append(ob)
    mesh=join(arm,objs,'HorseNative')
    seat=max(v.co.z for v in mesh.data.vertices if abs(v.co.x)<.05 and abs(v.co.y)<.05)+.025
    socket_bones(arm,{'Seat':((0,0,seat),'Body'),'BitL':(horse.P(.07,-1.22,1.4),'Head'),'BitR':(horse.P(-.07,-1.22,1.4),'Head'),'Forward':((0,-.5,1),'Body')})
    col=mesh.data.color_attributes.active_color
    for poly in mesh.data.polygons:
        name=mesh.data.materials[poly.material_index].name
        for li in poly.loop_indices:
            c=col.data[li].color; rgb=list(c[:3]); v=mesh.data.vertices[mesh.data.loops[li].vertex_index].co
            if name.startswith('Coat'):
                rgb=[rgb[0]*.48,rgb[1]*.21,rgb[2]*.085]
                # Narrow natural blaze, dark muzzle and lower legs retained from vertex paint.
                if abs(v.x)<.035 and v.y<-.98*horse.S and v.z>1.52*horse.S: rgb=[.72,.64,.48]
            elif name.startswith('Hair'): rgb=[rgb[0]*.075,rgb[1]*.045,rgb[2]*.025]
            elif name.startswith('Owner'): rgb=[rgb[0]*.45,rgb[1]*.035,rgb[2]*.055]
            col.data[li].color=(*rgb,1)
    return arm,mesh


def foot_path(t,stride,lift,duty):
    t=t%1
    if t<duty: return stride*(.5-t/duty),0
    s=(t-duty)/(1-duty)
    return -stride*.5+stride*s,lift*math.sin(math.pi*s)


def knight_pose(arm,t,mode):
    reset(arm)
    moving=mode in ('Walk','Run','CrouchWalk','RideWalk','RideGallop')
    crouch=mode.startswith('Crouch'); riding=mode.startswith('Ride')
    cycle=2*math.pi*t; bob=(.018 if mode=='Run' else .006)*math.sin(2*cycle) if moving else .002*math.sin(cycle)
    hips=arm.pose.bones['Hips']; drop=(-.33 if crouch else -.24 if mode=='Run' else -.10 if mode=='Walk' else 0)+bob
    hips.matrix=Matrix.Translation((0,0,drop)) @ arm.data.bones['Hips'].matrix_local
    bpy.context.view_layer.update()
    for side,sign,phase in [('L',1,0),('R',-1,.5)]:
        if riding:
            ankle=limb(arm,'Thigh'+side,'Shin'+side,'Foot'+side,(sign*.43,-.04,.315),(sign*.75,-.30,.55))
        else:
            stride=.48 if crouch else .72 if mode=='Walk' else .95 if mode=='Run' else 0
            f,h=foot_path(t+phase,stride,.10 if crouch else .20 if mode=='Run' else .11,.62 if mode!='Run' else .42)
            ankle=limb(arm,'Thigh'+side,'Shin'+side,'Foot'+side,(sign*.11,-f,.09+h),(sign*.12,-1,.55))
        pose_segment(arm,'Foot'+side,ankle,ankle+Vector((0,-.19,-.06)))
        sh=arm.pose.bones['Arm'+side].head.copy()
        swing=math.sin(cycle+phase*2*math.pi) if moving else 0
        if riding:
            target=Vector((sign*.17,-.43,1.08)); elbow=(sign*.55,.02,1.1)
        elif crouch:
            target=Vector((sign*.24,-.22+.06*swing,.72)); elbow=(sign*.38,0,.86)
        elif mode=='Run':
            target=Vector((sign*.24,-.20+.18*swing,.95)); elbow=(sign*.36,.10,.98)
        else:
            target=Vector((sign*.26,-.07+.10*swing,.92+drop)); elbow=(sign*.42,.02,1.03+drop)
        wrist=limb(arm,'Arm'+side,'ForeArm'+side,'Hand'+side,target,elbow)
        hand_direction=Vector((0,-.10,-.025)) if riding else (wrist-arm.pose.bones['ForeArm'+side].head).normalized()*.12
        pose_segment(arm,'Hand'+side,wrist,wrist+hand_direction)
    # World-space cloth shape follows the lowered shoulders; lift back over the saddle while riding.
    last=None
    for i,name in enumerate(['Cape','Cape2','Cape3','Cape4']):
        z=1.46+drop-i*(.19 if crouch or riding else .30)
        y=.20+i*(.17 if riding else .11 if crouch else .045)
        sway=.012*math.sin(cycle-i*.5)*(i/3) if moving else .003*math.sin(cycle-i*.4)
        head=Vector((sway,y,z)) if last is None else last
        tail=Vector((sway,y+(.17 if riding else .11 if crouch else .045),z-(.19 if crouch or riding else .30)))
        pose_segment(arm,name,head,tail); last=tail


def horse_pose(arm,t,mode):
    reset(arm); moving=mode!='Idle'; gallop=mode=='Gallop'
    cycle=t*math.tau
    arm.pose.bones['Body'].location.z=((-.30 if gallop else -.12)+.025*math.sin(cycle*2) if moving else .003*math.sin(cycle))
    bpy.context.view_layer.update()
    offsets={'FL':0,'HR':.25,'FR':.5,'HL':.75} if not gallop else {'HL':0,'HR':.12,'FL':.48,'FR':.60}
    for suffix,offset in offsets.items():
        front=suffix[0]=='F'; sign=1 if suffix[1]=='L' else -1
        stride=.80 if not gallop else 1.20
        f,h=foot_path(t+offset,stride,.17 if not gallop else .32,.64 if not gallop else .38) if moving else (0,0)
        x=sign*(.19 if front else .22)*horse.S; y=(-.468 if front else .62)*horse.S
        ankle=limb(arm,'Upper'+suffix,'Cannon'+suffix,'Pastern'+suffix,(x,y-f,.16*horse.S+h),(x,y+(-1 if front else 1),.5))
        pose_segment(arm,'Pastern'+suffix,ankle,ankle+Vector((0,-.035,-.16*horse.S)))
    for name,axis,angle in [('Neck',(1,0,0),.018*math.sin(cycle)),('Head',(1,0,0),.025*math.sin(cycle+.3)),('Tail',(0,1,0),.05*math.sin(cycle)),('Tail2',(0,1,0),.07*math.sin(cycle-.7))]:
        from mathutils import Quaternion
        arm.pose.bones[name].rotation_quaternion=Quaternion(axis,angle)


def build(family,make,pose,clips):
    arm,mesh=make(); sc=bpy.context.scene; sc.render.fps=FPS; sc.unit_settings.system='METRIC'; sc.unit_settings.scale_length=1
    reset(arm); arm.animation_data_clear()
    common.bake_ao([mesh],strength=.28,distance=.12 if family=='Knight' else .20,samples=16)
    fbx(arm,family)
    info={'triangles':len(mesh.data.loop_triangles),'vertices':len(mesh.data.vertices),'bones':len(arm.data.bones),'materials':len(mesh.data.materials),'clips':{},'anchors':{b.name:[round(float(v),5) for v in b.head_local] for b in arm.data.bones if b.name in ('Hips','Seat','BitL','BitR','GripL','GripR')}}
    for mode,duration in clips.items():
        n=round(duration*FPS); sc.frame_start=1; sc.frame_end=n+1
        action=bpy.data.actions.new(family+'_'+mode); action.use_fake_user=True; arm.animation_data_create(); arm.animation_data.action=action
        stance_error=0
        for frame in range(1,n+2):
            sc.frame_set(frame); pose(arm,(frame-1)/n,mode); key(arm,frame)
            if family=='Knight' and mode in ('Walk','Run','CrouchWalk'):
                duty=.42 if mode=='Run' else .62
                for side,offset in [('L',0),('R',.5)]:
                    if ((frame-1)/n+offset)%1 < duty:
                        stance_error=max(stance_error,abs(arm.pose.bones['Foot'+side].head.z-.09))
            if family=='Horse' and mode!='Idle':
                offsets={'FL':0,'HR':.25,'FR':.5,'HL':.75} if mode=='Walk' else {'HL':0,'HR':.12,'FL':.48,'FR':.60}
                for side,offset in offsets.items():
                    if ((frame-1)/n+offset)%1 < (.64 if mode=='Walk' else .38):
                        stance_error=max(stance_error,abs(arm.pose.bones['Pastern'+side].head.z-.16*horse.S))
        if stance_error>.025: raise RuntimeError(f'{family}/{mode} stance foot error {stance_error}')
        # Every clip closes exactly; all skinned bone channels are baked, no DCC constraints required.
        sc.frame_set(1); fbx(arm,family+'_'+mode,True)
        info['clips'][mode]={'seconds':n/FPS,'frames':n+1,'max_stance_ankle_error_m':round(stance_error,6)}
    select(arm); bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(family+'.blend')))
    REPORT['models'][family]=info
    print('HERO BUILD',family,json.dumps(info))


build('Knight',native_knight,knight_pose,{'Idle':2,'Walk':.75,'Run':.52,'CrouchIdle':2,'CrouchWalk':1,'RideIdle':2,'RideWalk':1,'RideGallop':.6})
build('Horse',native_horse,horse_pose,{'Idle':2,'Walk':1,'Gallop':.6})
for sheet in ('00-knight.png','17-animals.png','19-customization.png'):
    path=REPO/'assets/concepts/references'/sheet
    REPORT.setdefault('references',[]).append({'file':str(path.relative_to(REPO)).replace('\\','/'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(OUT/'manifest.json').write_text(json.dumps(REPORT,indent=2)+'\n',encoding='utf-8')
print('HERO BUILD COMPLETE')
