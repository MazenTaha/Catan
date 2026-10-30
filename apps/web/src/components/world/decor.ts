import * as THREE from 'three';
import type { DecorItem } from '@hexfall/net';
import { DECOR_TINT } from './looks';

type Room = 'cottage' | 'hall';

/**
 * Where each furnishing goes in a room (the building plan's frame: metres, origin at the
 * room's centre, front wall towards +z), chosen clear of the built-in furniture, doors and
 * windows of buildings.json. `wall` turns a hanging piece to face into the room.
 */
interface Spot {
  x: number;
  y: number;
  z: number;
  /** Rotation about y (0: faces +z, into the room from the back wall). */
  ry: number;
  scale?: number;
}

const SPOTS: Record<Room, Partial<Record<DecorItem, Spot[]>>> = {
  cottage: {
    rug: [{ x: -0.35, y: 0, z: 0.1, ry: 0, scale: 1 }],
    banner: [{ x: -2.06, y: 1.55, z: 0.95, ry: Math.PI / 2 }],
    tapestry: [{ x: -1.62, y: 1.65, z: -1.86, ry: 0 }],
    antlers: [{ x: 2.06, y: 2.15, z: 1.35, ry: -Math.PI / 2 }],
    chandelier: [{ x: 0.3, y: 2.45, z: 0.1, ry: 0 }],
    bookshelf: [{ x: -1.75, y: 0, z: 1.68, ry: Math.PI }],
    plants: [
      { x: 1.84, y: 0, z: -1.6, ry: 0 },
      { x: 0.25, y: 0.76, z: 0.3, ry: 0, scale: 0.6 },
    ],
    armor: [{ x: -0.45, y: 0, z: -1.5, ry: 0 }],
    candles: [
      { x: 0.95, y: 0.76, z: 0.2, ry: 0 },
      { x: 1.86, y: 1.5, z: -0.62, ry: 0 },
    ],
    shield: [{ x: 2.06, y: 1.65, z: -1.5, ry: -Math.PI / 2 }],
  },
  hall: {
    rug: [{ x: 0, y: 0, z: 1.35, ry: 0, scale: 1.6 }],
    banner: [
      { x: -1.4, y: 2.1, z: 2.46, ry: Math.PI },
      { x: 1.4, y: 2.1, z: 2.46, ry: Math.PI },
    ],
    tapestry: [{ x: -0.4, y: 2.75, z: -2.46, ry: 0, scale: 1.3 }],
    antlers: [{ x: -3.46, y: 2.7, z: -2.0, ry: Math.PI / 2 }],
    chandelier: [
      { x: -1.0, y: 3.4, z: -0.35, ry: 0, scale: 1.2 },
      { x: 1.0, y: 3.4, z: -0.35, ry: 0, scale: 1.2 },
    ],
    bookshelf: [{ x: 3.25, y: 0, z: 2.1, ry: -Math.PI / 2 }],
    plants: [
      { x: 3.15, y: 0, z: -2.2, ry: 0, scale: 1.2 },
      { x: -1.3, y: 0, z: 2.15, ry: 0 },
    ],
    armor: [{ x: -3.1, y: 0, z: -0.95, ry: Math.PI / 2 }],
    candles: [
      { x: -1.2, y: 0.78, z: -0.35, ry: 0 },
      { x: 0, y: 0.78, z: -0.35, ry: 0 },
      { x: 1.2, y: 0.78, z: -0.35, ry: 0 },
    ],
    shield: [{ x: 2.2, y: 2.4, z: -2.46, ry: 0 }],
  },
};

/** Floor pieces that block walking (radius, m). */
export const DECOR_SOLID: Partial<Record<DecorItem, number>> = { bookshelf: 0.4, armor: 0.32, plants: 0.22 };

const box = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.SphereGeometry(1, 12, 8);
const tube = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);

export class DecorBuilder {
  private mats = new Map<string, THREE.Material>();
  private textures: THREE.Texture[] = [];

