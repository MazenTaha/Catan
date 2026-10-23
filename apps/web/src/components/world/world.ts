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
  ASSET_FILES,
  SLOTS,
  assetUrl,
  cloneAsset,
  isShared,
  loadAsset,
  type AssetSlot,
  type LoadedAsset,
} from './assets';
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
  makeCloud,
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
  makeSunSprite,
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
  fbm,
  onPath,
  tileHeight,
  type TileGround,
} from './terrain';
import { WheatCrop, wheatClumpGeometry, wheatMaterial } from './wheat';

export { R };
/** Eye height above the ground, metres. */
const EYE = 1.7;
const PLAYER_R = 0.35;
const WALK = 5;
const RUN = 10;
/** Procedural houses are modelled small; this brings doors to ~2 m next to a 1.7 m eye. */
const PIECE_SCALE = 1.4;

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

/** Late-afternoon sky: clear blue overhead, pale and hazy at the horizon, warm toward the sun. */
const SKY = {
  zenith: new THREE.Color('#3a7fcb'),
  upper: new THREE.Color('#7db3e2'),
  horizon: new THREE.Color('#d6e6ee'),
  glow: new THREE.Color('#ffe6bd'),
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
  private clouds: THREE.Object3D[] = [];
  private pieces = new THREE.Group();
  private robber: THREE.Group | null = null;
  private foam: THREE.MeshBasicMaterial | null = null;
  private wheat: WheatCrop | null = null;
  private inst: Instancer;
  /** Swappable single objects (docks, boats, windmills), by slot. */
  private objects: { slot: AssetSlot; obj: THREE.Object3D }[] = [];
  /** Loaded models for slots, once they arrive. */
  private loaded = new Map<AssetSlot, LoadedAsset>();
  private ownerMats = new Map<string, THREE.Material>();
  private lastState: GameState | null = null;
  private sunGlow = makeSunSprite();
  /** Late-afternoon sun in the west-north-west, about 30 degrees up. */
  private sunDir = new THREE.Vector3(-0.64, 0.5, -0.58).normalize();
  private robberHex = -1;

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

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 1500);
    this.camera.rotation.order = 'YXZ';
    this.inst = new Instancer(this.kit, this.uTime, opts.lite);

    this.buildSky();
    this.buildLights();
    this.buildIsland(board);
    this.scene.add(this.pieces);
    for (const [slot, file] of Object.entries(ASSET_FILES) as [AssetSlot, string][])
      void this.applyAsset(slot, file);

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
    this.lastState = state;
    for (const c of [...this.pieces.children]) this.pieces.remove(c);
    this.pieceColliders = [];
    const center = (v: string) => ({ x: topo.vertexPos[v].x * R, z: topo.vertexPos[v].y * R });

    for (const [e, owner] of Object.entries(state.causeways)) {
      const [a, b] = topo.edgeVertices[e];
      const pa = center(a);
      const pb = center(b);
      const road = makeRoad(this.kit, R, COLOR_HEX[state.players[owner].color]);
      road.position.set((pa.x + pb.x) / 2, -0.04, (pa.z + pb.z) / 2);
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
      this.robber = makeRobber(this.kit);
      this.robber.scale.setScalar(1.1);
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

  /**
   * Loads a model for a slot and swaps it in for the procedural one, keeping every placement.
   * Resolves false (and keeps the procedural model) if it can't be loaded.
   */
  async applyAsset(slot: AssetSlot, file: string): Promise<boolean> {
    const asset = await loadAsset(assetUrl(file));
    if (!asset || this.disposed) return false;
    this.loaded.set(slot, asset);
    const spec = SLOTS[slot];
    switch (slot) {
      case 'wheat.clump':
      case 'wheat.clump.far':
        this.wheat?.setVisual(slot === 'wheat.clump' ? 'near' : 'far', { parts: this.bakedParts(asset) });
        break;
      case 'tree.broadleaf':
      case 'tree.conifer':
      case 'rock.boulder':
        this.inst.replace(slot, this.bakedParts(asset), spec.castShadow, this.scene);
        break;
      case 'building.settlement':
      case 'building.city':
        if (this.lastState) this.setPieces(this.lastState);
        break;
      case 'sheep':
        for (const s of this.sheep) {
          const old = s.rig.root;
          s.rig = rigFromAsset(cloneAsset(asset, spec));
          s.rig.root.scale.copy(old.scale);
          old.removeFromParent();
          this.scene.add(s.rig.root);
        }
        break;
      default:
        for (const o of this.objects) {
          if (o.slot !== slot) continue;
          const next = cloneAsset(asset, spec);
          next.position.copy(o.obj.position);
          next.rotation.copy(o.obj.rotation);
          o.obj.parent?.add(next);
          o.obj.removeFromParent();
          for (const b of this.boats) if (b.obj === o.obj) b.obj = next;
          if (slot === 'prop.windmill') {
            // The procedural sails go with the old mill; a model may name its own "Sails".
            this.spinners = this.spinners.filter((sp) => sp.parent !== o.obj);
            const sails = next.getObjectByName('Sails');
            if (sails) this.spinners.push(sails);
          }
          o.obj = next;
        }
    }
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    // Programs still linking in the background are released once they finish (deleting them
    // mid-link makes the driver log errors).
    if (!this.compiling) this.release();
  }

  private release(): void {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !isShared(m.geometry)) geos.add(m.geometry);
      if (m.material)
        (Array.isArray(m.material) ? m.material : [m.material]).forEach(
          (x) => !isShared(x) && mats.add(x),
        );
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map && !isShared(map)) map.dispose();
      m.dispose();
    });
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

  /** A loaded model's parts with their transforms baked in, owned by this world. */
  private bakedParts(asset: LoadedAsset): { geometry: THREE.BufferGeometry; material: THREE.Material }[] {
    return asset.parts.map((p) => ({
      geometry: this.kit.own(p.geometry.clone().applyMatrix4(p.matrix)),
      material: p.material,
    }));
  }

  /** A settlement or city: the loaded model if there is one, else the procedural one. */
  private piece(slot: AssetSlot, color: string): THREE.Object3D {
    const asset = this.loaded.get(slot);
    if (asset)
      return cloneAsset(asset, SLOTS[slot], (m) => {
        const key = `${m.uuid}|${color}`;
        let own = this.ownerMats.get(key);
        if (!own) {
          const c = m.clone() as THREE.MeshStandardMaterial;
          c.color?.set(color);
          own = this.kit.ownMat(c);
          this.ownerMats.set(key, own);
        }
        return own;
      });
    const obj = slot === 'building.city' ? makeCity(this.kit, color) : makeSettlement(this.kit, color);
    obj.scale.setScalar(PIECE_SCALE);
    return obj;
  }

  /** Records a swappable object and keeps it out of the static bake. */
  private place(slot: AssetSlot, obj: THREE.Object3D): THREE.Object3D {
    obj.userData.dynamic = true;
    this.objects.push({ slot, obj });
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
    const geo = new THREE.SphereGeometry(1000, 48, 24);
    const cols: number[] = [];
    const pos = geo.attributes.position;
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    const sunFlat = new THREE.Vector3(this.sunDir.x, 0, this.sunDir.z).normalize();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const t = THREE.MathUtils.clamp(v.y, 0, 1);
      if (t < 0.18) c.copy(SKY.horizon).lerp(SKY.upper, t / 0.18);
      else c.copy(SKY.upper).lerp(SKY.zenith, Math.pow((t - 0.18) / 0.82, 0.8));
      // Warmer and brighter low on the sun's side of the sky.
      const toward = Math.max(0, v.x * sunFlat.x + v.z * sunFlat.z);
      c.lerp(SKY.glow, Math.pow(toward, 4) * Math.pow(1 - t, 2.5) * 0.75);
      if (v.y < 0) c.copy(SKY.horizon);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const sky = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    sky.renderOrder = -2;
    this.scene.add(sky);
    this.scene.background = SKY.horizon.clone();
    // Light atmospheric haze: the island stays clear, the far ranges turn blue-grey.
    this.scene.fog = new THREE.Fog(SKY.horizon.clone(), 170, 980);
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
    const sun = new THREE.DirectionalLight('#ffd9a6', 3.2);
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
    this.sunGlow.scale.setScalar(200);
    this.sunGlow.renderOrder = -1;
    this.scene.add(this.sunGlow);
  }

  private buildIsland(board: Board) {
    const kit = this.kit;
    const seed = hashString(board.seed);
    this.buildSea();

    const beachGeo = kit.geo('beach', beachRing);
    const sand = kit.mat('#e3cc94', { roughness: 0.95 });
    const groundMats = new Map<Terrain, THREE.MeshStandardMaterial>();
    const groundMat = (t: Terrain) => {
      let m = groundMats.get(t);
      if (!m) {
        const map = detailTexture(DETAIL_KIND[t], seed + t.length * 97);
        map.repeat.set(0.22, 0.22); // UVs are in metres: one repeat every ~4.5 m
        m = kit.ownMat(
          new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.96 }),
        );
        groundMats.set(t, m);
      }
      return m;
    };
    const statics = new THREE.Group();
    const wheat = new WheatCrop(
      { parts: [{ geometry: kit.own(wheatClumpGeometry('near', this.opts.lite)), material: kit.ownMat(wheatMaterial(this.uTime, this.opts.lite ? 0 : 0.13)) }] },
      { parts: [{ geometry: kit.own(wheatClumpGeometry('far', this.opts.lite)), material: kit.ownMat(wheatMaterial(this.uTime, this.opts.lite ? 0 : 0.13)) }] },
    );
    this.wheat = wheat;

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
      const ground = mesh(kit.own(buildGround(tile, this.opts.lite ? 14 : 22)), groundMat(hex.terrain), cx, 0, cz, false);
      ground.receiveShadow = true;
      this.scene.add(ground);
      const b = mesh(beachGeo, sand, cx, -0.32, cz, false);
      b.receiveShadow = true;
      this.scene.add(b);
      statics.add(g);
    });
    this.buildFoam(board);
    for (const h of board.harbors) this.buildHarbor(h.edge, h.hex, h.kind);

    // Everything static across the island merges into one mesh per material.
    this.scene.add(statics);
    bake(statics, kit);
    this.inst.flush(this.scene, (x, z) => this.groundAt(x, z));
    wheat.build(this.scene);

    const rnd = mulberry(seed ^ 0x51ed);
    // A far-off ring of hazy ranges and drifting clouds give the horizon depth.
    const horizon = new THREE.Group();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + rnd() * 0.2;
      const d = 520 + rnd() * 180;
      for (let k = 0, n = 2 + Math.floor(rnd() * 3); k < n; k++) {
        const r = 30 + rnd() * 34;
        const m = makeCrag(kit, rnd, r, r * (1.0 + rnd() * 0.9), 'slate', true);
        const off = (rnd() - 0.5) * 90;
        m.position.set(
          Math.sin(a) * (d + (rnd() - 0.5) * 60) + Math.cos(a) * off,
          -3,
          Math.cos(a) * (d + (rnd() - 0.5) * 60) - Math.sin(a) * off,
        );
        horizon.add(m);
      }
    }
    horizon.traverse((o) => (o.castShadow = o.receiveShadow = false));
    bake(horizon, kit);
    this.scene.add(horizon);
    for (let i = 0; i < (this.opts.lite ? 8 : 14); i++) {
      const c = makeCloud(kit, rnd);
      const a = rnd() * Math.PI * 2;
      const d = 60 + rnd() * 300;
      c.position.set(Math.sin(a) * d, 70 + rnd() * 50, Math.cos(a) * d);
      c.scale.multiplyScalar(1.3 + rnd() * 1.2);
      c.traverse((o) => (o.castShadow = false));
      this.scene.add(c);
      this.clouds.push(c);
    }
  }

  /**
   * The sea: one plane whose colour comes from its distance to the island in the shader:
   * pale turquoise over the sand right by the beach, clear blue-green over the shelf, deep blue
   * beyond. Restrained low waves; the sky reflects in it at grazing angles.
   */
  private buildSea() {
    const land = topo.hexPos.map((p) => new THREE.Vector2(p.x * R, p.y * R));
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.14, flatShading: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.uniforms.uLand = { value: land };
      sh.uniforms.uDeep = { value: new THREE.Color('#0d4568') };
      sh.uniforms.uShelf = { value: new THREE.Color('#17809c') };
      sh.uniforms.uLagoon = { value: new THREE.Color('#58c7bf') };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec2 vSea;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z += sin(position.x * 0.11 + uTime * 0.9) * 0.1 + cos(position.y * 0.14 + uTime * 0.7) * 0.08;
          vSea = (modelMatrix * vec4(transformed, 1.0)).xz;`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
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
          vec3 seaC = mix(uDeep, uShelf, 1.0 - smoothstep(2.0, 18.0, seaD));
          seaC = mix(seaC, uLagoon, 1.0 - smoothstep(1.0, 5.5, seaD));
          diffuseColor.rgb *= seaC;`,
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
    for (let i = 0; i < n; i++) {
      const x = (ctx.rnd() * 2 - 1) * R;
      const z = (ctx.rnd() * 2 - 1) * R;
      if (!inHex(x, z, 0, 0, R * 0.95) || Math.hypot(x, z) < 0.9) continue;
      if (onPath(ctx.tile, x, z, -0.2)) continue;
      const wx = ctx.cx + x;
      const wz = ctx.cz + z;
      if (blockers.some((c) => segDist(wx, wz, c) < c.r + 0.15)) continue;
      // Denser where the meadow noise is high, sparse elsewhere: clumps, not a carpet.
      if (fbm(x / 4, z / 4, ctx.tile.seed + 3, 2) < spec.patch * (ctx.rnd() * 2 - 1)) continue;
      this.inst.grass(wx, wz, spec.colors[Math.floor(ctx.rnd() * spec.colors.length)], ctx.rnd);
    }
    // Flowers grow in drifts of one kind each.
    const drifts = this.opts.lite ? Math.ceil(spec.drifts / 2) : spec.drifts;
    for (let d = 0; d < drifts; d++) {
      const kind = FLOWERS[Math.floor(ctx.rnd() * FLOWERS.length)];
      const ax = (ctx.rnd() * 2 - 1) * R * 0.75;
      const az = (ctx.rnd() * 2 - 1) * R * 0.75;
      for (let i = 0; i < 18; i++) {
        const x = ax + (ctx.rnd() - 0.5) * 3.4;
        const z = az + (ctx.rnd() - 0.5) * 3.4;
        if (!inHex(x, z, 0, 0, R * 0.9) || Math.hypot(x, z) < 1 || onPath(ctx.tile, x, z)) continue;
        const wx = ctx.cx + x;
        const wz = ctx.cz + z;
        if (blockers.some((c) => segDist(wx, wz, c) < c.r + 0.2)) continue;
        this.inst.flower(wx, wz, kind, ctx.rnd);
      }
    }
  }

  /** A band of surf along every coastal edge, pulsing gently. */
  private buildFoam(board: Board) {
    const pos: number[] = [];
    for (const e of topo.coastalEdges) {
      const hex = topo.edgeHexes[e][0];
      if (hex === undefined || !board.hexes[hex]) continue;
      const c = topo.hexPos[hex];
      const [a, b] = topo.edgeVertices[e].map((v) => topo.vertexPos[v]);
      const at = (p: { x: number; y: number }, k: number) => [
        (c.x + (p.x - c.x) * k) * R,
        -0.52,
        (c.y + (p.y - c.y) * k) * R,
      ];
      const [a1, b1, a2, b2] = [at(a, 1.15), at(b, 1.15), at(a, 1.24), at(b, 1.24)];
      pos.push(...a1, ...a2, ...b1, ...b1, ...a2, ...b2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.foam = new THREE.MeshBasicMaterial({
      color: '#f2fbfa',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.scene.add(new THREE.Mesh(this.kit.own(geo), this.foam));
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
    const barn = makeBarn(kit);
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
      const bale = makeHayBale(kit);
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
    for (let i = 0; i < flock; i++) {
      const rig = makeSheep(kit, rnd);
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
    // Undergrowth between the trunks.
    for (let i = 0; i < 26; i++) {
      const p = this.scatter(ctx, taken, 0.5, 0.86);
      if (!p) continue;
      this.inst.bush(ctx.cx + p.x, ctx.cz + p.z, ctx.rnd, 0.5 + ctx.rnd() * 0.5);
    }
  }

  private buildFields(ctx: HexCtx, wheat: WheatCrop) {
    const a = ctx.spawnAngle + Math.PI + 0.9;
    const d = dir(a);
    const mill = makeWindmill(this.kit);
    const mx = d.x * R * 0.45;
    const mz = d.z * R * 0.45;
    mill.root.position.set(mx, 0, mz);
    mill.root.rotation.y = a + Math.PI;
    ctx.g.add(this.place('prop.windmill', mill.root));
    this.spinners.push(mill.blades);
    this.addCircle(ctx.cx + mx, ctx.cz + mz, SLOTS['prop.windmill'].footprint);
    this.flat(ctx, mx, mz, 2.6);

    // Freshly rolled bales beside the mill.
    for (const k of [-1, 1]) {
      const hb = makeHayBale(this.kit);
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
  private plantWheat(ctx: HexCtx, wheat: WheatCrop, mill: { x: number; z: number }) {
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

    const rowGap = this.opts.lite ? 0.62 : 0.46;
    const step = this.opts.lite ? 0.48 : 0.36;
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
          wheat.add(m.clone(), tint.clone());
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
      const k = makeKiln(this.kit);
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
      const m = makeCrag(this.kit, ctx.rnd, r, 1.4 + ctx.rnd() * 1.4, 'clay');
      m.position.set(p.x, -0.15, p.z);
      m.rotation.y = ctx.rnd() * Math.PI;
      ctx.g.add(m);
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
      const m = makeCrag(this.kit, ctx.rnd, r, h, 'slate');
      m.position.set(d.x * dist, -0.2, d.z * dist);
      m.rotation.y = ctx.rnd() * Math.PI;
      ctx.g.add(m);
      const sa = a + (ctx.rnd() < 0.5 ? -0.45 : 0.45);
      const sd = dir(sa);
      const shoulder = makeCrag(this.kit, ctx.rnd, r * 0.6, h * 0.45, 'slate');
      shoulder.position.set(sd.x * (dist - 0.6), -0.2, sd.z * (dist - 0.6));
      ctx.g.add(shoulder);
      taken.push({ x: d.x * dist, z: d.z * dist, r: r + 1.2 });
      this.addCircle(ctx.cx + d.x * dist, ctx.cz + d.z * dist, r * 0.9);
      this.addCircle(ctx.cx + sd.x * (dist - 0.6), ctx.cz + sd.z * (dist - 0.6), r * 0.5);
      this.flat(ctx, d.x * dist, d.z * dist, r * 0.9);
      if (i === 1) {
        // A mine dug into the foot of the middle peak, its cart rolling out towards the sign.
        const mine = makeMine(this.kit);
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
      const o = makeOreRock(this.kit, ctx.rnd);
      o.position.set(d.x * dist, 0, d.z * dist);
      ctx.g.add(o);
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
    const dock = makeDock(this.kit, len);
    dock.position.set(mx + nx * 1.5, -0.2, mz + nz * 1.5);
    dock.rotation.y = Math.atan2(nx, nz);
    this.scene.add(this.place('harbor.dock', dock));
    const sx = mx + nx * 1.5;
    const sz = mz + nz * 1.5;
    this.walkable.push({
      ax: sx - nx * 2,
      az: sz - nz * 2,
      bx: sx + nx * (len - 0.6),
      bz: sz + nz * (len - 0.6),
      r: 0.9,
    });
    const boat = makeBoat(this.kit, SAIL[kind]);
    boat.position.set(sx + nx * (len - 1) + nz * 2.6, -0.5, sz + nz * (len - 1) - nx * 2.6);
    boat.rotation.y = Math.atan2(nx, nz);
    this.scene.add(this.place('harbor.boat', boat));
    this.boats.push({ obj: boat, phase: hex * 1.7, y: -0.5 });
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
      for (const c of this.clouds) {
        c.position.x += dt * 1.6;
        if (c.position.x > 360) c.position.x = -360;
      }
      if (this.robber) this.robber.position.y = (this.robber.userData.y ?? 0) + 0.1 + Math.sin(t * 2) * 0.08;
      if (this.foam) this.foam.opacity = 0.3 + Math.sin(t * 1.3) * 0.08;
    }
    this.maybeBleat(dt);
    this.wheat?.update(this.x, this.z);

    // Keep the sun's shadow box centred on the walker, snapped to whole shadow texels so
    // shadow edges don't crawl as you move.
    const texel = 80 / 2048;
    const fx = Math.round(this.x / texel) * texel;
    const fz = Math.round(this.z / texel) * texel;
    this.sun.position.set(fx + this.sunDir.x * 120, this.sunDir.y * 120, fz + this.sunDir.z * 120);
    this.sun.target.position.set(fx, 0, fz);

    this.camY += (this.groundAt(this.x, this.z) + EYE - this.camY) * Math.min(1, dt * 10);
    this.camera.position.set(this.x, this.camY, this.z);
    this.sunGlow.position.copy(this.camera.position).addScaledVector(this.sunDir, 900);
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

/**
 * Collects trees, rocks, grass, flowers and stooks across all tiles; each part becomes one
 * instanced mesh. Heights are resolved at `flush`, once the ground is final. Slots (trees,
 * rocks) also keep one root transform per placement so a loaded model can replace them.
 */
class Instancer {
  private lists = new Map<string, Placed[]>();
  private roots = new Map<AssetSlot, Placed[]>();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private rootMatrices = new Map<AssetSlot, THREE.Matrix4[]>();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private kit: Kit,
    private uTime: { value: number },
    private lite: boolean,
  ) {}

  private push(list: string, p: Omit<Placed, 'color'>, color: string | THREE.Color) {
    let l = this.lists.get(list);
    if (!l) this.lists.set(list, (l = []));
    l.push({ ...p, color: new THREE.Color(color) });
  }

  private root(slot: AssetSlot, p: Omit<Placed, 'color'>) {
    let l = this.roots.get(slot);
    if (!l) this.roots.set(slot, (l = []));
    l.push({ ...p, color: new THREE.Color('#ffffff') });
  }

  tree(x: number, z: number, rnd: () => number, slot: AssetSlot, s: number) {
    const rot = rnd() * Math.PI * 2;
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
    this.root(slot, P(0, 0, 0, 1, 1, 1));
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

  bush(x: number, z: number, rnd: () => number, s: number) {
    const col = new THREE.Color(LEAF[Math.floor(rnd() * LEAF.length)]).offsetHSL(0, -0.04, -0.03);
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
    this.root('rock.boulder', p);
    this.push('rock.boulder|rock', p, new THREE.Color(color).offsetHSL(0, 0, (rnd() - 0.5) * 0.06));
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
      const im = new THREE.InstancedMesh(kit.geo(`inst-${part}`, geos[part]), mat, list.length);
      list.forEach((p, i) => {
        im.setMatrixAt(i, this.matrix(p, groundAt(p.x, p.z)));
        im.setColorAt(i, p.color);
      });
      im.castShadow = spec.shadow && !this.lite;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
      this.meshes.set(key, im);
    }
    for (const [slot, list] of this.roots)
      this.rootMatrices.set(slot, list.map((p) => this.matrix(p, groundAt(p.x, p.z))));
  }

  /** Swaps a slot's procedural parts for a loaded model's parts, placed at the same roots. */
  replace(
    slot: AssetSlot,
    parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[],
    shadow: boolean,
    scene: THREE.Scene,
  ) {
    const roots = this.rootMatrices.get(slot);
    if (!roots?.length) return;
    for (const [key, im] of this.meshes) if (key.startsWith(`${slot}|`)) im.visible = false;
    parts.forEach((p, n) => {
      const key = `${slot}|asset${n}`;
      this.meshes.get(key)?.removeFromParent();
      const im = new THREE.InstancedMesh(p.geometry, p.material, roots.length);
      roots.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadow && !this.lite;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
      this.meshes.set(key, im);
    });
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
