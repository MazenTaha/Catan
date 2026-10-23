import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getTopology,
  type Board,
  type GameState,
  type HarborKind,
  type Terrain,
} from '@hexfall/engine';
import { COLOR_HEX } from '../../lexicon';
import {
  SLOTS,
  cloneAsset,
  type AssetSlot,
  type GroundKind,
  type LoadedAsset,
  type WorldAssets,
} from './assets';
import { Field, variantAt, type PlantVisual } from './field';
import {
  Kit,
  STONE,
  WOOD,
  addSway,
  bake,
  makeBarn,
  makeBoat,
  makeBrickStack,
  makeCity,
  makeCrag,
  makeDock,
  makeFencePost,
  makeFenceRail,
  makeHayBale,
  makeKiln,
  makeMine,
  makeMist,
  makeOreRock,
  makeRoad,
  makeRobber,
  makeSettlement,
  makeSheep,
  makeTokenSprite,
  makeTrough,
  makeWindmill,
  mesh,
  type SheepRig,
} from './models';
import {
  DETAIL_KIND,
  R,
  buildGround,
  detailTexture,
  edgeDistance,
  fbm,
  onPath,
  tileHeight,
  type TileGround,
} from './terrain';
import { foliage, foliageDepth, groundDetail, makeSky, noiseTexture } from './shaders';
import { wheatClumpGeometry } from './wheat';

export { R };
/** Eye height above the ground, metres. */
const EYE = 1.7;
const PLAYER_R = 0.35;
const WALK = 5;
const RUN = 10;
/** Procedural houses are modelled small; this brings doors to ~2 m next to a 1.7 m eye. */
const PIECE_SCALE = 1.4;
/** Grass and flowers shrink away between these distances (metres); cells past them aren't drawn. */
const GRASS_FADE: [number, number] = [22, 30];
const FLOWER_FADE: [number, number] = [30, 40];
/** Grass and flowers keep this far (metres) from tile edges, where roads run and buildings stand. */
const EDGE_CLEAR = 1.6;
/** Wildflower models and how often a drift is of each kind. */
const FLOWER_SLOTS: AssetSlot[] = ['flower.daisy', 'flower.buttercup', 'flower.poppy', 'flower.lavender'];
const FLOWER_WEIGHTS = [0.36, 0.3, 0.22, 0.12];

/** Index of the bucket `t` (0-1) falls in, given bucket weights summing to 1. */
function weighted(weights: number[], t: number): number {
  let acc = 0;
  for (let i = 0; i < weights.length; i++) if (t < (acc += weights[i])) return i;
  return weights.length - 1;
}

const topo = getTopology();

/** A capsule on the ground (a circle when a == b) the walker can't enter. */
interface Collider {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

interface Sheep {
  rig: SheepRig;
  x: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  mode: 'walk' | 'graze' | 'look';
  timer: number;
  speed: number;
  gait: number;
  blink: number;
  pen: { cx: number; cz: number; r: number; avoid: { x: number; z: number; r: number }[] };
}

interface Spawn {
  x: number;
  z: number;
  yaw: number;
}

export interface WorldOptions {
  lite: boolean;
  reduceMotion: boolean;
  onHexChange(hex: number | null): void;
  onBleat(): void;
}

const SAIL: Record<HarborKind, string> = {
  any: '#f6f1e6',
  wood: '#4f9a3c',
  clay: '#c8653c',
  wool: '#d9eeb0',
  grain: '#efc649',
  ore: '#8d9fb4',
};

/** Afternoon sky: deep clear blue overhead, pale and hazy at the horizon, warm toward the sun. */
const SKY = {
  zenith: new THREE.Color('#2f73c4'),
  upper: new THREE.Color('#6eaae6'),
  horizon: new THREE.Color('#cfe2ee'),
  glow: new THREE.Color('#ffe2b4'),
  sun: new THREE.Color('#fff1d6'),
  cloudLit: new THREE.Color('#fffaf0'),
  cloudShade: new THREE.Color('#9fb0c8'),
};

/**
 * The fill light's sky: softer and less blue than the visible one, with a warm green bounce
 * from the meadows below, so shade keeps its colour instead of turning teal.
 */
const FILL = {
  zenith: new THREE.Color('#7aa6d6'),
  horizon: new THREE.Color('#e6e4da'),
  ground: new THREE.Color('#7d7a4c'),
};

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Is (x, z) inside a pointy-top hex of circumradius r centred at (cx, cz)? */
function inHex(x: number, z: number, cx: number, cz: number, r: number): boolean {
  const dx = Math.abs(x - cx);
  const dz = Math.abs(z - cz);
  const k = (Math.sqrt(3) / 2) * r;
  return dx <= k && dz <= r - dx / Math.sqrt(3);
}

/** Unit vector on the ground for an angle measured like `rotation.y` (0 = +Z). */
const dir = (a: number) => ({ x: Math.sin(a), z: Math.cos(a) });

export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private kit = new Kit();
  private sun!: THREE.DirectionalLight;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private uTime = { value: 0 };
  private last = performance.now();
  private disposed = false;
  /** Shaders are still linking in the background. */
  private compiling = false;

  private colliders: Collider[] = [];
  private pieceColliders: Collider[] = [];
  /** Docks: walkable strips beyond the beach. */
  private walkable: Collider[] = [];
  private landHexes: { id: number; x: number; z: number }[] = [];
  private tiles = new Map<number, TileGround>();
  private spawns = new Map<number, Spawn>();
  private sheep: Sheep[] = [];
  private spinners: THREE.Object3D[] = [];
  private boats: { obj: THREE.Object3D; phase: number; y: number }[] = [];
  private pieces = new THREE.Group();
  private robber: THREE.Object3D | null = null;
  /** Wheat, grass and flowers: instanced in cells, detail by distance. */
  private fields: Field[] = [];
  private grass: Field | null = null;
  private flowers: Field | null = null;
  private inst: Instancer;
  private sky!: THREE.Mesh;
  /** Owner-tinted copies of model materials, by original and colour. */
  private ownerMats = new Map<string, THREE.Material>();
  /** Per-world copies of shared plant materials with the wind shader, by original. */
  private plantMats = new Map<string, THREE.Material>();
  /** Depth pre-pass twins of leaf materials, by lit material. */
  private depthMats = new Map<THREE.Material, THREE.Material>();
  /** Afternoon sun in the west-north-west, about 30 degrees up. */
  private sunDir = new THREE.Vector3(-0.64, 0.5, -0.58).normalize();
  private robberHex = -1;
  /** Shadow map bookkeeping: where its box is centred, frames drawn, and a forced redraw. */
  private shadowAt = { x: NaN, z: NaN };
  private shadowTick = 0;
  private shadowDirty = true;

  private x = 0;
  private z = 0;
  private yaw = 0;
  private pitch = -0.08;
  private camY = EYE;
  private hex: number | null = -2;
  private nextBleat = 3;

  readonly keys = new Set<string>();
  readonly joy = { x: 0, y: 0 };

  constructor(
    canvas: HTMLCanvasElement,
    board: Board,
    private opts: WorldOptions,
    private assets: WorldAssets = { models: new Map(), ground: new Map() },
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !opts.lite,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lite ? 1 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral keeps authored colours (greens, gold, clay) saturated and only rolls off highlights.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !opts.lite;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 1500);
    this.camera.rotation.order = 'YXZ';
    this.inst = new Instancer(this.kit, this.uTime, opts.lite, (slot) => this.model(slot), (slot, p) => this.partsFor(slot, p));

    this.buildSky();
    this.buildLights();
    this.buildIsland(board);
    this.scene.add(this.pieces);

