import * as THREE from 'three';

export const CONSTRUCTION_MS = 5000;
export interface BuildingStart {
  vertex: string;
  kind: string;
  at: number;
}

/** Temporary presentation only: the confirmed building and its collision exist immediately. */
export class Construction {
  private plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  private materials = new Map<THREE.Material, THREE.Material>();
  private scaffold = new THREE.Group();
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private timber = new THREE.MeshStandardMaterial({ color: '#8b6741', roughness: 0.95 });
  private dustMaterial = new THREE.MeshBasicMaterial({
    color: '#d6bb8c',
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  private dust: THREE.InstancedMesh | null = null;
  private frame: THREE.InstancedMesh;
  private transform = new THREE.Object3D();
  private bounds: THREE.Box3;
  private gone = false;

  constructor(
    private root: THREE.Object3D,
    readonly started: number,
    lite: boolean,
    furnishings: THREE.Object3D[] = [],
  ) {
    root.updateWorldMatrix(true, true);
    this.bounds = new THREE.Box3().setFromObject(root);
    const clone = (material: THREE.Material) => {
      let copy = this.materials.get(material);
      if (!copy) {
        copy = material.clone();
        copy.clippingPlanes = [this.plane];
        copy.clipShadows = true;
        this.materials.set(material, copy);
      }
      return copy;
    };
    const visit = (node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      this.originals.push({ mesh, material: mesh.material });
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(clone)
        : clone(mesh.material);
    };
    root.traverse(visit);
    for (const group of furnishings) {
      group.updateWorldMatrix(true, true);
      group.traverse(visit);
    }
    // Local bounds retain the footprint when the house faces a different tile.
    const local = new THREE.Box3();
    const inverse = root.matrixWorld.clone().invert();
    for (const { mesh } of this.originals) {
      mesh.geometry.computeBoundingBox();
      local.union(
        mesh.geometry
          .boundingBox!.clone()
          .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)),
      );
    }
    const height = Math.min(4.8, local.max.y * 0.72);
    const x0 = local.min.x - 0.3,
      x1 = local.max.x + 0.3;
    const z0 = local.min.z - 0.3,
      z1 = local.max.z + 0.3;
    const parts: THREE.Matrix4[] = [];
    const beam = (x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
      parts.push(new THREE.Matrix4().makeScale(sx, sy, sz).setPosition(x, y, z));
    for (const x of [x0, x1]) for (const z of [z0, z1]) beam(x, height / 2, z, 0.1, height, 0.1);
    for (const y of [height * 0.45, height * 0.85]) {
      for (const z of [z0, z1]) beam((x0 + x1) / 2, y, z, x1 - x0, 0.08, 0.14);
      for (const x of [x0, x1]) beam(x, y, (z0 + z1) / 2, 0.14, 0.08, z1 - z0);
    }
    this.frame = new THREE.InstancedMesh(this.geometry, this.timber, parts.length);
    parts.forEach((matrix, index) => this.frame.setMatrixAt(index, matrix));
    this.scaffold.add(this.frame);
    if (!lite) {
      this.dust = new THREE.InstancedMesh(this.geometry, this.dustMaterial, 12);
      this.dust.frustumCulled = false;
      this.scaffold.add(this.dust);
    }
    root.add(this.scaffold);
    this.update(Date.now());
  }

  update(now: number): boolean {
    const t = Math.max(0, (now - this.started) / CONSTRUCTION_MS);
    if (t >= 1) {
      this.dispose();
      return false;
    }
    // Footings first, masonry/timber next, roof and fittings last. No squash or sinking shell.
    const progress =
      t < 0.16
        ? (t / 0.16) * 0.08
        : t < 0.72
          ? 0.08 + ((t - 0.16) / 0.56) * 0.55
          : 0.63 + ((t - 0.72) / 0.28) * 0.37;
    this.plane.constant = THREE.MathUtils.lerp(
      this.bounds.min.y - 0.02,
      this.bounds.max.y + 0.02,
      progress,
    );
    this.scaffold.visible = t < 0.94;
    if (this.dust) {
      const transform = this.transform;
      for (let i = 0; i < 12; i++) {
        const age = (t * 6 + i / 12) % 1;
        const a = i * 2.39996;
        transform.position.set(
          Math.cos(a) * (1 + age) * 2,
          0.08 + age * 0.7,
          Math.sin(a) * (1 + age) * 2,
        );
        transform.scale.setScalar(Math.sin(age * Math.PI) * 0.18);
        transform.rotation.set(age, a, age * 0.5);
        transform.updateMatrix();
        this.dust.setMatrixAt(i, transform.matrix);
      }
      this.dust.instanceMatrix.needsUpdate = true;
    }
    return true;
  }

  dispose() {
    if (this.gone) return;
    this.gone = true;
    for (const { mesh, material } of this.originals) mesh.material = material;
    this.materials.forEach((material) => material.dispose());
    this.root.remove(this.scaffold);
    this.dust?.dispose();
    this.frame.dispose();
    this.geometry.dispose();
    this.timber.dispose();
    this.dustMaterial.dispose();
  }
}
