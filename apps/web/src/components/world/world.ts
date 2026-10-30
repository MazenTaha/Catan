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
import { Clearings, Field, variantAt, type Circle, type PlantVisual } from './field';
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
  makeBridge,
  bridgeDeck,
  BRIDGE_WIDTH,
  makeRobber,
  makeSettlement,
  makeSheep,
  makeLogPile,
  makeTokenSign,
  woodMats,
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
import { AdaptiveScale } from './adaptive';
import { buildingShape, toLocal, toWorld, type BuildingKind, type BuildingShape, type DoorSpec } from './buildings';
import { NO_STRESS, type Stress } from './stress';
import { wheatClumpGeometry } from './wheat';
import { Combat, type Weapon, type WeaponState, type CombatSound } from './combat';
import { RemoteFighter } from './remote';
import { Horse } from './horse';
import { Chest, type ChestSound } from './chest';
import { DecorBuilder } from './decor';
import { lightAt } from './daylight';
import { DEFAULT_LOOK, type CharacterLook, type KingdomDecor, type Pose } from '@hexfall/net';

/** Riding speeds (m/s): a walk and, with Shift, a gallop. */
const HORSE_WALK = 7;
const HORSE_RUN = 17;
/** Where the weapon chest stands in each room (plan frame: front wall towards +z). */
const CHEST_SPOT = { cottage: { x: -1.62, z: 0.5 }, hall: { x: -3.05, z: 0.4 } } as const;

/** Another player for the 3D walk: who they are and where the server last saw them. */
export interface RemoteInfo {
  seat: number;
  name: string;
  color: string;
  look: CharacterLook;
  pose: Pose | null;
}

/** What the minimap draws each refresh, besides the board itself. */
export interface MapState {
  x: number;
  z: number;
  yaw: number;
  horses: { x: number; z: number }[];
  others: { seat: number; x: number; z: number }[];
}

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
  /** Waist-high (fences, railings): the camera passes over it. */
  low?: boolean;
  /** Query stamp, so a collider listed in several grid cells is tested once. */
  q?: number;
}

/** Colliders bucketed in 4 m cells, so the walker only tests what is near it. */
class ColliderGrid {
  private cells = new Map<number, Collider[]>();
  private stamp = 0;
  private static S = 4;

  constructor(list: Collider[]) {
    const S = ColliderGrid.S;
    for (const c of list) {
      const x0 = Math.floor((Math.min(c.ax, c.bx) - c.r) / S);
      const x1 = Math.floor((Math.max(c.ax, c.bx) + c.r) / S);
      const z0 = Math.floor((Math.min(c.az, c.bz) - c.r) / S);
      const z1 = Math.floor((Math.max(c.az, c.bz) + c.r) / S);
      for (let i = x0; i <= x1; i++)
        for (let j = z0; j <= z1; j++) {
          const k = (i + 4096) * 8192 + (j + 4096);
          let l = this.cells.get(k);
          if (!l) this.cells.set(k, (l = []));
          l.push(c);
        }
    }
  }

  /** Colliders whose cells touch a circle of `pad` round (x, z), each once. */
  near(x: number, z: number, pad: number, out: Collider[]): void {
    const S = ColliderGrid.S;
    const q = ++this.stamp;
    for (let i = Math.floor((x - pad) / S); i <= Math.floor((x + pad) / S); i++)
      for (let j = Math.floor((z - pad) / S); j <= Math.floor((z + pad) / S); j++) {
        const l = this.cells.get((i + 4096) * 8192 + (j + 4096));
        if (!l) continue;
        for (const c of l) {
          if (c.q === q) continue;
          c.q = q;
          out.push(c);
        }
      }
  }
}

/** A door in the world: its plan, the leaf's node, how open it is (0-1) and where it's going. */
interface HouseDoor {
  spec: DoorSpec;
  node: THREE.Object3D | null;
  base: number;
  t: number;
  target: number;
}

/** An enterable building placed in the world (a settlement, city or windmill with a model). */
interface House {
  key: string;
  kind: BuildingKind;
  shape: BuildingShape;
  x: number;
  z: number;
  y: number;
  rot: number;
  interior: THREE.Object3D | null;
  doors: HouseDoor[];
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

/**
 * A pasture's model sheep. Each sheep keeps its own rig (legs, head and tail turn on it) but
 * the rigs aren't in the scene: their parts are drawn as one instanced mesh per part for the
 * whole flock, about 7 draws per pasture instead of 7 per sheep, in both the camera and the
 * shadow pass. The pen bounds the flock, so each pasture still culls as a whole.
 */
interface Flock {
  rigs: SheepRig[];
  parts: { mesh: THREE.InstancedMesh; src: THREE.Mesh[] }[];
}

interface Spawn {
  x: number;
  z: number;
  yaw: number;
}

export interface WorldOptions {
  thirdPerson?: boolean;
  playerColor?: string;
  /** The player's character (Character screen). */
  look?: CharacterLook;
  /** A blow landed on another player (online live combat; the server checks it). */
  onStrike?(seat: number, weapon: Weapon): void;
  /** The revolver fired: spends one of the game's bullets. */
  onFire?(): void;
  /** A weapon chest's lid snapped open; `full` when it held the weapons. */
  onChestOpened?(full: boolean): void;
  onChestSound?(sound: ChestSound): void;
  /** Mounted or dismounted a horse. */
  onRide?(riding: boolean): void;
  /** Hours since midnight to light the island for (default 13). */
  hour?: number;
  onCombatSound?(event: CombatSound): void;
  onCombatHealth?(health: number, hit: boolean): void;
  onWeaponChange?(state: WeaponState): void;

  lite: boolean;
  reduceMotion: boolean;
  onHexChange(hex: number | null): void;
  onBleat(): void;
  /** The door hint to show (null: none); called only when it changes. */
  onHint?(hint: string | null): void;
  /** A short notice, e.g. after being moved out of a building that changed. */
  onNotice?(text: string): void;
  /** Share of the display's resolution the scene is drawn at (the setting; default 1). */
  renderScale?: number;
  /** Graphics "Auto": lower the resolution further while frames keep running late. */
  adaptive?: boolean;
  /** Development and benchmark builds only: scaled-up decorative detail (see stress.ts). */
  stress?: Stress;
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
  private combat: Combat | null = null;
  private cameraNear: Collider[] = [];
  private cameraFocus = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3();
  private cameraDistance = 4;
  private clearForCombat = (x: number, z: number) =>
    this.isWalkable(x, z) && !this.blockedAt(x, z, 0.4);
  /** Other players walking the island (online). */
  private remotes = new Map<number, RemoteFighter>();
  /** Saddled horses: one per pasture and one waiting at the settlement the walker starts at. */
  private horses: { horse: Horse; x: number; z: number; yaw: number }[] = [];
  /** Index of the horse being ridden, or -1. */
  private mount = -1;
  private chests = new Map<string, { chest: Chest; x: number; z: number; rot: number }>();
  private chestInfo: { real: string | null; decoy: string | null; opened: boolean } = { real: null, decoy: null, opened: false };
  private chestGroup = new THREE.Group();
  private decorBuilder = new DecorBuilder();
  /** Furnishings by owner seat (My kingdom); the owner's buildings show them inside. */
  private decor = new Map<number, KingdomDecor>();
  /** Bridges (the roads): centre, direction along, half length, for standing on the deck. */
  private bridges: { x: number; z: number; ux: number; uz: number; half: number }[] = [];
  private stars: THREE.Points | null = null;
  private skyColours = {
    zenith: SKY.zenith.clone(),
    upper: SKY.upper.clone(),
    horizon: SKY.horizon.clone(),
    glow: SKY.glow.clone(),
    sun: SKY.sun.clone(),
    cloudLit: SKY.cloudLit.clone(),
    cloudShade: SKY.cloudShade.clone(),
  };
  hour = 13;
  /** Live fights with the other players (online games with two or more people). */
  pvp = false;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private kit = new Kit();
  private sun!: THREE.DirectionalLight;
  private envRT: THREE.WebGLRenderTarget | null = null;
  /** The environment's prefilter, waiting for its shaders to link (see buildEnvironment). */
  private envPending: {
    env: THREE.Scene;
    sky: THREE.Mesh;
    pmrem: THREE.PMREMGenerator;
    standIn: THREE.WebGLRenderTarget;
    shaders: THREE.Group;
    flat: THREE.OrthographicCamera;
  } | null = null;
  private uTime = { value: 0 };
  private last = performance.now();
  private disposed = false;
  /** Shaders are still linking in the background. */
  private compiling = false;

