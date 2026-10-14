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
  Kit,
  groundTexture,
  makeBarn,
  makeBoat,
  makeBoulder,
  makeBrickStack,
  makeCactus,
  makeCity,
  makeCloud,
  makeDock,
  makeFencePost,
  makeFenceRail,
  makeHayBale,
  makeKiln,
  makeMountain,
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

/** Hex circumradius in metres: a land tile is ~24 m across, a few seconds' walk. */
export const R = 14;
const EYE = 1.7;
const PLAYER_R = 0.35;
const WALK = 5.5;
const RUN = 11;

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

const GROUND: Record<Terrain, { base: string; speck: string[]; strokes?: boolean }> = {
  witchwood: { base: '#4f8d3b', speck: ['#3f7630', '#62a046', '#356a28'], strokes: true },
  ashen: { base: '#c97c4f', speck: ['#ad623b', '#d99263', '#94512f'] },
  moors: { base: '#86c94e', speck: ['#72b83e', '#9ad862', '#62a534'], strokes: true },
  fields: { base: '#a7b84a', speck: ['#97a83e', '#b7c65c', '#8a9a36'], strokes: true },
  peaks: { base: '#9a9da5', speck: ['#83878f', '#b0b3ba', '#71757e'] },
  waste: { base: '#e8d49c', speck: ['#d9c286', '#f2e2b3', '#ccb576'] },
};