    this.startWhenCompiled();
  }

  // ---------------------------------------------------------------- public API

  resize(w: number, h: number): void {
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * 0.004;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -1.2, 1.1);
  }

  /** Teleports to a land hex's viewpoint, facing its centre, nudged clear of anything solid. */
  goTo(hex: number): void {
    const s = this.spawns.get(hex);
    if (!s) return;
    this.x = s.x;
    this.z = s.z;
    this.tryMove(s.x, s.z);
    this.yaw = s.yaw;
    this.pitch = -0.12;
    this.camY = this.groundAt(this.x, this.z) + EYE;
  }

  /** Rebuilds settlements, cities, roads and the robber from the game state. */
  setPieces(state: GameState): void {
    this.shadowDirty = true;
    for (const c of [...this.pieces.children]) this.pieces.remove(c);
    this.pieceColliders = [];
    const center = (v: string) => ({ x: topo.vertexPos[v].x * R, z: topo.vertexPos[v].y * R });

    for (const [e, owner] of Object.entries(state.causeways)) {
      const [a, b] = topo.edgeVertices[e];
      const pa = center(a);
      const pb = center(b);
      const color = COLOR_HEX[state.players[owner].color];
      const model = this.model('piece.road')?.[0];
      const road = model ? cloneAsset(model, SLOTS['piece.road'], (m) => this.tinted(m, color)) : makeRoad(this.kit, R, color);
      road.position.set((pa.x + pb.x) / 2, model ? -0.02 : -0.04, (pa.z + pb.z) / 2);
      road.rotation.y = Math.atan2(-(pb.z - pa.z), pb.x - pa.x);
      this.pieces.add(road);
    }
    for (const [v, b] of Object.entries(state.buildings)) {
      const p = center(v);
      const color = COLOR_HEX[state.players[b.owner].color];
      const slot: AssetSlot = b.kind === 'citadel' ? 'building.city' : 'building.settlement';
      const obj = this.piece(slot, color);
      obj.position.set(p.x, 0, p.z);
      obj.rotation.y = Math.atan2(-p.x, -p.z);
      this.pieces.add(obj);
      const r = SLOTS[slot].footprint;
      this.pieceColliders.push({ ax: p.x, az: p.z, bx: p.x, bz: p.z, r });
    }

    if (!this.robber) {
      const model = this.model('piece.robber')?.[0];
      this.robber = model ? cloneAsset(model, SLOTS['piece.robber']) : makeRobber(this.kit);
      // The built-in pawn floats and bobs; the model stands on its own stone base.
      this.robber.userData.hover = !model;
      if (!model) this.robber.scale.setScalar(1.1);
      this.scene.add(this.robber);
    }
    if (this.robberHex !== state.wraithHex) {
      this.robberHex = state.wraithHex;
      const h = topo.hexPos[state.wraithHex];
      const rx = h.x * R + 2.3;
      const rz = h.y * R + 1.4;
      this.robber.position.set(rx, this.groundAt(rx, rz), rz);
      this.robber.userData.y = this.robber.position.y;
    }
    const rb = this.robber.position;
    this.pieceColliders.push({ ax: rb.x, az: rb.z, bx: rb.x, bz: rb.z, r: 0.9 });
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    // Programs still linking in the background are released once they finish (deleting them
    // mid-link makes the driver log errors).
    if (!this.compiling) this.release();
  }

  private release(): void {
    // Frees everything this renderer uploaded, cached models included: dispose() only drops
    // the GPU copies, and the page cache keeps the data for the next world to upload again.
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      const m = o as THREE.Mesh;
      if (m.geometry) geos.add(m.geometry);
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => {
      for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) (v as THREE.Texture).dispose();
      m.dispose();
    });
    noiseTexture().dispose();
    this.kit.dispose();
    this.envRT?.dispose();
    this.renderer.dispose();
  }

  /**
   * Starts every shader compiling at once (the driver links them in parallel where it can) and
   * begins drawing when they're done, instead of stalling the first frame on each in turn.
   */
  private startWhenCompiled() {
    this.renderer.compile(this.scene, this.camera);
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('KHR_parallel_shader_compile') as { COMPLETION_STATUS_KHR: number } | null;
    const done = () =>
      !ext ||
      (this.renderer.info.programs ?? []).every((p) =>
        gl.getProgramParameter((p as unknown as { program: WebGLProgram }).program, ext.COMPLETION_STATUS_KHR),
      );
    const wait = () => {
      if (!done()) {
        window.setTimeout(wait, 16);
        return;
      }
      this.compiling = false;
      if (this.disposed) this.release();
      else this.renderer.setAnimationLoop(() => this.frame());
    };
    this.compiling = true;
    wait();
  }

  // ---------------------------------------------------------------- assets

  /** A slot's loaded variants, or undefined to draw it procedurally. */
  private model(slot: AssetSlot): LoadedAsset[] | undefined {
    return this.assets.models.get(slot);
  }

  /** An owner (or sail) material tinted in a colour; one copy per material and colour. */
  private tinted(m: THREE.Material, color: string): THREE.Material {
    const key = `${m.uuid}|${color}`;
    let own = this.ownerMats.get(key);
    if (!own) {
      const c = m.clone() as THREE.MeshStandardMaterial;
      c.color?.set(color);
      own = this.kit.ownMat(c);
      this.ownerMats.set(key, own);
    }
    return own;
  }

  /**
   * A variant's parts with their transforms baked in, owned by this world. Plant materials get
   * a per-world copy with the wind shader; `wphase` comes from the model's `_wphase` attribute.
   */
  private partsFor(slot: AssetSlot, asset: LoadedAsset): PlantVisual['parts'] {
    return asset.parts.map((p) => {
      const g = this.kit.own(p.geometry.clone().applyMatrix4(p.matrix));
      const phase = g.getAttribute('_wphase');
      if (phase) {
        g.setAttribute('wphase', phase);
        g.deleteAttribute('_wphase');
      }
      const material = this.plantMaterial(slot, p.material);
      return { geometry: g, material, depth: this.depthMats.get(material) };
    });
  }

  /** The material a slot's part is drawn with: shared as loaded, or a per-world foliage copy. */
  private plantMaterial(slot: AssetSlot, m: THREE.Material): THREE.Material {
    const leaf = /^leaf/i.test(m.name);
    const plant = /^plant/i.test(m.name) && slot !== 'prop.stook';
    if (!leaf && !plant) return m;
    const key = `${slot}|${m.uuid}`;
    let own = this.plantMats.get(key);
    if (!own) {
      const still = this.opts.lite || this.opts.reduceMotion;
      const c = (m as THREE.MeshStandardMaterial).clone();
      if (leaf) {
        // Plain alpha test (no alpha to coverage): the depth pre-pass must agree exactly on
        // which texels are leaf, or the sky shows through as bright fringes.
        const o = { uTime: this.uTime, sway: still ? 0 : slot === 'shrub' ? 0.012 : 0.02, translucency: 0.35 };
        foliage(c, o);
        this.depthMats.set(c, this.kit.ownMat(foliageDepth(c, o)));
      } else if (slot.startsWith('wheat')) {
        const o = { uTime: this.uTime, wind: { amount: still ? 0 : 0.12, height: 1.15 }, translucency: 1 };
        foliage(c, o);
        // The near clumps fill the screen in layers: shade only the front-most stalk.
        if (slot === 'wheat.clump') this.depthMats.set(c, this.kit.ownMat(foliageDepth(c, o)));
      } else if (slot === 'grass.clump') {
        foliage(c, { uTime: this.uTime, wind: { amount: still ? 0 : 0.35, height: 0.45 }, fade: GRASS_FADE, translucency: 0.7 });
      } else {
        foliage(c, { uTime: this.uTime, wind: { amount: still ? 0 : 0.3, height: 0.4 }, fade: FLOWER_FADE, translucency: 0.5 });
      }
      own = this.kit.ownMat(c);
      this.plantMats.set(key, own);
    }
    return own;
  }

  /** A settlement or city: the loaded model if there is one, else the procedural one. */
  private piece(slot: AssetSlot, color: string): THREE.Object3D {
    const asset = this.model(slot)?.[0];
    if (asset) return cloneAsset(asset, SLOTS[slot], (m) => this.tinted(m, color));
    const obj = slot === 'building.city' ? makeCity(this.kit, color) : makeSettlement(this.kit, color);
    obj.scale.setScalar(PIECE_SCALE);
    return obj;
  }

  /** A static prop: the loaded model if there is one (merged by the bake), else the procedural one. */
  private prop(slot: AssetSlot, fallback: () => THREE.Object3D): THREE.Object3D {
    const model = this.model(slot)?.[0];
    return model ? cloneAsset(model, SLOTS[slot]) : fallback();
  }

  /** Keeps a moving or model-drawn object out of the static bake. */
  private place(obj: THREE.Object3D): THREE.Object3D {
    obj.userData.dynamic = true;
    return obj;
  }

  // ---------------------------------------------------------------- building

  /** Ground height at a world point (0 off the land). */
  private groundAt(x: number, z: number): number {
    for (const h of this.landHexes)
      if (inHex(x, z, h.x, h.z, R)) return tileHeight(this.tiles.get(h.id)!, x - h.x, z - h.z);
    return 0;
  }

  private buildSky() {
    this.sky = makeSky(this.sunDir, this.uTime, SKY, true);
    this.scene.add(this.sky);
    this.scene.background = SKY.horizon.clone();
    // Restrained atmospheric depth: the island stays crisp, the far ranges and sea turn hazy.
    this.scene.fog = new THREE.Fog(SKY.horizon.clone(), 150, 820);
    this.buildEnvironment();
  }

  /**
   * Image-based fill light from a small sky: cool blue from above, warm green bounce from
   * below. It gives shaded faces colour and lets metal and water reflect the sky.
   */
  private buildEnvironment() {
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const cols: number[] = [];
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      if (v.y >= 0) c.copy(FILL.horizon).lerp(FILL.zenith, Math.pow(v.y, 0.6));
      else c.copy(FILL.horizon).lerp(FILL.ground, Math.min(1, -v.y * 3));
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    env.add(new THREE.Mesh(geo, mat));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    // Direct3D's shader compiler notes a harmless constant-folding precision issue in three's
    // own PMREM shaders; skip the log check for these two one-off programs only.
    this.renderer.debug.checkShaderErrors = false;
    this.envRT = pmrem.fromScene(env, 0.04);
    this.renderer.debug.checkShaderErrors = true;
    pmrem.dispose();
    geo.dispose();
    mat.dispose();
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.85;
  }

  private buildLights() {
    const sun = new THREE.DirectionalLight('#ffe2b8', 3.3);
    sun.castShadow = !this.opts.lite;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -40;
    sc.right = sc.top = 40;
    sc.near = 1;
    sc.far = 260;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  /** The ground material for a terrain: the loaded detail and normal maps, or the built-in texture. */
  private groundMaterial(t: Terrain, seed: number): THREE.MeshStandardMaterial {
    const kind: GroundKind = DETAIL_KIND[t];
    const tex = this.assets.ground.get(kind);
    if (!tex) {
      const map = detailTexture(kind, seed + t.length * 97);
      map.repeat.set(0.22, 0.22); // UVs are in metres: one repeat every ~4.5 m
      return this.kit.ownMat(new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.96 }));
    }
    // Shared textures: the same repeat for every world.
    tex.map.repeat.set(0.22, 0.22);
    tex.normal.repeat.set(0.22, 0.22);
    const m = new THREE.MeshStandardMaterial({
      map: tex.map,
      normalMap: tex.normal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      vertexColors: true,
      roughness: 0.95,
    });
    groundDetail(m);
    return this.kit.ownMat(m);
  }

  private buildIsland(board: Board) {
    const kit = this.kit;
    const seed = hashString(board.seed);
    const lite = this.opts.lite;
    const still = lite || this.opts.reduceMotion;
    this.buildSea();

    const beachGeo = kit.geo('beach', beachRing);
    const sandTex = this.assets.ground.get('sand');
    const sand = kit.ownMat(
      new THREE.MeshStandardMaterial({
        color: '#ead3a0',
        roughness: 0.95,
        map: sandTex?.map ?? null,
        normalMap: sandTex?.normal ?? null,
      }),
    );
    const groundMats = new Map<Terrain, THREE.MeshStandardMaterial>();
    const groundMat = (t: Terrain) => {
      let m = groundMats.get(t);
      if (!m) groundMats.set(t, (m = this.groundMaterial(t, seed)));
      return m;
    };
    const statics = new THREE.Group();

    // Wheat (near clumps in variants, a far clump), grass and flowers: instanced in cells.
    const fallbackWheat = (d: 'near' | 'far'): PlantVisual => ({
      parts: [
        {
          geometry: kit.own(wheatClumpGeometry(d, lite)),
          material: kit.ownMat(
            foliage(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide }), {
              uTime: this.uTime,
              wind: { amount: still ? 0 : 0.12, height: 1.15 },
              translucency: 1,
            }),
          ),
        },
      ],
    });
    const wheatNear = this.model('wheat.clump');
    const wheatMid = this.model('wheat.clump.mid')?.[0];
    const wheatFar = this.model('wheat.clump.far')?.[0];
    // Full detail only in the cells round the walker, a lighter clump to ~22 m, cards beyond.
    const wheat = new Field(
      'wheat',
      wheatNear ? wheatNear.map((a) => ({ parts: this.partsFor('wheat.clump', a) })) : [fallbackWheat('near')],
      wheatFar ? { parts: this.partsFor('wheat.clump.far', wheatFar) } : fallbackWheat('far'),
      7,
      wheatMid ? 7 : 16,
      Infinity,
      wheatMid ? { visual: { parts: this.partsFor('wheat.clump.mid', wheatMid) }, dist: 22 } : null,
    );
    const grass = this.model('grass.clump');
    this.grass = grass
      ? new Field('grass', grass.map((a) => ({ parts: this.partsFor('grass.clump', a) })), null, 12, GRASS_FADE[1] + 9, GRASS_FADE[1] + 9)
      : null;
    const flowerKinds = FLOWER_SLOTS.filter((s) => this.model(s));
    this.flowers =
      flowerKinds.length === FLOWER_SLOTS.length
        ? new Field(
            'flowers',
            flowerKinds.map((s) => ({ parts: this.partsFor(s, this.model(s)![0]) })),
            null,
            16,
            FLOWER_FADE[1] + 11,
            FLOWER_FADE[1] + 11,
          )
        : null;

    board.hexes.forEach((hex, i) => {
      const p = topo.hexPos[i];
      const cx = p.x * R;
      const cz = p.y * R;
      this.landHexes.push({ id: i, x: cx, z: cz });

      const rnd = mulberry(seed ^ Math.imul(i + 1, 0x9e3779b1));
      // Every tile is entered from an edge midpoint, facing its centre.
      const s = Math.PI / 6 + Math.floor(rnd() * 6) * (Math.PI / 3);
      const sd = dir(s);
      this.spawns.set(i, { x: cx + sd.x * R * 0.74, z: cz + sd.z * R * 0.74, yaw: s });
      const tile: TileGround = {
        terrain: hex.terrain,
        cx,
        cz,
        seed: (seed ^ Math.imul(i + 7, 0x85ebca6b)) >>> 0,
        grain: rnd() * Math.PI,
        flats: [],
        paths: [],
        shade: [],
      };
      this.tiles.set(i, tile);
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      const ctx: HexCtx = { g, cx, cz, rnd, spawnAngle: s, tile };
      const firstCollider = this.colliders.length;

      if (hex.token !== null) {
        g.add(
          mesh(
            kit.geo('signPost', () => new THREE.CylinderGeometry(0.12, 0.14, 2.6, 6)),
            kit.mat('#6e4a2c', WOOD),
            0,
            1.3,
            0,
          ),
        );
        const sign = makeTokenSprite(hex.token);
        sign.position.set(0, 3.1, 0);
        g.add(sign);
        this.addCircle(cx, cz, 0.35);
        tile.flats.push({ x: 0, z: 0, r: 0.8 });
      }

      switch (hex.terrain) {
        case 'moors':
          this.buildPasture(ctx);
          break;
        case 'witchwood':
          this.buildForest(ctx);
          break;
        case 'fields':
          this.buildFields(ctx, wheat);
          break;
        case 'ashen':
          this.buildHills(ctx);
          break;
        case 'peaks':
          this.buildMountains(ctx);
          break;
        case 'waste':
          this.buildDesert(ctx);
          break;
      }
      this.scatterGround(ctx, this.colliders.slice(firstCollider));

      // Seat every prop on the finished ground (big props sit on their own level patch).
      for (const c of g.children) c.position.y += tileHeight(tile, c.position.x, c.position.z);
      const ground = mesh(kit.own(buildGround(tile, lite ? 14 : 22)), groundMat(hex.terrain), cx, 0, cz, false);
      ground.receiveShadow = true;
      this.scene.add(ground);
      const b = mesh(beachGeo, sand, cx, -0.32, cz, false);
      b.receiveShadow = true;
      this.scene.add(b);
      statics.add(g);
    });
    for (const h of board.harbors) this.buildHarbor(h.edge, h.hex, h.kind);

    // Everything static across the island merges into one mesh per material.
    this.scene.add(statics);
    bake(statics, kit);

    const rnd = mulberry(seed ^ 0x51ed);
    // A far-off ring of hazy ranges gives the horizon depth.
    const crags = this.model('rock.crag');
    const horizon = new THREE.Group();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + rnd() * 0.2;
      const d = 520 + rnd() * 180;
      for (let k = 0, n = 2 + Math.floor(rnd() * 3); k < n; k++) {
        const r = 30 + rnd() * 34;
        const h = r * (1.0 + rnd() * 0.9);
        const off = (rnd() - 0.5) * 90;
        const x = Math.sin(a) * (d + (rnd() - 0.5) * 60) + Math.cos(a) * off;
        const z = Math.cos(a) * (d + (rnd() - 0.5) * 60) - Math.sin(a) * off;
        if (crags) {
          this.inst.crag(x, z, r * 1.2, h * 0.62, rnd() * Math.PI * 2, 'rock.crag', rnd, -4, true);
          continue;
        }
        const m = makeCrag(kit, rnd, r, h, 'slate', true);
        m.position.set(x, -3, z);
        horizon.add(m);
      }
    }
    if (horizon.children.length) {
      horizon.traverse((o) => (o.castShadow = o.receiveShadow = false));
      bake(horizon, kit);
      this.scene.add(horizon);
    }

    this.inst.flush(this.scene, (x, z) => this.groundAt(x, z));
    this.fields = [wheat, this.grass, this.flowers].filter((f): f is Field => !!f);
    for (const f of this.fields) f.build(this.scene);
  }

  /**
   * The sea: one plane coloured in the shader by its distance to the island (pale turquoise
   * over the sand, a clear blue-green shelf, deep blue beyond), with a moving wave normal from
   * the shared noise for sun glints and sky reflection, and foam where it meets the beach:
   * a lapping fringe plus swell lines rolling in.
   */
  private buildSea() {
    const land = topo.hexPos.map((p) => new THREE.Vector2(p.x * R, p.y * R));
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1 });
    const calm = this.opts.reduceMotion ? 0 : 1;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.uniforms.uCalm = { value: calm };
      sh.uniforms.uLand = { value: land };
      sh.uniforms.uNoise = { value: noiseTexture() };
      sh.uniforms.uDeep = { value: new THREE.Color('#0d4a78') };
      sh.uniforms.uShelf = { value: new THREE.Color('#1784a6') };
      sh.uniforms.uLagoon = { value: new THREE.Color('#47aeb0') };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uCalm;\nvarying vec2 vSea;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z += (sin(position.x * 0.11 + uTime * 0.9) * 0.08 + cos(position.y * 0.14 + uTime * 0.7) * 0.06) * uCalm;
          vSea = (modelMatrix * vec4(transformed, 1.0)).xz;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uTime;
          uniform sampler2D uNoise;
          uniform vec2 uLand[${land.length}];
          uniform vec3 uDeep;
          uniform vec3 uShelf;
          uniform vec3 uLagoon;
          varying vec2 vSea;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float seaD = 1e5;
          for (int i = 0; i < ${land.length}; i++) {
            vec2 q = abs(vSea - uLand[i]);
            seaD = min(seaD, max(q.x, q.x * 0.5 + q.y * 0.8660254) - ${((R * Math.sqrt(3)) / 2).toFixed(3)});
          }
          float seaN = texture2D(uNoise, vSea * 0.03 + uTime * 0.004).r;
          vec3 seaC = mix(uDeep, uShelf, 1.0 - smoothstep(3.0, 22.0 + seaN * 8.0, seaD));
          seaC = mix(seaC, uLagoon, 1.0 - smoothstep(1.5, 6.5 + seaN * 2.0, seaD));
          // Foam: a lapping fringe on the sand and swell lines rolling in to the shore.
          float fN = texture2D(uNoise, vSea * 0.09 - uTime * 0.012).g;
          float fringe = (1.0 - smoothstep(0.6, 2.0 + fN * 1.4, seaD + sin(uTime * 0.9 + fN * 6.0) * 0.35));
          float swell = sin(seaD * 1.6 - uTime * 1.3 + fN * 3.0) * 0.5 + 0.5;
          float lines = smoothstep(0.86, 0.98, swell) * (1.0 - smoothstep(2.0, 9.0, seaD)) * smoothstep(0.42, 0.62, fN);
          float seaFoam = clamp(fringe * 0.85 + lines * 0.55, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb * seaC, vec3(0.94, 0.97, 0.96), seaFoam);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, seaFoam);',
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec2 q1 = vSea * 0.11 + vec2(uTime * 0.011, uTime * 0.006);
            vec2 q2 = vSea * 0.29 - vec2(uTime * 0.017, -uTime * 0.01);
            float e = 1.0 / 256.0;
            float hx = texture2D(uNoise, q1 + vec2(e, 0.0)).r - texture2D(uNoise, q1 - vec2(e, 0.0)).r
              + 0.6 * (texture2D(uNoise, q2 + vec2(e, 0.0)).g - texture2D(uNoise, q2 - vec2(e, 0.0)).g);
            float hz = texture2D(uNoise, q1 + vec2(0.0, e)).r - texture2D(uNoise, q1 - vec2(0.0, e)).r
              + 0.6 * (texture2D(uNoise, q2 + vec2(0.0, e)).g - texture2D(uNoise, q2 - vec2(0.0, e)).g);
            vec3 wn = normalize(vec3(-hx * 9.0, 1.0, -hz * 9.0));
            wn = normalize(mix(wn, vec3(0.0, 1.0, 0.0), seaFoam * 0.8));
            normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'sea';
    const sea = new THREE.Mesh(this.kit.own(new THREE.PlaneGeometry(1800, 1800, 180, 180)), this.kit.ownMat(mat));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.6;
    sea.receiveShadow = true;
    this.scene.add(sea);
  }

  /** Grass tufts and wild flowers in patches, kept off paths, props and the centre sign. */
  private scatterGround(ctx: HexCtx, blockers: Collider[]) {
    const spec = GRASS[ctx.tile.terrain];
    const n = Math.round(spec.n * (this.opts.lite ? 0.35 : 1));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const x = (ctx.rnd() * 2 - 1) * R;
      const z = (ctx.rnd() * 2 - 1) * R;
      if (!inHex(x, z, 0, 0, R * 0.95) || Math.hypot(x, z) < 0.9) continue;
      if (onPath(ctx.tile, x, z, -0.2) || edgeDistance(x, z) < EDGE_CLEAR) continue;
      const wx = ctx.cx + x;
      const wz = ctx.cz + z;
      if (blockers.some((c) => segDist(wx, wz, c) < c.r + 0.15)) continue;
      // Denser where the meadow noise is high, sparse elsewhere: clumps, not a carpet.
      const lush = fbm(x / 4, z / 4, ctx.tile.seed + 3, 2);
      if (lush < spec.patch * (ctx.rnd() * 2 - 1)) continue;
      const color = spec.colors[Math.floor(ctx.rnd() * spec.colors.length)];
      if (!this.grass) {
        this.inst.grass(wx, wz, color, ctx.rnd);
        continue;
      }
      const s = 0.7 + ctx.rnd() * 0.6 + Math.max(0, lush) * 0.4;
      v.set(wx, tileHeight(ctx.tile, x, z), wz);
      q.setFromEuler(e.set((ctx.rnd() - 0.5) * 0.15, ctx.rnd() * Math.PI * 2, (ctx.rnd() - 0.5) * 0.15, 'YXZ'));
      m.compose(v, q, sc.set(s, s * (0.8 + ctx.rnd() * 0.45), s));
      // Taller seeding tufts where the meadow is lush.
      const variant = lush > 0.15 && ctx.rnd() < 0.55 ? 1 : 0;
      this.grass.add(variant, m.clone(), new THREE.Color(color));
    }
    // Flowers grow in drifts of one kind each.
    const drifts = this.opts.lite ? Math.ceil(spec.drifts / 2) : spec.drifts;
    for (let d = 0; d < drifts; d++) {
      const pick = ctx.rnd();
      const kind = this.flowers ? weighted(FLOWER_WEIGHTS, pick) : Math.floor(pick * FLOWERS.length);
      const ax = (ctx.rnd() * 2 - 1) * R * 0.75;
      const az = (ctx.rnd() * 2 - 1) * R * 0.75;
      const spread = this.flowers && FLOWER_SLOTS[kind] === 'flower.lavender' ? 2.4 : 3.4;
      for (let i = 0; i < 18; i++) {
        const x = ax + (ctx.rnd() - 0.5) * spread;
        const z = az + (ctx.rnd() - 0.5) * spread;
        if (!inHex(x, z, 0, 0, R * 0.9) || Math.hypot(x, z) < 1 || onPath(ctx.tile, x, z)) continue;
        if (edgeDistance(x, z) < EDGE_CLEAR) continue;
        const wx = ctx.cx + x;
        const wz = ctx.cz + z;
        if (blockers.some((c) => segDist(wx, wz, c) < c.r + 0.2)) continue;
        if (!this.flowers) {
          this.inst.flower(wx, wz, FLOWERS[kind], ctx.rnd);
          continue;
        }
        const s = 0.8 + ctx.rnd() * 0.5;
        v.set(wx, tileHeight(ctx.tile, x, z), wz);
        q.setFromEuler(e.set((ctx.rnd() - 0.5) * 0.2, ctx.rnd() * Math.PI * 2, (ctx.rnd() - 0.5) * 0.2, 'YXZ'));
        m.compose(v, q, sc.set(s, s, s));
        this.flowers.add(kind, m.clone(), new THREE.Color(1, 1, 1).multiplyScalar(0.92 + ctx.rnd() * 0.12));
      }
    }
  }

  /** A solid thing the walker bumps into; big ones also get a level patch of ground. */
  private addCircle(x: number, z: number, r: number) {
    this.colliders.push({ ax: x, az: z, bx: x, bz: z, r });
  }

  private flat(ctx: HexCtx, x: number, z: number, r: number, h?: number) {
    ctx.tile.flats.push({ x, z, r, h });
  }

  /** Picks a spot inside the tile that keeps clear of the centre sign, the spawn point, paths and `taken`. */
  private scatter(
    ctx: HexCtx,
    taken: { x: number; z: number; r: number }[],
    r: number,
    maxR = 0.78,
  ): { x: number; z: number } | null {
    const sp = dir(ctx.spawnAngle);
    for (let tries = 0; tries < 40; tries++) {
      const x = (ctx.rnd() * 2 - 1) * R;
      const z = (ctx.rnd() * 2 - 1) * R;
      if (!inHex(x, z, 0, 0, R * maxR)) continue;
      if (Math.hypot(x, z) < 2.6 + r) continue;
      if (Math.hypot(x - sp.x * R * 0.74, z - sp.z * R * 0.74) < 3 + r) continue;
      if (onPath(ctx.tile, x, z, r * 0.6)) continue;
      if (taken.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + r)) continue;
      taken.push({ x, z, r });
      return { x, z };
    }
    return null;
  }

  /** A worn footpath from the tile's way in to its centre sign. */
  private entryPath(ctx: HexCtx, w: number) {
    const sp = dir(ctx.spawnAngle);
    ctx.tile.paths.push({ ax: sp.x * R * 0.98, az: sp.z * R * 0.98, bx: sp.x * 1.2, bz: sp.z * 1.2, w });
  }

  private buildPasture(ctx: HexCtx) {
    const { g, cx, cz, rnd, kit } = { ...ctx, kit: this.kit };
    this.entryPath(ctx, 1.3);
    const a = ctx.spawnAngle + Math.PI; // the byre sits opposite the gate
    const d = dir(a);
    const barn = this.prop('prop.barn', () => makeBarn(kit));
    const bx = d.x * R * 0.34;
    const bz = d.z * R * 0.34;
    barn.position.set(bx, 0, bz);
    barn.rotation.y = a + Math.PI;
    g.add(barn);
    this.flat(ctx, bx, bz, 4.4);
    this.colliders.push({
      ax: cx + bx - d.x * 0.7,
      az: cz + bz - d.z * 0.7,
      bx: cx + bx + d.x * 0.7,
      bz: cz + bz + d.z * 0.7,
      r: 2.8,
    });

    // Hay bales beside the door and a water trough.
    const side = { x: d.z, z: -d.x };
    const avoid: { x: number; z: number; r: number }[] = [
      { x: cx + bx, z: cz + bz, r: 4.0 },
      { x: cx, z: cz, r: 0.9 },
    ];
    for (const k of [-1, 1]) {
      const hx = bx - d.x * 3.9 + side.x * k * 3.3;
      const hz = bz - d.z * 3.9 + side.z * k * 3.3;
      const bale = this.prop('prop.haybale', () => makeHayBale(kit));
      bale.position.x = hx;
      bale.position.z = hz;
      bale.rotation.y = rnd() * Math.PI;
      g.add(bale);
      this.addCircle(cx + hx, cz + hz, 0.8);
      this.flat(ctx, hx, hz, 0.9);
      avoid.push({ x: cx + hx, z: cz + hz, r: 1.1 });
    }
    const tr = makeTrough(kit);
    const tx = side.x * 4.2 - d.x * 1.2;
    const tz = side.z * 4.2 - d.z * 1.2;
    tr.position.set(tx, 0, tz);
    tr.rotation.y = a;
    g.add(tr);
    this.flat(ctx, tx, tz, 1.3);
    this.colliders.push({
      ax: cx + tx - d.z * 0.8,
      az: cz + tz + d.x * 0.8,
      bx: cx + tx + d.z * 0.8,
      bz: cz + tz - d.x * 0.8,
      r: 0.6,
    });
    avoid.push({ x: cx + tx, z: cz + tz, r: 1.4 });

    // A round fence with a gate facing the path in.
    const F = R * 0.62;
    const n = 26;
    const gate = ctx.spawnAngle;
    const posts: { x: number; z: number; open: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const diff = Math.abs(Math.atan2(Math.sin(t - gate), Math.cos(t - gate)));
      const pd = dir(t);
      posts.push({ x: pd.x * F, z: pd.z * F, open: diff < 0.2 });
    }
    posts.forEach((p, i) => {
      const q = posts[(i + 1) % n];
      const post = makeFencePost(kit);
      post.position.set(p.x, 0, p.z);
      g.add(post);
      if (p.open || q.open) return;
      const len = Math.hypot(q.x - p.x, q.z - p.z);
      const rail = makeFenceRail(kit, len, rnd);
      rail.position.set((p.x + q.x) / 2, 0, (p.z + q.z) / 2);
      rail.rotation.y = Math.atan2(-(q.z - p.z), q.x - p.x);
      g.add(rail);
      this.colliders.push({ ax: cx + p.x, az: cz + p.z, bx: cx + q.x, bz: cz + q.z, r: 0.2 });
    });
    for (const p of posts) if (p.open) this.addCircle(cx + p.x, cz + p.z, 0.2);

    // The flock.
    const flock = 7 + Math.floor(rnd() * 3);
    const sheepModel = this.model('sheep')?.[0];
    for (let i = 0; i < flock; i++) {
      const rig = sheepModel ? rigFromAsset(cloneAsset(sheepModel, SLOTS.sheep)) : makeSheep(kit, rnd);
      if (sheepModel) rig.root.scale.setScalar(0.92 + rnd() * 0.16);
      let x = cx;
      let z = cz;
      for (let t = 0; t < 30; t++) {
        const ang = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd()) * (F - 1.4);
        x = cx + Math.sin(ang) * rr;
        z = cz + Math.cos(ang) * rr;
        if (!avoid.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + 0.6)) break;
      }
      const sh: Sheep = {
        rig,
        x,
        z,
        heading: rnd() * Math.PI * 2,
        tx: x,
        tz: z,
        mode: 'graze',
        timer: rnd() * 4,
        speed: 0.9,
        gait: rnd() * 10,
        blink: 1 + rnd() * 4,
        pen: { cx, cz, r: F - 1.2, avoid },
      };
      rig.root.position.set(x, 0, z);
      this.scene.add(rig.root);
      this.sheep.push(sh);
    }

    // A few trees outside the fence.
    const taken: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < 5; i++) {
      const t = ctx.rnd() * Math.PI * 2;
      const diff = Math.abs(Math.atan2(Math.sin(t - gate), Math.cos(t - gate)));
      if (diff < 0.6) continue;
      const pd = dir(t);
      const x = pd.x * (F + 2.2);
      const z = pd.z * (F + 2.2);
      if (!inHex(x, z, 0, 0, R * 0.84) || taken.some((o) => Math.hypot(o.x - x, o.z - z) < 4))
        continue;
      taken.push({ x, z, r: 2 });
      this.inst.tree(cx + x, cz + z, rnd, 'tree.broadleaf', 0.9 + rnd() * 0.5);
      ctx.tile.shade.push({ x, z, r: 2.6 });
      this.addCircle(cx + x, cz + z, 0.6);
    }
  }

  private buildForest(ctx: HexCtx) {
    this.entryPath(ctx, 1.4);
    const taken: { x: number; z: number; r: number }[] = [];
    // A clearing with a woodcutter's log pile and a stump.
    const logs = new THREE.Group();
    const logGeo = this.kit.geo('log', () => new THREE.CylinderGeometry(0.35, 0.35, 3, 8));
    const bark = this.kit.mat('#6e4a2c', WOOD);
    [
      [-0.38, 0.35],
      [0.38, 0.35],
      [0, 0.95],
    ].forEach(([x, y]) => {
      const l = mesh(logGeo, bark, x, y, 0);
      l.rotation.x = Math.PI / 2;
      logs.add(l);
    });
    const lp = this.scatter(ctx, taken, 3.2, 0.55);
    if (lp) {
      logs.position.set(lp.x, 0, lp.z);
      logs.rotation.y = ctx.rnd() * Math.PI;
      ctx.g.add(logs);
      this.addCircle(ctx.cx + lp.x, ctx.cz + lp.z, 1.6);
      this.flat(ctx, lp.x, lp.z, 1.8);
      const sx = lp.x + 2.2;
      const sz = lp.z + 0.6;
      const stump = new THREE.Group();
      stump.position.set(sx, 0, sz);
      stump.add(mesh(this.kit.geo('stump', () => new THREE.CylinderGeometry(0.45, 0.55, 0.6, 10)), bark, 0, 0.3, 0));
      stump.add(
        mesh(
          this.kit.geo('stumpTop', () => new THREE.CylinderGeometry(0.42, 0.42, 0.04, 10)),
          this.kit.mat('#d9b07a', WOOD),
          0,
          0.61,
          0,
          false,
        ),
      );
      const axe = new THREE.Group();
      axe.position.set(0.05, 0.62, 0);
      axe.rotation.z = -0.35;
      axe.add(mesh(this.kit.rbox(0.07, 0.9, 0.07, 0.02), this.kit.mat('#8a5a32', WOOD), 0, 0.45, 0));
      axe.add(mesh(this.kit.rbox(0.36, 0.24, 0.05, 0.02), this.kit.mat('#9aa1ad', { roughness: 0.35, metalness: 0.85 }), -0.12, 0.08, 0));
      stump.add(axe);
      ctx.g.add(stump);
      this.addCircle(ctx.cx + sx, ctx.cz + sz, 0.6);
    }
    for (let i = 0; i < 7; i++) {
      const p = this.scatter(ctx, taken, 0.3, 0.8);
      if (!p) continue;
      const m = new THREE.Group();
      m.position.set(p.x, 0, p.z);
      m.scale.setScalar(0.7 + ctx.rnd() * 0.6);
      m.add(mesh(this.kit.geo('shroomStem', () => new THREE.CylinderGeometry(0.06, 0.08, 0.3, 7)), this.kit.mat('#f3ead6'), 0, 0.15, 0, false));
      m.add(
        mesh(
          this.kit.geo('shroomCap', () => new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
          this.kit.mat(ctx.rnd() < 0.7 ? '#cf3a2a' : '#c48a4a', { smooth: true, roughness: 0.6 }),
          0,
          0.28,
          0,
          false,
        ),
      );
      ctx.g.add(m);
    }
    // Trees in groves: mostly broadleaf, conifers gathering on one side, heights varied.
    const pineSide = ctx.rnd() * Math.PI * 2;
    for (let i = 0; i < 34; i++) {
      const p = this.scatter(ctx, taken, 1.45, 0.86);
      if (!p) continue;
      const toward = Math.cos(Math.atan2(p.x, p.z) - pineSide);
      const slot: AssetSlot = ctx.rnd() < 0.25 + toward * 0.3 ? 'tree.conifer' : 'tree.broadleaf';
      this.inst.tree(ctx.cx + p.x, ctx.cz + p.z, ctx.rnd, slot, 0.75 + ctx.rnd() * 0.75);
      ctx.tile.shade.push({ x: p.x, z: p.z, r: 2.4 });
      this.addCircle(ctx.cx + p.x, ctx.cz + p.z, 0.55);
    }
    // Undergrowth between the trunks, and young trees where light reaches the ground.
    for (let i = 0; i < 26; i++) {
      const p = this.scatter(ctx, taken, 0.5, 0.86);
      if (!p) continue;
      this.inst.bush(ctx.cx + p.x, ctx.cz + p.z, ctx.rnd, 0.5 + ctx.rnd() * 0.5);
    }
    if (this.model('tree.sapling'))
      for (let i = 0; i < 6; i++) {
        const p = this.scatter(ctx, taken, 0.6, 0.7);
        if (!p) continue;
        this.inst.tree(ctx.cx + p.x, ctx.cz + p.z, ctx.rnd, 'tree.sapling', 0.8 + ctx.rnd() * 0.5);
        this.addCircle(ctx.cx + p.x, ctx.cz + p.z, 0.25);
      }
  }

  private buildFields(ctx: HexCtx, wheat: Field) {
    const a = ctx.spawnAngle + Math.PI + 0.9;
    const d = dir(a);
    const millModel = this.model('prop.windmill')?.[0];
    let mill: { root: THREE.Object3D; blades: THREE.Object3D };
    if (millModel) {
      const root = cloneAsset(millModel, SLOTS['prop.windmill']);
      mill = { root, blades: root.getObjectByName('Sails') ?? new THREE.Object3D() };
    } else {
      mill = makeWindmill(this.kit);
    }
    const mx = d.x * R * 0.45;
    const mz = d.z * R * 0.45;
    mill.root.position.set(mx, 0, mz);
    mill.root.rotation.y = a + Math.PI;
    ctx.g.add(this.place(mill.root));
    this.spinners.push(mill.blades);
    this.addCircle(ctx.cx + mx, ctx.cz + mz, SLOTS['prop.windmill'].footprint);
    this.flat(ctx, mx, mz, 2.6);

    // Freshly rolled bales beside the mill.
    for (const k of [-1, 1]) {
      const hb = this.prop('prop.haybale', () => makeHayBale(this.kit));
      hb.position.x = mx + d.x * 2.6 + d.z * 1.5 * k;
      hb.position.z = mz + d.z * 2.6 - d.x * 1.5 * k;
      hb.rotation.y = a;
      ctx.g.add(hb);
      this.addCircle(ctx.cx + hb.position.x, ctx.cz + hb.position.z, 0.8);
      this.flat(ctx, hb.position.x, hb.position.z, 0.9);
    }
    this.plantWheat(ctx, wheat, { x: mx, z: mz });
  }

  /**
   * Plots of wheat split by two boundary paths, rows running a different way in each plot,
   * a footpath from the way in to the centre sign, and clear margins along the tile edges where
   * roads and settlements stand.
   */
  private plantWheat(ctx: HexCtx, wheat: Field, mill: { x: number; z: number }) {
    const { rnd, tile } = ctx;
    this.entryPath(ctx, 1.5);
    const sp = dir(ctx.spawnAngle);
    // Boundaries: one across the path, one along it, both a little off-centre.
    const n1 = { x: sp.x, z: sp.z };
    const o1 = (rnd() - 0.5) * 4;
    const n2 = { x: -sp.z, z: sp.x };
    const o2 = (rnd() < 0.5 ? -1 : 1) * (2.5 + rnd() * 3);
    const across = (x: number, z: number) => x * n1.x + z * n1.z - o1;
    const along = (x: number, z: number) => x * n2.x + z * n2.z - o2;
    for (const [n, o] of [
      [n1, o1],
      [n2, o2],
    ] as const) {
      const ex = -n.z;
      const ez = n.x;
      tile.paths.push({ ax: n.x * o - ex * R, az: n.z * o - ez * R, bx: n.x * o + ex * R, bz: n.z * o + ez * R, w: 0.9 });
    }
    const plot = (x: number, z: number) => (across(x, z) > 0 ? 0 : 2) + (along(x, z) > 0 ? 0 : 1);
    const angles = [0, 1, 2, 3].map(() => rnd() * Math.PI);
    const harvested = rnd() < 0.35 ? Math.floor(rnd() * 4) : -1;
    tile.plot = plot;
    tile.plotTone = [0, 1, 2, 3].map((k) => (k === harvested ? '#c9ab64' : k % 2 ? '#8f6a2c' : '#9c7631'));

    const rowGap = this.opts.lite ? 0.62 : 0.42;
    const step = this.opts.lite ? 0.48 : 0.31;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const tint = new THREE.Color();
    for (let k = 0; k < 4; k++) {
      if (k === harvested) continue;
      const ca = Math.cos(angles[k]);
      const sa = Math.sin(angles[k]);
      for (let u = -R; u <= R; u += rowGap)
        for (let w = -R; w <= R; w += step) {
          const ju = u + (rnd() - 0.5) * 0.12;
          const jw = w + (rnd() - 0.5) * 0.14;
          const x = ju * ca - jw * sa;
          const z = ju * sa + jw * ca;
          if (plot(x, z) !== k || !inHex(x, z, 0, 0, R * 0.86)) continue;
          if (Math.hypot(x, z) < 2.2 || Math.hypot(x - mill.x, z - mill.z) < 4.6) continue;
          if (onPath(tile, x, z, 0.15)) continue;
          if (tile.flats.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 0.4)) continue;
          // Ripeness drifts across the field in patches.
          const patch = fbm(x / 5, z / 5, tile.seed + 41, 2);
          tint.setRGB(1, 0.96 + patch * 0.06, 0.9 + patch * 0.12);
          const sc = 0.92 + rnd() * 0.18 + patch * 0.06;
          v.set(ctx.cx + x, 0, ctx.cz + z);
          v.y = tileHeight(tile, x, z);
          q.setFromEuler(e.set((rnd() - 0.5) * 0.08, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.08, 'YXZ'));
          m.compose(v, q, s.set(sc, sc * (0.95 + rnd() * 0.1), sc));
          wheat.add(variantAt(v.x, v.z, wheat.variants), m.clone(), tint.clone());
        }
    }
    // The harvested plot: stubble, stooks and a cart track.
    if (harvested >= 0) {
      for (let i = 0; i < 40; i++) {
        const x = (rnd() * 2 - 1) * R;
        const z = (rnd() * 2 - 1) * R;
        if (plot(x, z) !== harvested || !inHex(x, z, 0, 0, R * 0.84) || onPath(tile, x, z, 0.4)) continue;
        if (Math.hypot(x, z) < 2.4 || Math.hypot(x - mill.x, z - mill.z) < 4.6) continue;
        this.inst.stook(ctx.cx + x, ctx.cz + z, rnd);
      }
    }
  }

  private buildHills(ctx: HexCtx) {
    this.entryPath(ctx, 1.2);
    const taken: { x: number; z: number; r: number }[] = [];
    const kp = this.scatter(ctx, taken, 2.8, 0.6);
    if (kp) {
      const k = this.prop('prop.kiln', () => makeKiln(this.kit));
      k.position.set(kp.x, 0, kp.z);
      k.rotation.y = Math.atan2(-kp.x, -kp.z);
      ctx.g.add(k);
      this.addCircle(ctx.cx + kp.x, ctx.cz + kp.z, 1.8);
      this.flat(ctx, kp.x, kp.z, 2.4);
    }
    // A worked clay pit with stepped walls.
    const pit = this.scatter(ctx, taken, 3.2, 0.62);
    if (pit) {
      this.flat(ctx, pit.x, pit.z, 2.8, -1.0);
      this.addCircle(ctx.cx + pit.x, ctx.cz + pit.z, 1.6);
      for (let i = 0; i < 2; i++) {
        const s = makeBrickStack(this.kit);
        const a = ctx.rnd() * Math.PI * 2;
        const bx = pit.x + Math.sin(a) * 4.4;
        const bz = pit.z + Math.cos(a) * 4.4;
        if (!inHex(bx, bz, 0, 0, R * 0.8) || Math.hypot(bx, bz) < 2.4) continue;
        s.position.set(bx, 0, bz);
        s.rotation.y = ctx.rnd() * Math.PI;
        ctx.g.add(s);
        this.addCircle(ctx.cx + bx, ctx.cz + bz, 1.0);
        this.flat(ctx, bx, bz, 1.2);
      }
    }
    // Clay banks: low terraced mounds of exposed earth with grass on top.
    for (let i = 0; i < 4; i++) {
      const r = 2 + ctx.rnd() * 1.6;
      const p = this.scatter(ctx, taken, r + 0.6, 0.82);
      if (!p) continue;
      const h = 1.4 + ctx.rnd() * 1.4;
      if (this.model('rock.clay')) {
        this.inst.crag(ctx.cx + p.x, ctx.cz + p.z, r, h, ctx.rnd() * Math.PI * 2, 'rock.clay', ctx.rnd, -0.15);
      } else {
        const m = makeCrag(this.kit, ctx.rnd, r, h, 'clay');
        m.position.set(p.x, -0.15, p.z);
        m.rotation.y = ctx.rnd() * Math.PI;
        ctx.g.add(m);
      }
      this.addCircle(ctx.cx + p.x, ctx.cz + p.z, r * 0.85);
      this.flat(ctx, p.x, p.z, r * 0.8);
    }
    for (let i = 0; i < 7; i++) {
      const p = this.scatter(ctx, taken, 0.7, 0.84);
      if (!p) continue;
      this.inst.rock(ctx.cx + p.x, ctx.cz + p.z, 0.35 + ctx.rnd() * 0.4, ctx.rnd() < 0.5 ? '#9a6a52' : '#8a8580', ctx.rnd);
    }
    for (let i = 0; i < 10; i++) {
      const p = this.scatter(ctx, taken, 0.5, 0.86);
      if (!p) continue;
      this.inst.bush(ctx.cx + p.x, ctx.cz + p.z, ctx.rnd, 0.4 + ctx.rnd() * 0.35);
    }
  }

  private buildMountains(ctx: HexCtx) {
    // Three rock masses across from the way in, each with a lower shoulder, a mine at the
    // foot of the middle one, ore outcrops, scree and a few hardy pines.
    this.entryPath(ctx, 1.2);
    const base = ctx.spawnAngle + Math.PI;
    const taken: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const a = base + (i - 1) * 1.15;
      const d = dir(a);
      const r = (i === 1 ? 4.6 : 3.5) + ctx.rnd() * 0.8;
      const h = (i === 1 ? 15 : 10.5) + ctx.rnd() * 4;
      const dist = R * 0.54;
      const sa = a + (ctx.rnd() < 0.5 ? -0.45 : 0.45);
      const sd = dir(sa);
      if (this.model('rock.crag')) {
        // The formations carry their own shoulders and fallen blocks.
        this.inst.crag(ctx.cx + d.x * dist, ctx.cz + d.z * dist, r, h, a + Math.PI + (ctx.rnd() - 0.5), 'rock.crag', ctx.rnd, -0.2);
      } else {
        const m = makeCrag(this.kit, ctx.rnd, r, h, 'slate');
        m.position.set(d.x * dist, -0.2, d.z * dist);
        m.rotation.y = ctx.rnd() * Math.PI;
        ctx.g.add(m);
        const shoulder = makeCrag(this.kit, ctx.rnd, r * 0.6, h * 0.45, 'slate');
        shoulder.position.set(sd.x * (dist - 0.6), -0.2, sd.z * (dist - 0.6));
        ctx.g.add(shoulder);
      }
      taken.push({ x: d.x * dist, z: d.z * dist, r: r + 1.2 });
      this.addCircle(ctx.cx + d.x * dist, ctx.cz + d.z * dist, r * 0.9);
      this.addCircle(ctx.cx + sd.x * (dist - 0.6), ctx.cz + sd.z * (dist - 0.6), r * 0.5);
      this.flat(ctx, d.x * dist, d.z * dist, r * 0.9);
      if (i === 1) {
        // A mine dug into the foot of the middle peak, its cart rolling out towards the sign.
        const mine = this.prop('prop.mine', () => makeMine(this.kit));
        const md = dist - r * 1.05;
        mine.position.set(d.x * md, 0, d.z * md);
        mine.rotation.y = a + Math.PI;
        ctx.g.add(mine);
        this.flat(ctx, d.x * (md - 1.6), d.z * (md - 1.6), 2.4);
        const cx2 = ctx.cx + d.x * (md - 2.6);
        const cz2 = ctx.cz + d.z * (md - 2.6);
        this.addCircle(cx2, cz2, 0.9);
        for (const k of [-1, 1])
          this.addCircle(ctx.cx + d.x * md + d.z * 1.2 * k, ctx.cz + d.z * md - d.x * 1.2 * k, 0.3);
        taken.push({ x: d.x * (md - 2.6), z: d.z * (md - 2.6), r: 2 });
      }
    }
    // Ore outcrops flank the way in, leaving the view to the peaks clear.
    for (const off of [-1.05, 1.05]) {
      const d = dir(ctx.spawnAngle + off);
      const dist = R * (0.42 + ctx.rnd() * 0.1);
      if (this.model('rock.boulder')) {
        for (let k = 0; k < 3; k++)
          this.inst.rock(ctx.cx + d.x * dist + (ctx.rnd() - 0.5) * 1.4, ctx.cz + d.z * dist + (ctx.rnd() - 0.5) * 1.4,
            k === 0 ? 1.15 : 0.55, '#6c7886', ctx.rnd);
      } else {
        const o = makeOreRock(this.kit, ctx.rnd);
        o.position.set(d.x * dist, 0, d.z * dist);
        ctx.g.add(o);
      }
      this.addCircle(ctx.cx + d.x * dist, ctx.cz + d.z * dist, 1.2);
      this.flat(ctx, d.x * dist, d.z * dist, 1.3);
      taken.push({ x: d.x * dist, z: d.z * dist, r: 1.6 });
    }
    for (let i = 0; i < 9; i++) {
      const r = 0.5 + ctx.rnd() * 0.8;
      const p = this.scatter(ctx, taken, r + 0.4, 0.84);
      if (!p) continue;
      this.inst.rock(ctx.cx + p.x, ctx.cz + p.z, r, ctx.rnd() < 0.5 ? '#7d8994' : '#9aa3aa', ctx.rnd);
      if (r > 0.9) this.addCircle(ctx.cx + p.x, ctx.cz + p.z, r * 0.8);
    }
    for (let i = 0; i < 6; i++) {
      const p = this.scatter(ctx, taken, 1.2, 0.86);
      if (!p) continue;
      this.inst.tree(ctx.cx + p.x, ctx.cz + p.z, ctx.rnd, 'tree.conifer', 0.6 + ctx.rnd() * 0.35);
      this.addCircle(ctx.cx + p.x, ctx.cz + p.z, 0.45);
    }
    if (!this.opts.lite) {
      for (let i = 0; i < 4; i++) {
        const a = base + (ctx.rnd() - 0.5) * 2.4;
        const d = dir(a);
        const dist = R * (0.35 + ctx.rnd() * 0.35);
        const mist = makeMist(this.kit, 0.18);
        mist.position.set(d.x * dist, 1.2 + ctx.rnd() * 0.8, d.z * dist);
        mist.scale.set(8 + ctx.rnd() * 5, 2.2 + ctx.rnd(), 1);
        ctx.g.add(mist);
      }
    }
  }

  private buildDesert(ctx: HexCtx) {
    this.entryPath(ctx, 1.0);
    const taken: { x: number; z: number; r: number }[] = [];
    // A weathered sandstone ruin: a broken column and its fallen lintel.
    const rp = this.scatter(ctx, taken, 2.6, 0.6);
    if (rp) {
      const ruin = new THREE.Group();
      ruin.position.set(rp.x, 0, rp.z);
      ruin.rotation.y = ctx.rnd() * Math.PI;
      const stone = this.kit.mat('#d8c39a', STONE);
      const drum = this.kit.geo('drum', () => new THREE.CylinderGeometry(0.5, 0.55, 0.9, 10));
      ruin.add(mesh(this.kit.rbox(1.6, 0.4, 1.6, 0.06), this.kit.mat('#c9b48a', STONE), 0, 0.2, 0));
      for (let k = 0; k < 3; k++) {
        const dm = mesh(drum, stone, (ctx.rnd() - 0.5) * 0.06, 0.85 + k * 0.9, 0);
        dm.rotation.y = ctx.rnd() * 3;
        ruin.add(dm);
      }
      const lintel = mesh(this.kit.rbox(2.6, 0.5, 0.7, 0.06), stone, 1.7, 0.25, 0.6);
      lintel.rotation.y = 0.5;
      lintel.rotation.z = 0.08;
      ruin.add(lintel);
      ruin.add(mesh(drum, stone, -1.3, 0.3, 0.9).rotateX(Math.PI / 2).rotateZ(0.4));
      ctx.g.add(ruin);
      this.addCircle(ctx.cx + rp.x, ctx.cz + rp.z, 1.0);
      this.flat(ctx, rp.x, rp.z, 2.4);
    }
    for (let i = 0; i < 8; i++) {
      const p = this.scatter(ctx, taken, 0.8, 0.82);
      if (!p) continue;
      const r = 0.35 + ctx.rnd() * 0.55;
      this.inst.rock(ctx.cx + p.x, ctx.cz + p.z, r, ctx.rnd() < 0.5 ? '#d1b583' : '#bfa274', ctx.rnd);
      if (r > 0.6) this.addCircle(ctx.cx + p.x, ctx.cz + p.z, r * 0.8);
    }
    // Hardy scrub in the hollows between the dunes.
    for (let i = 0; i < 7; i++) {
      const p = this.scatter(ctx, taken, 0.6, 0.84);
      if (!p) continue;
      this.inst.bush(ctx.cx + p.x, ctx.cz + p.z, ctx.rnd, 0.25 + ctx.rnd() * 0.2, true);
    }
  }

  private buildHarbor(edge: string, hex: number, kind: HarborKind) {
    const [a, b] = topo.edgeVertices[edge];
    const pa = topo.vertexPos[a];
    const pb = topo.vertexPos[b];
    const mx = ((pa.x + pb.x) / 2) * R;
    const mz = ((pa.y + pb.y) / 2) * R;
    const h = topo.hexPos[hex];
    let nx = mx - h.x * R;
    let nz = mz - h.y * R;
    const l = Math.hypot(nx, nz);
    nx /= l;
    nz /= l;
    const len = 8;
    const dockModel = this.model('harbor.dock')?.[0];
    const dock = dockModel ? cloneAsset(dockModel, SLOTS['harbor.dock']) : makeDock(this.kit, len);
    dock.position.set(mx + nx * 1.5, dockModel ? -0.12 : -0.2, mz + nz * 1.5);
    dock.rotation.y = Math.atan2(nx, nz);
    this.scene.add(this.place(dock));
    const sx = mx + nx * 1.5;
    const sz = mz + nz * 1.5;
    this.walkable.push({
      ax: sx - nx * 2,
      az: sz - nz * 2,
      bx: sx + nx * (len - 0.6),
      bz: sz + nz * (len - 0.6),
      r: 0.9,
    });
    const boatModel = this.model('harbor.boat')?.[0];
    const boat = boatModel
      ? cloneAsset(boatModel, SLOTS['harbor.boat'], (m) => this.tinted(m, SAIL[kind]))
      : makeBoat(this.kit, SAIL[kind]);
    // The model's origin is its waterline; the sea sits at -0.6.
    const by = boatModel ? -0.66 : -0.5;
    boat.position.set(sx + nx * (len - 1) + nz * 2.6, by, sz + nz * (len - 1) - nx * 2.6);
    boat.rotation.y = Math.atan2(nx, nz);
    this.scene.add(this.place(boat));
    this.boats.push({ obj: boat, phase: hex * 1.7, y: by });
    this.colliders.push({
      ax: boat.position.x - nx * 1.6,
      az: boat.position.z - nz * 1.6,
      bx: boat.position.x + nx * 1.8,
      bz: boat.position.z + nz * 1.8,
      r: SLOTS['harbor.boat'].footprint,
    });
  }

  // ---------------------------------------------------------------- per frame

  private frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const animate = !this.opts.reduceMotion;
    if (animate) this.uTime.value += dt;
    const t = this.uTime.value;

    this.movePlayer(dt);
    if (animate) {
      for (const s of this.sheep) this.updateSheep(s, dt);
      for (const sp of this.spinners) sp.rotation.z -= dt * 0.7;
      for (const b of this.boats) {
        b.obj.position.y = b.y + Math.sin(t * 1.4 + b.phase) * 0.1;
        b.obj.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.04;
      }
      if (this.robber?.userData.hover) this.robber.position.y = (this.robber.userData.y ?? 0) + 0.1 + Math.sin(t * 2) * 0.08;
    }
    this.maybeBleat(dt);
    for (const f of this.fields) f.update(this.x, this.z);

    // The sun never moves and most casters are static, so the shadow map is redrawn only when
    // its box moves (in steps of 100 whole texels, ~3.9 m, so edges never crawl), when pieces
    // change, and every third frame for swaying trees, walking sheep and turning sails.
    const step = (80 / 2048) * 100;
    const fx = Math.round(this.x / step) * step;
    const fz = Math.round(this.z / step) * step;
    const moved = fx !== this.shadowAt.x || fz !== this.shadowAt.z;
    if (moved) {
      this.shadowAt = { x: fx, z: fz };
      this.sun.position.set(fx + this.sunDir.x * 120, this.sunDir.y * 120, fz + this.sunDir.z * 120);
      this.sun.target.position.set(fx, 0, fz);
    }
    this.shadowTick++;
    this.renderer.shadowMap.needsUpdate = moved || this.shadowDirty || (animate && this.shadowTick % 3 === 0);
    this.shadowDirty = false;

    this.camY += (this.groundAt(this.x, this.z) + EYE - this.camY) * Math.min(1, dt * 10);
    this.camera.position.set(this.x, this.camY, this.z);
    this.sky.position.copy(this.camera.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.renderer.render(this.scene, this.camera);

    const hex = this.landHexes.find((h) => inHex(this.x, this.z, h.x, h.z, R))?.id ?? null;
    if (hex !== this.hex) {
      this.hex = hex;
      this.opts.onHexChange(hex);
    }
  }

  private movePlayer(dt: number) {
    const k = this.keys;
    const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
    this.yaw += turn * 1.9 * dt;
    let fwd =
      (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) -
      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) -
      this.joy.y;
    let str = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.joy.x;
    const mag = Math.hypot(fwd, str);
    if (mag > 1) {
      fwd /= mag;
      str /= mag;
    }
    const running =
      k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.92;
    const speed = running ? RUN : WALK;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const dx = (-sy * fwd + cy * str) * speed * dt;
    const dz = (-cy * fwd - sy * str) * speed * dt;
    if (Math.abs(dx) + Math.abs(dz) > 1e-5) {
      // Try the full step, then slide along each axis.
      if (!this.tryMove(this.x + dx, this.z + dz) && !this.tryMove(this.x + dx, this.z))
        this.tryMove(this.x, this.z + dz);
    }
  }

  private tryMove(nx: number, nz: number): boolean {
    let x = nx;
    let z = nz;
    for (const c of this.colliders) [x, z] = pushOut(x, z, c, PLAYER_R);
    for (const c of this.pieceColliders) [x, z] = pushOut(x, z, c, PLAYER_R);
    for (const s of this.sheep)
      [x, z] = pushOut(x, z, { ax: s.x, az: s.z, bx: s.x, bz: s.z, r: 0.5 }, PLAYER_R);
    if (!this.isWalkable(x, z)) return false;
    this.x = x;
    this.z = z;
    return true;
  }

  private isWalkable(x: number, z: number): boolean {
    return (
      this.landHexes.some((h) => inHex(x, z, h.x, h.z, R * 1.1)) ||
      this.walkable.some((w) => segDist(x, z, w) < w.r)
    );
  }

  private updateSheep(s: Sheep, dt: number) {
    s.timer -= dt;
    const pdx = s.x - this.x;
    const pdz = s.z - this.z;
    const pd = Math.hypot(pdx, pdz);
    // Startled by the walker: trot a few metres away.
    if (pd < 2.6 && s.mode !== 'walk') {
      const ang = Math.atan2(pdx, pdz) + (Math.random() - 0.5) * 0.8;
      this.setTarget(s, s.x + Math.sin(ang) * 4, s.z + Math.cos(ang) * 4);
      s.speed = 2.4;
    }
    if (s.mode === 'walk') {
      const dx = s.tx - s.x;
      const dz = s.tz - s.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.25 || s.timer < 0) {
        s.mode = Math.random() < 0.7 ? 'graze' : 'look';
        s.timer = 2.5 + Math.random() * 5;
      } else {
        const want = Math.atan2(dx, dz);
        let diff = want - s.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        s.heading += THREE.MathUtils.clamp(diff, -3 * dt, 3 * dt);
        const step = Math.min(d, s.speed * dt) * Math.max(0, Math.cos(diff));
        let nx = s.x + Math.sin(s.heading) * step;
        let nz = s.z + Math.cos(s.heading) * step;
        for (const o of this.sheep) {
          if (o === s) continue;
          [nx, nz] = pushOut(nx, nz, { ax: o.x, az: o.z, bx: o.x, bz: o.z, r: 0.55 }, 0.55);
        }
        if (this.inPen(s, nx, nz, 0.5)) {
          s.x = nx;
          s.z = nz;
        } else {
          s.timer = -1; // bumped into the fence: stop and think again
        }
        s.gait += dt * s.speed * 7;
      }
    } else if (s.timer < 0) {
      // Wander to a fresh patch of grass.
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 1.5 + Math.random() * 4;
        const tx = s.x + Math.sin(ang) * r;
        const tz = s.z + Math.cos(ang) * r;
        if (this.inPen(s, tx, tz, 0.6)) {
          this.setTarget(s, tx, tz);
          s.speed = 0.7 + Math.random() * 0.5;
          break;
        }
      }
    }

    const rig = s.rig;
    const ground = this.groundAt(s.x, s.z);
    rig.root.position.set(s.x, ground, s.z);
    rig.root.rotation.y = s.heading;
    const walking = s.mode === 'walk';
    const swing = walking ? Math.sin(s.gait) * 0.55 : 0;
    rig.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing));
    const now = this.uTime.value + s.gait * 0.1;
    let headDown = 0;
    let headTurn = 0;
    if (s.mode === 'graze') headDown = 0.85 + Math.sin(now * 6) * 0.08; // nibbling
    if (s.mode === 'look') headTurn = Math.sin(now * 0.9) * 0.6;
    rig.head.rotation.x += (headDown - rig.head.rotation.x) * Math.min(1, dt * 5);
    rig.head.rotation.y += (headTurn - rig.head.rotation.y) * Math.min(1, dt * 3);
    rig.root.position.y = ground + (walking ? Math.abs(Math.sin(s.gait)) * 0.04 * s.speed : 0);
    // Blink every few seconds; wag the tail while grazing.
    s.blink -= dt;
    if (s.blink < 0) s.blink = 2 + Math.random() * 4;
    const shut = s.blink < 0.13 ? 0.1 : 1;
    for (const e of rig.eyes) e.scale.y = shut;
    const wag =
      s.mode === 'graze' ? Math.sin(now * 9) * 0.45 : walking ? Math.sin(s.gait) * 0.2 : 0;
    rig.tail.rotation.z += (wag - rig.tail.rotation.z) * Math.min(1, dt * 8);
  }

  private setTarget(s: Sheep, tx: number, tz: number) {
    const p = s.pen;
    const dx = tx - p.cx;
    const dz = tz - p.cz;
    const d = Math.hypot(dx, dz);
    if (d > p.r) {
      tx = p.cx + (dx / d) * p.r;
      tz = p.cz + (dz / d) * p.r;
    }
    s.tx = tx;
    s.tz = tz;
    s.mode = 'walk';
    s.timer = 8;
  }

  private inPen(s: Sheep, x: number, z: number, pad: number): boolean {
    const p = s.pen;
    if (Math.hypot(x - p.cx, z - p.cz) > p.r) return false;
    return !p.avoid.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad);
  }

  private maybeBleat(dt: number) {
    this.nextBleat -= dt;
    if (this.nextBleat > 0) return;
    this.nextBleat = 3.5 + Math.random() * 6;
    if (this.opts.reduceMotion) return;
    if (this.sheep.some((s) => Math.hypot(s.x - this.x, s.z - this.z) < 14)) this.opts.onBleat();
  }
}

