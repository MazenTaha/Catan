import * as THREE from 'three';
import { DEFAULT_LOOK, type CharacterLook, type Pose } from '@hexfall/net';
import { Avatar } from './avatar';
import { Horse } from './horse';

/**
 * Another player walking the island (online games): their avatar eases towards each
 * position the server relays, replays every swing or shot once, and rides a horse of its own
 * when they ride.
 */
export class RemoteFighter {
  readonly avatar: Avatar;
  readonly horse: Horse;
  readonly root = new THREE.Group();
  private pose: Pose | null = null;
  private x = 0;
  private y = 0;
  private z = 0;
  private yaw = 0;
  private attacks = -1;
  private age = 9;
  private side = 1;
  private shot = 0;
  private tracer: THREE.Mesh;
  /** Name tag above the head, drawn once on a small canvas. */
  private tag: THREE.Sprite;

  constructor(
    readonly seat: number,
    name: string,
    color: string,
    look: CharacterLook = DEFAULT_LOOK,
    private reduce = false,
    private onShot?: (x: number, z: number) => void,
  ) {
    this.avatar = new Avatar(look, color, reduce);
    this.horse = new Horse(color, reduce);
    this.horse.root.visible = false;
    this.root.add(this.avatar.root, this.horse.root);
    const glow = new THREE.MeshBasicMaterial({ color: '#ffd993' });
    this.tracer = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 1), glow);
    this.tracer.geometry.translate(0, 0, -0.5);
    this.tracer.visible = false;
    this.root.add(this.tracer);
    this.tag = nameTag(name, color);
    this.root.add(this.tag);
    this.root.visible = false;
  }

  /** The latest relayed position (null: they left the 3D walk). */
  setPose(p: Pose | null) {
    if (p && !this.pose) {
      this.x = p.x;
      this.y = p.y;
      this.z = p.z;
      this.yaw = p.yaw;
      this.attacks = p.attacks;
    }
    this.pose = p;
    this.root.visible = !!p;
  }

  get present() {
    return !!this.pose;
  }

  get position() {
    return { x: this.x, y: this.y, z: this.z, yaw: this.yaw };
  }

  /** Struck by someone (shown when the game confirms the hit). */
  hurt() {
    this.avatar.hurt();
  }

  update(dt: number, ground: (x: number, z: number) => number) {
    const p = this.pose;
    if (!p) return;
    // Ease towards the relayed position: about 100 ms behind, without stutter.
    const k = 1 - Math.exp(-dt * 12);
    this.x += (p.x - this.x) * k;
    this.z += (p.z - this.z) * k;
    this.y = ground(this.x, this.z);
    let dy = p.yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * k;
    if (p.attacks !== this.attacks) {
      this.attacks = p.attacks;
      this.age = 0;
      this.side *= -1;
      if (p.weapon === 'revolver') {
        this.shot = 0.075;
        this.onShot?.(this.x, this.z);
      }
    }
    this.age += dt;
    const ride = p.riding;
    this.horse.root.visible = ride;
    if (ride) {
      this.horse.root.position.set(this.x, this.y, this.z);
      this.horse.root.rotation.y = this.yaw;
      this.horse.update(dt, p.speed);
    }
    this.avatar.root.position.set(this.x, this.y + (ride ? this.horse.saddleHeight - 0.78 : 0), this.z);
    this.avatar.root.rotation.y = this.yaw;
    this.avatar.update(dt, { speed: p.speed, weapon: p.weapon, attackAge: this.age, side: this.side, block: p.block, riding: ride });
    this.tag.position.set(this.x, this.y + (ride ? 3.3 : 2.35), this.z);
    this.shot = Math.max(0, this.shot - dt);
    this.tracer.visible = this.shot > 0 && !this.reduce;
    if (this.tracer.visible) {
      this.tracer.position.set(this.x, this.y + 1.05, this.z);
      this.tracer.rotation.y = this.yaw;
      this.tracer.scale.z = 20;
    }
  }

  dispose() {
    this.avatar.dispose();
    this.horse.dispose();
    (this.tag.material as THREE.SpriteMaterial).map?.dispose();
    this.tag.material.dispose();
    this.tracer.geometry.dispose();
    (this.tracer.material as THREE.Material).dispose();
    this.root.removeFromParent();
  }
}

function nameTag(name: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(9,10,11,0.7)';
  g.beginPath();
  g.roundRect(8, 8, 240, 48, 14);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(36, 32, 9, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f3e6d6';
  g.font = '600 28px Cinzel, Georgia, serif';
  g.textBaseline = 'middle';
  g.fillText(name.slice(0, 12), 54, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}
