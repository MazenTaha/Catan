import * as THREE from 'three';
import type { Weapon } from '@hexfall/engine';
import { DEFAULT_LOOK, type CharacterLook } from '@hexfall/net';
import { HAIR_COLOR, OUTFIT, SKIN } from './looks';

export interface AvatarPose {
  /** Walking speed (m/s). */
  speed: number;
  weapon: Weapon;
  /** Seconds since the last attack started (large when idle). */
  attackAge: number;
  /** Alternates the sword's cutting side. */
  side: number;
  block: boolean;
  riding: boolean;
}

/** How long each attack plays (s). */
export const ATTACK_TIME: Record<Weapon, number> = { fist: 0.42, sword: 0.58, revolver: 0.42 };

const box = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.SphereGeometry(1, 14, 10);
const tube = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);

/**
 * A player's character in the 3D walk, built from simple shapes in their chosen look: skin,
 * hair, beard, tunic, hat and cape, with the seat colour on the shoulders, sash and cape so
 * everyone can tell who is who. Arms and legs are pivots, posed each frame by `update`.
 */
export class Avatar {
  readonly root = new THREE.Group();
  /** Everything above the hips; leans and twists with blows. */
  readonly body = new THREE.Group();
  readonly arm = new THREE.Group();
  readonly offArm = new THREE.Group();
  readonly legs = [new THREE.Group(), new THREE.Group()];
  readonly sword = new THREE.Group();
  readonly revolver = new THREE.Group();
  readonly shield = new THREE.Group();
  readonly muzzle = new THREE.Group();
  private head = new THREE.Group();
  private styled = new THREE.Group();
  private cape = new THREE.Group();
  private gait = 0;
  private mats: THREE.Material[] = [];
  private skin: THREE.MeshStandardMaterial;
  private cloth: THREE.MeshStandardMaterial;
  private seat: THREE.MeshStandardMaterial;
  private hair: THREE.MeshStandardMaterial;
  private flash = 0;