interface HexCtx {
  g: THREE.Group;
  cx: number;
  cz: number;
  rnd: () => number;
  spawnAngle: number;
  tile: TileGround;
}

function segDist(x: number, z: number, c: Collider): number {
  const vx = c.bx - c.ax;
  const vz = c.bz - c.az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? THREE.MathUtils.clamp(((x - c.ax) * vx + (z - c.az) * vz) / l2, 0, 1) : 0;
  return Math.hypot(x - (c.ax + vx * t), z - (c.az + vz * t));
}

function pushOut(x: number, z: number, c: Collider, pad: number): [number, number] {
  const vx = c.bx - c.ax;
  const vz = c.bz - c.az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? THREE.MathUtils.clamp(((x - c.ax) * vx + (z - c.az) * vz) / l2, 0, 1) : 0;
  const px = c.ax + vx * t;
  const pz = c.az + vz * t;
  const dx = x - px;
  const dz = z - pz;
  const d = Math.hypot(dx, dz);
  const min = c.r + pad;
  if (d >= min) return [x, z];
  if (d < 1e-6) return [px + min, pz];
  return [px + (dx / d) * min, pz + (dz / d) * min];
}

/** The sand ring around a tile: a hex band from the tile's edge out into the water. */
function beachRing(): THREE.BufferGeometry {
  const pos: number[] = [];
  const corner = (k: number, r: number, y: number) => {
    const a = Math.PI / 2 + (k * Math.PI) / 3;
    return [Math.cos(a) * r, y, -Math.sin(a) * r];
  };
  for (let k = 0; k < 6; k++) {
    const i0 = corner(k, R * 0.98, 0);
    const i1 = corner(k + 1, R * 0.98, 0);
    const o0 = corner(k, R * 1.17, -0.05);
    const o1 = corner(k + 1, R * 1.17, -0.05);
    const b0 = corner(k, R * 1.26, -0.6);
    const b1 = corner(k + 1, R * 1.26, -0.6);
    pos.push(...i0, ...o0, ...i1, ...i1, ...o0, ...o1);
    pos.push(...o0, ...b0, ...o1, ...o1, ...b0, ...b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Builds a sheep rig from a loaded model, finding its moving parts by name. */
function rigFromAsset(root: THREE.Object3D): SheepRig {
  const find = (n: string) => root.getObjectByName(n) ?? new THREE.Group();
  const wrap = new THREE.Group();
  wrap.add(root);
  return {
    root: wrap,
    head: find('Head') as THREE.Group,
    legs: ['LegFL', 'LegFR', 'LegBL', 'LegBR'].map((n) => find(n) as THREE.Group),
    eyes: [],
    tail: find('Tail'),
  };
}

// ------------------------------------------------------------------ instancing

interface Placed {
  x: number;
  z: number;
  y: number;
  sx: number;
  sy: number;
  sz: number;
  rot: number;
  tilt: number;
  color: THREE.Color;
}

/** A placement of a model-drawn slot: which variant, where, and a gentle tint. */
interface Root extends Placed {
  variant: number;
  /** On the horizon: outside the shadow box, so it neither casts nor receives shadows. */
  far?: boolean;
}

/** Authored size of the rock formations (radius, height), so placements can ask for metres. */
const FORMATION: Partial<Record<AssetSlot, [number, number]>> = {
  'rock.crag': [4.8, 12],
  'rock.clay': [2.4, 1.6],
};

/**
 * Collects trees, shrubs, rocks, rock formations, grass, flowers and stooks across all tiles.
 * Slots with a loaded model become one instanced mesh per variant part; the rest are built from
 * procedural parts, one instanced mesh each. Heights are resolved at `flush`, once the ground
 * is final.
 */
class Instancer {
  private lists = new Map<string, Placed[]>();
  private roots = new Map<AssetSlot, Root[]>();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private kit: Kit,
    private uTime: { value: number },
    private lite: boolean,
    private model: (slot: AssetSlot) => LoadedAsset[] | undefined,
    private partsFor: (slot: AssetSlot, asset: LoadedAsset) => PlantVisual['parts'],
  ) {}

  private push(list: string, p: Omit<Placed, 'color'>, color: string | THREE.Color) {
    let l = this.lists.get(list);
    if (!l) this.lists.set(list, (l = []));
    l.push({ ...p, color: new THREE.Color(color) });
  }

  private root(slot: AssetSlot, p: Omit<Placed, 'color'>, rnd: () => number, tint: THREE.Color, far = false) {
    let l = this.roots.get(slot);
    if (!l) this.roots.set(slot, (l = []));
    l.push({ ...p, color: tint, variant: Math.floor(rnd() * this.model(slot)!.length), far });
  }

  /** A slight, natural difference from one plant to the next. */
  private natural(rnd: () => number): THREE.Color {
    const k = 0.9 + rnd() * 0.18;
    return new THREE.Color(k * (0.97 + rnd() * 0.06), k, k * (0.94 + rnd() * 0.08));
  }

  tree(x: number, z: number, rnd: () => number, slot: AssetSlot, s: number) {
    const rot = rnd() * Math.PI * 2;
    if (this.model(slot)) {
      const tall = 0.9 + rnd() * 0.2;
      this.root(slot, { x, z, y: 0, sx: s, sy: s * tall, sz: s, rot, tilt: 0 }, rnd, this.natural(rnd));
      return;
    }
    const pick = (a: string[]) => a[Math.floor(rnd() * a.length)];
    const P = (dx: number, dy: number, dz: number, sx: number, sy: number, sz: number, r = rot) => ({
      x: x + (dx * Math.cos(rot) + dz * Math.sin(rot)) * s,
      z: z + (-dx * Math.sin(rot) + dz * Math.cos(rot)) * s,
      y: dy * s,
      sx: sx * s,
      sy: sy * s,
      sz: sz * s,
      rot: r,
      tilt: 0,
    });
    if (slot === 'tree.conifer') {
      this.push(`${slot}|trunk`, P(0, 0, 0, 0.8, 0.9, 0.8), pick(BARK));
      const col = new THREE.Color(pick(PINE));
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const k = 1.3 - i * 0.25;
        this.push(
          `${slot}|cone`,
          P(0, 1.1 + i * 1.25, 0, k, 1.05, k, rot + i * 0.9),
          col.clone().offsetHSL(0, 0, i * 0.025),
        );
      }
    } else {
      // A broadleaf: a trunk and a crown of lumps, darker and cooler underneath.
      this.push(`${slot}|trunk`, P(0, 0, 0, 1, 1.05, 1), pick(BARK));
      const col = new THREE.Color(pick(LEAF));
      const lumps = 4 + Math.floor(rnd() * 3);
      this.push(`${slot}|leaf`, P(0, 3.2, 0, 1.75, 1.45, 1.75), col.clone().offsetHSL(0, 0, -0.02));
      for (let i = 0; i < lumps; i++) {
        const a = (i / lumps) * Math.PI * 2 + rnd() * 0.6;
        const up = rnd();
        const rr = 1.05 + rnd() * 0.35;
        const sz = 0.95 + rnd() * 0.45;
        this.push(
          `${slot}|leaf`,
          P(Math.cos(a) * rr, 2.6 + up * 1.4, Math.sin(a) * rr, sz, sz * 0.88, sz, rot + i),
          col.clone().offsetHSL(0.005 * (up - 0.5), 0, (up - 0.55) * 0.08),
        );
      }
      this.push(`${slot}|leaf`, P(0.1, 4.25, -0.1, 1.05, 0.9, 1.05), col.clone().offsetHSL(0.01, 0.02, 0.06));
    }
  }

  /** Undergrowth; `dry` turns it to sun-bleached scrub (the desert). */
  bush(x: number, z: number, rnd: () => number, s: number, dry = false) {
    if (this.model('shrub')) {
      // Dry scrub: the green leaves pushed towards olive and straw.
      const tint = dry ? new THREE.Color(1.75, 0.8, 0.36).multiplyScalar(0.8 + rnd() * 0.15) : this.natural(rnd);
      const k = s * 1.15;
      this.root('shrub', { x, z, y: -0.05, sx: k, sy: k * (0.85 + rnd() * 0.3), sz: k, rot: rnd() * Math.PI * 2, tilt: 0 }, rnd, tint);
      return;
    }
    const col = new THREE.Color(dry ? '#a59a52' : LEAF[Math.floor(rnd() * LEAF.length)]).offsetHSL(0, -0.04, -0.03);
    for (let i = 0; i < 3; i++)
      this.push(
        'bush|leaf',
        {
          x: x + (rnd() - 0.5) * s,
          z: z + (rnd() - 0.5) * s,
          y: 0.25 * s,
          sx: s * (0.6 + rnd() * 0.3),
          sy: s * (0.45 + rnd() * 0.2),
          sz: s * (0.6 + rnd() * 0.3),
          rot: rnd() * 6,
          tilt: 0,
        },
        col.clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.06),
      );
  }

  rock(x: number, z: number, r: number, color: string, rnd: () => number) {
    if (this.model('rock.boulder')) {
      // The stone's own colours, nudged towards the local rock (sandstone, clay, slate).
      const c = new THREE.Color(color);
      const tint = new THREE.Color(1, 1, 1).lerp(c.multiplyScalar(1 / Math.max(c.r, c.g, c.b)), 0.7);
      const p = {
        x,
        z,
        y: -0.12 * r,
        sx: r * (0.9 + rnd() * 0.4),
        sy: r * (0.7 + rnd() * 0.4),
        sz: r * (0.9 + rnd() * 0.4),
        rot: rnd() * Math.PI * 2,
        tilt: (rnd() - 0.5) * 0.3,
      };
      this.root('rock.boulder', p, rnd, tint.multiplyScalar(0.95 + rnd() * 0.1));
      return;
    }
    const p = {
      x,
      z,
      y: r * 0.35,
      sx: r * (0.9 + rnd() * 0.4),
      sy: r * (0.6 + rnd() * 0.3),
      sz: r * (0.9 + rnd() * 0.4),
      rot: rnd() * 6,
      tilt: (rnd() - 0.5) * 0.5,
    };
    this.push('rock.boulder|rock', p, new THREE.Color(color).offsetHSL(0, 0, (rnd() - 0.5) * 0.06));
  }

  /** A rock formation (mountain mass or clay bank) of about radius `r` and height `h`; model only. */
  crag(x: number, z: number, r: number, h: number, rot: number, slot: AssetSlot, rnd: () => number, y = 0, far = false) {
    const [r0, h0] = FORMATION[slot]!;
    const k = 0.94 + rnd() * 0.12;
    // Mountains are massifs, not spires: broader and a little lower than the asked-for peak.
    const wide = slot === 'rock.crag' ? 1.18 : 1;
    const low = slot === 'rock.crag' ? 0.82 : 1;
    const sx = (r / r0) * wide;
    this.root(slot, { x, z, y, sx, sy: (h / h0) * low, sz: sx * (0.9 + rnd() * 0.2), rot, tilt: 0 }, rnd, new THREE.Color(k, k, k), far);
  }

  grass(x: number, z: number, color: string, rnd: () => number) {
    const s = 0.6 + rnd() * 0.55;
    this.push('grass', { x, z, y: 0, sx: s, sy: s * (0.75 + rnd() * 0.6), sz: s, rot: rnd() * Math.PI * 2, tilt: 0 }, color);
  }

  flower(x: number, z: number, color: string, rnd: () => number) {
    const s = 0.85 + rnd() * 0.5;
    this.push('flower', { x, z, y: 0.2 + rnd() * 0.1, sx: s, sy: s, sz: s, rot: rnd() * 3, tilt: (rnd() - 0.5) * 0.5 }, color);
  }

  stook(x: number, z: number, rnd: () => number) {
    const s = 0.85 + rnd() * 0.3;
    if (this.model('prop.stook')) {
      this.root('prop.stook', { x, z, y: -0.03, sx: s, sy: s * (0.9 + rnd() * 0.2), sz: s, rot: rnd() * Math.PI * 2, tilt: (rnd() - 0.5) * 0.08 }, rnd, this.natural(rnd));
      return;
    }
    this.push('stook', { x, z, y: 0, sx: s, sy: s, sz: s, rot: rnd() * 6, tilt: (rnd() - 0.5) * 0.12 }, '#e0b85a');
  }

  private matrix(p: Placed, y: number): THREE.Matrix4 {
    if (p.tilt) this.q.setFromEuler(this.e.set(p.tilt, p.rot, p.tilt * 0.5, 'YXZ'));
    else this.q.setFromAxisAngle(this.up, p.rot);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, y + p.y, p.z),
      this.q,
      new THREE.Vector3(p.sx, p.sy, p.sz),
    );
  }

  private add(scene: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, list: Placed[], shadow: boolean,
    groundAt: (x: number, z: number) => number, receive = true, depth?: THREE.Material) {
    const im = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((p, i) => {
      im.setMatrixAt(i, this.matrix(p, groundAt(p.x, p.z)));
      im.setColorAt(i, p.color);
    });
    im.castShadow = shadow && !this.lite;
    im.receiveShadow = receive;
    im.computeBoundingSphere();
    scene.add(im);
    if (depth) {
      // The depth pre-pass twin shares the instance buffers and draws before anything else.
      const pre = new THREE.InstancedMesh(geometry, depth, list.length);
      pre.instanceMatrix = im.instanceMatrix;
      pre.boundingSphere = im.boundingSphere;
      pre.renderOrder = -1;
      scene.add(pre);
    }
  }

  flush(scene: THREE.Scene, groundAt: (x: number, z: number) => number) {
    const kit = this.kit;
    const geos: Record<string, () => THREE.BufferGeometry> = {
      trunk: () => new THREE.CylinderGeometry(0.15, 0.24, 2.6, 7).translate(0, 1.3, 0),
      leaf: () => lumpGeo(1, 0x1eaf),
      cone: () => jitterCone(),
      rock: () => lumpGeo(1, 0x50c4, 0),
      grass: tuftGeo,
      flower: flowerGeo,
      stook: stookGeo,
    };
    const specs: Record<string, { sway: number; shadow: boolean; mat: () => THREE.Material }> = {
      trunk: { sway: 0, shadow: true, mat: () => kit.ownMat(new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true })) },
      leaf: { sway: 0.03, shadow: true, mat: () => kit.ownMat(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true })) },
      cone: { sway: 0.025, shadow: true, mat: () => kit.ownMat(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true })) },
      rock: { sway: 0, shadow: true, mat: () => kit.ownMat(new THREE.MeshStandardMaterial({ roughness: 0.88, flatShading: true })) },
      grass: { sway: 0.22, shadow: false, mat: () => kit.ownMat(new THREE.MeshStandardMaterial({ roughness: 0.92, vertexColors: true, side: THREE.DoubleSide })) },
      flower: { sway: 0, shadow: false, mat: () => kit.ownMat(new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true })) },
      stook: { sway: 0, shadow: true, mat: () => kit.ownMat(new THREE.MeshStandardMaterial({ roughness: 0.92, vertexColors: true, flatShading: true })) },
    };
    for (const [key, list] of this.lists) {
      if (!list.length) continue;
      const part = key.includes('|') ? key.split('|')[1] : key;
      const spec = specs[part];
      const mat = spec.mat();
      if (spec.sway && !this.lite) addSway(mat, this.uTime, spec.sway);
      this.add(scene, kit.geo(`inst-${part}`, geos[part]), mat, list, spec.shadow, groundAt);
    }
    // Model-drawn slots: one instanced mesh per variant part.
    for (const [slot, list] of this.roots) {
      const variants = this.model(slot)!;
      variants.forEach((asset, v) => {
        for (const far of [false, true]) {
          const mine = list.filter((p) => p.variant === v && !!p.far === far);
          if (!mine.length) continue;
          for (const part of this.partsFor(slot, asset))
            this.add(scene, part.geometry, part.material, mine, SLOTS[slot].castShadow && !far, groundAt, !far, part.depth);
        }
      });
    }
  }
}