const SAIL: Record<HarborKind, string> = {
  any: '#fbf6ea',
  wood: '#5aa83c',
  clay: '#d0663f',
  wool: '#c9f08a',
  grain: '#f2c84b',
  ore: '#9aa7c4',
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

/** Adds a gentle wind sway to an instanced material (taller vertices move more). */
function addSway(m: THREE.Material, uTime: { value: number }, amount: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float h = max(transformed.y, 0.0);
        transformed.x += sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.23) * h * ${amount.toFixed(3)};
        transformed.z += cos(uTime * 1.3 + ip.x * 0.19) * h * ${(amount * 0.6).toFixed(3)};`,
      );
  };
}

export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private kit = new Kit();
  private sun: THREE.DirectionalLight;
  private uTime = { value: 0 };
  private last = performance.now();

  private colliders: Collider[] = [];
  private pieceColliders: Collider[] = [];
  /** Docks: walkable strips beyond the beach. */
  private walkable: Collider[] = [];
  private landHexes: { id: number; x: number; z: number }[] = [];
  private spawns = new Map<number, Spawn>();
  private sheep: Sheep[] = [];
  private spinners: THREE.Object3D[] = [];
  private boats: { obj: THREE.Object3D; phase: number; y: number }[] = [];
  private clouds: THREE.Object3D[] = [];
  private pieces = new THREE.Group();
  private robber: THREE.Group | null = null;
  private robberHex = -1;

  private x = 0;
  private z = 0;
  private yaw = 0;
  private pitch = -0.08;
  private bob = 0;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lite ? 1 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = !opts.lite;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1400);
    this.camera.rotation.order = 'YXZ';

    this.buildSky();
    this.buildLights();
    this.sun = this.scene.children.find(
      (o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight,
    )!;
    this.buildIsland(board);
    this.scene.add(this.pieces);

    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- public API

  resize(w: number, h: number): void {
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * 0.0045;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0045, -1.2, 1.1);
  }

  /** Teleports to a land hex's viewpoint, facing its centre. */
  goTo(hex: number): void {
    const s = this.spawns.get(hex);
    if (!s) return;
    this.x = s.x;
    this.z = s.z;
    this.yaw = s.yaw;
    this.pitch = -0.12;
  }

  /** Rebuilds settlements, cities, roads and the robber from the game state. */
  setPieces(state: GameState): void {
    for (const c of [...this.pieces.children]) this.pieces.remove(c);
    this.pieceColliders = [];
    const center = (v: string) => ({ x: topo.vertexPos[v].x * R, z: topo.vertexPos[v].y * R });

    for (const [e, owner] of Object.entries(state.causeways)) {
      const [a, b] = topo.edgeVertices[e];
      const pa = center(a);
      const pb = center(b);
      const road = makeRoad(this.kit, R * 0.74, COLOR_HEX[state.players[owner].color]);
      road.position.set((pa.x + pb.x) / 2, -0.06, (pa.z + pb.z) / 2);
      road.rotation.y = Math.atan2(-(pb.z - pa.z), pb.x - pa.x);
      this.pieces.add(road);
    }
    for (const [v, b] of Object.entries(state.buildings)) {
      const p = center(v);
      const color = COLOR_HEX[state.players[b.owner].color];
      const obj =
        b.kind === 'citadel' ? makeCity(this.kit, color) : makeSettlement(this.kit, color);
      obj.position.set(p.x, 0, p.z);
      obj.rotation.y = Math.atan2(-p.x, -p.z);
      this.pieces.add(obj);
      this.pieceColliders.push({
        ax: p.x,
        az: p.z,
        bx: p.x,
        bz: p.z,
        r: b.kind === 'citadel' ? 2.9 : 2.0,
      });
    }

    if (!this.robber) {
      this.robber = makeRobber(this.kit);
      this.scene.add(this.robber);
    }
    if (this.robberHex !== state.wraithHex) {
      this.robberHex = state.wraithHex;
      const h = topo.hexPos[state.wraithHex];
      this.robber.position.set(h.x * R + 2.3, 0, h.y * R + 1.4);
    }
    const rb = this.robber.position;
    this.pieceColliders.push({ ax: rb.x, az: rb.z, bx: rb.x, bz: rb.z, r: 0.9 });
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geos.add(m.geometry);
      if (m.material)
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
    });
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => {
      (m as THREE.MeshStandardMaterial).map?.dispose();
      m.dispose();
    });
    this.kit.dispose();
    this.renderer.dispose();
  }

  // ---------------------------------------------------------------- building

  private buildSky() {
    const top = new THREE.Color('#3f9cf0');
    const horizon = new THREE.Color('#d9f1ff');
    const geo = new THREE.SphereGeometry(1000, 24, 16);
    const cols: number[] = [];
    const pos = geo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp(pos.getY(i) / 1000, 0, 1);
      c.copy(horizon).lerp(top, Math.pow(t, 0.6));
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
    sky.renderOrder = -1;
    this.scene.add(sky);
    this.scene.background = horizon.clone();
    this.scene.fog = new THREE.Fog('#cfeaff', 90, 620);
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight('#e3f4ff', '#6d8f45', 1.25));
    const sun = new THREE.DirectionalLight('#fff1d2', 2.4);
    sun.castShadow = !this.opts.lite;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -42;
    sc.right = sc.top = 42;
    sc.near = 1;
    sc.far = 220;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  private buildIsland(board: Board) {
    const kit = this.kit;
    const seed = hashString(board.seed);

    // Sea with lazy low-poly waves, see-through enough to show the lagoon shelf beneath.
    const seaMat = new THREE.MeshStandardMaterial({
      color: '#2f9fd6',
      roughness: 0.35,
      flatShading: true,
      transparent: true,
      opacity: 0.82,
    });
    seaMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z += sin(position.x * 0.13 + uTime * 1.1) * 0.16 + cos(position.y * 0.17 + uTime * 0.8) * 0.12;`,
        );
    };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 160, 160), seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.6;
    sea.receiveShadow = true;
    this.scene.add(sea);

    const tileGeo = kit.geo('tile', () => new THREE.CylinderGeometry(R * 0.965, R * 0.98, 0.6, 6));
    const dirtGeo = kit.geo('dirt', () => new THREE.CylinderGeometry(R * 1.0, R * 1.0, 0.4, 6));
    const beachGeo = kit.geo('beach', () => new THREE.CylinderGeometry(R * 1.16, R * 1.24, 0.6, 6));
    const shelfGeo = kit.geo('shelf', () => new THREE.CylinderGeometry(R * 1.55, R * 1.7, 0.4, 6));
    const dirt = kit.mat('#b98f5c');
    const sand = kit.mat('#f0dca3');
    const shelf = kit.mat('#7fd8d0');
    const groundMats = new Map<Terrain, THREE.MeshStandardMaterial>();
    const groundMat = (t: Terrain) => {
      let m = groundMats.get(t);
      if (!m) {
        const g = GROUND[t];
        m = new THREE.MeshStandardMaterial({
          map: groundTexture(g.base, g.speck, seed + t.length * 97, g.strokes),
          roughness: 0.95,
        });
        groundMats.set(t, m);
      }
      return m;
    };

    const inst = new Instancer(kit, this.uTime, this.opts.lite);

    board.hexes.forEach((hex, i) => {
      const p = topo.hexPos[i];
      const cx = p.x * R;
      const cz = p.y * R;
      this.landHexes.push({ id: i, x: cx, z: cz });

      const tile = mesh(tileGeo, groundMat(hex.terrain), cx, -0.3, cz, false);
      tile.receiveShadow = true;
      this.scene.add(tile);
      this.scene.add(mesh(dirtGeo, dirt, cx, -0.32, cz, false));
      const b = mesh(beachGeo, sand, cx, -0.62, cz, false);
      b.receiveShadow = true;
      this.scene.add(b);
      this.scene.add(mesh(shelfGeo, shelf, cx, -1.25, cz, false));

      const rnd = mulberry(seed ^ Math.imul(i + 1, 0x9e3779b1));
      // Every tile is entered from an edge midpoint, facing its centre.
      const s = Math.PI / 6 + Math.floor(rnd() * 6) * (Math.PI / 3);
      const sd = dir(s);
      this.spawns.set(i, { x: cx + sd.x * R * 0.74, z: cz + sd.z * R * 0.74, yaw: s });
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      this.scene.add(g);
      const ctx: HexCtx = { g, cx, cz, rnd, spawnAngle: s, inst };

      if (hex.token !== null) {
        g.add(
          mesh(
            kit.geo('signPost', () => new THREE.CylinderGeometry(0.12, 0.14, 2.6, 6)),
            kit.mat('#7b5230'),
            0,
            1.3,
            0,
          ),
        );
        const sign = makeTokenSprite(hex.token);
        sign.position.set(0, 3.1, 0);
        g.add(sign);
        this.addCircle(cx, cz, 0.35);
      }

      switch (hex.terrain) {
        case 'moors':
          this.buildPasture(ctx);
          break;
        case 'witchwood':
          this.buildForest(ctx);
          break;
        case 'fields':
          this.buildFields(ctx);
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
    });

    for (const h of board.harbors) this.buildHarbor(h.edge, h.hex, h.kind);

    inst.flush(this.scene);

    const rnd = mulberry(seed ^ 0x51ed);
    // Far-off mountains and drifting clouds give the horizon some depth.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.2;
      const d = 520 + rnd() * 160;
      const m = makeMountain(kit, rnd, 40 + rnd() * 50, 50 + rnd() * 90);
      m.position.set(Math.sin(a) * d, -2, Math.cos(a) * d);
      m.traverse((o) => (o.castShadow = o.receiveShadow = false));
      this.scene.add(m);
    }
    for (let i = 0; i < (this.opts.lite ? 8 : 16); i++) {
      const c = makeCloud(kit, rnd);
      const a = rnd() * Math.PI * 2;
      const d = 40 + rnd() * 260;
      c.position.set(Math.sin(a) * d, 45 + rnd() * 35, Math.cos(a) * d);
      c.scale.multiplyScalar(1 + rnd());
      this.scene.add(c);
      this.clouds.push(c);
    }
  }

  private addCircle(x: number, z: number, r: number) {
    this.colliders.push({ ax: x, az: z, bx: x, bz: z, r });
  }

  /** Picks a spot inside the tile that keeps clear of the centre sign, the spawn point and `taken`. */
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
      if (taken.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + r)) continue;
      taken.push({ x, z, r });
      return { x, z };
    }
    return null;
  }

  private buildPasture(ctx: HexCtx) {
    const { g, cx, cz, rnd, kit } = { ...ctx, kit: this.kit };
    const a = ctx.spawnAngle + Math.PI; // barn sits opposite the gate
    const d = dir(a);
    const barn = makeBarn(kit);
    const bx = d.x * R * 0.34;
    const bz = d.z * R * 0.34;
    barn.position.set(bx, 0, bz);
    barn.rotation.y = a + Math.PI;
    g.add(barn);
    this.colliders.push({
      ax: cx + bx - d.x * 0.7,
      az: cz + bz - d.z * 0.7,
      bx: cx + bx + d.x * 0.7,
      bz: cz + bz + d.z * 0.7,
      r: 2.8,
    });

    // Hay bales beside the barn door and a water trough.
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
      avoid.push({ x: cx + hx, z: cz + hz, r: 1.1 });
    }
    const tr = makeTrough(kit);
    const tx = side.x * 4.2 - d.x * 1.2;
    const tz = side.z * 4.2 - d.z * 1.2;
    tr.position.set(tx, 0, tz);
    tr.rotation.y = a;
    g.add(tr);
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
      const rail = makeFenceRail(kit, len);
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
        pen: { cx, cz, r: F - 1.2, avoid },
      };
      rig.root.position.set(x, 0, z);
      this.scene.add(rig.root);
      this.sheep.push(sh);
    }

    // A few trees outside the fence.
    const taken: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const t = ctx.rnd() * Math.PI * 2;
      const diff = Math.abs(Math.atan2(Math.sin(t - gate), Math.cos(t - gate)));
      if (diff < 0.6) continue;
      const pd = dir(t);
      const x = pd.x * (F + 2.2);
      const z = pd.z * (F + 2.2);
      if (!inHex(x, z, 0, 0, R * 0.84) || taken.some((o) => Math.hypot(o.x - x, o.z - z) < 4))
        continue;
      taken.push({ x, z, r: 2 });
      ctx.inst.tree(cx + x, cz + z, rnd, rnd() < 0.5);
      this.addCircle(cx + x, cz + z, 0.6);
    }
  }

  private buildForest(ctx: HexCtx) {
    const taken: { x: number; z: number; r: number }[] = [];
    // A woodcutter's log pile near the centre.
    const logs = new THREE.Group();
    const logGeo = this.kit.geo('log', () => new THREE.CylinderGeometry(0.35, 0.35, 3, 8));
    const bark = this.kit.mat('#7a4f2b');
    [
      [-0.38, 0.35],
      [0.38, 0.35],
      [0, 0.95],
    ].forEach(([x, y]) => {
      const l = mesh(logGeo, bark, x, y, 0);
      l.rotation.x = Math.PI / 2;
      logs.add(l);
    });
    const lp = this.scatter(ctx, taken, 2.2, 0.55);
    if (lp) {
      logs.position.set(lp.x, 0, lp.z);
      logs.rotation.y = ctx.rnd() * Math.PI;
      ctx.g.add(logs);
      this.addCircle(ctx.cx + lp.x, ctx.cz + lp.z, 1.6);
    }
    for (let i = 0; i < 30; i++) {
      const p = this.scatter(ctx, taken, 1.5, 0.84);
      if (!p) continue;
      ctx.inst.tree(ctx.cx + p.x, ctx.cz + p.z, ctx.rnd, ctx.rnd() < 0.45);
      this.addCircle(ctx.cx + p.x, ctx.cz + p.z, 0.55);
    }
  }

  private buildFields(ctx: HexCtx) {
    const a = ctx.spawnAngle + Math.PI + 0.9;
    const d = dir(a);
    const mill = makeWindmill(this.kit);
    const mx = d.x * R * 0.45;
    const mz = d.z * R * 0.45;
    mill.root.position.set(mx, 0, mz);
    mill.root.rotation.y = a + Math.PI;
    ctx.g.add(mill.root);
    this.spinners.push(mill.blades);
    this.addCircle(ctx.cx + mx, ctx.cz + mz, 1.8);

    // Wheat in rows, leaving a footpath from the entrance to the sign.
    const sp = dir(ctx.spawnAngle);
    for (let x = -R; x <= R; x += 0.5) {
      for (let z = -R; z <= R; z += 0.5) {
        const jx = x + (ctx.rnd() - 0.5) * 0.25;
        const jz = z + (ctx.rnd() - 0.5) * 0.25;
        if (!inHex(jx, jz, 0, 0, R * 0.8)) continue;
        if (Math.hypot(jx, jz) < 2.2 || Math.hypot(jx - mx, jz - mz) < 4.2) continue;
        // Distance from the path line (centre → spawn).
        const along = jx * sp.x + jz * sp.z;
        const across = Math.abs(jx * sp.z - jz * sp.x);
        if (along > 0 && across < 1.1) continue;
        ctx.inst.wheat(ctx.cx + jx, ctx.cz + jz, ctx.rnd);
      }
    }
    // Freshly rolled bales beside the mill.
    for (const k of [-1, 1]) {
      const hb = makeHayBale(this.kit);
      hb.position.x = mx + d.x * 2.6 + d.z * 1.5 * k;
      hb.position.z = mz + d.z * 2.6 - d.x * 1.5 * k;
      hb.rotation.y = a;
      ctx.g.add(hb);
      this.addCircle(ctx.cx + hb.position.x, ctx.cz + hb.position.z, 0.8);
    }
  }

  private buildHills(ctx: HexCtx) {
    const taken: { x: number; z: number; r: number }[] = [];
    const kp = this.scatter(ctx, taken, 2.4, 0.6);
    if (kp) {
      const k = makeKiln(this.kit);
      k.position.set(kp.x, 0, kp.z);
      k.rotation.y = Math.atan2(-kp.x, -kp.z);
      ctx.g.add(k);
      this.addCircle(ctx.cx + kp.x, ctx.cz + kp.z, 1.8);
    }
    for (let i = 0; i < 2; i++) {
      const p = this.scatter(ctx, taken, 1.4, 0.65);
      if (!p) continue;
      const s = makeBrickStack(this.kit);
      s.position.set(p.x, 0, p.z);
      s.rotation.y = ctx.rnd() * Math.PI;
      ctx.g.add(s);
      this.addCircle(ctx.cx + p.x, ctx.cz + p.z, 1.0);
    }
    const moundGeo = this.kit.geo('mound', () => new THREE.IcosahedronGeometry(1, 1));
    for (let i = 0; i < 5; i++) {
      const r = 1.8 + ctx.rnd() * 1.6;
      const p = this.scatter(ctx, taken, r, 0.82);
      if (!p) continue;
      const m = mesh(moundGeo, this.kit.mat(ctx.rnd() < 0.5 ? '#b5643c' : '#c4744a'), p.x, 0, p.z);
      m.scale.set(r, r * 0.55, r * (0.8 + ctx.rnd() * 0.4));
      ctx.g.add(m);
      this.addCircle(ctx.cx + p.x, ctx.cz + p.z, r * 0.85);
    }
    for (let i = 0; i < 5; i++) {
      const p = this.scatter(ctx, taken, 0.6, 0.82);
      if (!p) continue;
      const b = makeBoulder(this.kit, ctx.rnd, 0.5, '#a0593a');
      b.position.x = p.x;
      b.position.z = p.z;
      ctx.g.add(b);
    }
  }

  private buildMountains(ctx: HexCtx) {
    const base = ctx.spawnAngle + Math.PI;
    for (let i = 0; i < 3; i++) {
      const a = base + (i - 1) * 1.15;
      const d = dir(a);
      const r = 3.8 + ctx.rnd() * 0.9;
      const m = makeMountain(this.kit, ctx.rnd, r, 8 + ctx.rnd() * 5);
      const dist = R * 0.52;
      m.position.set(d.x * dist, 0, d.z * dist);
      m.rotation.y = ctx.rnd() * Math.PI;
      ctx.g.add(m);
      this.addCircle(ctx.cx + d.x * dist, ctx.cz + d.z * dist, r * 0.92);
    }
    // Ore outcrops flank the way in, leaving the view to the peaks clear.
    for (const off of [-1.05, 1.05]) {
      const d = dir(ctx.spawnAngle + off);
      const dist = R * (0.42 + ctx.rnd() * 0.1);
      const o = makeOreRock(this.kit, ctx.rnd);
      o.position.set(d.x * dist, 0, d.z * dist);
      ctx.g.add(o);
      this.addCircle(ctx.cx + d.x * dist, ctx.cz + d.z * dist, 1.2);
    }
  }

  private buildDesert(ctx: HexCtx) {
    const taken: { x: number; z: number; r: number }[] = [];
    const duneGeo = this.kit.geo('dune', () => new THREE.IcosahedronGeometry(1, 1));
    for (let i = 0; i < 4; i++) {
      const r = 3 + ctx.rnd() * 2;
      const p = this.scatter(ctx, taken, r * 0.6, 0.8);
      if (!p) continue;
      const m = mesh(duneGeo, this.kit.mat('#e2c98d'), p.x, -0.1, p.z);
      m.scale.set(r, 0.7, r * 0.7);
      m.rotation.y = ctx.rnd() * Math.PI;
      ctx.g.add(m);
    }
    for (let i = 0; i < 5; i++) {
      const p = this.scatter(ctx, taken, 0.8, 0.8);
      if (!p) continue;
      const c = makeCactus(this.kit, ctx.rnd);
      c.position.set(p.x, 0, p.z);
      c.rotation.y = ctx.rnd() * Math.PI;
      ctx.g.add(c);
      this.addCircle(ctx.cx + p.x, ctx.cz + p.z, 0.5);
    }
    for (let i = 0; i < 4; i++) {
      const p = this.scatter(ctx, taken, 1, 0.8);
      if (!p) continue;
      const b = makeBoulder(this.kit, ctx.rnd, 0.6 + ctx.rnd() * 0.7, '#cdb88f');
      b.position.x = p.x;
      b.position.z = p.z;
      ctx.g.add(b);
      this.addCircle(ctx.cx + p.x, ctx.cz + p.z, 0.6);
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
    this.scene.add(dock);
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
    this.scene.add(boat);
    this.boats.push({ obj: boat, phase: hex * 1.7, y: -0.5 });
    this.colliders.push({
      ax: boat.position.x - nx * 1.6,
      az: boat.position.z - nz * 1.6,
      bx: boat.position.x + nx * 1.8,
      bz: boat.position.z + nz * 1.8,
      r: 0.9,
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
        b.obj.position.y = b.y + Math.sin(t * 1.4 + b.phase) * 0.12;
        b.obj.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.05;
      }
      for (const c of this.clouds) {
        c.position.x += dt * 1.6;
        if (c.position.x > 320) c.position.x = -320;
      }
      if (this.robber) this.robber.position.y = 0.1 + Math.sin(t * 2) * 0.1;
    }
    this.maybeBleat(dt);

    // Keep the sun's shadow box centred on the walker.
    this.sun.position.set(this.x + 34, 60, this.z + 22);
    this.sun.target.position.set(this.x, 0, this.z);

    this.camera.position.set(this.x, EYE + this.bob, this.z);
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
    const moving = Math.abs(dx) + Math.abs(dz) > 1e-5;
    if (moving) {
      // Try the full step, then slide along each axis.
      if (!this.tryMove(this.x + dx, this.z + dz) && !this.tryMove(this.x + dx, this.z))
        this.tryMove(this.x, this.z + dz);
    }
    if (!this.opts.reduceMotion) {
      this.bob = moving
        ? Math.sin(performance.now() / (running ? 95 : 140)) * 0.06
        : this.bob * 0.85;
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
    rig.root.position.set(s.x, 0, s.z);
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
    rig.root.position.y = walking ? Math.abs(Math.sin(s.gait)) * 0.04 * s.speed : 0;
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
  inst: Instancer;
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

/** Collects trees and wheat across all tiles and draws each part as one instanced mesh. */
class Instancer {
  private trunks: THREE.Matrix4[] = [];
  private blocks: THREE.Matrix4[] = [];
  private cones: THREE.Matrix4[] = [];
  private wheatM: THREE.Matrix4[] = [];
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private kit: Kit,
    private uTime: { value: number },
    private lite: boolean,
  ) {}

  private at(
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rot: number,
  ): THREE.Matrix4 {
    this.q.setFromAxisAngle(this.up, rot);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      this.q,
      new THREE.Vector3(sx, sy, sz),
    );
  }

  tree(x: number, z: number, rnd: () => number, pine: boolean) {
    const s = 0.85 + rnd() * 0.5;
    const rot = rnd() * Math.PI;
    this.trunks.push(this.at(x, 0, z, s, s * (pine ? 0.8 : 1), s, rot));
    if (pine) {
      // Three stacked tiers.
      for (let i = 0; i < 3; i++)
        this.cones.push(
          this.at(
            x,
            (1.4 + i * 1.3) * s,
            z,
            s * (1.25 - i * 0.3),
            s,
            s * (1.25 - i * 0.3),
            rot + i,
          ),
        );
    } else {
      // The chunky, cube-ish canopy from the reference.
      this.blocks.push(this.at(x, 2.2 * s, z, s * 2.6, s * 2.2, s * 2.6, rot));
      this.blocks.push(this.at(x, 3.7 * s, z, s * 1.7, s * 1.3, s * 1.7, rot + 0.4));
    }
  }

  wheat(x: number, z: number, rnd: () => number) {
    const s = 0.85 + rnd() * 0.35;
    this.wheatM.push(this.at(x, 0, z, 1, s, 1, rnd() * Math.PI));
  }

  flush(scene: THREE.Scene) {
    const kit = this.kit;
    const trunkGeo = kit.geo('trunk', () => new THREE.BoxGeometry(0.5, 2, 0.5).translate(0, 1, 0));
    const blockGeo = kit.geo('canopy', () =>
      new THREE.BoxGeometry(1, 1, 1, 2, 2, 2).translate(0, 0, 0),
    );
    const coneGeo = kit.geo('pine', () => new THREE.ConeGeometry(1.5, 2, 7).translate(0, 1, 0));
    const wheatGeo = kit.geo('wheat', () => {
      const stalk = new THREE.BoxGeometry(0.06, 1.0, 0.06).translate(0, 0.5, 0);
      const ear = new THREE.BoxGeometry(0.15, 0.36, 0.15).translate(0, 1.16, 0);
      const ear2 = new THREE.BoxGeometry(0.12, 0.28, 0.12).translate(0.16, 0.92, 0.08).rotateY(2.1);
      const g = mergeGeometries([stalk, ear, ear2])!;
      stalk.dispose();
      ear.dispose();
      ear2.dispose();
      return g;
    });

    const leafBlock = new THREE.MeshStandardMaterial({
      color: '#5aae3c',
      flatShading: true,
      roughness: 0.9,
    });
    const leafPine = new THREE.MeshStandardMaterial({
      color: '#2f8a46',
      flatShading: true,
      roughness: 0.9,
    });
    const wheatMat = new THREE.MeshStandardMaterial({
      color: '#f0c85a',
      flatShading: true,
      roughness: 0.9,
    });
    if (!this.lite) {
      addSway(leafBlock, this.uTime, 0.08);
      addSway(leafPine, this.uTime, 0.04);
      addSway(wheatMat, this.uTime, 0.1);
    }
    const add = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      list: THREE.Matrix4[],
      shadow: boolean,
    ) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadow;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      scene.add(im);
    };
    add(trunkGeo, kit.mat('#7a4f2b'), this.trunks, true);
    add(blockGeo, leafBlock, this.blocks, true);
    add(coneGeo, leafPine, this.cones, true);
    add(wheatGeo, wheatMat, this.wheatM, false);
  }
}
