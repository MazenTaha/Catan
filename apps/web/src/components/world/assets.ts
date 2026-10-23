import * as THREE from 'three';

/**
 * Visual assets for the 3D walk: the reusable objects drawn from Blender-made models, each with
 * a procedural fallback. `ASSET_FILES` lists, per slot, a GLB under `apps/web/public/` and the
 * names of the variant nodes inside it (several slots share one file and one texture atlas).
 * `preloadWorldAssets` fetches everything once per page before the world is built, so nothing
 * pops in; a slot whose file is missing or broken keeps its procedural model (one warning).
 *
 * Placement never depends on the mesh: the world decides where things stand (and what the
 * walker collides with, from `footprint`) before any model is chosen. Sources and conventions:
 * `assets/blender/*.py` and docs/BLENDER_ASSET_PIPELINE.md.
 *
 * Conventions (metres, Y up, the model's front facing +Z, origin at the centre of its ground
 * contact, base-colour textures sRGB, others linear). A material whose name starts with "Owner"
 * is recoloured in the owning player's colour (or a harbour's sail colour); "Leaf" materials are
 * alpha-tested foliage; "Plant" materials get the game's wind shader.
 */

export type AssetSlot =
  | 'tree.broadleaf'
  | 'tree.conifer'
  | 'tree.sapling'
  | 'shrub'
  | 'wheat.clump'
  | 'wheat.clump.mid'
  | 'wheat.clump.far'
  | 'prop.stook'
  | 'grass.clump'
  | 'flower.daisy'
  | 'flower.poppy'
  | 'flower.buttercup'
  | 'flower.lavender'
  | 'rock.boulder'
  | 'rock.crag'
  | 'rock.clay'
  | 'sheep'
  | 'building.settlement'
  | 'building.city'
  | 'piece.road'
  | 'piece.robber'
  | 'harbor.dock'
  | 'harbor.boat'
  | 'prop.windmill'
  | 'prop.barn'
  | 'prop.kiln'
  | 'prop.haybale'
  | 'prop.mine';

export interface SlotSpec {
  /** Approximate size at scale 1 (width x, height y, depth z), metres. */
  size: [number, number, number];
  /** Radius the world keeps clear and the walker collides with; not taken from the mesh. */
  footprint: number;
  /** 'instanced': many copies, one instanced mesh per variant part. 'object': cloned per placement. */
  mode: 'instanced' | 'object';
  /** Has "Owner" material slots tinted in the player's colour. */
  owner?: boolean;
  castShadow: boolean;
}

export const SLOTS: Record<AssetSlot, SlotSpec> = {
  'tree.broadleaf': { size: [5, 6.5, 5], footprint: 0.55, mode: 'instanced', castShadow: true },
  'tree.conifer': { size: [3.6, 8, 3.6], footprint: 0.55, mode: 'instanced', castShadow: true },
  'tree.sapling': { size: [1.8, 2.6, 1.8], footprint: 0.3, mode: 'instanced', castShadow: true },
  shrub: { size: [2, 1.2, 2], footprint: 0, mode: 'instanced', castShadow: true },
  'wheat.clump': { size: [0.35, 1.25, 0.35], footprint: 0, mode: 'instanced', castShadow: false },
  'wheat.clump.mid': { size: [0.35, 1.25, 0.35], footprint: 0, mode: 'instanced', castShadow: false },
  'wheat.clump.far': { size: [0.35, 1.25, 0.35], footprint: 0, mode: 'instanced', castShadow: false },
  'prop.stook': { size: [0.9, 1.2, 0.9], footprint: 0.5, mode: 'instanced', castShadow: true },
  'grass.clump': { size: [0.3, 0.5, 0.3], footprint: 0, mode: 'instanced', castShadow: false },
  'flower.daisy': { size: [0.15, 0.32, 0.15], footprint: 0, mode: 'instanced', castShadow: false },
  'flower.poppy': { size: [0.2, 0.45, 0.2], footprint: 0, mode: 'instanced', castShadow: false },
  'flower.buttercup': { size: [0.15, 0.32, 0.15], footprint: 0, mode: 'instanced', castShadow: false },
  'flower.lavender': { size: [0.2, 0.45, 0.2], footprint: 0, mode: 'instanced', castShadow: false },
  'rock.boulder': { size: [2, 1.2, 2], footprint: 0.9, mode: 'instanced', castShadow: true },
  'rock.crag': { size: [10, 12, 9], footprint: 4.5, mode: 'instanced', castShadow: true },
  'rock.clay': { size: [5, 2, 4.5], footprint: 2.4, mode: 'instanced', castShadow: true },
  sheep: { size: [0.8, 1.1, 1.4], footprint: 0.5, mode: 'object', castShadow: true },
  'building.settlement': { size: [5.4, 7.6, 5.2], footprint: 2.8, mode: 'object', owner: true, castShadow: true },
  'building.city': { size: [9, 13.5, 8], footprint: 4.2, mode: 'object', owner: true, castShadow: true },
  'piece.road': { size: [14, 0.6, 2.6], footprint: 0, mode: 'object', owner: true, castShadow: true },
  'piece.robber': { size: [1.9, 3.2, 1.9], footprint: 0.9, mode: 'object', castShadow: true },
  'harbor.dock': { size: [2.6, 1.2, 8], footprint: 0, mode: 'object', castShadow: true },
  'harbor.boat': { size: [2, 4.6, 5.6], footprint: 0.9, mode: 'object', castShadow: true },
  'prop.windmill': { size: [3.7, 9, 3.7], footprint: 1.8, mode: 'object', castShadow: true },
  'prop.barn': { size: [5.4, 7, 6.6], footprint: 2.8, mode: 'object', castShadow: true },
  'prop.kiln': { size: [3.7, 4.6, 3.9], footprint: 1.8, mode: 'object', castShadow: true },
  'prop.haybale': { size: [1.1, 1.3, 1.3], footprint: 0.8, mode: 'object', castShadow: true },
  'prop.mine': { size: [3.2, 3.2, 4.8], footprint: 0.9, mode: 'object', castShadow: true },
};