const BARK = ['#6e4a2c', '#5f3f25', '#7a5434'];
/** Fresh spring greens to deep summer greens; shade comes from the light, not the swatch. */
const LEAF = ['#4f9a3c', '#3f8a38', '#5aa646', '#367c3a', '#6aaf4a'];
const PINE = ['#1f5a3e', '#245f42', '#2c6a48', '#1a4d38'];
/** Daisies and buttercups mostly, then poppies, now and then violet cranesbill. */
const FLOWERS = ['#f7f5ee', '#f7f5ee', '#f2cd3a', '#d93a24', '#8b6ccb'];
const GRASS: Record<Terrain, { n: number; drifts: number; patch: number; colors: string[] }> = {
  moors: { n: 3400, drifts: 7, patch: 0.15, colors: ['#5aa63e', '#6db544', '#4a9435', '#7fbf4c'] },
  witchwood: { n: 1500, drifts: 2, patch: 0.3, colors: ['#3a7a32', '#2f6a2e', '#4a8a3a', '#2a5f30'] },
  fields: { n: 380, drifts: 2, patch: 0.4, colors: ['#8aa63e', '#9aad48', '#7a9a3a'] },
  ashen: { n: 420, drifts: 1, patch: 0.35, colors: ['#7aa04a', '#8aac50', '#6a9442'] },
  peaks: { n: 260, drifts: 1, patch: 0.4, colors: ['#5f8f48', '#6f9a50'] },
  waste: { n: 60, drifts: 0, patch: 0.6, colors: ['#b5a46a', '#c2b077', '#a8986a'] },
};

