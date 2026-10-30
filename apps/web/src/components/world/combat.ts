import * as THREE from 'three';
import type { Weapon } from '@hexfall/engine';
import { DEFAULT_LOOK, REACH, type CharacterLook } from '@hexfall/net';
import { ATTACK_TIME, Avatar } from './avatar';

export type { Weapon };
export type CombatSound = 'swing' | 'impact' | 'shot' | 'empty' | 'clang' | 'punch';
export interface WeaponState {
  weapon: Weapon;
  /** Revolver rounds left for the whole game (the engine's count). */
  ammo: number;
  /** The seat has opened its weapon chest. */
  armed: boolean;
  blocking: boolean;
}

/** Another player in reach of a blow: their seat and where they stand. */
export interface Target {
  seat: number;
  x: number;
  y: number;
  z: number;
}

const DAMAGE_PRACTICE: Record<Weapon, number> = { fist: 10, sword: 25, revolver: 50 };

/**
 * The walker's own fighting: fists until the weapon chest is opened, then sword (1) or
 * revolver (2), fists (3). F or a click attacks; the right mouse button holds a guard, and a
 * raised sword parries blows and bullets from the front. Hits on other players are reported
 * (the server checks them and the engine applies the damage); the straw dummy is local.
 */
export class Combat {
  readonly root = new THREE.Group();
  readonly me: Avatar;
  readonly dummy = new THREE.Group();
  readonly sparks = new THREE.Group();
  readonly tracer = new THREE.Group();
  private flashMesh: THREE.Mesh;
  weapon: Weapon = 'fist';
  ammo = 0;
  armed = false;
  blocking = false;
  riding = false;
  private shotFlash = 0;
  health = 100;
  hits = 0;
  active = false;
  private age = 9;
  private struck = true;
  private side = 1;
  private hold = 0;
  private flash = 0;
  private reset = 0;
  private anchor = new THREE.Vector3();
  private push = 0;
  private aim = 0;
  private straw = new THREE.MeshStandardMaterial({ color: '#c39343', roughness: 1 });
  /** Other players this frame (online live combat). */
  targets: Target[] = [];

