import * as THREE from 'three';
import { clone as cloneRigged } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { LoadedAsset } from './assets';
import { RigBaker } from './rig';

const box = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.SphereGeometry(1, 14, 10);
const tube = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);

/** Coats and their mane and tail: bay, dark bay, chestnut, grey, black, palomino. */
const COATS = ['#7a4a2a', '#4a2e1e', '#9a5a2e', '#c9c4bb', '#2c2725', '#d2a75c'];
const HAIR = ['#1b1512', '#141010', '#6e3a1c', '#e6e1d8', '#161313', '#f1e6cc'];

/** The Blender horse (assets/blender/horse.py), handed over once the world has loaded it. */
let template: LoadedAsset | null = null;
export function setHorseModel(asset: LoadedAsset | null) {
  template = asset;
}

/** A bone posed by angles about the horse's own side (pitch) and up (yaw) axes. */
interface Joint {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
  pos: THREE.Vector3;
  side: THREE.Vector3;
  up: THREE.Vector3;
  pitch: number;
  yaw: number;
}

type Leg = 'FL' | 'FR' | 'HL' | 'HR';
const LEGS: Leg[] = ['FL', 'FR', 'HL', 'HR'];
/**
 * Footfalls per gait: metres per stride, the share of it a hoof bears weight, the leg's swing
 * (rad), how far the joints fold in the air, and each leg's phase (the walk's four beats, the
 * trot's diagonal pairs, the gallop's lead).
 */
const GAITS = {
  walk: { stride: 1.7, duty: 0.62, swing: 0.3, flex: 0.85, phase: { HL: 0, FL: 0.25, HR: 0.5, FR: 0.75 } },
  trot: { stride: 3.6, duty: 0.45, swing: 0.4, flex: 1.2, phase: { HL: 0, FR: 0, HR: 0.5, FL: 0.5 } },
  gallop: { stride: 6.5, duty: 0.36, swing: 0.6, flex: 1.45, phase: { HR: 0, HL: 0.1, FR: 0.38, FL: 0.48 } },
};

/**
 * A saddled horse. The Blender model is one skinned mesh on 17 bones whose gait follows its
 * speed: a four-beat walk, a trot, then a gallop, the strides matched to the ground covered.
 * Without the model it is built from simple shapes merged per joint (`RigBaker`). Faces -z
 * like the walker; the saddle blanket shows the rider's seat colour.
 */
