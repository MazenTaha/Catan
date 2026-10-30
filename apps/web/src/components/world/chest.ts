import * as THREE from 'three';

const box = new THREE.BoxGeometry(1, 1, 1);
const coinGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12);

export type ChestSound = 'chest-wind' | 'chest-open' | 'chest-empty';

interface Bit {
  mesh: THREE.Mesh;
  v: THREE.Vector3;
  spin: number;
  life: number;
}

/** Opening beats (s): wind-up, the lid snapping open, the settle and the reveal. */
const WIND = 0.5;
const SNAP = 0.12;
const REVEAL = 0.7;
const HOLD = 1.5;
const FLY = 0.45;

/**
 * The weapon chest hidden in one of the player's two starting settlements: oak boards,
 * riveted iron bands, a brass lock and a barrel lid hinged at the back. Opening it follows
 * the "juicy chest" recipe: hold, a shaking wind-up with the lid straining, a squash, the lid
 * snapping open with a stretch, a burst of light, sparks and coins, the lid's bounce settling,
 * then the sword and revolver rising out one after the other, turning in the glow, and
 * flying to the player. A decoy (the other settlement) opens on dust and nothing.
 */
export class Chest {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private lid = new THREE.Group();
  private glow: THREE.Sprite;
  private loot = new THREE.Group();
  private sword = new THREE.Group();
  private gun = new THREE.Group();
  private bits: Bit[] = [];
  private mats: THREE.Material[] = [];
  private t = -1;
  private burst = false;
  private done = false;
  /** Camera shake for the player watching (0..1). */
  shake = 0;
  opened = false;

