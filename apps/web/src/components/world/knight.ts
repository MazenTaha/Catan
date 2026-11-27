import * as THREE from 'three';
import { walkingGait, CROUCH_DROP } from './locomotion';
import { clone as cloneRigged } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Weapon } from '@hexfall/engine';
import type { HandPoints } from './reins';

/** A loaded model (an assets.ts LoadedAsset), typed by shape so tests can import this without Vite. */
interface Model {
  root: THREE.Object3D;
}
/** The Blender knight (assets/blender/knight.py), handed over once a world or preview loads it. */
let template: Model | null = null;
export function setKnightModel(asset: Model | null) {
  template = asset;
}
export const knightModel = () => template;

/** Helm per look.hat: great helm, armet, bascinet (open face), bare head, crowned great helm. */
const HELMS = ['HelmGreat', 'HelmArmet', 'HelmBascinet', null, 'HelmCrowned'];
/** Does this helm show the face (and so the beard), and the hair? */
export const HELM_FACE = [false, false, true, true, false];
export const HELM_HAIR = [false, false, false, true, false];

export interface KnightPose {
  speed: number;
  /** Footfalls so far, from the world's stride (the local player), so feet land on the sound. */
  stride?: number;
  weapon: Weapon;
  attackAge: number;
  attackTime: number;
  side: number;
  block: boolean;
  riding: boolean;
  crouch?: number;
  aimTurn?: number;
}

/** A bone posed by angles about the knight's own side (x), up (y) and forward (z) axes. */
interface Joint {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  pos: THREE.Vector3;
  scale: THREE.Vector3;
  axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  now: [number, number, number];
}

type Angles = [number, number, number];
const SIDES = ['L', 'R'] as const;
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/**
 * The knight: one skinned body on 17 bones, with the helm, face and cape choices as further
 * skinned meshes, and slots on the head, right hand and left forearm for the hair, the weapons
 * and the shield. `pose` drives a walk and a run (knees and elbows that bend, arms pumping
 * against the legs, a forward lean, a bounce between footfalls, a cape that streams behind),
 * the sword and fist, the guard and the riding seat. Model space: front +z, left +x;
 * a positive angle about x swings a limb back, so forward is negative.
 */
export class KnightRig {
  /** Faces -z like every walker. */
  readonly root = new THREE.Group();
  /** Hair and beard (the old avatar's head frame, scaled to the knight's head). */
  readonly head = new THREE.Group();
  /** The weapons, held in the right gauntlet. */
  readonly hand = new THREE.Group();
  /** The shield, on the left forearm. */
  readonly forearm = new THREE.Group();
  readonly back = new THREE.Group();
  readonly steel: THREE.MeshStandardMaterial;
  readonly cloth: THREE.MeshStandardMaterial;
  readonly owner: THREE.MeshStandardMaterial;
  readonly skin: THREE.MeshStandardMaterial;
  private mats: THREE.Material[] = [];
  private joints = new Map<string, Joint>();
  private skins: THREE.SkinnedMesh[] = [];
  private model: THREE.Object3D;
  readonly seatHeight: number;
  private gait = 0;
  private time = Math.random() * 10;
  private hipOffset = 0;
  private readonly palms = { left: new THREE.Object3D(), right: new THREE.Object3D() };
  private readonly gripPoints: HandPoints = { left: new THREE.Vector3(), right: new THREE.Vector3() };
  private readonly shoulderPoint = new THREE.Vector3();
  private readonly elbowPoint = new THREE.Vector3();
  private readonly handPoint = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly desiredElbow = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly swing = new THREE.Quaternion();
  private readonly worldRotation = new THREE.Quaternion();
  private readonly parentRotation = new THREE.Quaternion();