export class Horse {
  readonly root = new THREE.Group();
  /** Height of the saddle's seat above the ground (m). */
  readonly saddleHeight: number;
  /** Grazing (head down) when idle and nobody rides. */
  grazing = false;
  private mats: THREE.Material[] = [];
  private blanket: THREE.MeshStandardMaterial;
  private t = Math.random() * 10;
  // The Blender model.
  private joints = new Map<string, Joint>();
  private skins: THREE.SkinnedMesh[] = [];
  // The procedural fallback.
  private body = new THREE.Group();
  private neck = new THREE.Group();
  private tail = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group; phase: number }[] = [];
  private rig: RigBaker | null = null;

  constructor(color = '#b0364a', private reduce = false, coat = 0) {
    const hue = coat % COATS.length;
    if (template) {
      this.blanket = this.fromModel(template, color, hue);
      this.saddleHeight = 1.65;
    } else {
      this.blanket = this.procedural(color, hue);
      this.saddleHeight = 1.62;
    }
  }

  private fromModel(asset: LoadedAsset, color: string, hue: number) {
    const model = cloneRigged(asset.root);
    let blanket: THREE.MeshStandardMaterial | null = null;
    const tint = (m: THREE.Material) => {
      const name = m.name.toLowerCase();
      if (!['coat', 'hair', 'owner_blanket'].includes(name)) return m;
      const own = (m as THREE.MeshStandardMaterial).clone();
      own.color.set(name === 'coat' ? COATS[hue] : name === 'hair' ? HAIR[hue] : color);
      if (name === 'owner_blanket') blanket = own;
      this.mats.push(own);
      return own;
    };
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      m.material = Array.isArray(m.material) ? m.material.map(tint) : tint(m.material);
      if (m.isSkinnedMesh) this.skins.push(m);
    });
    // Each bone's side and up axes in its own frame, from the rest pose (model space: front +z).
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
        side: new THREE.Vector3(1, 0, 0).applyQuaternion(inv),
        up: new THREE.Vector3(0, 1, 0).applyQuaternion(inv),
        pitch: 0,
        yaw: 0,
      });
    });
    model.rotation.y = Math.PI;
    this.root.add(model);
    return blanket ?? new THREE.MeshStandardMaterial();
  }

  /** Barrel, neck, head with ears and mane, four jointed legs and a tail, from simple shapes. */
  private procedural(color: string, hue: number) {
    this.rig = new RigBaker(0.85);
    const hide = this.mat(COATS[hue], 0.85);
    const dark = this.mat('#1c1512', 0.8);
    const leather = this.mat('#4a3020', 0.7);
    const hoof = this.mat('#2b2420', 0.6);
    const brass = this.mat('#b8964f', 0.4, 0.7);
    const blanket = this.mat(color, 0.9);
    this.body.position.y = 1.32;
    this.root.add(this.body);
    this.part(this.body, hide, 0, 0, 0, 0.62, 0.66, 1.72, ball);
    this.part(this.body, hide, 0, 0.04, 0.62, 0.58, 0.62, 0.62, ball);
    this.part(this.body, hide, 0, 0.06, -0.6, 0.56, 0.62, 0.6, ball);
    // Saddle: blanket in the rider's colour, leather seat, cantle, pommel and stirrups.
    this.part(this.body, blanket, 0, 0.3, 0.02, 0.7, 0.06, 0.82);
    this.part(this.body, leather, 0, 0.36, 0.02, 0.5, 0.1, 0.62);
    this.part(this.body, leather, 0, 0.45, 0.3, 0.42, 0.14, 0.1);
    this.part(this.body, leather, 0, 0.44, -0.24, 0.16, 0.16, 0.1);
    for (const x of [-0.36, 0.36]) {
      this.part(this.body, leather, x, 0.05, 0.02, 0.02, 0.5, 0.04);
      this.part(this.body, brass, x, -0.22, 0.02, 0.05, 0.04, 0.12);
    }
    // Neck and head, pivoting at the withers so it can drop to graze.
    this.neck.position.set(0, 0.25, -0.72);
    this.body.add(this.neck);
    const n = this.part(this.neck, hide, 0, 0.36, -0.2, 0.36, 0.86, 0.42, tube);
    n.rotation.x = -0.55;
    const mane = this.part(this.neck, dark, 0, 0.5, -0.06, 0.08, 0.8, 0.14);
    mane.rotation.x = -0.55;
    const head = new THREE.Group();
    head.position.set(0, 0.78, -0.48);
    this.neck.add(head);
    const skull = this.part(head, hide, 0, 0, -0.18, 0.28, 0.3, 0.62);
    skull.rotation.x = 0.55;
    this.part(head, hide, 0, -0.18, -0.42, 0.22, 0.2, 0.3, ball);
    for (const x of [-0.08, 0.08]) {
      this.part(head, hide, x, 0.22, 0.02, 0.06, 0.16, 0.05).rotation.x = -0.2;
      this.part(head, dark, x * 1.6, 0.02, -0.2, 0.035, 0.04, 0.04, ball);
      this.part(head, dark, x * 0.7, -0.26, -0.55, 0.03, 0.03, 0.03, ball);
    }
    this.part(head, leather, 0, -0.08, -0.32, 0.3, 0.035, 0.035).rotation.y = Math.PI / 2;
    // Reins from the bit to the saddle.
    const rein = this.part(this.body, leather, 0, 0.55, -0.62, 0.02, 0.02, 0.9);
    rein.rotation.x = 0.55;
    // Tail.
    this.tail.position.set(0, 0.2, 0.92);
    this.body.add(this.tail);
    const tail = this.part(this.tail, dark, 0, -0.38, 0.12, 0.13, 0.8, 0.13, tube);
    tail.rotation.x = 0.3;
    // Legs: hip and knee joints, dark lower legs and hooves.
    const at: [number, number, number][] = [
      [-0.24, -0.62, 0],
      [0.24, -0.62, 0.5],
      [-0.22, 0.62, 0.25],
      [0.22, 0.62, 0.75],
    ];
    for (const [x, z, phase] of at) {
      const hip = new THREE.Group();
      hip.position.set(x, -0.28, z);
      this.body.add(hip);
      this.part(hip, hide, 0, -0.3, 0, 0.19, 0.62, 0.22, tube);
      const knee = new THREE.Group();
      knee.position.y = -0.6;
      hip.add(knee);
      this.part(knee, dark, 0, -0.22, 0, 0.1, 0.46, 0.1, tube);
      this.part(knee, hoof, 0, -0.46, -0.02, 0.14, 0.08, 0.16, tube);
      this.legs.push({ hip, knee, phase });
    }
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    this.bake();
    return blanket;
  }

  private bake() {
    this.rig?.bake(this.root, [this.body, this.neck, this.tail, ...this.legs.flatMap((l) => [l.hip, l.knee])]);
  }

  private mat(color: string, roughness: number, metalness = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.mats.push(m);
    return m;
  }

  private part(p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, g: THREE.BufferGeometry = box) {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    p.add(mesh);
    return mesh;
  }

  setColor(color: string) {
    this.blanket.color.set(color);
    this.bake();
  }

  /** Poses the horse for a speed (m/s): standing (grazing if left alone), walking, trotting, galloping. */
  update(dt: number, speed: number) {
    if (this.joints.size) this.pose(dt, speed);
    else this.poseProcedural(dt, speed);
  }

  private pose(dt: number, speed: number) {
    const target = new Map<string, [pitch: number, yaw: number]>();
    const set = (name: string, pitch: number, yaw = 0) => target.set(name, [pitch, yaw]);
    const now = performance.now() / 1000;
    const grazing = this.grazing && speed < 0.1;
    const g = this.reduce || speed < 0.1 ? null : speed < 4 ? GAITS.walk : speed < 9 ? GAITS.trot : GAITS.gallop;
    if (g) this.t += (dt * speed) / g.stride;
    for (const leg of LEGS) {
      let swing = 0;
      let lift = 0;
      if (g) {
        const p = (((this.t + g.phase[leg]) % 1) + 1) % 1;
        if (p < g.duty) swing = g.swing * (1 - (2 * p) / g.duty);
        else {
          const u = (p - g.duty) / (1 - g.duty);
          swing = g.swing * (-1 + 2 * u * u * (3 - 2 * u));
          lift = Math.sin(Math.PI * u) * g.flex;
        }
      }
      // In model space a positive pitch swings a leg back; joints fold the hoof up behind.
      const front = leg[0] === 'F';
      set(`Upper${leg}`, -swing - (front ? 0 : lift * 0.2));
      set(`Cannon${leg}`, lift * (front ? 1 : 0.8));
      set(`Pastern${leg}`, lift * 0.5);
    }
    const phase = this.t * Math.PI * 2;
    const gallop = g === GAITS.gallop;
    const bob = !g ? 0 : gallop ? Math.abs(Math.sin(phase)) * 0.07 : Math.abs(Math.sin(phase)) * (g === GAITS.trot ? 0.04 : 0.015);
    const body = this.joints.get('Body');
    if (body) body.bone.position.set(body.pos.x, body.pos.y + bob, body.pos.z);
    set('Body', gallop ? Math.sin(phase) * 0.05 : 0);
    // The head nods with the stride, or drops to graze and crop.
    const nod = !g ? 0 : gallop ? Math.sin(phase) * 0.12 : Math.sin(phase * 2) * 0.05;
    set('Neck', grazing ? 1.05 + Math.sin(now * 0.7) * 0.04 : nod);
    set('Head', grazing ? 0.25 + Math.max(0, Math.sin(now * 5)) * 0.06 : 0);
    // The tail swishes at flies, and lifts as the pace rises.
    const swish = this.reduce ? 0 : Math.sin(now * 1.6 + this.t) * 0.18 + Math.sin(now * 0.37) * 0.1;
    set('Tail', !g ? 0 : gallop ? 0.55 : g === GAITS.trot ? 0.25 : 0.05, swish);
    set('Tail2', g ? -0.15 : 0, swish * 0.8);
    const k = this.reduce ? 1 : Math.min(1, dt * 14);
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    for (const [name, j] of this.joints) {
      const [pitch, yaw] = target.get(name) ?? [0, 0];
      j.pitch += (pitch - j.pitch) * k;
      j.yaw += (yaw - j.yaw) * k;
      j.bone.quaternion.copy(j.rest).multiply(qa.setFromAxisAngle(j.side, j.pitch)).multiply(qb.setFromAxisAngle(j.up, j.yaw));
    }
  }

  private poseProcedural(dt: number, speed: number) {
    if (this.reduce) {
      this.neck.rotation.x = this.grazing && speed < 0.1 ? 0.9 : 0;
      return;
    }
    const gallop = speed > 9;
    this.t += dt * (speed < 0.1 ? 0 : gallop ? 9 : 5.5);
    const amp = speed < 0.1 ? 0 : gallop ? 0.75 : 0.42;
    for (const l of this.legs) {
      l.hip.rotation.x = Math.sin(this.t + l.phase * Math.PI * 2) * amp;
      l.knee.rotation.x = Math.max(0, -Math.cos(this.t + l.phase * Math.PI * 2)) * amp * 1.4;
    }
    this.body.position.y = 1.32 + (gallop ? Math.abs(Math.sin(this.t)) * 0.08 : 0);
    this.body.rotation.x = gallop ? Math.sin(this.t) * 0.05 : 0;
    const graze = this.grazing && speed < 0.1 ? 0.9 + Math.sin(performance.now() / 900) * 0.05 : 0;
    this.neck.rotation.x += (graze + (gallop ? Math.sin(this.t) * 0.1 : 0) - this.neck.rotation.x) * Math.min(1, dt * 3);
    this.tail.rotation.z = Math.sin(performance.now() / 600) * 0.15;
    this.tail.rotation.x = gallop ? 0.6 : 0.1;
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.mats) m.dispose();
    for (const s of this.skins) s.skeleton.dispose();
    this.rig?.dispose();
  }
}