/** A slot's model: a GLB under `apps/web/public/` and the variant node names inside it. */
export interface AssetRef {
  file: string;
  nodes: string[];
}

const FLORA = 'models/flora.glb';
const ROCKS = 'models/rocks.glb';
const VILLAGE = 'models/village.glb';

/**
 * Blender-made models for slots (sources in `assets/blender/`). Remove an entry to fall back
 * to the procedural model for that slot.
 */
export const ASSET_FILES: Partial<Record<AssetSlot, AssetRef>> = {
  'wheat.clump': { file: FLORA, nodes: ['WheatA', 'WheatB', 'WheatC'] },
  'wheat.clump.mid': { file: FLORA, nodes: ['WheatMid'] },
  'wheat.clump.far': { file: FLORA, nodes: ['WheatFar'] },
  'prop.stook': { file: FLORA, nodes: ['Stook'] },
  'grass.clump': { file: FLORA, nodes: ['GrassA', 'GrassB'] },
  'flower.daisy': { file: FLORA, nodes: ['Daisy'] },
  'flower.poppy': { file: FLORA, nodes: ['Poppy'] },
  'flower.buttercup': { file: FLORA, nodes: ['Buttercup'] },
  'flower.lavender': { file: FLORA, nodes: ['Lavender'] },
  'tree.broadleaf': { file: FLORA, nodes: ['Oak', 'Lime'] },
  'tree.conifer': { file: FLORA, nodes: ['Spruce', 'Fir'] },
  'tree.sapling': { file: FLORA, nodes: ['Sapling'] },
  shrub: { file: FLORA, nodes: ['ShrubA', 'ShrubB'] },
  'rock.boulder': { file: ROCKS, nodes: ['BoulderA', 'BoulderB', 'BoulderC'] },
  'rock.crag': { file: ROCKS, nodes: ['CragA', 'CragB', 'CragC'] },
  'rock.clay': { file: ROCKS, nodes: ['ClayA', 'ClayB'] },
  'building.settlement': { file: VILLAGE, nodes: ['Settlement'] },
  'building.city': { file: VILLAGE, nodes: ['City'] },
  'piece.road': { file: VILLAGE, nodes: ['Road'] },
  'piece.robber': { file: VILLAGE, nodes: ['Robber'] },
  'prop.windmill': { file: VILLAGE, nodes: ['Windmill'] },
  'harbor.dock': { file: VILLAGE, nodes: ['Dock'] },
  'harbor.boat': { file: VILLAGE, nodes: ['Boat'] },
  sheep: { file: VILLAGE, nodes: ['Sheep'] },
  'prop.barn': { file: VILLAGE, nodes: ['Barn'] },
  'prop.kiln': { file: VILLAGE, nodes: ['Kiln'] },
  'prop.haybale': { file: VILLAGE, nodes: ['HayBale'] },
  'prop.mine': { file: VILLAGE, nodes: ['Mine'] },
};

/** Tiling ground detail (sRGB) and normal maps (linear), by kind. */
export const GROUND_TEXTURES = ['grass', 'soil', 'sand', 'rock'] as const;
export type GroundKind = (typeof GROUND_TEXTURES)[number];

/** One variant of a slot, flattened into parts (geometry + material + transform relative to its root). */
export interface LoadedAsset {
  name: string;
  root: THREE.Object3D;
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[];
}

/** Everything the world draws from files; any missing entry falls back to procedural. */
export interface WorldAssets {
  models: Map<AssetSlot, LoadedAsset[]>;
  ground: Map<GroundKind, { map: THREE.Texture; normal: THREE.Texture }>;
}