  constructor(
    readonly full: boolean,
    private reduce: boolean,
    private sound: (s: ChestSound) => void,
  ) {
    const oak = this.mat('#7a4f2c', 0.85);
    const oakDark = this.mat('#5a3820', 0.9);
    const iron = this.mat('#4b5257', 0.5, 0.75);
    const brass = this.mat('#c9a24b', 0.35, 0.8);
    const inside = this.mat('#2a1a10', 1);
    const W = 0.86;
    const D = 0.54;
    const H = 0.44;
    this.root.add(this.body);
    // Body: a dark interior, boards with seams, iron bands and corner straps, the lock plate.
    this.part(this.body, inside, 0, H - 0.04, 0, W - 0.08, 0.02, D - 0.08);
    for (let i = 0; i < 4; i++) {
      const y = 0.06 + i * 0.105;
      this.part(this.body, i % 2 ? oak : oakDark, 0, y, D / 2 - 0.02, W, 0.1, 0.04);
      this.part(this.body, i % 2 ? oakDark : oak, 0, y, -D / 2 + 0.02, W, 0.1, 0.04);
      this.part(this.body, oak, W / 2 - 0.02, y, 0, 0.04, 0.1, D);
      this.part(this.body, oak, -W / 2 + 0.02, y, 0, 0.04, 0.1, D);
    }
    this.part(this.body, oakDark, 0, 0.02, 0, W, 0.04, D);
    for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) {
      this.part(this.body, iron, x, H / 2, D / 2 + 0.005, 0.07, H, 0.02);
      this.part(this.body, iron, x, H / 2, -D / 2 - 0.005, 0.07, H, 0.02);
      this.part(this.body, iron, x, 0.01, 0, 0.07, 0.02, D + 0.01);
      for (const y of [0.1, 0.32]) this.part(this.body, brass, x, y, D / 2 + 0.02, 0.025, 0.025, 0.02);
    }
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) this.part(this.body, iron, x, H / 2, z, 0.05, H + 0.01, 0.05);
    this.part(this.body, brass, 0, H - 0.1, D / 2 + 0.02, 0.14, 0.16, 0.02);
    this.part(this.body, inside, 0, H - 0.12, D / 2 + 0.032, 0.025, 0.05, 0.01);
    // Lid: a half barrel hinged at the back edge, banded like the body.
    this.lid.position.set(0, H, -D / 2);
    this.body.add(this.lid);
    // Double-sided: the open lid shows its inside to anyone at the chest.
    const lidOak = this.mat('#7a4f2c', 0.85);
    lidOak.side = THREE.DoubleSide;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, W, 16, 1, true, 0, Math.PI), lidOak);
    // The cylinder's axis turned onto x, its half shell facing up.
    shell.rotation.z = Math.PI / 2;
    shell.position.set(0, 0, D / 2);
    this.lid.add(shell);
    const capGeo = new THREE.CircleGeometry(D / 2, 16, 0, Math.PI);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, lidOak);
      cap.rotation.y = (s * Math.PI) / 2;
      cap.position.set((s * W) / 2, 0, D / 2);
      this.lid.add(cap);
    }
    for (const x of [-W / 2 + 0.12, W / 2 - 0.12, 0]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(D / 2 + 0.008, 0.012, 4, 16, Math.PI), x ? iron : brass);
      band.rotation.y = Math.PI / 2;
      band.position.set(x, 0, D / 2);
      this.lid.add(band);
    }
    this.part(this.lid, brass, 0, -0.02, D + 0.01, 0.1, 0.08, 0.02);

    // What's inside: a heap of coins, and (in the real chest) the two weapons.
    const gold = this.mat('#e3b54a', 0.3, 0.85);
    for (let i = 0; i < 18; i++) {
      const c = new THREE.Mesh(coinGeo, gold);
      c.position.set((Math.sin(i * 2.3) * W) / 3, H - 0.06 + (i % 3) * 0.012, (Math.cos(i * 1.7) * D) / 4);
      c.rotation.set(Math.sin(i) * 0.4, i, Math.cos(i) * 0.4);
      this.body.add(c);
    }
    if (full) {
      const steel = this.mat('#c8d0d4', 0.3, 0.8);
      this.part(this.sword, steel, 0, 0.35, 0, 0.06, 0.8, 0.018);
      this.part(this.sword, brass, 0, -0.08, 0, 0.26, 0.045, 0.05);
      this.part(this.sword, this.mat('#51382b', 0.8), 0, -0.18, 0, 0.045, 0.18, 0.045);
      this.part(this.sword, brass, 0, -0.29, 0, 0.06, 0.06, 0.06);
      const blued = this.mat('#2e3a41', 0.4, 0.7);
      this.part(this.gun, blued, 0, 0.05, -0.12, 0.05, 0.05, 0.32);
      this.part(this.gun, blued, 0, 0.04, 0.02, 0.1, 0.1, 0.1);
      const grip = this.part(this.gun, this.mat('#6a4428', 0.9), 0, -0.07, 0.1, 0.06, 0.18, 0.08);
      grip.rotation.x = -0.35;
      this.sword.visible = this.gun.visible = false;
      this.loot.add(this.sword, this.gun);
      this.loot.position.y = H;
      this.root.add(this.loot);
    }

    // The burst of light, as an additive sprite (no scene light: that would recompile shaders).
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,240,190,1)');
    grad.addColorStop(0.35, 'rgba(255,200,90,0.55)');
    grad.addColorStop(1, 'rgba(255,170,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const glowMat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.mats.push(glowMat);
    this.glow = new THREE.Sprite(glowMat);
    this.glow.position.y = H + 0.15;
    this.glow.scale.setScalar(0.01);
    this.glow.visible = false;
    this.root.add(this.glow);

    // Pooled sparks and flying coins (dust for the decoy).
    const spark = new THREE.MeshBasicMaterial({ color: full ? '#ffd27a' : '#9a8f80' });
    this.mats.push(spark);
    for (let i = 0; i < 26; i++) {
      const coin = full && i < 10;
      const m = new THREE.Mesh(coin ? coinGeo : box, coin ? gold : spark);
      if (!coin) m.scale.setScalar(full ? 0.03 : 0.06);
      m.visible = false;
      this.root.add(m);
      this.bits.push({ mesh: m, v: new THREE.Vector3(), spin: 0, life: 0 });
    }
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material as THREE.MeshBasicMaterial).isMeshBasicMaterial) m.castShadow = m.receiveShadow = true;
    });
  }

  private mat(color: string, roughness: number, metalness = 0) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.mats.push(m);
    return m;
  }

  private part(p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const mesh = new THREE.Mesh(box, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    p.add(mesh);
    return mesh;
  }

  /** Starts the opening; `onBurst` fires as the lid snaps open (that's when it counts). */
  open(onBurst: () => void, onDone?: () => void) {
    if (this.t >= 0) return;
    this.t = 0;
    this.onBurst = onBurst;
    this.onDone = onDone;
    this.sound('chest-wind');
  }
  private onBurst: (() => void) | null = null;
  private onDone: (() => void) | undefined;

  /** Shows it already opened (a revisit after the weapons were taken). */
  showOpen() {
    this.t = 99;
    this.burst = this.done = this.opened = true;
    this.lid.rotation.x = -1.85;
  }

  get busy() {
    return this.t >= 0 && !this.done;
  }

  update(dt: number) {
    if (this.t < 0 || this.done) {
      this.shake = 0;
      return;
    }
    this.t += dt;
    const t = this.t;
    const r = this.reduce;
    const b = this.body;
    if (t < WIND) {
      // Wind-up: building shake and squash, the lid straining against the lock, light leaking.
      const k = t / WIND;
      b.rotation.z = r ? 0 : Math.sin(t * 70) * 0.035 * k;
      b.scale.set(1 + 0.05 * k * (r ? 0 : 1), 1 - 0.1 * k * (r ? 0 : 1), 1 + 0.05 * k * (r ? 0 : 1));
      this.lid.rotation.x = r ? 0 : -Math.abs(Math.sin(t * 38)) * 0.07 * k;
      this.glow.visible = this.full;
      this.glow.scale.setScalar(0.3 * k);
      this.shake = r ? 0 : 0.15 * k;
      return;
    }
    if (!this.burst) {
      this.burst = true;
      this.opened = true;
      this.onBurst?.();
      this.sound(this.full ? 'chest-open' : 'chest-empty');
      if (!r) this.emit();
    }
    const u = t - WIND;
    // Snap: the lid flies open with a stretch, overshoots and bounces to rest.
    const open = -1.85;
    if (u < SNAP) {
      const k = u / SNAP;
      this.lid.rotation.x = open * 1.12 * k * k;
    } else {
      const s = u - SNAP;
      this.lid.rotation.x = open + (r ? 0 : -open * 0.12 * Math.exp(-s * 6) * Math.cos(s * 22));
    }
    const sq = r ? 0 : Math.exp(-u * 7) * Math.cos(u * 24);
    b.rotation.z = 0;
    b.scale.set(1 - 0.06 * sq, 1 + 0.12 * sq, 1 - 0.06 * sq);
    this.shake = r ? 0 : Math.max(0, 0.6 - u * 2);
    // Glow peaks with the snap, then breathes while the loot floats.
    if (this.full) {
      const peak = u < 0.15 ? u / 0.15 : Math.max(0.35, 1 - (u - 0.15) * 1.6);
      this.glow.scale.setScalar((r ? 1 : 1.4) * peak + Math.sin(t * 6) * 0.05);
    } else this.glow.visible = false;
    // Sparks, coins or dust under gravity.
    for (const bit of this.bits) {
      if (bit.life <= 0) continue;
      bit.life -= dt;
      bit.v.y -= 9.8 * dt * (this.full ? 1 : 0.15);
      bit.mesh.position.addScaledVector(bit.v, dt);
      if (bit.mesh.position.y < 0.02) {
        bit.mesh.position.y = 0.02;
        bit.v.multiplyScalar(0.4);
        bit.v.y = Math.abs(bit.v.y) * 0.5;
      }
      bit.mesh.rotation.x += bit.spin * dt;
      bit.mesh.rotation.z += bit.spin * 0.7 * dt;
      if (bit.life <= 0) bit.mesh.visible = false;
    }
    if (!this.full) {
      if (u > 1.2) this.finish();
      return;
    }
    // Reveal: the sword pops up first, the revolver a beat later, both turning in the light.
    const pop = (g: THREE.Group, at: number, x: number) => {
      const v = u - at;
      if (v < 0) return;
      g.visible = true;
      const s = r ? 1 : v < 0.18 ? (v / 0.18) * 1.25 : 1 + 0.25 * Math.exp(-(v - 0.18) * 8) * Math.cos((v - 0.18) * 20);
      g.scale.setScalar(Math.max(0.01, s * 1.35));
      const rise = Math.min(1, v / 0.4);
      // Up to about chest-and-a-half height, where someone standing at the chest sees them.
      g.position.set(x, 0.15 + (1 - (1 - rise) ** 3) * 0.42, 0.05);
      g.rotation.y = r ? 0 : v * 2.4;
    };
    pop(this.sword, 0.2, -0.16);
    pop(this.gun, 0.42, 0.18);
    const fly = u - (REVEAL + HOLD);
    if (fly > 0) {
      // Taken: both shrink up and away towards the player.
      const k = Math.min(1, fly / FLY);
      this.loot.position.set(0, 0.44 + k * 0.9, k * 1.2);
      this.loot.scale.setScalar(Math.max(0.01, 1 - k));
      this.glow.scale.setScalar(Math.max(0.01, 0.5 * (1 - k)));
      if (k >= 1) this.finish();
    }
  }

  private finish() {
    this.done = true;
    this.shake = 0;
    this.glow.visible = false;
    this.loot.visible = false;
    for (const bit of this.bits) bit.mesh.visible = false;
    this.onDone?.();
  }

  private emit() {
    this.bits.forEach((bit, i) => {
      bit.mesh.visible = true;
      bit.mesh.position.set((Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.25);
      const a = Math.random() * Math.PI * 2;
      const coin = this.full && i < 10;
      const up = this.full ? (coin ? 2.6 : 3.6) + Math.random() * 1.6 : 0.6 + Math.random() * 0.5;
      const out = this.full ? (coin ? 0.9 : 1.6) : 0.7;
      bit.v.set(Math.cos(a) * out * Math.random(), up, Math.sin(a) * out * Math.random() + (coin ? 0.5 : 0));
      bit.spin = (Math.random() - 0.5) * 18;
      bit.life = this.full ? (coin ? 1.4 : 0.8 + Math.random() * 0.4) : 1.1;
    });
  }

  dispose() {
    this.root.removeFromParent();
    for (const m of this.mats) m.dispose();
  }
}
