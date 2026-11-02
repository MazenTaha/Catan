import * as THREE from 'three';
import { clone as cloneRigged } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Weapon } from '@hexfall/engine';

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
}

/** A bone posed by angles about the knight's own side (x), up (y) and forward (z) axes. */
interface Joint {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  pos: THREE.Vector3;
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
 * the sword, fist and revolver, the guard and the riding seat. Model space: front +z, left +x;
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
  readonly steel: THREE.MeshStandardMaterial;
  readonly cloth: THREE.MeshStandardMaterial;
  readonly owner: THREE.MeshStandardMaterial;
  readonly skin: THREE.MeshStandardMaterial;
  private mats: THREE.Material[] = [];
  private joints = new Map<string, Joint>();
  private skins: THREE.SkinnedMesh[] = [];
  private model: THREE.Object3D;
  private gait = 0;
  private time = Math.random() * 10;

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
      if (m.isSkinnedMesh) this.skins.push(m);
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
        axes: [new THREE.Vector3(1, 0, 0).applyQuaternion(inv), new THREE.Vector3(0, 1, 0).applyQuaternion(inv), new THREE.Vector3(0, 0, 1).applyQuaternion(inv)],
        now: [0, 0, 0],
      });
    });
    // Slots, placed at rest in model space and turned to the walker's frame (facing -z).
    this.attach(this.head, 'Head', new THREE.Vector3(0, 1.665, 0.005), 0.55);
    this.attach(this.hand, 'HandR', new THREE.Vector3(-0.252, 0.865, 0.005), 1);
    this.attach(this.forearm, 'ForeArmL', new THREE.Vector3(0.243, 1.04, -0.01), 1);
    model.rotation.y = Math.PI;
    this.root.add(model);
  }

  private attach(slot: THREE.Group, bone: string, at: THREE.Vector3, scale: number) {
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

  pose(dt: number, p: KnightPose, reduce: boolean) {
    this.time += dt;
    const step = 0.6 + p.speed * 0.16;
    // One stride (two footfalls) per 2π; the local player follows the world's footfalls.
    if (p.stride !== undefined) this.gait = p.stride * Math.PI;
    else this.gait += (p.speed * dt * Math.PI) / step;
    const moving = reduce || p.riding ? 0 : Math.min(1, p.speed / 4);
    const run = reduce || p.riding ? 0 : Math.min(1, Math.max(0, (p.speed - 5.5) / 4));
    const g = this.gait;
    const want = new Map<string, Angles>();
    const set = (name: string, x: number, y = 0, z = 0) => want.set(name, [x, y, z]);

    // Legs: the leading leg is fully forward as its foot lands (cos = 1 at a footfall); the
    // knee folds through the swing, high at a run.
    const swing = 0.42 * moving + 0.33 * run;
    const fold = 0.7 * moving + 0.9 * run;
    const leg: Record<string, number> = {};
    SIDES.forEach((s, i) => {
      const c = Math.cos(g + i * Math.PI);
      const back = Math.max(0, -Math.sin(g + i * Math.PI));
      leg[s] = c;
      const thigh = -swing * c - run * 0.25 * back;
      const knee = fold * back * back + 0.12 * run;
      set(`Thigh${s}`, thigh, 0, s === 'L' ? 0.02 : -0.02);
      set(`Shin${s}`, knee);
      set(`Foot${s}`, -(thigh + knee) * 0.55 + 0.25 * run * Math.max(0, -c));
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
    let lean = 0.04 * moving + 0.2 * run;
    let twist = 0.14 * run * leg.L;
    const hipTwist = -0.1 * run * leg.L;

    // Weapons, blows and the guard take over the arms.
    const t = p.attackAge;
    const live = t < p.attackTime && !reduce;
    if (p.riding) {
      arms.L = arms.R = [-0.55, 0, 0];
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
    } else if (p.weapon === 'revolver') {
      const kick = live ? Math.max(0, 1 - t / 0.25) : 0;
      arms.R = [-1.5 + kick * 0.45, 0.12, -0.05];
      fore.R = -0.05 - kick * 0.3;
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
    set('Spine', lean, twist);
    set('Hips', 0, hipTwist);
    set('Head', -lean * 0.6, -twist * 0.5);
    // The cape lifts with the pace and flutters at a run.
    const flow = reduce ? 0 : Math.min(1, p.speed / 10);
    const flutter = reduce ? 0 : Math.sin(this.time * 9) * 0.05 * run + Math.sin(this.time * 1.3) * 0.02;
    set('Cape', 0.08 + flow * 0.65 + lean * 0.5 + flutter);
    set('Cape2', flow * 0.35 + flutter * 1.5);

    // Up between footfalls at a run, a slight dip as each foot takes the weight.
    const hips = this.joints.get('Hips');
    if (hips) {
      const lift = Math.abs(Math.sin(g)) * (0.012 * moving + 0.045 * run) - 0.02 * run;
      hips.bone.position.set(hips.pos.x, hips.pos.y + lift, hips.pos.z);
    }
    const k = reduce ? 1 : Math.min(1, dt * 18);
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
