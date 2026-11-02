import type * as THREE from 'three';

/**
 * Equipment, the weapon chest and furnishings from props.glb (Blender), by node name. The
 * world's loader fills this; the avatar, chest and decor builders read it and keep their
 * procedural parts when a model is missing. No loader imports here, so the combat code stays
 * usable outside Vite (its e2e test).
 */
export interface GearModel {
  root: THREE.Object3D;
}

const models = new Map<string, GearModel>();

export function setGear(name: string, model: GearModel) {
  models.set(name, model);
}

/**
 * A clone of a gear model, its meshes casting and receiving shadows; `swap` may replace a
 * material (by returning one), e.g. a seat or furnishing colour for an "Owner" or "Tint" slot.
 */
export function cloneGear(name: string, swap?: (m: THREE.Material) => THREE.Material | undefined): THREE.Object3D | null {
  const g = models.get(name);
  if (!g) return null;
  const o = g.root.clone(true);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = m.receiveShadow = true;
    if (swap && !Array.isArray(m.material)) m.material = swap(m.material) ?? m.material;
  });
  return o;
}