/** A lumpy, faceted blob (foliage, rocks): an icosahedron with its vertices nudged. */
function lumpGeo(r: number, seed: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + fbm(x * 1.7 + y, z * 1.7 - y, seed, 2) * 0.22;
    pos.setXYZ(i, x * k, y * k * (y < 0 ? 0.75 : 1), z * k);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A conifer tier: a cone whose rim is star-shaped, every other point pulled in and lifted,
 * so the boughs read as needled sprays rather than a smooth lampshade.
 */
function jitterCone(): THREE.BufferGeometry {
  const radial = 14;
  const g = new THREE.ConeGeometry(1.5, 2, radial, 2).translate(0, 1, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 1.9) continue;
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const spoke = Math.round(((a + Math.PI) / (Math.PI * 2)) * radial) % 2;
    const rim = y < 0.5;
    const k = (spoke ? (rim ? 0.72 : 0.86) : 1.04) * (1 + fbm(x * 2, z * 2, 0xc0e, 1) * 0.1);
    pos.setXYZ(i, x * k, y + (rim && spoke ? 0.28 : 0) - (rim && !spoke ? 0.12 : 0), z * k);
  }
  const flat = g.toNonIndexed();
  g.dispose();
  flat.computeVertexNormals();
  return flat;
}

/** A five-petal bloom facing the sky, with a golden centre (vertex-coloured). */
function flowerGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(
      new THREE.SphereGeometry(0.045, 6, 4)
        .scale(1, 0.35, 0.6)
        .translate(0.045, 0, 0)
        .rotateY(a)
        .toNonIndexed(),
    );
  }
  const centre = new THREE.SphereGeometry(0.028, 6, 4)
    .scale(1, 0.6, 1)
    .translate(0, 0.012, 0)
    .toNonIndexed();
  const stem = new THREE.CylinderGeometry(0.006, 0.008, 0.22, 4).translate(0, -0.11, 0).toNonIndexed();
  const g = mergeGeometries([...parts, centre, stem])!;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const centreStart = n - centre.attributes.position.count - stem.attributes.position.count;
  const stemStart = n - stem.attributes.position.count;
  for (let i = 0; i < n; i++)
    col.set(i >= stemStart ? [0.25, 0.45, 0.18] : i >= centreStart ? [1.3, 1.0, 0.2] : [1, 1, 1], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  [...parts, centre, stem].forEach((p) => p.dispose());
  return g;
}

