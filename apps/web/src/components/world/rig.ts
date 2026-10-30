import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges a figure built from many small parts (a character, a horse, a chest) into one mesh
 * per joint and surface, coloured per vertex, so it costs a handful of draws instead of dozens
 * (DECISIONS #41). A joint is any object that moves on its own (an arm, a lid); parts under a
 * static group (a head, a hand) go to the nearest joint above them. Plain parts share two
 * materials, matte and metal; a part with a texture, a glow, a second side or transparency
 * keeps its own material in its own bucket. The parts stay behind as hidden sources, so a new
 * look or colour (their materials changed) only needs `bake` again; `keep: false` drops them
 * for a figure that never changes.
 */
export class RigBaker {
  readonly matte: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  private geos = new Map<THREE.Object3D, THREE.BufferGeometry[]>();

  constructor(matte = 0.9, metal: [number, number] = [0.42, 0.72]) {
    this.matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: matte });
    this.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: metal[0], metalness: metal[1] });
  }

  /** (Re)builds the merged meshes of `root`; `joints` are its moving parts (root included). */
  bake(root: THREE.Object3D, joints: THREE.Object3D[] = [], keep = true) {
    this.clear(root);
    const isJoint = new Set<THREE.Object3D>([root, ...joints]);
    const made: THREE.BufferGeometry[] = [];
    const buckets = new Map<string, { joint: THREE.Object3D; mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
    const rel = new THREE.Matrix4();
    const sources: THREE.Mesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.rigBaked && !m.userData.loose && !(m as THREE.InstancedMesh).isInstancedMesh) sources.push(m);
    });
    for (const m of sources) {
      // The part's transform relative to its joint, through any static groups between.
      m.updateMatrix();
      rel.copy(m.matrix);
      let p = m.parent;
      while (p && !isJoint.has(p)) {
        p.updateMatrix();
        rel.premultiply(p.matrix);
        p = p.parent;
      }
      if (!p || Array.isArray(m.material)) continue;
      const src = m.material as THREE.MeshStandardMaterial;
      const special =
        !src.isMeshStandardMaterial || !!src.map || src.transparent || src.side !== THREE.FrontSide || src.emissive.getHex() !== 0;
      const mat = special ? src : src.metalness > 0.3 ? this.metal : this.matte;
      // Indexed, so the GPU shades each shared vertex once (merging needs all or none indexed).
      const g = m.geometry.clone();
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.clearGroups();
      g.applyMatrix4(rel);
      if (!special) {
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.set([src.color.r, src.color.g, src.color.b], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      const key = `${p.uuid}|${mat.uuid}|${m.castShadow}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { joint: p, mat, cast: m.castShadow, geos: [] }));
      b.geos.push(g);
      if (keep) m.visible = false;
      else m.removeFromParent();
    }
    for (const b of buckets.values()) {
      const merged = mergeGeometries(b.geos);
      b.geos.forEach((g) => g.dispose());
      if (!merged) continue;
      made.push(merged);
      const out = new THREE.Mesh(merged, b.mat);
      out.userData.rigBaked = true;
      out.castShadow = b.cast;
      out.receiveShadow = true;
      b.joint.add(out);
    }
    this.geos.set(root, made);
  }

  /** Removes `root`'s merged meshes (its sources stay hidden). */
  private clear(root: THREE.Object3D) {
    const old: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (o.userData.rigBaked) old.push(o);
    });
    for (const o of old) o.removeFromParent();
    this.geos.get(root)?.forEach((g) => g.dispose());
    this.geos.delete(root);
  }

  dispose() {
    this.geos.forEach((gs) => gs.forEach((g) => g.dispose()));
    this.geos.clear();
    this.matte.dispose();
    this.metal.dispose();
  }
}