  constructor(
    private reduce: boolean,
    private sound: (event: CombatSound) => void,
    private report: (health: number, hit: boolean) => void,
    private weaponChanged?: (state: WeaponState) => void,
    /** A blow landed on another player. */
    private onHit?: (seat: number, weapon: Weapon) => void,
    /** A revolver shot was fired (spends one of the game's bullets). */
    private onFire?: () => void,
    look: CharacterLook = DEFAULT_LOOK,
  ) {
    this.me = new Avatar(look, '#3f7fd4', reduce);
    const leather = new THREE.MeshStandardMaterial({ color: '#51382b', roughness: 0.9 });
    const wood = new THREE.MeshStandardMaterial({ color: '#765039', roughness: 1 });
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const ballGeo = new THREE.SphereGeometry(1, 10, 8);
    const part = (parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, round = false) => {
      const m = new THREE.Mesh(round ? ballGeo : boxGeo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const glow = new THREE.MeshBasicMaterial({ color: '#ffd993' });
    this.flashMesh = part(this.me.muzzle, glow, 0, 0, -0.05, 0.1, 0.1, 0.18, true);
    this.flashMesh.castShadow = this.flashMesh.receiveShadow = false;
    // Blinks on its own, so the avatar's re-bakes leave it out.
    this.flashMesh.userData.loose = true;
    const line = part(this.tracer, glow, 0, 0, -0.5, 0.008, 0.008, 1);
    line.castShadow = line.receiveShadow = false;
    this.tracer.visible = this.flashMesh.visible = false;
    part(this.dummy, wood, 0, 0.8, 0, 0.14, 1.6, 0.14);
    part(this.dummy, wood, 0, 0.08, 0, 1, 0.16, 0.8);
    part(this.dummy, this.straw, 0, 1.1, 0, 0.35, 0.43, 0.24, true);
    part(this.dummy, this.straw, 0, 1.7, 0, 0.23, 0.25, 0.23, true);
    part(this.dummy, wood, 0, 1.32, 0, 1.15, 0.13, 0.13);
    for (const y of [0.86, 1.12, 1.4]) part(this.dummy, leather, 0, y, 0, 0.68, 0.04, 0.49);
    const sparkMat = new THREE.MeshBasicMaterial({ color: '#f2ac52' });
    for (let i = 0; i < 8; i++) {
      const p = part(this.sparks, sparkMat, 0, 0, 0, 0.025, 0.08, 0.025);
      p.castShadow = p.receiveShadow = false;
    }
    this.dummy.visible = this.sparks.visible = false;
    this.root.add(this.me.root, this.dummy, this.sparks, this.tracer);
    this.publishWeapon();
  }

  /** The player model (kept as `player` for the camera and tests). */
  get player() {
    return this.me.root;
  }

  setColor(color: string) {
    this.me.setSeatColor(color);
  }

  setLook(look: CharacterLook) {
    this.me.setLook(look);
  }

  /** Arms and bullets come from the game: opening the chest, shots fired so far. */
  setArms(armed: boolean, ammo: number) {
    if (armed === this.armed && ammo === this.ammo) return;
    const first = armed && !this.armed;
    this.armed = armed;
    this.ammo = ammo;
    if (!armed) this.weapon = 'fist';
    else if (first) this.weapon = 'sword';
    this.publishWeapon();
  }

  practice(x: number, y: number, z: number) {
    this.anchor.set(x, y, z);
    this.dummy.position.copy(this.anchor);
    this.health = 100;
    this.reset = this.push = this.flash = 0;
    this.active = this.dummy.visible = true;
    this.report(100, false);
  }

  get attacking() {
    return this.age < ATTACK_TIME[this.weapon];
  }

  attack(yaw: number): boolean {
    if (this.attacking || this.blocking || this.riding) return false;
    if (this.weapon === 'revolver' && this.ammo <= 0) {
      this.sound('empty');
      return false;
    }
    this.age = 0;
    this.aim = yaw;
    this.struck = false;
    this.side *= -1;
    if (this.weapon === 'revolver') {
      this.shotFlash = 0.075;
      this.onFire?.();
    }
    this.sound(this.weapon === 'sword' ? 'swing' : this.weapon === 'revolver' ? 'shot' : 'swing');
    return true;
  }

  selectWeapon(weapon: Weapon): boolean {
    if (this.attacking) return false;
    if (weapon !== 'fist' && !this.armed) return false;
    this.weapon = weapon;
    this.age = 9;
    this.publishWeapon();
    return true;
  }

  setBlock(on: boolean) {
    if (on === this.blocking) return;
    this.blocking = on && !this.riding;
    this.publishWeapon();
  }

  /** Our own blade turned a blow aside: sparks at the sword and a clang. */
  parried() {
    this.sound('clang');
    this.flash = Math.max(this.flash, 0.6);
    this.sparks.position.copy(this.me.root.position);
    this.sparks.position.y += 1.4;
  }

  private publishWeapon() {
    this.weaponChanged?.({ weapon: this.weapon, ammo: this.ammo, armed: this.armed, blocking: this.blocking });
  }

  get shake() {
    return this.reduce ? 0 : this.flash * 0.055;
  }

  get attackCount() {
    return this.count;
  }
  private count = 0;

  private clearLine(x: number, z: number, tx: number, tz: number, clear: (x: number, z: number) => boolean) {
    const steps = Math.ceil(Math.hypot(tx - x, tz - z) / 0.15);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!clear(x + (tx - x) * t, z + (tz - z) * t)) return false;
    }
    return true;
  }

  /** Is (tx, tz) in front of the fighter, in reach and not behind cover? */
  private lands(x: number, y: number, z: number, tx: number, ty: number, tz: number, clear: (x: number, z: number) => boolean) {
    const gun = this.weapon === 'revolver';
    const dx = tx - x;
    const dz = tz - z;
    const distance = Math.hypot(dx, dz);
    const reach = gun ? REACH.revolver : REACH[this.weapon] - 0.15;
    if (distance > reach || Math.abs(ty - y) > 1.2) return false;
    const facing = (-Math.sin(this.aim) * dx - Math.cos(this.aim) * dz) / Math.max(distance, 0.001);
    const across = Math.abs(Math.cos(this.aim) * dx - Math.sin(this.aim) * dz);
    const aligned = gun ? facing > 0 && across < 0.45 : facing > 0.5;
    return aligned && this.clearLine(x, z, tx, tz, clear);
  }