  constructor(
    look: CharacterLook = DEFAULT_LOOK,
    seatColor = '#3f7fd4',
    private reduce = false,
  ) {
    this.skin = this.mat('#d9a77f', 0.9);
    this.cloth = this.mat('#3f5f8a', 0.95);
    this.seat = this.mat(seatColor, 0.8);
    this.hair = this.mat('#4a2f1f', 1);
    const leather = this.mat('#51382b', 0.85);
    const boot = this.mat('#3a2a20', 0.8);
    const steel = this.mat('#a3adb2', 0.45, 0.65);
    const wood = this.mat('#765039', 1);
    const dark = this.mat('#1d1715', 0.6);

    const b = this.body;
    b.position.y = 0.78;
    this.root.add(b);
    // Torso: tunic, belt, sash and shoulder plates in the seat colour.
    this.part(b, this.cloth, 0, 0.32, 0, 0.5, 0.62, 0.32, tube).scale.set(0.5, 0.62, 0.32);
    this.part(b, this.cloth, 0, -0.04, 0, 0.62, 0.3, 0.4, tube);
    this.part(b, leather, 0, 0.04, 0, 0.53, 0.08, 0.35, tube);
    this.part(b, this.mat('#c9a24b', 0.4, 0.7), 0, 0.04, -0.18, 0.08, 0.07, 0.03);
    const sash = this.part(b, this.seat, 0, 0.36, 0, 0.56, 0.08, 0.36);
    sash.rotation.z = 0.75;
    sash.scale.set(0.62, 0.08, 0.35);
    for (const x of [-0.27, 0.27]) this.part(b, this.seat, x, 0.6, 0, 0.17, 0.09, 0.2, ball);

    // Head with eyes and nose; hair, beard and hat are swapped by setLook.
    this.head.position.set(0, 0.86, 0);
    b.add(this.head);
    this.part(this.head, this.skin, 0, 0, 0, 0.17, 0.2, 0.17, ball);
    this.part(this.head, this.skin, 0, -0.18, 0, 0.07, 0.08, 0.07, tube);
    for (const x of [-0.06, 0.06]) this.part(this.head, dark, x, 0.03, -0.15, 0.022, 0.026, 0.015, ball);
    this.part(this.head, this.skin, 0, -0.02, -0.17, 0.03, 0.05, 0.04, ball);
    this.head.add(this.styled);
    b.add(this.cape);

    // Arms hang from the shoulders; the right holds the weapon, the left the shield.
    const arm = (g: THREE.Group, x: number) => {
      g.position.set(x, 0.58, 0);
      b.add(g);
      this.part(g, this.cloth, 0, -0.17, 0, 0.13, 0.36, 0.13, tube);
      this.part(g, leather, 0, -0.42, 0, 0.12, 0.2, 0.12, tube);
      this.part(g, this.skin, 0, -0.56, -0.01, 0.065, 0.07, 0.07, ball);
    };
    arm(this.arm, 0.33);
    arm(this.offArm, -0.33);
    this.legs.forEach((leg, i) => {
      leg.position.set(i ? 0.12 : -0.12, 0.8, 0);
      this.root.add(leg);
      this.part(leg, this.mat('#4b4037', 0.95), 0, -0.24, 0, 0.17, 0.46, 0.17, tube);
      this.part(leg, boot, 0, -0.62, -0.04, 0.17, 0.3, 0.24);
    });

    // Sword: blade, fuller, guard, grip and pommel, held point-forward in the right hand.
    const hand = new THREE.Group();
    hand.position.set(0, -0.56, -0.02);
    this.arm.add(hand);
    hand.add(this.sword, this.revolver);
    this.part(this.sword, steel, 0, 0, -0.62, 0.075, 0.025, 0.95);
    this.part(this.sword, this.mat('#7f8a90', 0.4, 0.7), 0, 0.014, -0.62, 0.016, 0.006, 0.85);
    this.part(this.sword, this.mat('#a78c54', 0.5, 0.6), 0, 0, -0.12, 0.3, 0.05, 0.05);
    this.part(this.sword, leather, 0, 0, 0.02, 0.05, 0.05, 0.2, tube).rotation.x = Math.PI / 2;
    this.part(this.sword, this.mat('#a78c54', 0.5, 0.6), 0, 0, 0.14, 0.05, 0.05, 0.05, ball);
    // Revolver: blued barrel, cylinder, walnut grip, brass trigger guard.
    const blued = this.mat('#303c43', 0.5, 0.7);
    const grip = this.part(this.revolver, wood, 0, -0.05, 0.03, 0.06, 0.16, 0.08);
    grip.rotation.x = -0.35;
    this.part(this.revolver, blued, 0, 0.05, -0.16, 0.045, 0.045, 0.3);
    const cyl = this.part(this.revolver, blued, 0, 0.04, -0.04, 0.09, 0.09, 0.1, tube);
    cyl.rotation.x = Math.PI / 2;
    this.part(this.revolver, this.mat('#a78c54', 0.5, 0.6), 0, -0.02, -0.03, 0.03, 0.04, 0.08);
    this.muzzle.position.set(0, 0.05, -0.33);
    this.revolver.add(this.muzzle);
    // Round shield on the left forearm, boss and rim in iron, face in the seat colour.
    this.shield.position.set(-0.06, -0.38, -0.06);
    this.offArm.add(this.shield);
    const face = this.part(this.shield, this.seat, 0, 0, 0, 0.56, 0.05, 0.56, tube);
    face.rotation.z = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 20), steel);
    rim.rotation.y = Math.PI / 2;
    this.shield.add(rim);
    this.part(this.shield, steel, -0.04, 0, 0, 0.06, 0.1, 0.1, ball);
    this.shield.rotation.y = -0.2;

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    this.setLook(look);
    this.setWeapon('fist');
  }

  private mat(color: string, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.mats.push(m);
    return m;
  }

  private part(
    parent: THREE.Object3D,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    geo: THREE.BufferGeometry = box,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  setSeatColor(color: string) {
    this.seat.color.set(color);
  }

  setLook(look: CharacterLook) {
    this.skin.color.set(SKIN[look.skin] ?? SKIN[1]);
    this.cloth.color.set(OUTFIT[look.outfit] ?? OUTFIT[0]);
    this.hair.color.set(HAIR_COLOR[look.hairColor] ?? HAIR_COLOR[1]);
    for (const c of [...this.styled.children, ...this.cape.children]) c.removeFromParent();
    const h = this.styled;
    const hair = this.hair;
    const hat = look.hat;
    // Hair (a helm or hood covers the top of it).
    if (look.hair > 0 && hat !== 3 && hat !== 1) this.part(h, hair, 0, 0.05, 0.015, 0.18, 0.18, 0.18, ball).scale.set(0.182, 0.17, 0.185);
    if (look.hair === 2) this.part(h, hair, 0, -0.1, 0.1, 0.3, 0.3, 0.1);
    if (look.hair === 3) {
      const braid = this.part(h, hair, 0, -0.2, 0.17, 0.06, 0.32, 0.06, tube);
      braid.rotation.x = 0.25;
    }
    if (look.hair === 4) this.part(h, hair, 0, 0.21, 0.04, 0.07, 0.07, 0.07, ball);
    if (look.hair === 5)
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        this.part(h, hair, Math.cos(a) * 0.15, 0.07 + Math.sin(i * 1.7) * 0.03, Math.sin(a) * 0.15 + 0.02, 0.06, 0.06, 0.06, ball);
      }
    // Beard.
    if (look.beard === 1) this.part(h, hair, 0, -0.1, -0.08, 0.14, 0.08, 0.11, ball).material = this.mat('#5a4a3c', 1);
    if (look.beard >= 2) this.part(h, hair, 0, -0.12, -0.1, 0.13, 0.13, 0.1, ball);
    if (look.beard === 3) this.part(h, hair, 0, -0.27, -0.13, 0.04, 0.14, 0.04, tube);
    // Hats.
    const leather = this.mat('#5d4030', 0.85);
    if (hat === 1) {
      const hood = this.mat(OUTFIT[look.outfit] ?? OUTFIT[0], 1);
      (hood as THREE.MeshStandardMaterial).color.multiplyScalar(0.7);
      this.part(h, hood, 0, 0.04, 0.03, 0.21, 0.23, 0.21, ball);
      this.part(h, hood, 0, -0.17, 0.05, 0.24, 0.1, 0.22, tube);
    }
    if (hat === 2) {
      this.part(h, leather, 0, 0.12, 0, 0.36, 0.1, 0.36, tube);
      this.part(h, leather, 0, 0.08, -0.02, 0.44, 0.02, 0.46, tube);
    }
    if (hat === 3) {
      const iron = this.mat('#8f9aa0', 0.45, 0.7);
      this.part(h, iron, 0, 0.05, 0, 0.19, 0.19, 0.19, ball);
      this.part(h, iron, 0, -0.03, -0.18, 0.025, 0.12, 0.02);
      this.part(h, iron, 0, 0.0, 0, 0.4, 0.03, 0.4, tube);
    }
    if (hat === 4) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 6, 24), this.mat('#d8b45a', 0.35, 0.8));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.09;
      h.add(ring);
    }
    // Cape in the seat colour, hanging from the shoulders.
    if (look.cape > 0) {
      const long = look.cape === 2;
      const cape = this.part(this.cape, this.seat, 0, long ? 0.12 : 0.36, 0.2, 0.56, long ? 0.98 : 0.5, 0.03);
      cape.rotation.x = 0.1;
      this.part(this.cape, this.mat('#c9a24b', 0.4, 0.7), 0, 0.62, -0.02, 0.06, 0.06, 0.04, ball);
    }
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
  }

  setWeapon(w: Weapon) {
    this.sword.visible = this.shield.visible = w === 'sword';
    this.revolver.visible = w === 'revolver';
  }

  /** A short red glow when struck. */
  hurt() {
    this.flash = 1;
  }

  update(dt: number, p: AvatarPose) {
    this.setWeapon(p.weapon);
    this.gait += p.speed * dt * (p.riding ? 0 : 2.3);
    const walk = this.reduce || p.riding ? 0 : Math.min(p.speed / 10, 0.6);
    this.legs.forEach((leg, i) => {
      leg.rotation.x = p.riding ? -1.25 : Math.sin(this.gait + i * Math.PI) * walk;
      leg.rotation.z = p.riding ? (i ? -0.32 : 0.32) : 0;
    });
    this.body.position.y = 0.78 + (p.riding ? 0 : Math.abs(Math.sin(this.gait)) * walk * 0.05);
    const t = p.attackAge;
    const dur = ATTACK_TIME[p.weapon];
    const live = t < dur;
    // Arms swing with the stride when idle.
    const sway = Math.sin(this.gait) * walk * 0.6;
    let ax = sway * 0.6;
    let ay = 0;
    let az = 0.06;
    let ox = -sway * 0.6;
    let oz = -0.06;
    let lean = 0;
    let twist = 0;
    if (p.weapon === 'sword') {
      ax = -0.35;
      // Anticipation, a fast diagonal cut, then recovery.
      if (live && !this.reduce) {
        const s =
          t < 0.15 ? -t / 0.15 : t < 0.27 ? -1 + ((t - 0.15) / 0.12) * 2 : Math.max(0, 1 - (t - 0.27) / 0.31);
        ax = -0.35 - s * 0.9;
        ay = s * 1.2 * p.side;
        twist = -s * 0.35 * p.side;
        lean = -s * 0.06;
      }
      ox = -0.5;
      oz = -0.25;
    } else if (p.weapon === 'revolver') {
      ax = -1.45;
      if (live && !this.reduce) ax -= Math.max(0, 1 - t / 0.25) * 0.45;
    } else if (live && !this.reduce) {
      // A jab: pull back, punch out, recover.
      const s = t < 0.12 ? -t / 0.12 : t < 0.22 ? -1 + ((t - 0.12) / 0.1) * 2.4 : Math.max(0, 1.4 - (t - 0.22) / 0.2 * 1.4);
      ax = -0.6 - s * 0.8;
      twist = -s * 0.25;
    }
    if (p.block) {
      // Parry stance: the blade held level across the body, the shield up.
      if (p.weapon === 'sword') {
        ax = -1.35;
        ay = 0.9;
        ox = -1.2;
        oz = -0.5;
      } else {
        ax = ox = -1.6;
        az = 0.5;
        oz = -0.5;
      }
    }
    this.arm.rotation.set(ax, ay, az);
    this.offArm.rotation.set(ox, 0, oz);
    this.body.rotation.set(lean, twist, 0);
    this.cape.rotation.x = this.reduce ? 0 : Math.min(p.speed / 14, 0.6) + Math.sin(this.gait * 0.5) * walk * 0.05;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4);
      this.cloth.emissive.setRGB(this.flash * 0.5, 0, 0);
      this.skin.emissive.setRGB(this.flash * 0.4, 0, 0);
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}
