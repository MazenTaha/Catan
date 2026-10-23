import type * as THREE from 'three';

/**
 * Visual asset slots for the 3D walk: the reusable objects a hand-made model could replace.
 * Each slot renders its procedural model by default. Listing a local GLB for a slot in
 * `ASSET_FILES` makes the world load it in the background (once per page, shared by every
 * world) and swap it in; while it loads, or if it fails, the procedural model stays.
 *
 * Placement never depends on the mesh: the world decides where things stand (and what the
 * walker collides with, from `footprint`) before any model is chosen. See
 * docs/BLENDER_ASSET_PIPELINE.md for the authoring conventions.
 *
 * Conventions (metres, Y up, the model's front facing +Z, origin at the centre of its ground
 * contact, transforms applied, base-colour textures sRGB, others linear). A material whose name
 * starts with "Owner" is recoloured in the owning player's colour.
 */

export type AssetSlot =
  | 'tree.broadleaf'
  | 'tree.conifer'
  | 'wheat.clump'
  | 'wheat.clump.far'
  | 'rock.boulder'
  | 'sheep'
  | 'building.settlement'
  | 'building.city'
  | 'harbor.dock'
  | 'harbor.boat'
  | 'prop.windmill';

export interface SlotSpec {
  /** Approximate size of the procedural model at scale 1 (width x, height y, depth z), metres. */
  size: [number, number, number];
  /** Radius the world keeps clear and the walker collides with; not taken from the mesh. */
  footprint: number;
  /** 'instanced': many copies, one instanced mesh per model part. 'object': cloned per placement. */
  mode: 'instanced' | 'object';
  /** Has "Owner" material slots tinted in the player's colour. */
  owner?: boolean;
  castShadow: boolean;
}

export const SLOTS: Record<AssetSlot, SlotSpec> = {
  'tree.broadleaf': { size: [4, 6, 4], footprint: 0.55, mode: 'instanced', castShadow: true },
  'tree.conifer': { size: [3, 7.5, 3], footprint: 0.55, mode: 'instanced', castShadow: true },
  'wheat.clump': { size: [0.35, 1.25, 0.35], footprint: 0, mode: 'instanced', castShadow: false },
  'wheat.clump.far': { size: [0.35, 1.25, 0.35], footprint: 0, mode: 'instanced', castShadow: false },
  'rock.boulder': { size: [2, 1.2, 2], footprint: 0.9, mode: 'instanced', castShadow: true },
  sheep: { size: [0.8, 1.1, 1.4], footprint: 0.5, mode: 'object', castShadow: true },
  'building.settlement': { size: [4.6, 6.4, 4.8], footprint: 2.8, mode: 'object', owner: true, castShadow: true },
  'building.city': { size: [9, 12.5, 8], footprint: 4.2, mode: 'object', owner: true, castShadow: true },
  'harbor.dock': { size: [2.6, 1.2, 8], footprint: 0, mode: 'object', castShadow: true },
  'harbor.boat': { size: [2, 6, 4.4], footprint: 0.9, mode: 'object', castShadow: true },
  'prop.windmill': { size: [3.7, 9.5, 3.7], footprint: 1.8, mode: 'object', castShadow: true },
};

/**
 * Local GLB files (under `apps/web/public/`) for slots. Empty: everything is procedural and no
 * request is ever made. Example: `'tree.broadleaf': 'models/tree-broadleaf.glb'`.
 */
export const ASSET_FILES: Partial<Record<AssetSlot, string>> = {};

/** A loaded model, flattened into parts (geometry + material + transform relative to its root). */
export interface LoadedAsset {
  root: THREE.Object3D;
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[];
}

const cache = new Map<string, Promise<LoadedAsset | null>>();

/** Marks GPU resources owned by the shared cache, so a world never disposes them. */
const markShared = (o: { userData: Record<string, unknown> }) => (o.userData.shared = true);
export const isShared = (o: { userData: Record<string, unknown> }) => o.userData.shared === true;

/** Resolves a configured path against the app's base URL (blob: and data: URLs pass through). */
export function assetUrl(file: string): string {
  return /^(blob|data|https?):/.test(file) ? file : `${import.meta.env.BASE_URL}${file}`;
}

/**
 * Loads a GLB once per page; later calls share the same promise and resources. Resolves to
 * null (after one warning) if the file is missing or broken, so callers keep their fallback.
 */
export function loadAsset(url: string): Promise<LoadedAsset | null> {
  let p = cache.get(url);
  if (!p) {
    p = import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url))
      .then((gltf) => {
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const parts: LoadedAsset['parts'] = [];
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          markShared(m.geometry);
          for (const mat of mats) {
            markShared(mat);
            // Textures belong to the cache too, even when a world clones the material.
            for (const v of Object.values(mat)) if ((v as THREE.Texture | null)?.isTexture) markShared(v as THREE.Texture);
          }
          if (mats.length === 1) parts.push({ geometry: m.geometry, material: mats[0], matrix: m.matrixWorld.clone() });
        });
        return { root, parts };
      })
      .catch((err: unknown) => {
        console.warn(`3D walk: couldn't load ${url}; keeping the built-in model.`, err);
        return null;
      });
    cache.set(url, p);
  }
  return p;
}

/** Is this a player-colour material slot? */
export const isOwnerMaterial = (m: THREE.Material) => /^owner/i.test(m.name);

/**
 * A clone of a loaded model for one placement. Geometry and materials are shared with the
 * cache, except "Owner" materials, which are swapped for `ownerMat(original)` (owned by the
 * caller's world).
 */
export function cloneAsset(
  asset: LoadedAsset,
  spec: SlotSpec,
  ownerMat?: (original: THREE.Material) => THREE.Material,
): THREE.Object3D {
  const obj = asset.root.clone(true);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = spec.castShadow;
    m.receiveShadow = true;
    if (ownerMat) {
      if (Array.isArray(m.material)) m.material = m.material.map((x) => (isOwnerMaterial(x) ? ownerMat(x) : x));
      else if (isOwnerMaterial(m.material)) m.material = ownerMat(m.material);
    }
  });
  return obj;
}