  update(dt: number, x: number, y: number, z: number, yaw: number, speed: number, clear: (x: number, z: number) => boolean) {
    this.shotFlash = Math.max(0, this.shotFlash - dt);
    const gun = this.weapon === 'revolver';
    this.flashMesh.visible = this.tracer.visible = gun && this.shotFlash > 0 && !this.reduce;
    this.flash = Math.max(0, this.flash - dt * 7);
    const pause = this.hold > 0;
    this.hold = Math.max(0, this.hold - dt);
    if (!pause) this.age += dt;
    const root = this.me.root;
    root.position.set(x, y, z);
    root.rotation.y = this.attacking || this.blocking ? this.aim : yaw;
    if (this.blocking) this.aim = yaw;
    this.me.update(dt, {
      speed,
      weapon: this.weapon,
      attackAge: this.age,
      side: this.side,
      block: this.blocking,
      riding: this.riding,
    });
    // The moment of contact: a sword at 210 ms into its swing, a fist at 120 ms, a shot at once.
    const contact = gun ? 0 : this.weapon === 'sword' ? 0.21 : 0.12;
    if (!this.struck && this.age >= contact && this.attacking) {
      this.struck = true;
      this.count++;
      const eye = y + 1.3;
      let length = REACH.revolver;
      // The nearest other player the blow lands on, if any.
      let best: Target | null = null;
      let bestD = Infinity;
      for (const t of this.targets) {
        const d = Math.hypot(t.x - x, t.z - z);
        if (d < bestD && this.lands(x, y, z, t.x, t.y, t.z, clear)) {
          best = t;
          bestD = d;
        }
      }
      const dummyHit =
        this.active && this.health > 0 && this.lands(x, y, z, this.dummy.position.x, this.dummy.position.y, this.dummy.position.z, clear);
      const dummyD = Math.hypot(this.dummy.position.x - x, this.dummy.position.z - z);
      if (gun) {
        for (let d = 0.15; d < length; d += 0.15) {
          if (!clear(x - Math.sin(this.aim) * d, z - Math.cos(this.aim) * d)) {
            length = d;
            break;
          }
        }
        if (best) length = Math.min(length, bestD);
        else if (dummyHit) length = Math.min(length, dummyD);
        this.tracer.position.set(x, eye - 0.25, z);
        this.tracer.rotation.y = this.aim;
        this.tracer.scale.z = length;
      }
      if (best && (!dummyHit || bestD < dummyD)) {
        this.onHit?.(best.seat, this.weapon);
        this.sound(this.weapon === 'fist' ? 'punch' : 'impact');
        this.hold = this.reduce || gun ? 0 : 0.045;
        this.flash = 0.6;
      } else if (dummyHit) {
        this.health = Math.max(0, this.health - DAMAGE_PRACTICE[this.weapon]);
        this.hits++;
        this.flash = 1;
        this.hold = this.reduce || gun ? 0 : 0.045;
        this.push = this.reduce ? 0 : 0.32;
        this.sound(this.weapon === 'fist' ? 'punch' : 'impact');
        this.report(this.health, true);
        this.sparks.position.copy(this.dummy.position);
        this.sparks.position.y += 1.2;
        if (!this.health) this.reset = 2;
      }
    }
    const tx = this.anchor.x - Math.sin(this.aim) * this.push;
    const tz = this.anchor.z - Math.cos(this.aim) * this.push;
    if (this.active && clear(tx, tz)) this.dummy.position.set(tx, this.anchor.y, tz);
    this.push *= Math.exp(-dt * 8);
    this.dummy.rotation.z = this.reduce ? 0 : this.flash * 0.14 * this.side;
    this.straw.emissive.setRGB(this.flash * 0.28, this.flash * 0.12, 0);
    this.sparks.visible = this.flash > 0 && !this.reduce;
    this.sparks.children.forEach((p, i) => {
      const a = (i * Math.PI) / 4,
        r = (1 - this.flash) * 0.7;
      p.position.set(Math.cos(a) * r, Math.sin(a) * r, -r * 0.2);
      p.scale.setScalar(this.flash * 0.05);
      p.rotation.z = a;
    });
    if (this.reset > 0 && (this.reset -= dt) <= 0) {
      this.health = 100;
      this.report(100, false);
    }
  }
}