/** Marks GPU resources owned by the shared cache, so a world never disposes them. */
const markShared = (o: { userData: Record<string, unknown> }) => (o.userData.shared = true);
export const isShared = (o: { userData: Record<string, unknown> }) => o.userData.shared === true;

/** Resolves a configured path against the app's base URL (blob: and data: URLs pass through). */
export function assetUrl(file: string): string {
  return /^(blob|data|https?):/.test(file) ? file : `${import.meta.env.BASE_URL}${file}`;
}

const files = new Map<string, Promise<THREE.Object3D | null>>();

/** Loads a GLB once per page; later calls share the same promise and resources. */
function loadFile(url: string): Promise<THREE.Object3D | null> {
  let p = files.get(url);
  if (!p) {
    p = import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url))
      .then((gltf) => {
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          markShared(m.geometry);
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            markShared(mat);
            prepareMaterial(mat as THREE.MeshStandardMaterial);
          }
        });
        return gltf.scene as THREE.Object3D;
      })
      .catch((err: unknown) => {
        console.warn(`3D walk: couldn't load ${url}; keeping the built-in models.`, err);
        return null;
      });
    files.set(url, p);
  }
  return p;
}

/** Material conventions by name, applied once to the shared (cached) materials. */
function prepareMaterial(m: THREE.MeshStandardMaterial) {
  for (const v of Object.values(m)) {
    const t = v as THREE.Texture | null;
    if (t?.isTexture) {
      markShared(t);
      t.anisotropy = 4;
    }
  }
  if (/^leaf/i.test(m.name)) {
    m.transparent = false;
    m.alphaTest = 0.5;
    m.side = THREE.DoubleSide;
  }
  if (/^plant/i.test(m.name)) m.side = THREE.DoubleSide;
}

/** A variant node re-rooted at the origin (its file position is only a layout in Blender). */
function variant(scene: THREE.Object3D, name: string): LoadedAsset | null {
  const node = scene.getObjectByName(name);
  if (!node) return null;
  const root = node.clone(true);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const parts: LoadedAsset['parts'] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    parts.push({ geometry: m.geometry, material: m.material, matrix: m.matrixWorld.clone() });
  });
  return { name, root, parts };
}

const slots = new Map<AssetSlot, Promise<LoadedAsset[] | null>>();

/** A slot's variants (null if none of them could be loaded). */
export function loadSlot(slot: AssetSlot): Promise<LoadedAsset[] | null> {
  let p = slots.get(slot);
  if (!p) {
    const ref = ASSET_FILES[slot];
    p = !ref
      ? Promise.resolve(null)
      : loadFile(assetUrl(ref.file)).then((scene) => {
          if (!scene) return null;
          const found = ref.nodes.map((n) => variant(scene, n)).filter((v): v is LoadedAsset => !!v);
          if (found.length < ref.nodes.length)
            console.warn(`3D walk: ${ref.file} is missing some of ${ref.nodes.join(', ')}.`);
          return found.length ? found : null;
        });
    slots.set(slot, p);
  }
  return p;
}

const textures = new Map<string, Promise<THREE.Texture | null>>();

function loadTexture(url: string, srgb: boolean): Promise<THREE.Texture | null> {
  let p = textures.get(url);
  if (!p) {
    p = new THREE.TextureLoader()
      .loadAsync(url)
      .then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        markShared(t);
        return t;
      })
      .catch(() => {
        console.warn(`3D walk: couldn't load ${url}; using the built-in ground texture.`);
        return null;
      });
    textures.set(url, p);
  }
  return p;
}

/**
 * Fetches every listed model and the ground textures (once per page; later worlds reuse them).
 * Resolves after at most `timeoutMs`; anything still loading then is drawn procedurally.
 */
export async function preloadWorldAssets(timeoutMs = 10_000): Promise<WorldAssets> {
  const out: WorldAssets = { models: new Map(), ground: new Map() };
  const jobs: Promise<void>[] = [];
  for (const slot of Object.keys(ASSET_FILES) as AssetSlot[])
    jobs.push(
      loadSlot(slot).then((v) => {
        if (v) out.models.set(slot, v);
      }),
    );
  for (const kind of GROUND_TEXTURES)
    jobs.push(
      Promise.all([
        loadTexture(assetUrl(`textures/ground-${kind}.jpg`), true),
        loadTexture(assetUrl(`textures/ground-${kind}-n.jpg`), false),
      ]).then(([map, normal]) => {
        if (map && normal) out.ground.set(kind, { map, normal });
      }),
    );
  let timer = 0;
  await Promise.race([
    Promise.all(jobs),
    new Promise<void>((resolve) => (timer = window.setTimeout(resolve, timeoutMs))),
  ]);
  window.clearTimeout(timer);
  return out;
}

/** Is this a player-colour (or sail-colour) material slot? */
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