  private colliders: Collider[] = [];
  private pieceColliders: Collider[] = [];
  private grid: ColliderGrid | null = null;
  private pieceGrid = new ColliderGrid([]);
  private near: Collider[] = [];
  /** Enterable buildings: the windmills (fixed) and the settlements and cities (from the game). */
  private mills: House[] = [];
  private homes: House[] = [];
  /** Which doors were left open, by building and door, so a rebuild of the pieces keeps them. */
  private doorOpen = new Map<string, number>();
  private hint: string | null = null;
  /** Scattered plants and props, and the circles kept clear round the game's buildings. */
  private clear = new Clearings();
  private clearings: Circle[] = [];
  /** Every building's spot and kind, in the game's order (inspection and the benchmark). */
  spots: { x: number; z: number; kind: string; vertex: string }[] = [];
  /** Docks: walkable strips beyond the beach. */
  private walkable: Collider[] = [];
  private landHexes: { id: number; x: number; z: number }[] = [];
  private tiles = new Map<number, TileGround>();
  private spawns = new Map<number, Spawn>();
  private sheep: Sheep[] = [];
  /** Model sheep, drawn per pasture as one instanced mesh per body part. */
  private flocks: Flock[] = [];
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
  /** Walking speed this frame (m/s). */
  private speed = 0;
  private pitch = -0.08;
  private camY = EYE;
  private hex: number | null = -2;
  private nextBleat = 3;
  private stress: Stress;
  private renderScale: number;
  private adaptive: AdaptiveScale | null = null;
  /** Grass and flower fade distances (scaled by the stress preset). */
  private grassFade: [number, number];
  private flowerFade: [number, number];

  readonly keys = new Set<string>();
  readonly joy = { x: 0, y: 0 };

  constructor(
    canvas: HTMLCanvasElement,
    board: Board,
    private opts: WorldOptions,
    private assets: WorldAssets = { models: new Map(), ground: new Map() },
  ) {
    this.stress = opts.stress ?? NO_STRESS;
    const far = this.stress.distance;
    this.grassFade = [GRASS_FADE[0] * far, GRASS_FADE[1] * far];
    this.flowerFade = [FLOWER_FADE[0] * far, FLOWER_FADE[1] * far];
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !opts.lite,
      powerPreference: 'high-performance',
    });
    this.renderScale = opts.renderScale ?? 1;
    if (opts.adaptive) this.adaptive = new AdaptiveScale();
    this.renderer.setPixelRatio(this.pixelRatio());
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
    this.addRobber();
    this.freezeStatic();

    if (opts.thirdPerson) {
      this.combat = new Combat(
        opts.reduceMotion,
        (hit) => opts.onCombatSound?.(hit),
        (health, hit) => opts.onCombatHealth?.(health, hit),
        (state) => opts.onWeaponChange?.(state),
        (seat, weapon) => opts.onStrike?.(seat, weapon),
        () => opts.onFire?.(),
        opts.look ?? DEFAULT_LOOK,
      );
      this.combat.setColor(opts.playerColor ?? '#3f7fd4');
      this.scene.add(this.combat.root);
      this.addHorses(board);
    }
    this.scene.add(this.chestGroup);
    this.buildStars();
    this.setHour(opts.hour ?? 13);