  constructor(asset: Model) {
    const model = cloneRigged(asset.root);
    this.model = model;
    const own = new Map<string, THREE.MeshStandardMaterial>();
    const swap = (m: THREE.Material) => {
      const name = m.name.toLowerCase();
      if (!['steel', 'cloth', 'owner', 'skin'].includes(name)) return m;
      let c = own.get(name);
      if (!c) {
        c = (m as THREE.MeshStandardMaterial).clone();
        own.set(name, c);
        this.mats.push(c);
      }
      return c;
    };
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      // Posed by its bones, not merged by RigBaker.
      m.userData.loose = true;
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
      if (m.isSkinnedMesh) {
        // Rest-pose bounds do not contain a running leg or a lifted cape.
        m.frustumCulled = false;
        this.skins.push(m);
      }
    });
    const fallback = () => {
      const m = new THREE.MeshStandardMaterial();
      this.mats.push(m);
      return m;
    };
    this.steel = own.get('steel') ?? fallback();
    this.cloth = own.get('cloth') ?? fallback();
    this.owner = own.get('owner') ?? fallback();
    this.skin = own.get('skin') ?? fallback();

    model.updateMatrixWorld(true);
    const q = new THREE.Quaternion();
    model.traverse((o) => {
      const bone = o as THREE.Bone;
      if (!bone.isBone) return;
      const inv = bone.getWorldQuaternion(q).invert();
      this.joints.set(bone.name, {
        bone,
        rest: bone.quaternion.clone(),
        pos: bone.position.clone(),
        scale: bone.scale.clone(),
        axes: [new THREE.Vector3(1, 0, 0).applyQuaternion(inv), new THREE.Vector3(0, 1, 0).applyQuaternion(inv), new THREE.Vector3(0, 0, 1).applyQuaternion(inv)],
        now: [0, 0, 0],
      });
    });
    this.seatHeight = this.joints.get('Hips')!.bone.getWorldPosition(new THREE.Vector3()).y;
    // Slots, placed at rest in model space and turned to the walker's frame (facing -z).
    this.attach(this.head, 'Head', new THREE.Vector3(0, 1.665, 0.005), 0.55);
    this.attach(this.hand, 'HandR', new THREE.Vector3(-0.252, 0.865, 0.005), 1);
    this.attach(this.forearm, 'ForeArmL', new THREE.Vector3(0.243, 1.04, -0.01), 1);
    this.attach(this.back, 'Spine', new THREE.Vector3(0.26, 1.12, -0.23), 1);
    this.palms.left.name = 'ReinGripL';
    this.palms.right.name = 'ReinGripR';
    this.attach(this.palms.left, 'HandL', new THREE.Vector3(0.252, 0.865, 0.005), 1);
    this.attach(this.palms.right, 'HandR', new THREE.Vector3(-0.252, 0.865, 0.005), 1);
    model.rotation.y = Math.PI;
    this.root.add(model);
  }

  private attach(slot: THREE.Object3D, bone: string, at: THREE.Vector3, scale: number) {
    const b = this.joints.get(bone)?.bone;
    if (!b) return;
    const want = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(scale, scale, scale));
    const local = b.matrixWorld.clone().invert().multiply(want);
    local.decompose(slot.position, slot.quaternion, slot.scale);
    b.add(slot);
  }

  /** Shows one helm (or none), the face under an open one, and the chosen cape. */
  setLook(hat: number, cape: number) {
    const helm = HELMS[hat] ?? HELMS[0];
    for (const name of HELMS) if (name) this.show(name, name === helm);
    this.show('KnightFace', HELM_FACE[hat] ?? false);
    this.show('CapeShort', cape === 1);
    this.show('CapeLong', cape === 2);
  }

  private show(name: string, on: boolean) {
    const o = this.model.getObjectByName(name);
    if (o) o.visible = on;
  }

  /** Analytic arm IK: hands stay on the moving tack instead of hovering in a fixed pose. */
  holdReins(targets: HandPoints, both: boolean): HandPoints {
    this.root.updateWorldMatrix(true, true);
    for (const [key, side] of [['left', 'L'], ['right', 'R']] as const) {
      if (key === 'right' && !both) continue;
      const arm = this.joints.get(`Arm${side}`)!.bone;
      const fore = this.joints.get(`ForeArm${side}`)!.bone;
      const palm = this.palms[key];
      arm.getWorldPosition(this.shoulderPoint);
      fore.getWorldPosition(this.elbowPoint);
      palm.getWorldPosition(this.handPoint);
      const upper = this.shoulderPoint.distanceTo(this.elbowPoint);
      const lower = this.elbowPoint.distanceTo(this.handPoint);
      this.direction.subVectors(targets[key], this.shoulderPoint);
      const distance = THREE.MathUtils.clamp(this.direction.length(), Math.abs(upper - lower) + 0.001, upper + lower - 0.001);
      this.direction.normalize();
      // Elbows bend down and out, consistently through turns and all horse gaits.
      this.pole.set(key === 'left' ? -0.7 : 0.7, -1, 0.15).applyQuaternion(this.root.getWorldQuaternion(this.worldRotation));
      this.pole.addScaledVector(this.direction, -this.pole.dot(this.direction)).normalize();
      const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
      this.desiredElbow.copy(this.shoulderPoint).addScaledVector(this.direction, along).addScaledVector(this.pole, Math.sqrt(Math.max(0, upper * upper - along * along)));
      this.pointBone(arm, this.elbowPoint, this.desiredElbow);
      fore.getWorldPosition(this.elbowPoint);
      palm.getWorldPosition(this.handPoint);
      this.pointBone(fore, this.handPoint, targets[key]);
    }
    this.palms.left.getWorldPosition(this.gripPoints.left);
    this.palms.right.getWorldPosition(this.gripPoints.right);
    return this.gripPoints;
  }

  private pointBone(bone: THREE.Bone, end: THREE.Vector3, target: THREE.Vector3) {
    bone.getWorldPosition(this.shoulderPoint);
    this.from.subVectors(end, this.shoulderPoint).normalize();
    this.to.subVectors(target, this.shoulderPoint).normalize();
    this.swing.setFromUnitVectors(this.from, this.to);
    bone.getWorldQuaternion(this.worldRotation).premultiply(this.swing);
    bone.parent!.getWorldQuaternion(this.parentRotation).invert();
    bone.quaternion.copy(this.parentRotation).multiply(this.worldRotation);
    bone.updateWorldMatrix(false, true);
  }

  pose(dt: number, p: KnightPose, reduce: boolean) {
    this.time += dt;
    const crouch = p.riding ? 0 : p.crouch ?? 0;
    const motion = walkingGait(p.speed, crouch);
    const step = motion.step;
    // One stride (two footfalls) per 2π; the local player follows the world's footfalls.
    if (p.stride !== undefined) this.gait = p.stride * Math.PI;
    else this.gait += (p.speed * dt * Math.PI) / step;
    const moving = reduce || p.riding ? 0 : motion.moving;
    const run = reduce || p.riding ? 0 : motion.run;
    const g = this.gait;
    const want = new Map<string, Angles>();
    const set = (name: string, x: number, y = 0, z = 0) => want.set(name, [x, y, z]);

    // Legs: the leading leg is fully forward as its foot lands (cos = 1 at a footfall); the
    // knee folds through the swing, high at a run.
    const swing = reduce || p.riding ? 0 : motion.swing;
    const upper = this.joints.get('ShinL')!.pos.length();
    const lower = this.joints.get('FootL')!.pos.length();
    const reach = upper + lower;
    const stride = reach * Math.sin(swing) * Math.cos(g);
    // Follow the stance leg's arc with the pelvis, so its foot can reach the floor.
    // Use the same solve while rising: switching from IK to a different gait caused a pop.
    const hipArc = reach - Math.sqrt(Math.max(0, reach * reach - stride * stride));
    const leg: Record<string, number> = {};
    SIDES.forEach((s, i) => {
      const c = Math.cos(g + i * Math.PI);
      const back = Math.max(0, -Math.sin(g + i * Math.PI));
      leg[s] = c;
      const forward = 0.08 * crouch + reach * Math.sin(swing) * c;
      const down = reach - hipArc - CROUCH_DROP * crouch - (0.04 * moving + 0.16 * run) * back * back;
      const knee = Math.acos(THREE.MathUtils.clamp((forward * forward + down * down - upper * upper - lower * lower) / (2 * upper * lower), -1, 1));
      const thigh = -Math.atan2(forward, down) - Math.atan2(lower * Math.sin(knee), upper + lower * Math.cos(knee));
      set(`Thigh${s}`, thigh, 0, s === 'L' ? 0.02 : -0.02);
      set(`Shin${s}`, knee);
      set(`Foot${s}`, -(thigh + knee) * (0.55 + 0.45 * crouch) + 0.25 * run * Math.max(0, -c));
    });
    // Arms pump against the legs, elbows bent more the faster the pace.
    const pump = 0.32 * moving + 0.55 * run;
    const elbow = 0.18 + 0.25 * moving + 0.95 * run;
    const arms: Record<string, Angles> = {};
    const fore: Record<string, number> = {};
    SIDES.forEach((s) => {
      const opp = leg[s === 'L' ? 'R' : 'L'];
      arms[s] = [-pump * opp, 0, s === 'L' ? 0.1 : -0.1];
      fore[s] = -elbow - 0.35 * run * Math.max(0, opp);
    });
    let lean = 0.04 * moving + 0.2 * run + 0.25 * crouch;
    let twist = 0.14 * run * leg.L;
    const hipTwist = -0.1 * run * leg.L;

    // Weapons, blows and the guard take over the arms.
    const t = p.attackAge;
    const live = t < p.attackTime && !reduce;
    if (p.riding) {
      arms.L = [-0.55, 0, 0.12];
      arms.R = [-0.55, 0, -0.12];
      fore.L = fore.R = -0.85;
      arms.L[2] = 0.12;
      arms.R[2] = -0.12;
      lean = 0.06;
      twist = 0;
    }
    if (p.weapon === 'sword') {
      arms.R = [-0.45, 0, -0.12];
      fore.R = -0.6;
      if (live) {
        // Anticipation, a fast diagonal cut, then recovery.
        const s = t < 0.15 ? -t / 0.15 : t < 0.27 ? -1 + ((t - 0.15) / 0.12) * 2 : Math.max(0, 1 - (t - 0.27) / 0.31);
        arms.R = [-0.45 - s * 1.1, s * 0.9 * p.side, -0.12 - s * 0.35];
        fore.R = -0.6 + s * 0.45;
        twist = -s * 0.4 * p.side;
        lean += s * 0.08;
      }
      // The shield held across the body.
      arms.L = [-0.35, 0, 0.18];
      fore.L = -1.25;
    } else if (live) {
      // A jab: pull back, punch out, recover.
      const s = t < 0.12 ? -t / 0.12 : t < 0.22 ? -1 + ((t - 0.12) / 0.1) * 2.4 : Math.max(0, 1.4 - ((t - 0.22) / 0.2) * 1.4);
      arms.R = [-0.7 - s * 0.6, 0, -0.1];
      fore.R = -1.5 + Math.max(0, s) * 1.35;
      arms.L = [-0.8, 0, 0.12];
      fore.L = -1.7;
      twist = s * 0.3;
    }
    if (p.block) {
      if (p.weapon === 'sword') {
        // The blade level across the body, the shield up.
        arms.R = [-1.2, -0.7, -0.25];
        fore.R = -0.9;
        arms.L = [-1.0, 0, 0.3];
        fore.L = -1.3;
      } else {
        arms.L = [-1.15, 0, 0.35];
        arms.R = [-1.15, 0, -0.35];
        fore.L = fore.R = -1.6;
      }
    }
    SIDES.forEach((s) => {
      set(`Arm${s}`, ...arms[s]);
      set(`ForeArm${s}`, fore[s]);
      set(`Hand${s}`, s === 'R' && p.weapon !== 'fist' ? 0.1 : 0);
    });
    if (p.riding) {
      for (const s of SIDES) {
        set(`Thigh${s}`, -1.3, 0, s === 'L' ? 0.38 : -0.38);
        set(`Shin${s}`, 1.35);
        set(`Foot${s}`, -0.15);
      }
    }
    if (p.riding && (p.weapon !== 'fist' || live || p.block)) twist += THREE.MathUtils.clamp(p.aimTurn ?? 0, -0.65, 0.65);
    set('Spine', lean, twist);
    set('Hips', 0, hipTwist);
    set('Head', -lean * 0.6, -twist * 0.5);
    // The cape lifts with the pace and flutters at a run.
    const flow = reduce ? 0 : Math.min(1, p.speed / 10);
    const flutter = reduce ? 0 : Math.sin(this.time * 2.4) * 0.012 * (0.3 + flow);
    // Counter the torso lean; gather the lower cloth instead of kicking the whole cape up.
    set('Cape', (p.riding ? 0.75 : 0.12) + flow * 0.25 - lean * 0.8 + flutter);
    set('Cape2', (p.riding ? -0.3 : crouch * 0.1) + flow * 0.12 + flutter * 0.6);
    const lowerCape = this.joints.get('Cape2');
    if (lowerCape) {
      lowerCape.bone.scale.copy(lowerCape.scale);
      lowerCape.bone.scale.y *= 1 - crouch * 0.38;
    }

    // Up between footfalls at a run, a slight dip as each foot takes the weight.
    const k = reduce ? 1 : 1 - Math.exp(-dt * 32);
    const hips = this.joints.get('Hips');
    if (hips) {
      const lift = p.riding ? 0 : -hipArc;
      this.hipOffset = p.riding ? 0 : this.hipOffset + (lift - crouch * CROUCH_DROP - this.hipOffset) * k;
      hips.bone.position.set(hips.pos.x, hips.pos.y + this.hipOffset, hips.pos.z - crouch * 0.08);
    }
    for (const [name, j] of this.joints) {
      const a = want.get(name) ?? [0, 0, 0];
      for (let i = 0; i < 3; i++) j.now[i] += (a[i] - j.now[i]) * k;
      j.bone.quaternion
        .copy(j.rest)
        .multiply(qa.setFromAxisAngle(j.axes[0], j.now[0]))
        .multiply(qb.setFromAxisAngle(j.axes[1], j.now[1]))
        .multiply(qa.setFromAxisAngle(j.axes[2], j.now[2]));
    }
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    for (const s of this.skins) s.skeleton.dispose();
  }
}
