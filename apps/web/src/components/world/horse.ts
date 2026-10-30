import * as THREE from 'three';

const box = new THREE.BoxGeometry(1, 1, 1);
const ball = new THREE.SphereGeometry(1, 14, 10);
const tube = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);

const COATS = ['#6b4429', '#3b2a20', '#a8784a', '#d8cfc0', '#2a2522', '#8a5a34'];

/**
 * A saddled horse, built from simple shapes: barrel, neck, head with ears and mane, four
 * jointed legs and a swishing tail. Its gait follows its speed: a walk, then a gallop.
 * Faces -z like the walker; the saddle blanket shows the rider's seat colour.
 */
export class Horse {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private neck = new THREE.Group();
  private tail = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group; phase: number }[] = [];
  private mats: THREE.Material[] = [];
  private blanket: THREE.MeshStandardMaterial;
  private t = Math.random() * 10;
  /** Height of the saddle's seat above the ground (m). */
  readonly saddleHeight = 1.62;
  /** Grazing (head down) when idle and nobody rides. */
  grazing = false;

  constructor(color = '#b0364a', private reduce = false, coat = 0) {
    const hide = this.mat(COATS[coat % COATS.length], 0.85);
    const dark = this.mat('#1c1512', 0.8);
    const leather = this.mat('#4a3020', 0.7);
    const hoof = this.mat('#2b2420', 0.6);
    const brass = this.mat('#b8964f', 0.4, 0.7);
    this.blanket = this.mat(color, 0.9);
    this.body.position.y = 1.32;
    this.root.add(this.body);
    this.part(this.body, hide, 0, 0, 0, 0.62, 0.66, 1.72, ball);
    this.part(this.body, hide, 0, 0.04, 0.62, 0.58, 0.62, 0.62, ball);
    this.part(this.body, hide, 0, 0.06, -0.6, 0.56, 0.62, 0.6, ball);
    // Saddle: blanket in the rider's colour, leather seat, cantle, pommel and stirrups.
    this.part(this.body, this.blanket, 0, 0.3, 0.02, 0.7, 0.06, 0.82);
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
  }

  /** Poses the legs, neck and tail for a speed (m/s): standing, walking or galloping. */
  update(dt: number, speed: number) {
    if (this.reduce) {
      this.neck.rotation.x = this.grazing && speed < 0.1 ? 0.9 : 0;
      return;
    }
    const gallop = speed > 9;
    this.t += dt * (speed < 0.1 ? 0 : gallop ? 9 : 5.5);
    const amp = speed < 0.1 ? 0 : gallop ? 0.75 : 0.42;
    for (const l of this.legs) {
      const a = Math.sin((this.t + l.phase * Math.PI * 2) * (gallop ? 1 : 1));
      l.hip.rotation.x = a * amp;
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
  }
}