/** Seven thin blades leaning outwards; dark at the root, light at the tip. */
function tuftGeo(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.7;
    const h = 0.26 + ((i * 37) % 10) / 55;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const px = -cz * 0.03;
    const pz = cx * 0.03;
    const bx = cx * 0.04;
    const bz = cz * 0.04;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, cx * 0.14, h, cz * 0.14);
    col.push(0.45, 0.55, 0.4, 0.45, 0.55, 0.4, 1.1, 1.08, 0.92);
    for (let k = 0; k < 3; k++) nrm.push(cx * 0.3, 0.95, cz * 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** A stook of sheaves: a straw cone tied at the waist, ears flaring at the top. */
function stookGeo(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.12, 0.5, 1.0, 9).translate(0, 0.5, 0).toNonIndexed();
  const top = new THREE.CylinderGeometry(0.32, 0.12, 0.35, 9).translate(0, 1.17, 0).toNonIndexed();
  const band = new THREE.CylinderGeometry(0.2, 0.22, 0.07, 9).translate(0, 0.8, 0).toNonIndexed();
  const g = mergeGeometries([body, top, band])!;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const bandStart = n - band.attributes.position.count;
  const topStart = bandStart - top.attributes.position.count;
  for (let i = 0; i < n; i++)
    col.set(i >= bandStart ? [0.55, 0.42, 0.22] : i >= topStart ? [1.15, 1.08, 0.85] : [1, 1, 1], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  [body, top, band].forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
}