  private mat(color: string, roughness = 0.85, metalness = 0, emissive?: string) {
    const key = `${color}|${roughness}|${metalness}|${emissive ?? ''}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: emissive ?? '#000000', emissiveIntensity: emissive ? 1.4 : 1 });
      this.mats.set(key, m);
    }
    return m;
  }

  private part(p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, g: THREE.BufferGeometry = box) {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = mesh.receiveShadow = true;
    p.add(mesh);
    return mesh;
  }

  /** A woven rug texture: border bands and a diamond field in the kingdom colour. */
  private rugMat(tint: string) {
    const key = `rug|${tint}`;
    const have = this.mats.get(key);
    if (have) return have;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 96;
    const g = c.getContext('2d')!;
    g.fillStyle = tint;
    g.fillRect(0, 0, 128, 96);
    g.strokeStyle = '#e6d3a3';
    g.lineWidth = 4;
    g.strokeRect(6, 6, 116, 84);
    g.strokeStyle = 'rgba(20,12,8,0.45)';
    g.lineWidth = 2;
    g.strokeRect(13, 13, 102, 70);
    g.fillStyle = '#e6d3a3';
    for (let i = 0; i < 3; i++) {
      const cx = 34 + i * 30;
      g.beginPath();
      g.moveTo(cx, 30);
      g.lineTo(cx + 10, 48);
      g.lineTo(cx, 66);
      g.lineTo(cx - 10, 48);
      g.closePath();
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(tex);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
    this.mats.set(key, m);
    return m;
  }

  private item(kind: DecorItem, tint: string): THREE.Object3D {
    const g = new THREE.Group();
    const wood = this.mat('#6b4a2e');
    const dark = this.mat('#3e2a1a');
    const iron = this.mat('#4b5257', 0.5, 0.7);
    const brass = this.mat('#c9a24b', 0.4, 0.75);
    const cloth = this.mat(tint, 0.95);
    const flame = this.mat('#ffcf6e', 1, 0, '#ffb347');
    const wax = this.mat('#efe6d2', 0.7);
    switch (kind) {
      case 'rug':
        this.part(g, this.rugMat(tint), 0, 0.012, 0, 1.7, 0.012, 1.15);
        break;
      case 'banner':
        this.part(g, dark, 0, 0.62, 0.04, 0.8, 0.05, 0.05, tube).rotation.z = Math.PI / 2;
        this.part(g, cloth, 0, 0, 0.03, 0.66, 1.15, 0.02);
        this.part(g, brass, 0, 0.05, 0.05, 0.22, 0.22, 0.01, tube).rotation.x = Math.PI / 2;
        for (const x of [-0.22, 0, 0.22]) this.part(g, cloth, x, -0.62, 0.03, 0.16, 0.16, 0.02).rotation.z = Math.PI / 4;
        break;
      case 'tapestry': {
        this.part(g, dark, 0, 0.48, 0.04, 1.4, 0.05, 0.05);
        this.part(g, cloth, 0, 0, 0.025, 1.3, 0.9, 0.015);
        this.part(g, this.mat('#e6d3a3', 0.95), 0, 0, 0.035, 1.1, 0.06, 0.01);
        this.part(g, this.mat('#e6d3a3', 0.95), 0, 0.2, 0.035, 0.06, 0.4, 0.01);
        this.part(g, this.mat('#3a5a2a', 0.95), 0.32, -0.18, 0.035, 0.28, 0.32, 0.01, ball);
        break;
      }
      case 'antlers': {
        this.part(g, wood, 0, 0, 0.03, 0.34, 0.42, 0.04);
        const bone = this.mat('#e3d6bc', 0.7);
        this.part(g, bone, 0, -0.02, 0.1, 0.1, 0.14, 0.12, ball);
        for (const s of [-1, 1]) {
          const beam = this.part(g, bone, s * 0.22, 0.2, 0.12, 0.035, 0.5, 0.035, tube);
          beam.rotation.z = -s * 0.8;
          for (let i = 0; i < 3; i++) {
            const tine = this.part(g, bone, s * (0.14 + i * 0.1), 0.18 + i * 0.1, 0.12, 0.025, 0.2, 0.025, tube);
            tine.rotation.z = s * 0.2;
          }
        }
        break;
      }
      case 'chandelier': {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 20), iron);
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          const chain = this.part(g, iron, Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2, 0.01, 0.48, 0.01, tube);
          chain.rotation.set(Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38);
        }
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          this.part(g, wax, Math.cos(a) * 0.42, 0.08, Math.sin(a) * 0.42, 0.05, 0.14, 0.05, tube);
          this.part(g, flame, Math.cos(a) * 0.42, 0.19, Math.sin(a) * 0.42, 0.025, 0.05, 0.025, ball).castShadow = false;
        }
        break;
      }
      case 'bookshelf': {
        this.part(g, wood, 0, 0.8, 0, 0.62, 1.6, 0.3);
        const colours = ['#7a2a2a', '#2f4f6a', '#4a5a2a', '#8a6a2a', '#5a3a5a', tint];
        for (let shelf = 0; shelf < 4; shelf++) {
          const y = 0.2 + shelf * 0.38;
          this.part(g, dark, 0, y - 0.02, 0.02, 0.56, 0.03, 0.27);
          let x = -0.25;
          for (let k = 0; x < 0.24; k++) {
            const w = 0.05 + ((k * 7 + shelf * 3) % 4) * 0.012;
            const h = 0.22 + ((k * 5 + shelf) % 3) * 0.04;
            this.part(g, this.mat(colours[(k + shelf) % colours.length], 0.9), x + w / 2, y + h / 2, 0.04, w - 0.006, h, 0.2);
            x += w;
          }
        }
        break;
      }
      case 'plants': {
        const pot = this.mat('#b0603c', 0.9);
        this.part(g, pot, 0, 0.16, 0, 0.32, 0.32, 0.32, tube);
        this.part(g, this.mat('#4a3424', 1), 0, 0.31, 0, 0.28, 0.02, 0.28, tube);
        const leaf = this.mat('#4f8a3a', 0.9);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const l = this.part(g, leaf, Math.cos(a) * 0.1, 0.5 + (i % 3) * 0.08, Math.sin(a) * 0.1, 0.11, 0.24, 0.05, ball);
          l.rotation.set(Math.sin(a) * 0.5, a, -Math.cos(a) * 0.5);
        }
        this.part(g, this.mat('#e8d35a', 0.8), 0, 0.72, 0, 0.05, 0.05, 0.05, ball);
        break;
      }
      case 'armor': {
        this.part(g, dark, 0, 0.03, 0, 0.5, 0.06, 0.5, tube);
        this.part(g, wood, 0, 0.7, 0, 0.05, 1.3, 0.05, tube);
        const steel = this.mat('#9aa6ab', 0.4, 0.75);
        this.part(g, steel, 0, 1.15, 0, 0.42, 0.55, 0.28, tube);
        for (const x of [-0.25, 0.25]) this.part(g, steel, x, 1.4, 0, 0.18, 0.12, 0.2, ball);
        this.part(g, steel, 0, 1.6, 0, 0.17, 0.2, 0.17, ball);
        this.part(g, iron, 0, 1.56, 0.16, 0.02, 0.12, 0.02);
        this.part(g, cloth, 0, 0.82, 0.02, 0.44, 0.3, 0.3, tube);
        break;
      }
      case 'candles':
        for (const [x, z, h] of [
          [0, 0, 0.22],
          [0.08, 0.05, 0.15],
          [-0.07, 0.06, 0.12],
        ]) {
          this.part(g, brass, x, 0.01, z, 0.09, 0.02, 0.09, tube);
          this.part(g, wax, x, h / 2 + 0.02, z, 0.045, h, 0.045, tube);
          this.part(g, flame, x, h + 0.05, z, 0.022, 0.045, 0.022, ball).castShadow = false;
        }
        break;
      case 'shield':
        for (const s of [-1, 1]) {
          const sword = this.part(g, this.mat('#c8d0d4', 0.3, 0.8), s * 0.1, 0, 0.04, 0.04, 0.95, 0.015);
          sword.rotation.z = s * 0.7;
        }
        {
          const face = this.part(g, cloth, 0, 0, 0.07, 0.56, 0.04, 0.56, tube);
          face.rotation.x = Math.PI / 2;
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 6, 20), iron);
          rim.position.z = 0.09;
          g.add(rim);
          this.part(g, brass, 0, 0, 0.1, 0.09, 0.09, 0.05, ball);
        }
        break;
    }
    return g;
  }

  /** Every chosen furnishing for a room, in the building plan's frame (floor at `floor`). */
  room(room: Room, items: DecorItem[], tint: number, floor: number): { group: THREE.Group; solids: { x: number; z: number; r: number }[] } {
    const group = new THREE.Group();
    const solids: { x: number; z: number; r: number }[] = [];
    const colour = DECOR_TINT[tint] ?? DECOR_TINT[0];
    for (const kind of items) {
      for (const s of SPOTS[room][kind] ?? []) {
        const o = this.item(kind, colour);
        o.position.set(s.x, floor + s.y, s.z);
        o.rotation.y = s.ry;
        o.scale.setScalar(s.scale ?? 1);
        group.add(o);
        const r = DECOR_SOLID[kind];
        if (r && s.y === 0) solids.push({ x: s.x, z: s.z, r: r * (s.scale ?? 1) });
      }
    }
    return { group, solids };
  }

  dispose() {
    this.mats.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.mats.clear();
  }
}
