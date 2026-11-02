import * as THREE from 'three';

/** What a foot lands on, for the step's sound and dust. */
export type Surface = 'grass' | 'soil' | 'sand' | 'wood' | 'stone';

/** Metres per footfall at a speed (m/s): longer strides as the pace rises, as people run. */
export const stepLength = (speed: number) => 0.6 + speed * 0.16;

const DUST: Record<Surface, [number, number, number] | null> = {
  grass: [0.72, 0.7, 0.55],
  soil: [0.6, 0.47, 0.34],
  sand: [0.9, 0.82, 0.64],
  stone: [0.7, 0.7, 0.68],
  wood: null,
};

/**
 * Makes running feel like running (DECISIONS #43): footfalls on a stride that lengthens with
 * speed (each one a sound and, at a run, a puff of dust), and a camera that answers the pace,
 * with a wider field of view and a kick as the sprint starts, a bob and sway on the stride,
 * a dip as each foot lands, a lean into turns and strafes. `sprint` (0 to 1) also drives the
 * screen's speed lines. Reduced motion keeps the steps and drops the camera motion and dust.
 */
export class RunFeel {
  /** 0 walking or still, 1 at a full run. */
  sprint = 0;
  /** Footfalls so far (fractional): each whole number is one foot landing. */
  phase = 0;
  private dip = 0;
  private kick = 0;
  private roll = 0;
  private wasRunning = false;
  private fov = 0;
  private readonly dust: Dust | null;

  constructor(
    scene: THREE.Scene,
    private reduce: boolean,
    lite: boolean,
  ) {
    this.dust = reduce || lite ? null : new Dust(scene);
  }

  /**
   * Advances the stride by the distance covered. Returns true when a foot lands (on foot only).
   * `walk` and `run` are the walker's two speeds; `turn` is the yaw rate (rad/s); `strafe` -1..1.
   */
  update(dt: number, speed: number, walk: number, run: number, riding: boolean, turn: number, strafe: number): boolean {
    const target = riding ? Math.min(1, Math.max(0, (speed - 9) / 8)) : Math.min(1, Math.max(0, (speed - walk * 0.9) / (run - walk * 0.9)));
    this.sprint += (target - this.sprint) * Math.min(1, dt * (target > this.sprint ? 3.5 : 5));
    const running = this.sprint > 0.5;
    if (running && !this.wasRunning) this.kick = 1;
    this.wasRunning = running;
    this.kick = Math.max(0, this.kick - dt * 2.2);
    this.dip = Math.max(0, this.dip - dt * 7);
    this.roll += (THREE.MathUtils.clamp(-turn * 0.012 - strafe * 0.025, -0.05, 0.05) * Math.max(this.sprint, speed > 0.5 ? 0.35 : 0) - this.roll) * Math.min(1, dt * 6);
    this.dust?.update(dt);
    if (riding || speed < 0.3) {
      if (speed < 0.3) this.phase = Math.ceil(this.phase);
      return false;
    }
    const before = Math.floor(this.phase);
    this.phase += (speed * dt) / stepLength(speed);
    if (Math.floor(this.phase) === before) return false;
    this.dip = 1;
    return true;
  }

  /** A foot landed at (x, y, z): kicks up dust at a run on soft ground. */
  footfall(x: number, y: number, z: number, yaw: number, surface: Surface) {
    const tint = DUST[surface];
    if (!this.dust || !tint || this.sprint < 0.4) return;
    // The landing foot is to one side of the line of travel.
    const side = Math.floor(this.phase) % 2 ? 0.14 : -0.14;
    this.dust.puff(x + Math.cos(yaw) * side, y + 0.05, z - Math.sin(yaw) * side, tint, this.sprint);
  }

  /** Extra distance to pull the third-person camera back at a run (m). */
  get pullBack() {
    return this.reduce ? 0 : this.sprint * 0.55;
  }

  /** Applies the bob, sway, landing dip, lean and field of view to a placed camera. */
  apply(camera: THREE.PerspectiveCamera, baseFov: number) {
    if (this.reduce) {
      this.setFov(camera, baseFov);
      return;
    }
    const s = Math.max(this.sprint, this.phase % 1 === 0 ? 0 : 0.25);
    const a = this.phase * Math.PI;
    const bob = Math.cos(a * 2) * (0.018 + 0.05 * this.sprint) * s;
    const sway = Math.sin(a) * 0.035 * this.sprint;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    camera.position.y += bob - this.dip * this.dip * 0.04 * this.sprint;
    camera.position.addScaledVector(right, sway);
    camera.rotateZ(this.roll + Math.sin(a) * 0.006 * this.sprint);
    this.setFov(camera, baseFov + this.sprint * 9 + this.kick * this.kick * 4);
  }

  private setFov(camera: THREE.PerspectiveCamera, fov: number) {
    if (Math.abs(fov - this.fov) < 0.02) return;
    this.fov = fov;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  dispose() {
    this.dust?.dispose();
  }
}

const MAX = 48;

/** Dust puffs: one point cloud whose soft discs rise, grow and fade (one draw call). */
class Dust {
  private points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX).fill(1);
  private size = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private next = 0;

  constructor(scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('life', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float life;
        attribute float size;
        attribute vec3 color;
        varying float vLife;
        varying vec3 vColor;
        void main() {
          vLife = life;
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = life >= 1.0 ? 0.0 : size * (0.5 + life) * 300.0 / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.2, d) * (1.0 - vLife) * 0.42;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  puff(x: number, y: number, z: number, tint: [number, number, number], strength: number) {
    for (let k = 0; k < 3; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      this.pos.set([x + (Math.random() - 0.5) * 0.25, y, z + (Math.random() - 0.5) * 0.25], i * 3);
      this.vel.set([(Math.random() - 0.5) * 0.6, 0.35 + Math.random() * 0.35, (Math.random() - 0.5) * 0.6], i * 3);
      this.col.set(tint, i * 3);
      this.size[i] = (0.22 + Math.random() * 0.18) * (0.6 + strength * 0.6);
      this.life[i] = 0;
    }
  }

  update(dt: number) {
    let live = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] >= 1) continue;
      live = true;
      this.life[i] = Math.min(1, this.life[i] + dt / 0.75);
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
      this.vel[i * 3 + 1] *= 1 - dt * 2;
    }
    if (!live) return;
    const g = this.points.geometry;
    for (const n of ['position', 'color', 'life', 'size']) g.getAttribute(n).needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