    this.startWhenCompiled();
  }

  // ---------------------------------------------------------------- public API

  resize(w: number, h: number): void {
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Changes the render resolution without rebuilding anything. */
  setRenderScale(k: number): void {
    this.renderScale = k;
    this.renderer.setPixelRatio(this.pixelRatio());
  }

  /** Auto's adaptive resolution can still go lower (until then, Auto doesn't fall back to Lite). */
  get adapting(): boolean {
    return !!this.adaptive?.canDrop;
  }

  /** Turns Auto's adaptive resolution on or off (off returns to the full setting). */
  setAdaptive(on: boolean): void {
    if (on === !!this.adaptive) return;
    this.adaptive = on ? new AdaptiveScale() : null;
    this.renderer.setPixelRatio(this.pixelRatio());
  }

  /**
   * Device pixels per CSS pixel: the display's, capped (1 in Lite, 1.5 in Full), times the
   * setting and, in Auto, the adaptive step.
   */
  private pixelRatio(): number {
    const cap = Math.min(window.devicePixelRatio || 1, this.opts.lite ? 1 : 1.5);
    return cap * this.renderScale * (this.adaptive?.scale ?? 1) * this.stress.scale;
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * 0.004;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -1.2, 1.1);
  }

  attack(): boolean {
    return this.combat?.attack(this.yaw) ?? false;
  }

  selectWeapon(weapon: Weapon): boolean { return this.combat?.selectWeapon(weapon) ?? false; }

  setPlayerColor(color: string): void {
    this.combat?.setColor(color);
    if (this.mount >= 0) this.horses[this.mount].horse.setColor(color);
  }

  setLook(look: CharacterLook): void {
    this.combat?.setLook(look);
  }

  /** From the game: has the weapon chest been opened, and how many bullets are left. */
  setArms(armed: boolean, ammo: number): void {
    this.combat?.setArms(armed, ammo);
  }

  /** Right mouse button: hold a guard (a sword parries from the front). */
  setBlock(on: boolean): void {
    this.combat?.setBlock(on);
  }

  /** Our own guard turned a blow aside. */
  parried(): void {
    this.combat?.parried();
  }

  /** We were struck: a red flash and a jolt of the camera. */
  hurt(): void {
    this.combat?.me.hurt();
  }

  hurtRemote(seat: number): void {
    this.remotes.get(seat)?.hurt();
  }

  get riding(): boolean {
    return this.mount >= 0;
  }

  /** Where we are, for the server to relay to the other players. */
  pose(): Pose {
    const c = this.combat;
    return {
      x: this.x,
      y: this.groundAt(this.x, this.z),
      z: this.z,
      yaw: this.yaw,
      speed: this.speed,
      weapon: c?.weapon ?? 'fist',
      attacks: c?.attackCount ?? 0,
      block: !!c?.blocking,
      riding: this.mount >= 0,
    };
  }

  /** The other players in the walk (online), each with their last relayed position. */
  setRemotes(list: RemoteInfo[]): void {
    const seen = new Set<number>();
    for (const r of list) {
      seen.add(r.seat);
      let f = this.remotes.get(r.seat);
      if (!f) {
        f = new RemoteFighter(r.seat, r.name, r.color, r.look, this.opts.reduceMotion, (x, z) => {
          if (Math.hypot(x - this.x, z - this.z) < 45) this.opts.onCombatSound?.('shot');
        });
        this.remotes.set(r.seat, f);
        this.scene.add(f.root);
      }
      f.setPose(r.pose);
    }
    for (const [seat, f] of this.remotes)
      if (!seen.has(seat)) {
        f.dispose();
        this.remotes.delete(seat);
      }
  }

  /** For the minimap: us, the horses and the other players. */
  mapState(): MapState {
    return {
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      horses: this.horses.filter((_, i) => i !== this.mount).map((h) => ({ x: h.x, z: h.z })),
      others: [...this.remotes.values()].filter((f) => f.present).map((f) => ({ seat: f.seat, ...f.position })),
    };
  }

  /** Furnishings for each owner's buildings (My kingdom). Takes effect on the next setPieces. */
  setDecor(byOwner: Map<number, KingdomDecor>): void {
    this.decor = byOwner;
  }

  /**
   * The walker's own weapon chest (in `real`) and the empty one in their other starting
   * settlement (`decoy`); `opened` once the game says the weapons were taken.
   */
  setChests(real: string | null, decoy: string | null, opened: boolean): void {
    const same = real === this.chestInfo.real && decoy === this.chestInfo.decoy;
    this.chestInfo = { real, decoy, opened };
    if (!same) {
      for (const c of this.chests.values()) c.chest.dispose();
      this.chests.clear();
    }
    this.placeChests();
  }

  private placeChests() {
    const { real, decoy, opened } = this.chestInfo;
    for (const [v, full] of [
      [real, true],
      [decoy, false],
    ] as const) {
      if (!v) continue;
      let c = this.chests.get(v);
      if (!c) {
        const chest = new Chest(full, this.opts.reduceMotion, (sn) => this.opts.onChestSound?.(sn));
        if (full && opened) chest.showOpen();
        c = { chest, x: 0, z: 0, rot: 0 };
        this.chests.set(v, c);
        this.chestGroup.add(chest.root);
      } else if (full && opened && !c.chest.opened) c.chest.showOpen();
      const h = this.homes.find((x) => x.key === v);
      const spot = this.spots.find((x) => x.vertex === v);
      if (h) {
        const at = CHEST_SPOT[h.kind === 'hall' ? 'hall' : 'cottage'];
        const [x, z] = toWorld(at.x, at.z, h.x, h.z, h.rot);
        c.x = x;
        c.z = z;
        c.rot = h.rot;
        c.chest.root.position.set(x, h.y + h.shape.floor, z);
      } else if (spot) {
        const out = Math.atan2(-spot.x, -spot.z);
        c.x = spot.x + Math.sin(out) * 2.6;
        c.z = spot.z + Math.cos(out) * 2.6;
        c.rot = out;
        c.chest.root.position.set(c.x, this.groundAt(c.x, c.z), c.z);
      } else {
        c.chest.root.visible = false;
        continue;
      }
      c.chest.root.visible = true;
      c.chest.root.rotation.y = c.rot;
    }
  }

  /** Lights the island for an hour of the day: sun or moon, sky, fog, fill and stars. */
  setHour(hour: number): void {
    this.hour = hour;
    const l = lightAt(hour);
    this.sunDir.copy(l.dir);
    this.sun.color.copy(l.sunColor);
    this.sun.intensity = l.intensity;
    const c = this.skyColours;
    c.zenith.copy(l.zenith);
    c.upper.copy(l.upper);
    c.horizon.copy(l.horizon);
    c.glow.copy(l.glow);
    c.sun.copy(l.day > 0.3 ? l.sunColor : new THREE.Color('#e9eefc'));
    c.cloudLit.copy(l.cloudLit);
    c.cloudShade.copy(l.cloudShade);
    (this.scene.background as THREE.Color).copy(l.horizon);
    this.scene.fog?.color.copy(l.horizon);
    this.scene.environmentIntensity = l.env;
    this.renderer.toneMappingExposure = l.exposure;
    if (this.stars) (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - l.day * 1.6);
    if (this.stars) this.stars.visible = l.day < 0.6;
    // Move the shadow camera to the new light at once.
    this.shadowAt = { x: NaN, z: NaN };
    this.shadowDirty = true;
  }

  private buildStars() {
    const rnd = mulberry(77);
    const pos: number[] = [];
    for (let i = 0; i < 900; i++) {
      const y = 0.08 + rnd() * 0.92;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * r * 900, y * 900, Math.sin(a) * r * 900);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: '#eef2ff', size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 1;
    this.scene.add(this.stars);
  }

  /** A saddled horse grazing in each pasture, plus one kept for the walker's start. */
  private addHorses(board: Board) {
    let n = 0;
    board.hexes.forEach((hex, i) => {
      if (hex.terrain !== 'moors') return;
      const s = this.spawns.get(i);
      if (!s) return;
      const side = s.yaw + Math.PI / 2;
      const x = s.x + Math.sin(side) * 2.4 - Math.sin(s.yaw) * 2;
      const z = s.z + Math.cos(side) * 2.4 - Math.cos(s.yaw) * 2;
      this.addHorse(x, z, s.yaw + 1.2, n++);
    });
    this.addHorse(0, -400, 0, n);
  }

  private addHorse(x: number, z: number, yaw: number, coat: number) {
    const horse = new Horse(this.opts.playerColor ?? '#b0364a', this.opts.reduceMotion, coat);
    horse.grazing = true;
    horse.root.position.set(x, this.groundAt(x, z), z);
    horse.root.rotation.y = yaw;
    this.scene.add(horse.root);
    this.horses.push({ horse, x, z, yaw });
  }

  /** The nearest free horse within reach, if any. */
  private horseInReach(): number {
    let best = -1;
    let bestD = 2.6;
    this.horses.forEach((h, i) => {
      const d = Math.hypot(h.x - this.x, h.z - this.z);
      if (i !== this.mount && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  }

  /** The chest in front of us, within reach. */
  private chestInReach(): Chest | null {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    for (const c of this.chests.values()) {
      const d = Math.hypot(c.x - this.x, c.z - this.z);
      if (!c.chest.root.visible || d > 1.7) continue;
      if (d > 0.6 && ((c.x - this.x) * fx + (c.z - this.z) * fz) / d < 0.3) continue;
      return c.chest;
    }
    return null;
  }

  private mountHorse(i: number) {
    const h = this.horses[i];
    this.mount = i;
    this.x = h.x;
    this.z = h.z;
    this.yaw = h.yaw;
    h.horse.grazing = false;
    h.horse.setColor(this.opts.playerColor ?? '#b0364a');
    if (this.combat) this.combat.riding = true;
    this.combat?.setBlock(false);
    this.opts.onRide?.(true);
  }

  private dismount() {
    const h = this.horses[this.mount];
    h.x = this.x;
    h.z = this.z;
    h.yaw = this.yaw;
    h.horse.grazing = true;
    this.mount = -1;
    if (this.combat) this.combat.riding = false;
    // Step off to the left, or the right, wherever there's room.
    for (const side of [1, -1, 0]) {
      const a = this.yaw + (side * Math.PI) / 2;
      const nx = h.x - Math.sin(a) * (side ? 1.3 : 0);
      const nz = h.z - Math.cos(a) * (side ? 1.3 : 0);
      if (side === 0 || (this.isWalkable(nx, nz) && !this.blockedAt(nx, nz, 0.4))) {
        this.x = nx;
        this.z = nz;
        break;
      }
    }
    this.opts.onRide?.(false);
  }

  /** Place one reusable practice dummy in clear reachable ground, never inside a building. */
  practice(): boolean {
    if (!this.combat) return false;
    for (const distance of [2, 2.5, 3, 3.5]) {
      const x = this.x - Math.sin(this.yaw) * distance;
      const z = this.z - Math.cos(this.yaw) * distance;
      if (!this.clearForCombat(x, z) || this.houseAt(x, z)) continue;
      let clear = true;
      for (let t = 0.2; t < 1; t += 0.2)
        if (!this.clearForCombat(this.x + (x - this.x) * t, this.z + (z - this.z) * t))
          clear = false;
      if (!clear) continue;
      this.combat.practice(x, this.groundAt(x, z), z);
      return true;
    }
    this.opts.onNotice?.('Find open ground in front of you to place the training dummy.');
    return false;
  }

  private nearbySolids(x: number, z: number, radius: number): Collider[] {
    const list = this.cameraNear;
    list.length = 0;
    this.grid?.near(x, z, radius, list);
    this.pieceGrid.near(x, z, radius, list);
    this.doorColliders(list);
    return list;
  }

  private blockedAt(x: number, z: number, radius: number): boolean {
    return this.touchesSolid(this.nearbySolids(x, z, radius), x, z, radius);
  }

  /** `overLow`: the point is high enough to pass over fences and railings. */
  private touchesSolid(list: Collider[], x: number, z: number, radius: number, overLow = false): boolean {
    for (const c of list) {
      if (overLow && c.low) continue;
      if (c.ax === c.bx && c.az === c.bz && this.cleared(c.ax, c.az)) continue;
      if (segDist(x, z, c) < c.r + radius) return true;
    }
    return false;
  }

  private thirdPersonCamera(dt: number): void {
    const pitch = THREE.MathUtils.clamp(this.pitch - 0.2, -0.85, 0.35);
    const ground = this.groundAt(this.x, this.z);
    // Over the right shoulder, like a third-person shooter: the character stands left of centre.
    const riding = this.mount >= 0;
    const shoulder = riding ? 0.75 : 0.62;
    const rx = Math.cos(this.yaw) * shoulder;
    const rz = -Math.sin(this.yaw) * shoulder;
    let fx = this.x + rx;
    let fz = this.z + rz;
    if (this.touchesSolid(this.nearbySolids(fx, fz, 0.6), fx, fz, 0.2)) {
      fx = this.x;
      fz = this.z;
    }
    this.cameraFocus.set(fx, ground + (riding ? 2.45 : 1.55), fz);
    this.cameraOffset.set(
      Math.sin(this.yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(this.yaw) * Math.cos(pitch),
    );
    const far = riding ? 4.6 : 3.4;
    let distance = far;
    const obstacles = this.nearbySolids(fx, fz, far + 0.3);
    // A small swept proxy, rather than raycasting thousands of foliage triangles.
    for (let d = 0.2; d <= far; d += 0.15) {
      const x = fx + this.cameraOffset.x * d,
        z = fz + this.cameraOffset.z * d;
      const y = this.cameraFocus.y + this.cameraOffset.y * d;
      const house = this.houseAt(x, z);
      const below = this.groundAt(x, z);
      if (
        this.touchesSolid(obstacles, x, z, 0.18, y - below > 1.3) ||
        y < below + 0.2 ||
        (house && y > house.y + house.shape.ceiling - 0.2)
      ) {
        distance = Math.max(0.15, d - 0.2);
        break;
      }
    }
    // Retract immediately; ease back out. Never interpolate through an obstruction.
    this.cameraDistance = Math.min(distance, this.cameraDistance + dt * 5);
    this.camera.position
      .copy(this.cameraFocus)
      .addScaledVector(this.cameraOffset, this.cameraDistance);
    this.camera.lookAt(this.cameraFocus);
    if (this.combat) {
      this.combat.player.visible = this.cameraDistance > 0.8;
      let shake = this.combat.shake;
      for (const c of this.chests.values()) shake = Math.max(shake, c.chest.shake * 0.03);
      this.camera.rotation.z += Math.sin(this.last * 0.09) * shake;
    }
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
    const inside = this.houseAt(this.x, this.z);
    if (inside) this.stepOutside(inside);
    this.camY = this.groundAt(this.x, this.z) + EYE;
  }

  /**
   * Spawns the walker at a building on corner `v`: outside its door when it is enterable,
   * otherwise a few metres out towards the tile it faces.
   */
  spawnAt(v: string): boolean {
    if (this.mount >= 0) this.dismount();
    if (this.goToBuilding(v)) {
      this.tetherHorse();
      return true;
    }
    const spot = this.spots.find((s) => s.vertex === v);
    if (!spot) return false;
    const toward = Math.atan2(-spot.x, -spot.z);
    this.x = spot.x + Math.sin(toward) * 3.2;
    this.z = spot.z + Math.cos(toward) * 3.2;
    this.tryMove(this.x, this.z);
    this.yaw = Math.atan2(-(spot.x - this.x), -(spot.z - this.z));
    this.pitch = -0.08;
    this.camY = this.groundAt(this.x, this.z) + EYE;
    this.tetherHorse();
    return true;
  }

  /** Brings the spare horse to stand beside the walker, saddled and waiting. */
  private tetherHorse() {
    const h = this.horses[this.horses.length - 1];
    if (!h) return;
    for (const side of [1, -1]) {
      const a = this.yaw + (side * Math.PI) / 2;
      const x = this.x - Math.sin(a) * 3.2 + Math.sin(this.yaw) * 1.5;
      const z = this.z - Math.cos(a) * 3.2 + Math.cos(this.yaw) * 1.5;
      if (this.isWalkable(x, z) && !this.blockedAt(x, z, 1.0) && !this.houseAt(x, z)) {
        h.x = x;
        h.z = z;
        h.yaw = this.yaw + Math.PI / 2;
        return;
      }
    }
  }

  /** Teleports to just outside a building's door, facing it (development scenario, tests). */
  goToBuilding(vertex: string): boolean {
    const h = this.homes.find((x) => x.key === vertex);
    if (!h) return false;
    this.stepOutside(h);
    this.pitch = -0.05;
    return true;
  }

  /** Rebuilds settlements, cities, roads and the robber from the game state. */
  setPieces(state: GameState): void {
    if (this.stress.pieces) state = fullBoard(state);
    this.shadowDirty = true;
    for (const c of [...this.pieces.children]) this.pieces.remove(c);
    this.pieceColliders = [];
    this.bridges = [];
    const before = new Map(this.homes.map((h) => [h.key, h.kind]));
    this.homes = [];
    this.spots = [];
    const center = (v: string) => ({ x: topo.vertexPos[v].x * R, z: topo.vertexPos[v].y * R });

    for (const [e, owner] of Object.entries(state.causeways)) {
      const [a, b] = topo.edgeVertices[e];
      const pa = center(a);
      const pb = center(b);
      const color = COLOR_HEX[state.players[owner].color];
      // Every road is a bridge over a brook (DECISIONS #40): unmistakable from anywhere.
      const road = makeBridge(this.kit, R, color);
      // A road stops at the walls of an enterable building at either end instead of running
      // through its doorway and across the floor.
      const ta = this.roadTrim(state, a);
      const tb = this.roadTrim(state, b);
      const k = (R - ta - tb) / R;
      const m = (ta + (R - ta - tb) / 2) / R;
      const cx = pa.x + (pb.x - pa.x) * m;
      const cz = pa.z + (pb.z - pa.z) * m;
      road.position.set(cx, -0.04, cz);
      road.rotation.y = Math.atan2(-(pb.z - pa.z), pb.x - pa.x);
      road.scale.x = k;
      this.pieces.add(road);
      // Stand on the arched deck; the railings fence its middle, the ends stay open.
      const ux = (pb.x - pa.x) / R;
      const uz = (pb.z - pa.z) / R;
      const half = (R * k) / 2;
      this.bridges.push({ x: cx, z: cz, ux, uz, half });
      const rail = half * 0.84;
      for (const side of [-1, 1]) {
        const ox = -uz * side * (BRIDGE_WIDTH / 2 + 0.05);
        const oz = ux * side * (BRIDGE_WIDTH / 2 + 0.05);
        this.pieceColliders.push({ ax: cx - ux * rail + ox, az: cz - uz * rail + oz, bx: cx + ux * rail + ox, bz: cz + uz * rail + oz, r: 0.12, low: true });
      }
    }
    for (const [v, b] of Object.entries(state.buildings)) {
      const p = center(v);
      const color = COLOR_HEX[state.players[b.owner].color];
      const slot: AssetSlot = b.kind === 'citadel' ? 'building.city' : 'building.settlement';
      const obj = this.piece(slot, color);
      const rot = this.facing(v, state, p);
      obj.position.set(p.x, 0, p.z);
      obj.rotation.y = rot;
      this.pieces.add(obj);
      this.spots.push({ x: p.x, z: p.z, kind: b.kind, vertex: v });
      if (this.model(slot)) {
        const house = this.makeHouse(v, b.kind === 'citadel' ? 'hall' : 'cottage', obj, p.x, p.z, 0, rot);
        this.homes.push(house);
        this.pieceColliders.push(...this.houseColliders(house));
        // The owner's own furnishings (My kingdom), in the room's frame.
        const decor = this.decor.get(b.owner);
        const room = b.kind === 'citadel' ? 'hall' : 'cottage';
        if (decor && decor[room].length) {
          const { group, solids } = this.decorBuilder.room(room, decor[room], decor.tint, house.shape.floor);
          group.position.set(p.x, 0, p.z);
          group.rotation.y = rot;
          this.pieces.add(group);
          for (const sd of solids) {
            const [sx, sz] = toWorld(sd.x, sd.z, p.x, p.z, rot);
            this.pieceColliders.push({ ax: sx, az: sz, bx: sx, bz: sz, r: sd.r });
          }
        }
      } else {
        this.pieceColliders.push({ ax: p.x, az: p.z, bx: p.x, bz: p.z, r: SLOTS[slot].footprint });
      }
    }

    const robber = this.addRobber();
    if (this.robberHex !== state.wraithHex) {
      this.robberHex = state.wraithHex;
      const h = topo.hexPos[state.wraithHex];
      const rx = h.x * R + 2.3;
      const rz = h.y * R + 1.4;
      robber.position.set(rx, this.groundAt(rx, rz), rz);
      robber.userData.y = robber.position.y;
    }
    const rb = robber.position;
    this.pieceColliders.push({ ax: rb.x, az: rb.z, bx: rb.x, bz: rb.z, r: 0.9 });
    this.placeChests();
    for (const c of this.chests.values()) {
      if (!c.chest.root.visible) continue;
      const ax = Math.cos(c.rot) * 0.32;
      const az = -Math.sin(c.rot) * 0.32;
      this.pieceColliders.push({ ax: c.x - ax, az: c.z - az, bx: c.x + ax, bz: c.z + az, r: 0.3 });
    }
    this.pieceGrid = new ColliderGrid(this.pieceColliders);
    // Wheat, grass, flowers, trees and rocks give way where a building stands.
    this.clearings = [
      ...this.homes.map((h) => ({ x: h.x, z: h.z, r: h.kind === 'hall' ? 6.2 : 4.2 })),
      ...this.mills.map((m) => ({ x: m.x, z: m.z, r: 3.0 })),
    ];
    this.clear.apply(this.clearings);
    // Standing in a building that just appeared or changed (a settlement upgraded to a city)?
    // Step outside its door rather than end up inside a wall or a table.
    const inside = this.homes.find((h) => before.get(h.key) !== h.kind && this.onFloorOf(h, this.x, this.z));
    if (inside && before.size) {
      this.stepOutside(inside);
      this.opts.onNotice?.(inside.kind === 'hall' ? 'The settlement became a city: you stepped outside.' : 'A building went up here: you stepped outside.');
    }
  }

  /** How far a road keeps back from corner `v` (metres): clear of a model building's walls. */
  private roadTrim(state: GameState, v: string): number {
    const b = state.buildings[v];
    if (!b) return 0;
    const slot: AssetSlot = b.kind === 'citadel' ? 'building.city' : 'building.settlement';
    if (!this.model(slot)) return 0;
    return b.kind === 'citadel' ? 4.8 : 3.0;
  }

  /**
   * Which way a building on corner `v` faces: its door opens onto the most inviting of the
   * tiles meeting there (a wheat field first, then pasture, hills, forest, mountains, desert),
   * looking towards that tile's centre; ties go to the one nearer the island's middle.
   */
  private facing(v: string, state: GameState, p: { x: number; z: number }): number {
    const order: Terrain[] = ['fields', 'moors', 'ashen', 'witchwood', 'peaks', 'waste'];
    let best: { h: number; score: number } | null = null;
    for (const h of topo.vertexHexes[v]) {
      const t = state.board.hexes[h].terrain;
      const hp = topo.hexPos[h];
      const score = order.indexOf(t) * 100 + Math.hypot(hp.x, hp.y);
      if (!best || score < best.score) best = { h, score };
    }
    if (!best) return Math.atan2(-p.x, -p.z);
    const hp = topo.hexPos[best.h];
    return Math.atan2(hp.x * R - p.x, hp.y * R - p.z);
  }

  /** An enterable building around a placed model: its doors (state kept across rebuilds) and room. */
  private makeHouse(key: string, kind: BuildingKind, obj: THREE.Object3D, x: number, z: number, y: number, rot: number): House {
    const shape = buildingShape(kind);
    const named = (name: string) => obj.getObjectByName(name) ?? null;
    const doors = shape.doors.map((spec, i) => {
      const node = named(spec.node);
      const open = this.doorOpen.get(`${key}:${i}`) ?? 0;
      const d: HouseDoor = { spec, node, base: node?.rotation.y ?? 0, t: open, target: open };
      if (node) node.rotation.y = d.base + spec.sign * spec.open * open;
      return d;
    });
    const interior = named(shape.interior);
    return { key, kind, shape, x, z, y, rot, interior, doors };
  }

  /** A building's walls, furniture and outside props as world colliders. */
  private houseColliders(h: House): Collider[] {
    return h.shape.colliders.map((c) => {
      const [ax, az] = toWorld(c.ax, c.az, h.x, h.z, h.rot);
      const [bx, bz] = toWorld(c.bx, c.bz, h.x, h.z, h.rot);
      return { ax, az, bx, bz, r: c.r };
    });
  }

  private onFloorOf(h: House, x: number, z: number): boolean {
    if (Math.abs(x - h.x) > 7 || Math.abs(z - h.z) > 7) return false;
    const [lx, lz] = toLocal(x, z, h.x, h.z, h.rot);
    return h.shape.onFloor(lx, lz);
  }

  /** The house whose floor (x, z) is on, if any. */
  private houseAt(x: number, z: number): House | undefined {
    for (const h of this.homes) if (this.onFloorOf(h, x, z)) return h;
    for (const h of this.mills) if (this.onFloorOf(h, x, z)) return h;
    return undefined;
  }

  /** Puts the walker just outside a building's (first) door, facing it. */
  private stepOutside(h: House) {
    const d = h.doors[0].spec;
    const [cx, cz] = toWorld(d.cx, d.cz, h.x, h.z, h.rot);
    const [ox, oz] = toWorld(d.cx + d.nx * 2.6, d.cz + d.nz * 2.6, h.x, h.z, h.rot);
    this.x = ox;
    this.z = oz;
    this.yaw = Math.atan2(-(cx - ox), -(cz - oz));
    this.camY = this.groundAt(ox, oz) + EYE;
  }

  /** The door the walker is close to and looking at (or standing in), if any. */
  private targetDoor(): { h: House; d: HouseDoor; dist: number } | null {
    let best: { h: House; d: HouseDoor; dist: number } | null = null;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    for (const list of [this.homes, this.mills])
      for (const h of list) {
        if (Math.abs(this.x - h.x) > 9 || Math.abs(this.z - h.z) > 9) continue;
        for (const d of h.doors) {
          if (!d.node) continue;
          const [cx, cz] = toWorld(d.spec.cx, d.spec.cz, h.x, h.z, h.rot);
          const dist = Math.hypot(cx - this.x, cz - this.z);
          if (dist > 2.4) continue;
          const facing = ((cx - this.x) * fx + (cz - this.z) * fz) / Math.max(dist, 1e-3);
          if (dist > 1.0 && facing < 0.45) continue;
          if (!best || dist < best.dist) best = { h, d, dist };
        }
      }
    return best;
  }

  /** E: opens or closes the door in front of the walker. Returns false if there is none. */
  interact(): boolean {
    const chest = this.mount < 0 ? this.chestInReach() : null;
    if (chest) {
      if (chest.opened) this.opts.onNotice?.(chest.full ? 'The chest is empty now: you carry its weapons.' : 'Nothing in here.');
      else chest.open(() => this.opts.onChestOpened?.(chest.full));
      return true;
    }
    if (this.mount >= 0) {
      this.dismount();
      return true;
    }
    const horse = this.horseInReach();
    if (horse >= 0) {
      this.mountHorse(horse);
      return true;
    }
    const t = this.targetDoor();
    if (!t) return false;
    const { d } = t;
    if (d.target > 0.5 && t.dist < 0.75) {
      // Closing it now would shut the leaf on the walker.
      this.opts.onNotice?.('Step out of the doorway to close it.');
      return true;
    }
    d.target = d.target > 0.5 ? 0 : 1;
    this.doorOpen.set(`${t.h.key}:${t.h.doors.indexOf(d)}`, d.target);
    if (this.opts.reduceMotion) d.t = d.target;
    return true;
  }

  /** Door leaves as colliders at their current angle (only near the walker). */
  private doorColliders(out: Collider[]) {
    for (const list of [this.homes, this.mills])
      for (const h of list) {
        if (Math.abs(this.x - h.x) > 8 || Math.abs(this.z - h.z) > 8) continue;
        for (const d of h.doors) {
          const s = d.spec;
          const ang = s.sign * s.open * ease(d.t);
          const c = Math.cos(ang);
          const sn = Math.sin(ang);
          // The leaf's direction turned about +Y, as its node turns.
          const lx = s.ax * c + s.az * sn;
          const lz = -s.ax * sn + s.az * c;
          const [ax, az] = toWorld(s.hx + lx * 0.12, s.hz + lz * 0.12, h.x, h.z, h.rot);
          const [bx, bz] = toWorld(s.hx + lx * s.len, s.hz + lz * s.len, h.x, h.z, h.rot);
          out.push({ ax, az, bx, bz, r: 0.08 });
        }
      }
  }

  /** Doors swing towards their target; far interiors are hidden; the hint follows the target. */
  private updateHouses(dt: number) {
    const swing = this.opts.reduceMotion ? 1 : dt / 0.45;
    for (const list of [this.homes, this.mills])
      for (const h of list) {
        for (const d of h.doors) {
          if (d.t === d.target) continue;
          d.t = d.target > d.t ? Math.min(d.target, d.t + swing) : Math.max(d.target, d.t - swing);
          if (d.node) d.node.rotation.y = d.base + d.spec.sign * d.spec.open * ease(d.t);
        }
        if (h.interior) h.interior.visible = Math.hypot(this.x - h.x, this.z - h.z) < 34;
      }
    const t = this.targetDoor();
    const chest = this.mount < 0 ? this.chestInReach() : null;
    const horse = this.mount < 0 ? this.horseInReach() : -1;
    const hint = chest
      ? chest.opened
        ? null
        : 'Open chest'
      : this.mount >= 0
        ? 'Dismount'
        : horse >= 0
          ? 'Ride horse'
          : t
            ? t.d.target > 0.5
              ? 'Close door'
              : 'Open door'
            : null;
    if (hint !== this.hint) {
      this.hint = hint;
      this.opts.onHint?.(hint);
    }
  }

  /**
   * Nearly everything on the island stands still, yet three recomputes every object's matrices
   * each frame. So once built, the static parts get their matrices once and are skipped from
   * then on (setPieces and the LOD switches only change visibility, never a frozen object's
   * transform). Only what moves keeps updating: sheep, the robber, the pieces, windmill sails
   * and doors, boats, the sky (it follows the camera) and the sun, plus the groups that hold them.
   */
  private freezeStatic() {
    const moving = new Set<THREE.Object3D>([
      this.pieces,
      this.sky,
      this.sun,
      this.sun.target,
      ...this.sheep.map((s) => s.rig.root),
      ...this.spinners,
      ...this.boats.map((b) => b.obj),
      ...this.mills.flatMap((m) => m.doors.map((d) => d.node).filter((n): n is THREE.Object3D => !!n)),
    ]);
    if (this.robber) moving.add(this.robber);
    const holders = new Set<THREE.Object3D>();
    for (const o of moving) for (let p = o.parent; p; p = p.parent) holders.add(p);
    this.scene.updateMatrixWorld(true);
    const visit = (o: THREE.Object3D) => {
      for (const c of o.children) {
        if (moving.has(c)) continue;
        if (holders.has(c)) visit(c);
        else c.traverse((x) => (x.matrixAutoUpdate = x.matrixWorldAutoUpdate = false));
      }
    };
    visit(this.scene);
  }

  /** The robber exists from the start (off the island until placed), so its shaders compile with the rest. */
  private addRobber(): THREE.Object3D {
    if (this.robber) return this.robber;
    const model = this.model('piece.robber')?.[0];
    const robber = model ? cloneAsset(model, SLOTS['piece.robber']) : makeRobber(this.kit);
    // The built-in pawn floats and bobs; the model stands on its own stone base.
    robber.userData.hover = !model;
    if (!model) robber.scale.setScalar(1.1);
    robber.position.set(0, -50, 0);
    this.scene.add(robber);
    this.robber = robber;
    return robber;
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
    if (this.envPending) this.disposeEnvHelpers(this.envPending);
    this.envRT?.dispose();
    this.renderer.dispose();
    // dispose() leaves the WebGL context alive; Chrome keeps 16 and warns past that, so every
    // visit to the walk would hold one until the page closes. Give it back now.
    this.renderer.forceContextLoss();
  }

  /**
   * Starts every shader compiling at once (the driver links them in parallel where it can) and
   * begins drawing when they're done, instead of stalling the first frame on each in turn.
   */
  private startWhenCompiled() {
    // One of each piece joins the compile, so the first city or road built later doesn't stall
    // a frame on a new shader. They sit below the sea and are removed before drawing starts.
    const templates = new THREE.Group();
    templates.position.y = -50;
    templates.add(this.piece('building.settlement', '#ffffff'), this.piece('building.city', '#ffffff'));
    templates.add(makeBridge(this.kit, R, '#ffffff'));
    this.scene.add(templates);
    this.renderer.compile(this.scene, this.camera);
    templates.removeFromParent();
    const env = this.envPending;
    if (env) {
      // Compiled as PMREM will draw them, into a half-float target (the target picks the
      // tone mapping and colour space a program is built for).
      this.renderer.debug.checkShaderErrors = false;
      this.renderer.setRenderTarget(env.standIn);
      this.renderer.compile(env.shaders, env.flat);
      this.renderer.compile(env.env, env.flat);
      this.renderer.setRenderTarget(null);
      this.renderer.debug.checkShaderErrors = true;
    }
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
      if (this.disposed) return this.release();
      this.finishEnvironment();
      this.renderer.setAnimationLoop(() => this.frame());
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
        foliage(c, { uTime: this.uTime, wind: { amount: still ? 0 : 0.35, height: 0.45 }, fade: this.grassFade, translucency: 0.7 });
      } else {
        foliage(c, { uTime: this.uTime, wind: { amount: still ? 0 : 0.3, height: 0.4 }, fade: this.flowerFade, translucency: 0.5 });
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

  private makeFlock(rigs: SheepRig[], cx: number, cz: number, r: number): Flock {
    const meshesOf = (rig: SheepRig) => {
      const list: THREE.Mesh[] = [];
      rig.root.traverse((o) => (o as THREE.Mesh).isMesh && list.push(o as THREE.Mesh));
      return list;
    };
    const all = rigs.map(meshesOf);
    const bounds = new THREE.Sphere(new THREE.Vector3(cx, 0.6, cz), r + 1.5);
    const parts = all[0].map((m, k) => {
      const mesh = new THREE.InstancedMesh(m.geometry, m.material, rigs.length);
      mesh.name = 'flock';
      mesh.castShadow = SLOTS.sheep.castShadow && !this.opts.lite;
      mesh.receiveShadow = true;
      mesh.boundingSphere = bounds;
      this.scene.add(mesh);
      return { mesh, src: all.map((list) => list[k]) };
    });
    const f = { rigs, parts };
    syncFlock(f);
    return f;
  }

  /** Keeps a moving or model-drawn object out of the static bake. */
  private place(obj: THREE.Object3D): THREE.Object3D {
    obj.userData.dynamic = true;
    return obj;
  }

  // ---------------------------------------------------------------- building

  /**
   * Which instancing chunk a placement belongs to: its land tile, or a 250 m square out on the
   * horizon. Each chunk is its own draw, so the camera and the shadow map skip what they can't see.
   */
  private chunkOf(x: number, z: number): string {
    let best = -1;
    let bd = R * 1.3;
    for (const h of this.landHexes) {
      const d = Math.hypot(x - h.x, z - h.z);
      if (d < bd) {
        bd = d;
        best = h.id;
      }
    }
    return best >= 0 ? `t${best}` : `f${Math.floor(x / 250)},${Math.floor(z / 250)}`;
  }

  /** Ground height at a world point (0 off the land). */
  private groundAt(x: number, z: number): number {
    const house = this.houseAt(x, z);
    if (house) return house.y + house.shape.floor;
    const deck = this.deckAt(x, z);
    if (deck !== null) return deck;
    for (const h of this.landHexes)
      if (inHex(x, z, h.x, h.z, R)) return tileHeight(this.tiles.get(h.id)!, x - h.x, z - h.z);
    return 0;
  }

  /** Height of a bridge deck under (x, z), if there is one. */
  private deckAt(x: number, z: number): number | null {
    for (const b of this.bridges) {
      const dx = x - b.x;
      const dz = z - b.z;
      const along = dx * b.ux + dz * b.uz;
      if (Math.abs(along) > b.half || Math.abs(-dx * b.uz + dz * b.ux) > BRIDGE_WIDTH / 2 + 0.1) continue;
      return bridgeDeck(along, b.half * 2) + 0.06;
    }
    return null;
  }

  private buildSky() {
    this.sky = makeSky(this.sunDir, this.uTime, this.skyColours, true);
    this.scene.add(this.sky);
    this.scene.background = SKY.horizon.clone();
    // Restrained atmospheric depth: the island stays crisp, the far ranges and sea turn hazy.
    this.scene.fog = new THREE.Fog(SKY.horizon.clone(), 150, 820);
    this.buildEnvironment();
  }

  /**
   * Image-based fill light from a small sky: cool blue from above, warm green bounce from
   * below. It gives shaded faces colour and lets metal and water reflect the sky.
   *
   * Prefiltering it (PMREM) needs three's GGX filter shader, whose Direct3D compile takes about
   * 0.4 s. So this only prepares: the filter materials join the parallel compile in
   * `startWhenCompiled`, the scene compiles against a stand-in of the same size and layout
   * (so no material needs recompiling later), and `finishEnvironment` renders the real one
   * once every program is linked. Uses PMREMGenerator internals; three is pinned (0.186.1).
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
    const sky = new THREE.Mesh(geo, mat);
    env.add(sky);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const internals = pmrem as unknown as {
      _setSize(size: number): void;
      _allocateTargets(): THREE.WebGLRenderTarget;
      _blurMaterial: THREE.Material;
      _ggxMaterial: THREE.Material;
      _lodMeshes: THREE.Mesh[];
    };
    internals._setSize(256); // fromScene's default size
    const standIn = internals._allocateTargets();
    const flat = new THREE.OrthographicCamera();
    const shaders = new THREE.Group();
    for (const m of [internals._blurMaterial, internals._ggxMaterial]) {
      // PMREM's own plane: the program depends on which attributes the geometry has.
      const q = new THREE.Mesh(internals._lodMeshes[0].geometry, m);
      q.frustumCulled = false;
      shaders.add(q);
    }
    this.envPending = { env, sky, pmrem, standIn, shaders, flat };
    this.scene.environment = standIn.texture;
    this.scene.environmentIntensity = 0.85;
  }

  /** Renders the prefiltered environment (its shaders are linked by now) and frees the helpers. */
  private finishEnvironment() {
    const p = this.envPending;
    if (!p) return;
    this.envPending = null;
    // Direct3D's shader compiler notes a harmless constant-folding precision issue in three's
    // own PMREM shaders; skip the log check for these one-off programs only.
    this.renderer.debug.checkShaderErrors = false;
    this.envRT = p.pmrem.fromScene(p.env, 0.04);
    this.renderer.debug.checkShaderErrors = true;
    this.scene.environment = this.envRT.texture;
    this.disposeEnvHelpers(p);
  }

  private disposeEnvHelpers(p: NonNullable<World['envPending']>) {
    p.pmrem.dispose();
    p.standIn.dispose();
    p.sky.geometry.dispose();
    (p.sky.material as THREE.Material).dispose();
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
    const far = this.stress.distance;
    const wheat = new Field(
      'wheat',
      wheatNear ? wheatNear.map((a) => ({ parts: this.partsFor('wheat.clump', a) })) : [fallbackWheat('near')],
      wheatFar ? { parts: this.partsFor('wheat.clump.far', wheatFar) } : fallbackWheat('far'),
      7,
      (wheatMid ? 7 : 16) * far,
      Infinity,
      wheatMid ? { visual: { parts: this.partsFor('wheat.clump.mid', wheatMid) }, dist: 22 * far } : null,
    );
    const grass = this.model('grass.clump');
    const grassTo = this.grassFade[1] + 9;
    this.grass = grass
      ? new Field('grass', grass.map((a) => ({ parts: this.partsFor('grass.clump', a) })), null, 12, grassTo, grassTo)
      : null;
    const flowerKinds = FLOWER_SLOTS.filter((s) => this.model(s));
    this.flowers =
      flowerKinds.length === FLOWER_SLOTS.length
        ? new Field(
            'flowers',
            flowerKinds.map((s) => ({ parts: this.partsFor(s, this.model(s)![0]) })),
            null,
            16,
            this.flowerFade[1] + 11,
            this.flowerFade[1] + 11,
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
        // The plaque faces the footpath in; a slight lean, fixed per tile, keeps the row of signs
        // from looking stamped out.
        const sign = makeTokenSign(kit, hex.token);
        sign.rotation.set(0, s, (((i * 37) % 7) - 3) * 0.006);
        g.add(sign);
        this.addCircle(cx, cz, 0.5);
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
      // The tile's windmill stands on the same ground its model was just seated on.
      for (const m of this.mills) if (Math.hypot(m.x - cx, m.z - cz) < R) m.y = tileHeight(tile, m.x - cx, m.z - cz);
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

    this.inst.flush(this.scene, (x, z) => this.groundAt(x, z), (x, z) => this.chunkOf(x, z), this.clear);
    this.grid = new ColliderGrid(this.colliders);
    this.fields = [wheat, this.grass, this.flowers].filter((f): f is Field => !!f);
    for (const f of this.fields) f.build(this.scene, this.clear);
  }

  /**
   * The sea: one plane coloured in the shader by its distance to the island (pale turquoise
   * over the sand, a clear blue-green shelf, deep blue beyond), with a moving wave normal from
   * the shared noise for sun glints and sky reflection, and foam where it meets the beach:
   * a lapping fringe plus swell lines rolling in.
   */
  private buildSea() {
    const shore = shoreDistance();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1 });
    const calm = this.opts.reduceMotion ? 0 : 1;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.uniforms.uCalm = { value: calm };
      sh.uniforms.uShore = { value: shore.texture };
      sh.uniforms.uShoreMap = { value: shore.map };
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
          uniform sampler2D uShore;
          uniform vec4 uShoreMap;
          uniform vec3 uDeep;
          uniform vec3 uShelf;
          uniform vec3 uLagoon;
          varying vec2 vSea;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float seaD = texture2D(uShore, (vSea - uShoreMap.xy) * uShoreMap.zw).r;
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
    // The distance map is the material's own: dispose it with the material.
    mat.addEventListener('dispose', () => shore.texture.dispose());
    const sea = new THREE.Mesh(this.kit.own(new THREE.PlaneGeometry(1800, 1800, 180, 180)), this.kit.ownMat(mat));
    sea.name = 'sea';
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.6;
    sea.receiveShadow = true;
    // After the land (but before the sky), so the depth test skips the sea under the island.
    sea.renderOrder = 1;
    this.scene.add(sea);
  }

  /** Grass tufts and wild flowers in patches, kept off paths, props and the centre sign. */
  private scatterGround(ctx: HexCtx, blockers: Collider[]) {
    const spec = GRASS[ctx.tile.terrain];
    const n = Math.round(spec.n * (this.opts.lite ? 0.35 : 1) * this.stress.density);
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
    const drifts = Math.round((this.opts.lite ? Math.ceil(spec.drifts / 2) : spec.drifts) * this.stress.density);
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
      this.colliders.push({ ax: cx + p.x, az: cz + p.z, bx: cx + q.x, bz: cz + q.z, r: 0.2, low: true });
    });
    for (const p of posts) if (p.open) this.addCircle(cx + p.x, cz + p.z, 0.2);

    // The flock.
    const flock = Math.round((7 + Math.floor(rnd() * 3)) * this.stress.sheep);
    const sheepModel = this.model('sheep')?.[0];
    const rigs: SheepRig[] = [];
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
      if (sheepModel) rigs.push(rig);
      else this.scene.add(rig.root);
      this.sheep.push(sh);
    }
    if (rigs.length) this.flocks.push(this.makeFlock(rigs, cx, cz, F));

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
    const logs = makeLogPile(this.kit);
    const bark = this.kit.mat('#6e4a2c', WOOD);
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
          woodMats(this.kit).grain,
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
    const dense = this.stress.density;
    for (let i = 0; i < 34 * dense; i++) {
      const p = this.scatter(ctx, taken, 1.45 / Math.sqrt(dense), 0.86);
      if (!p) continue;
      const toward = Math.cos(Math.atan2(p.x, p.z) - pineSide);
      const slot: AssetSlot = ctx.rnd() < 0.25 + toward * 0.3 ? 'tree.conifer' : 'tree.broadleaf';
      this.inst.tree(ctx.cx + p.x, ctx.cz + p.z, ctx.rnd, slot, 0.75 + ctx.rnd() * 0.75);
      ctx.tile.shade.push({ x: p.x, z: p.z, r: 2.4 });
      this.addCircle(ctx.cx + p.x, ctx.cz + p.z, 0.55);
    }
    // Undergrowth between the trunks, and young trees where light reaches the ground.
    for (let i = 0; i < 26 * dense; i++) {
      const p = this.scatter(ctx, taken, 0.5, 0.86);
      if (!p) continue;
      this.inst.bush(ctx.cx + p.x, ctx.cz + p.z, ctx.rnd, 0.5 + ctx.rnd() * 0.5);
    }
    if (this.model('tree.sapling'))
      for (let i = 0; i < 6 * dense; i++) {
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
    if (millModel) {
      // Enterable: walls, door and floor from the plan; its height is settled with the tile's.
      const house = this.makeHouse(`mill${ctx.tile.seed}`, 'mill', mill.root, ctx.cx + mx, ctx.cz + mz, 0, a + Math.PI);
      this.mills.push(house);
      this.colliders.push(...this.houseColliders(house));
      this.flat(ctx, mx, mz, 3.2);
    } else {
      this.addCircle(ctx.cx + mx, ctx.cz + mz, SLOTS['prop.windmill'].footprint);
      this.flat(ctx, mx, mz, 2.6);
    }

    // Freshly rolled bales beside the mill.
    for (const k of [-1, 1]) {
      const hb = this.prop('prop.haybale', () => makeHayBale(this.kit));
      hb.position.x = mx + d.x * 3.7 + d.z * 1.6 * k;
      hb.position.z = mz + d.z * 3.7 - d.x * 1.6 * k;
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

    const thin = Math.sqrt(this.stress.density);
    const rowGap = (this.opts.lite ? 0.62 : 0.42) / thin;
    const step = (this.opts.lite ? 0.48 : 0.31) / thin;
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
          // Each plot has its own ripeness (deep gold, honey, pale straw, a greener gold) and
          // drifts across it in patches, so the field reads as tended strips from any height.
          const patch = fbm(x / 5, z / 5, tile.seed + 41, 2);
          const [rr, rg, rb] = PLOT_RIPENESS[(k + (tile.seed & 3)) % 4];
          tint.setRGB(rr, rg * (0.96 + patch * 0.06), rb * (0.9 + patch * 0.12));
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
    if (this.adaptive?.sample(now, now - this.last)) this.renderer.setPixelRatio(this.pixelRatio());
    this.last = now;
    const animate = !this.opts.reduceMotion;
    if (animate) this.uTime.value += dt;
    const t = this.uTime.value;

    const oldX = this.x,
      oldZ = this.z;
    this.movePlayer(dt);
    this.speed = Math.hypot(this.x - oldX, this.z - oldZ) / Math.max(dt, 0.001);
    const ground = this.groundAt(this.x, this.z);
    // Horses: the ridden one carries the walker, the others graze where they were left.
    this.horses.forEach((h, i) => {
      if (i === this.mount) {
        h.x = this.x;
        h.z = this.z;
        h.yaw = this.yaw;
      }
      h.horse.root.position.set(h.x, i === this.mount ? ground : this.groundAt(h.x, h.z), h.z);
      h.horse.root.rotation.y = h.yaw;
      h.horse.update(dt, i === this.mount ? this.speed : 0);
    });
    if (this.combat) {
      const targets = this.combat.targets;
      targets.length = 0;
      if (this.pvp) for (const f of this.remotes.values()) if (f.present) targets.push({ seat: f.seat, ...f.position });
    }
    const seat = this.mount >= 0 ? this.horses[this.mount].horse.saddleHeight - 0.78 : 0;
    this.combat?.update(dt, this.x, ground + seat, this.z, this.yaw, this.speed, this.clearForCombat);
    for (const f of this.remotes.values()) f.update(dt, (x, z) => this.groundAt(x, z));
    for (const c of this.chests.values()) c.chest.update(dt);
    if (animate) {
      for (const s of this.sheep) this.updateSheep(s, dt);
      for (const f of this.flocks) syncFlock(f);
      for (const sp of this.spinners) sp.rotation.z -= dt * 0.7;
      for (const b of this.boats) {
        b.obj.position.y = b.y + Math.sin(t * 1.4 + b.phase) * 0.1;
        b.obj.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.04;
      }
      if (this.robber?.userData.hover) this.robber.position.y = (this.robber.userData.y ?? 0) + 0.1 + Math.sin(t * 2) * 0.08;
    }
    this.maybeBleat(dt);
    this.updateHouses(dt);
    for (const f of this.fields) f.update(this.x, this.z);

    // The sun never moves and most casters are static, so the shadow map is redrawn only when
    // its box moves (in steps of 100 whole texels, ~3.9 m, so edges never crawl), when pieces
    // change, and every third frame for walking sheep, turning sails and bobbing boats (swaying
    // crowns don't need it: shadows use the plain depth shader).
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
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this.combat) this.thirdPersonCamera(dt);
    this.sky.position.copy(this.camera.position);
    this.stars?.position.copy(this.camera.position);
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
    const riding = this.mount >= 0;
    const speed = this.combat?.blocking ? 2.2 : riding ? (running ? HORSE_RUN : HORSE_WALK) : running ? RUN : WALK;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const dx = (-sy * fwd + cy * str) * speed * dt;
    const dz = (-cy * fwd - sy * str) * speed * dt;
    if (Math.abs(dx) + Math.abs(dz) > 1e-5) {
      // In steps of at most 15 cm, so a slow frame can't carry the walker through a wall.
      const n = Math.ceil(Math.hypot(dx, dz) / 0.15);
      const sx = dx / n;
      const sz = dz / n;
      for (let i = 0; i < n; i++) {
        // Try the full step, then slide along each axis.
        if (!this.tryMove(this.x + sx, this.z + sz) && !this.tryMove(this.x + sx, this.z)) this.tryMove(this.x, this.z + sz);
      }
    }
  }

  private tryMove(nx: number, nz: number): boolean {
    let x = nx;
    let z = nz;
    const near = this.near;
    near.length = 0;
    if (this.grid) this.grid.near(nx, nz, PLAYER_R + 0.5, near);
    else near.push(...this.colliders);
    this.pieceGrid.near(nx, nz, PLAYER_R + 0.5, near);
    this.doorColliders(near);
    for (const c of near) {
      // A tree or rock hidden by a building's clearing doesn't block either.
      if (c.ax === c.bx && c.az === c.bz && this.cleared(c.ax, c.az)) continue;
      [x, z] = pushOut(x, z, c, PLAYER_R);
    }
    for (const s of this.sheep)
      [x, z] = pushOut(x, z, { ax: s.x, az: s.z, bx: s.x, bz: s.z, r: 0.5 }, PLAYER_R);
    // Horses are solid along their length; other players are solid too.
    this.horses.forEach((h, i) => {
      if (i === this.mount) return;
      const ax = Math.sin(h.yaw) * 0.7;
      const az = Math.cos(h.yaw) * 0.7;
      [x, z] = pushOut(x, z, { ax: h.x - ax, az: h.z - az, bx: h.x + ax, bz: h.z + az, r: 0.45 }, PLAYER_R);
    });
    for (const f of this.remotes.values()) {
      if (!f.present) continue;
      const p = f.position;
      [x, z] = pushOut(x, z, { ax: p.x, az: p.z, bx: p.x, bz: p.z, r: 0.35 }, PLAYER_R);
    }
    if (this.combat?.active) {
      const p = this.combat.dummy.position;
      [x, z] = pushOut(x, z, { ax: p.x, az: p.z, bx: p.x, bz: p.z, r: 0.4 }, PLAYER_R);
    }
    if (!this.isWalkable(x, z)) return false;
    this.x = x;
    this.z = z;
    return true;
  }

  private cleared(x: number, z: number): boolean {
    for (const c of this.clearings) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
    return false;
  }

  private isWalkable(x: number, z: number): boolean {
    return (
      this.landHexes.some((h) => inHex(x, z, h.x, h.z, R * 1.1)) ||
      !!this.houseAt(x, z) ||
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

/** Door swing: eases in and out. */
const ease = (t: number) => t * t * (3 - 2 * t);

/** Stress preset: a settlement or city on every corner and a road on every edge (drawing only). */
function fullBoard(state: GameState): GameState {
  const n = state.players.length;
  const buildings: GameState['buildings'] = {};
  Object.keys(topo.vertexPos).forEach((v, i) => (buildings[v] = { owner: i % n, kind: i % 2 ? 'citadel' : 'outpost' }));
  const causeways: GameState['causeways'] = {};
  Object.keys(topo.edgeVertices).forEach((e, i) => (causeways[e] = i % n));
  return { ...state, buildings, causeways };
}

interface HexCtx {
  g: THREE.Group;
  cx: number;
  cz: number;
  rnd: () => number;
  spawnAngle: number;
  tile: TileGround;
}

/**
 * Distance from each point of the sea to the nearest land tile's edge (metres, negative under
 * the land), precomputed once into a half-float texture over the island plus a 40 m margin.
 * The sea shader used to work this out per pixel over all 19 tiles; the field is piecewise
 * linear, so bilinear filtering reproduces it except within a texel of the tile corners.
 * Beyond the margin the clamped edge value (40 m+) is already the deep-water colour.
 */
function shoreDistance(): { texture: THREE.DataTexture; map: THREE.Vector4 } {
  const land = topo.hexPos.map((p) => ({ x: p.x * R, z: p.y * R }));
  const apothem = (R * Math.sqrt(3)) / 2;
  const pad = R + 40;
  const x0 = Math.min(...land.map((h) => h.x)) - pad;
  const z0 = Math.min(...land.map((h) => h.z)) - pad;
  const size = Math.max(Math.max(...land.map((h) => h.x)) + pad - x0, Math.max(...land.map((h) => h.z)) + pad - z0);
  const N = 256;
  const data = new Uint16Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      // Texel centres, as the GPU samples them.
      const x = x0 + ((i + 0.5) / N) * size;
      const z = z0 + ((j + 0.5) / N) * size;
      let d = 1e5;
      for (const h of land) {
        const qx = Math.abs(x - h.x);
        const qz = Math.abs(z - h.z);
        d = Math.min(d, Math.max(qx, qx * 0.5 + qz * 0.8660254) - apothem);
      }
      data[j * N + i] = THREE.DataUtils.toHalfFloat(d);
    }
  const texture = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return { texture, map: new THREE.Vector4(x0, z0, 1 / size, 1 / size) };
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

/** Copies each sheep's posed parts into its flock's instanced meshes. */
function syncFlock(f: Flock) {
  f.rigs.forEach((rig, i) => {
    rig.root.updateMatrixWorld(true);
    for (const p of f.parts) p.mesh.setMatrixAt(i, p.src[i].matrixWorld);
  });
  for (const p of f.parts) p.mesh.instanceMatrix.needsUpdate = true;
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
    groundAt: (x: number, z: number) => number, receive = true, depth?: THREE.Material, clearings?: Clearings) {
    const im = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((p, i) => {
      const m = this.matrix(p, groundAt(p.x, p.z));
      im.setMatrixAt(i, m);
      im.setColorAt(i, p.color);
      if (!(p as Root).far) clearings?.add(im, i, m);
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

  flush(scene: THREE.Scene, groundAt: (x: number, z: number) => number, chunkOf: (x: number, z: number) => string, clearings?: Clearings) {
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
    const chunks = <T extends Placed>(list: T[]) => {
      const by = new Map<string, T[]>();
      for (const p of list) {
        const k = chunkOf(p.x, p.z);
        let l = by.get(k);
        if (!l) by.set(k, (l = []));
        l.push(p);
      }
      return [...by.values()];
    };
    for (const [key, list] of this.lists) {
      if (!list.length) continue;
      const part = key.includes('|') ? key.split('|')[1] : key;
      const spec = specs[part];
      const mat = spec.mat();
      if (spec.sway && !this.lite) addSway(mat, this.uTime, spec.sway);
      for (const c of chunks(list)) this.add(scene, kit.geo(`inst-${part}`, geos[part]), mat, c, spec.shadow, groundAt, true, undefined, clearings);
    }
    // Model-drawn slots: one instanced mesh per variant part and chunk.
    for (const [slot, list] of this.roots) {
      const variants = this.model(slot)!;
      variants.forEach((asset, v) => {
        for (const far of [false, true]) {
          const mine = list.filter((p) => p.variant === v && !!p.far === far);
          if (!mine.length) continue;
          const parts = this.partsFor(slot, asset);
          for (const c of chunks(mine))
            for (const part of parts) this.add(scene, part.geometry, part.material, c, SLOTS[slot].castShadow && !far, groundAt, !far, part.depth, clearings);
        }
      });
    }
  }
}

/** Wheat tint per plot: deep gold, honey, pale straw, greener gold (multiplied into the model's colours). */
const PLOT_RIPENESS: [number, number, number][] = [
  [1.04, 0.97, 0.84],
  [1.0, 0.9, 0.74],
  [1.03, 1.03, 0.98],
  [0.92, 1.0, 0.78],
];
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
