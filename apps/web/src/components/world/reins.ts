import * as THREE from 'three';

export interface HandPoints {
  left: THREE.Vector3;
  right: THREE.Vector3;
}

const SEGMENTS = 12;
const SIDES = 4;

/** Two leather straps, updated between animated bit rings and the rider's palms. */
export class Reins {
  readonly mesh: THREE.Mesh;
  private readonly positions = new Float32Array(2 * (SEGMENTS + 1) * SIDES * 3);
  private readonly normals = new Float32Array(this.positions.length);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.MeshStandardMaterial({ color: '#51331f', roughness: 0.85 });
  private readonly tangent = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly vertical = new THREE.Vector3(0, 1, 0);

  constructor() {
    const indices: number[] = [];
    for (let strap = 0; strap < 2; strap++)
      for (let i = 0; i < SEGMENTS; i++)
        for (let j = 0; j < SIDES; j++) {
          const a = (strap * (SEGMENTS + 1) + i) * SIDES + j;
          const b = (strap * (SEGMENTS + 1) + i) * SIDES + ((j + 1) % SIDES);
          indices.push(a, a + SIDES, b, b, a + SIDES, b + SIDES);
        }
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'HeldReins';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.mesh.userData.loose = true;
  }

  update(bits: HandPoints, hands: HandPoints) {
    for (const [strap, key] of (['left', 'right'] as const).entries()) {
      const start = bits[key],
        end = hands[key];
      const sag = Math.min(0.11, start.distanceTo(end) * 0.08);
      for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS;
        const x = THREE.MathUtils.lerp(start.x, end.x, t);
        const y = THREE.MathUtils.lerp(start.y, end.y, t) - 4 * sag * t * (1 - t);
        const z = THREE.MathUtils.lerp(start.z, end.z, t);
        this.tangent.subVectors(end, start).normalize();
        this.tangent.y -= (4 * sag * (1 - 2 * t)) / Math.max(0.1, start.distanceTo(end));
        this.tangent.normalize();
        this.side.crossVectors(this.tangent, this.vertical);
        if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
        this.side.normalize();
        this.up.crossVectors(this.side, this.tangent).normalize();
        for (let j = 0; j < SIDES; j++) {
          const c = Math.cos((j * Math.PI) / 2),
            s = Math.sin((j * Math.PI) / 2);
          const nx = this.side.x * c + this.up.x * s;
          const ny = this.side.y * c + this.up.y * s;
          const nz = this.side.z * c + this.up.z * s;
          const p = ((strap * (SEGMENTS + 1) + i) * SIDES + j) * 3;
          this.positions[p] = x + nx * 0.009;
          this.positions[p + 1] = y + ny * 0.009;
          this.positions[p + 2] = z + nz * 0.009;
          this.normals[p] = nx;
          this.normals[p + 1] = ny;
          this.normals[p + 2] = nz;
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.mesh.visible = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
