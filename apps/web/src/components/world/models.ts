import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isShared } from './assets';
import { fbm } from './terrain';

/**
 * Low-poly models for the 3D walk, built from primitives (no asset files). Every model faces
 * +Z and stands on y = 0, in metres. Materials and geometries are shared through a per-world
 * `Kit` so the whole scene can be disposed in one sweep, and static models are "baked" (merged
 * per material) so a detailed house costs a handful of draw calls.
 *
 * Materials are physically based and tuned by what they are: rough foliage, cloth and plaster,
 * slightly glossier timber and stone, controlled metal, so the late-afternoon sun and the sky's
 * fill light read differently on each.
 */

/** GLSL for a gentle wind sway on instanced foliage (taller vertices move more). */
export function swayGlsl(amount: number): string {
  return `
    #ifdef USE_INSTANCING
      vec3 ip = vec3(instanceMatrix[3]);
    #else
      vec3 ip = vec3(0.0);
    #endif
    float swayH = max(transformed.y, 0.0);
    transformed.x += sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.23) * swayH * ${amount.toFixed(3)};
    transformed.z += cos(uTime * 1.3 + ip.x * 0.19) * swayH * ${(amount * 0.6).toFixed(3)};`;
}

/** Adds the foliage sway to a material (instanced trees, grass). */
export function addSway(m: THREE.Material, uTime: { value: number }, amount: number): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>${swayGlsl(amount)}`);
  };
  m.customProgramCacheKey = () => `sway${amount}`;
}

export interface MatOpts {
  emissive?: string;
  emissiveIntensity?: number;
  /** 0 = mirror, 1 = chalk. Defaults to 0.85 (plaster, cloth, foliage, earth). */
  roughness?: number;
  /** 1 for bare metal; keep it on small parts so highlights stay controlled. */
  metalness?: number;
  /** Smooth normals (round things); otherwise faces are flat-shaded, low-poly style. */
  smooth?: boolean;
  vertexColors?: boolean;
  side?: THREE.Side;
}

/** Material presets by what a thing is made of. */
export const WOOD: MatOpts = { roughness: 0.72 };
export const STONE: MatOpts = { roughness: 0.9 };
export const METAL: MatOpts = { roughness: 0.38, metalness: 0.85 };
export const CLOTH: MatOpts = { roughness: 0.95, smooth: true };

export class Kit {
  private mats = new Map<string, THREE.Material>();
  private geos = new Map<string, THREE.BufferGeometry>();
  private templates = new Map<string, THREE.Object3D>();

  /** A shared lit material for a colour and finish. */
  mat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
    const key = `std|${color}|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.roughness ?? ''}|${o.metalness ?? ''}|${o.smooth ? 1 : 0}|${o.vertexColors ? 1 : 0}|${o.side ?? ''}`;
    let m = this.mats.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: o.roughness ?? 0.85,
        metalness: o.metalness ?? 0,
        emissive: o.emissive ?? '#000000',
        emissiveIntensity: o.emissiveIntensity ?? 1,
        flatShading: !o.smooth,
        vertexColors: o.vertexColors ?? false,
        side: o.side ?? THREE.FrontSide,
      });
      this.mats.set(key, m);
    }
    return m;
  }

  /** Registers a material made elsewhere so it is disposed with the world. */
  ownMat<T extends THREE.Material>(m: T): T {
    this.mats.set(`own${this.mats.size}:${m.uuid}`, m);
    return m;
  }

  /** An unlit, see-through material (contact shadows, foam). */
  basic(color: string, opacity: number): THREE.MeshBasicMaterial {
    const key = `basic|${color}|${opacity}`;
    let m = this.mats.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      this.mats.set(key, m);
    }
    return m;
  }

  /** A soft, pale puff of haze; shared per opacity. */
  mist(opacity: number): THREE.SpriteMaterial {
    const key = `mist|${opacity}`;
    let m = this.mats.get(key) as THREE.SpriteMaterial | undefined;
    if (!m) {
      const size = 128;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(240,246,250,0.9)');
      g.addColorStop(0.5, 'rgba(232,240,246,0.35)');
      g.addColorStop(1, 'rgba(226,236,244,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
      m = new THREE.SpriteMaterial({ map, transparent: true, opacity, depthWrite: false });
      this.mats.set(key, m);
    }
    return m;
  }

  /** A soft, round contact shadow (radial falloff, no hard edge). */
  blobShadow(): THREE.MeshBasicMaterial {
    let m = this.mats.get('blobShadow') as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      const size = 64;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(14,26,24,0.45)');
      g.addColorStop(0.6, 'rgba(14,26,24,0.2)');
      g.addColorStop(1, 'rgba(14,26,24,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const map = new THREE.CanvasTexture(c);
      m = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
      this.mats.set('blobShadow', m);
    }
    return m;
  }

  geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
    let g = this.geos.get(key) as T | undefined;
    if (!g) {
      g = make();
      this.geos.set(key, g);
    }
    return g;
  }

  /** Registers a one-off geometry so it is disposed with the world. */
  own<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.set(`own${this.geos.size}:${g.uuid}`, g);
    return g;
  }

  box(w: number, h: number, d: number): THREE.BufferGeometry {
    return this.geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  }

  /** A box with chamfered edges: the bevels catch the light like worked timber and stone. */
  rbox(w: number, h: number, d: number, r = 0.06): THREE.BufferGeometry {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    return this.geo(`rbox${w},${h},${d},${rr}`, () => chamferBox(w, h, d, rr));
  }

  /** Builds a model once, bakes it, and hands out cheap clones that share its geometry. */
  template(key: string, make: () => THREE.Object3D): THREE.Object3D {
    let t = this.templates.get(key);
    if (!t) {
      t = make();
      bake(t, this);
      this.templates.set(key, t);
    }
    return t.clone();
  }

  dispose(): void {
    this.mats.forEach((m) => {
      if (isShared(m)) return;
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map && !isShared(map)) map.dispose();
      m.dispose();
    });
    this.geos.forEach((g) => !isShared(g) && g.dispose());
    this.mats.clear();
    this.geos.clear();
    this.templates.clear();
  }
}

/**
 * A centred box whose 12 edges are bevelled by `r` (44 triangles, flat-shaded): six inset
 * faces, a bevel strip along each edge and a small triangle at each corner.
 */
function chamferBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2];
  // V(corner signs, axis): the corner, pulled in by r along the two other axes.
  const V = (s: number[], a: number) => s.map((sg, i) => sg * (i === a ? half[i] : half[i] - r));
  const pos: number[] = [];
  const centroid = new THREE.Vector3();
  const tri = (p: number[][]) => {
    const [a, b, c] = p.map((q) => new THREE.Vector3(q[0], q[1], q[2]));
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    centroid.copy(a).add(b).add(c);
    // Keep every face wound outwards (the box is convex and centred on the origin).
    const o = n.dot(centroid) < 0 ? [a, c, b] : [a, b, c];
    for (const v of o) pos.push(v.x, v.y, v.z);
  };
  const quad = (p: number[][]) => {
    tri([p[0], p[1], p[2]]);
    tri([p[0], p[2], p[3]]);
  };
  const S = [-1, 1];
  for (let a = 0; a < 3; a++) {
    const [b, c] = [(a + 1) % 3, (a + 2) % 3];
    for (const sa of S) {
      // Face perpendicular to axis a.
      const corner = (sb: number, sc: number) => {
        const s = [0, 0, 0];
        s[a] = sa;
        s[b] = sb;
        s[c] = sc;
        return V(s, a);
      };
      quad([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]);
      // Bevel strip along the edge where face a meets face b, running along axis c.
      for (const sb of S) {
        const e = (sc: number, onA: boolean) => {
          const s = [0, 0, 0];
          s[a] = sa;
          s[b] = sb;
          s[c] = sc;
          return V(s, onA ? a : b);
        };
        quad([e(-1, true), e(1, true), e(1, false), e(-1, false)]);
      }
    }
  }
  for (const sx of S) for (const sy of S) for (const sz of S) tri([0, 1, 2].map((a) => V([sx, sy, sz], a)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  shadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
}

/** Lighter (dl > 0) or darker (dl < 0) version of a colour. */
export function shade(hex: string, dl: number, ds = 0): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, ds, dl);
  return `#${c.getHexString()}`;
}

/**
 * Merges every static mesh under `root` (children flagged `userData.dynamic` are left alone so
 * they can still move). With a kit, plain lit materials fold their colour into vertex colours
 * and merge by finish (roughness, metalness, glow, flat or smooth), so a whole island of props
 * costs a few draw calls rather than one per colour.
 */
export function bake(root: THREE.Object3D, kit?: Kit): void {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  const buckets = new Map<
    string,
    { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }
  >();
  const done: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    if (o !== root && o.userData.dynamic) return;
    for (const c of o.children) walk(c);
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material))
      return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes))
      if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color')
        g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv)
      g.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2),
      );
    g.clearGroups();
    rel.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(rel);
    let mat = m.material;
    const std = mat as THREE.MeshStandardMaterial;
    if (kit && std.isMeshStandardMaterial && !std.map && !std.transparent) {
      const n = g.attributes.position.count;
      const src = std.vertexColors ? (g.attributes.color as THREE.BufferAttribute | undefined) : undefined;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++)
        col.set(
          src
            ? [src.getX(i) * std.color.r, src.getY(i) * std.color.g, src.getZ(i) * std.color.b]
            : [std.color.r, std.color.g, std.color.b],
          i * 3,
        );
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      mat = kit.mat('#ffffff', {
        roughness: std.roughness,
        metalness: std.metalness,
        emissive: `#${std.emissive.getHexString()}`,
        emissiveIntensity: std.emissiveIntensity,
        smooth: !std.flatShading,
        vertexColors: true,
        side: std.side,
      });
    }
    // Vertex-coloured geometry only merges with others that have colours too.
    const key = `${mat.uuid}|${m.castShadow}|${'color' in g.attributes}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, geos: [] }));
    b.geos.push(g);
    done.push(m);
  };
  walk(root);
  for (const m of done) m.removeFromParent();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    kit?.own(merged);
    const out = new THREE.Mesh(merged, b.mat);
    out.castShadow = b.cast;
    out.receiveShadow = true;
    root.add(out);
  }
}

/** A triangular prism spanning `w` (x) and `d` (z), apex `h` above y = 0. */
function gableGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

/**
 * A pitched roof (ridge along z) made of overlapping shingle courses that alternate
 * between two shades, with a ridge cap on top.
 */
function shingleRoof(
  kit: Kit,
  hw: number,
  h: number,
  d: number,
  color: string,
  opts: { overhang?: number; rows?: number; thickness?: number } = {},
): THREE.Group {
  const g = new THREE.Group();
  const over = opts.overhang ?? 0.35;
  const rows = opts.rows ?? 5;
  const th = opts.thickness ?? 0.16;
  const ang = Math.atan2(h, hw);
  const L = Math.hypot(hw, h) + over;
  const rowW = (L / rows) * 1.25;
  const len = d + over * 2;
  const tones = [color, shade(color, -0.05), shade(color, 0.03)];
  for (const side of [-1, 1]) {
    const down = { x: side * Math.cos(ang), y: -Math.sin(ang) };
    const out = { x: side * Math.sin(ang), y: Math.cos(ang) };
    for (let i = 0; i < rows; i++) {
      const s = (i + 0.5) * (L / rows) + 0.05;
      const m = mesh(kit.rbox(rowW, th, len, 0.05), kit.mat(tones[i % tones.length]));
      // Each course tips out a little more than the one above, so the edges step.
      m.rotation.z = -side * (ang - 0.06);
      m.position.set(
        down.x * s + out.x * (th / 2 + 0.04),
        h + down.y * s + out.y * (th / 2 + 0.04),
        0,
      );
      g.add(m);
    }
  }
  const cap = mesh(
    kit.rbox(0.34, 0.3, len + 0.1, 0.08),
    kit.mat(shade(color, -0.12)),
    0,
    h + 0.14,
    0,
  );
  cap.rotation.z = Math.PI / 4;
  g.add(cap);
  return g;
}

/** A framed, glowing window with a cross mullion; optional shutters. */
function windowPanel(kit: Kit, w: number, h: number, shutter?: string): THREE.Group {
  const g = new THREE.Group();
  const frame = kit.mat('#f7f1e3');
  g.add(mesh(kit.rbox(w + 0.16, h + 0.16, 0.08, 0.03), frame, 0, 0, 0, false));
  g.add(
    mesh(
      kit.box(w, h, 0.06),
      kit.mat('#ffd98a', { emissive: '#ffa336', emissiveIntensity: 0.35, roughness: 0.25 }),
      0,
      0,
      0.03,
      false,
    ),
  );
  const bar = kit.mat('#5a3d24');
  g.add(mesh(kit.box(0.05, h, 0.04), bar, 0, 0, 0.07, false));
  g.add(mesh(kit.box(w, 0.05, 0.04), bar, 0, 0, 0.07, false));
  g.add(mesh(kit.rbox(w + 0.3, 0.08, 0.2, 0.03), frame, 0, -h / 2 - 0.1, 0.06, false));
  if (shutter) {
    for (const s of [-1, 1]) {
      const sh = mesh(
        kit.rbox(w * 0.5, h + 0.1, 0.06, 0.02),
        kit.mat(shutter),
        s * (w * 0.75 + 0.12),
        0,
        0.02,
        false,
      );
      g.add(sh);
      g.add(
        mesh(
          kit.box(w * 0.4, 0.04, 0.03),
          kit.mat(shade(shutter, -0.12)),
          s * (w * 0.75 + 0.12),
          0,
          0.06,
          false,
        ),
      );
    }
  }
  return g;
}

function flowerBox(kit: Kit, w: number, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(kit.rbox(w, 0.18, 0.22, 0.04), kit.mat('#7b5230'), 0, 0, 0, false));
  g.add(mesh(kit.box(w - 0.08, 0.06, 0.16), kit.mat('#4f9a3a'), 0, 0.1, 0, false));
  const bloom = kit.geo('bloom', () => new THREE.IcosahedronGeometry(0.06, 0));
  const colors = ['#c2402b', '#e6c450', '#f2eee2', '#8576ac', '#f2eee2'];
  for (let x = -w / 2 + 0.08; x < w / 2 - 0.04; x += 0.11)
    g.add(
      mesh(
        bloom,
        kit.mat(colors[Math.floor(rnd() * colors.length)]),
        x,
        0.16 + rnd() * 0.04,
        (rnd() - 0.5) * 0.08,
        false,
      ),
    );
  return g;
}

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

/** Points spread evenly over a unit sphere. */
function fibonacci(n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    out.push(new THREE.Vector3(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r));
  }
  return out;
}

// ------------------------------------------------------------------ sheep

export interface SheepRig {
  root: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  eyes: THREE.Object3D[];
  tail: THREE.Object3D;
}

const WOOL = ['#f8f5ee', '#f3eee3', '#efe7d8'];

/** A fluffy fleece: a core plus soft lumps spread over an ellipsoid, baked into one mesh. */
function fleece(kit: Kit, color: string, variant: number): THREE.Object3D {
  return kit.template(`fleece${color}${variant}`, () => {
    const g = new THREE.Group();
    const wool = kit.mat(color, CLOTH);
    const puff = kit.geo('woolPuff', () => new THREE.IcosahedronGeometry(1, 2));
    const rnd = mulberry(0x5eed + variant * 977);
    const core = mesh(puff, wool, 0, 0.7, -0.02);
    core.scale.set(0.38, 0.33, 0.52);
    g.add(core);
    for (const p of fibonacci(26)) {
      if (p.y < -0.45) continue; // belly stays slim so the legs show
      const r = 0.15 + rnd() * 0.07;
      const m = mesh(puff, wool, p.x * 0.36, 0.7 + p.y * 0.3, p.z * 0.5);
      m.scale.setScalar(r);
      g.add(m);
    }
    return g;
  });
}

export function makeSheep(kit: Kit, rnd: () => number): SheepRig {
  const root = new THREE.Group();
  const black = rnd() < 0.1;
  const lamb = rnd() < 0.22;
  const woolColor = black ? '#45403d' : WOOL[Math.floor(rnd() * WOOL.length)];
  const wool = kit.mat(woolColor, CLOTH);
  // One finish for skin, hooves and wool, so each moving part merges into a single mesh.
  const skin = kit.mat(black ? '#1d1714' : '#2e2420', CLOTH);
  const muzzleMat = kit.mat(black ? '#2b2420' : '#4a3b34', CLOTH);
  const pink = kit.mat('#d99a8e', CLOTH);
  const hoofMat = kit.mat('#17110f', CLOTH);
  const puff = kit.geo('woolPuff', () => new THREE.IcosahedronGeometry(1, 2));

  root.add(fleece(kit, woolColor, Math.floor(rnd() * 3)));
  // Soft contact shadow so the flock sits on the grass even without shadow maps.
  const blob = mesh(
    kit.geo('blob', () => new THREE.CircleGeometry(0.55, 20)),
    kit.blobShadow(),
    0,
    0.03,
    0,
    false,
  );
  blob.rotation.x = -Math.PI / 2;
  blob.scale.set(0.9, 1.3, 1);
  root.add(blob);

  const head = new THREE.Group();
  head.position.set(0, 0.88, 0.6);
  const face = mesh(kit.rbox(0.3, 0.34, 0.42, 0.11), skin, 0, -0.03, 0.16);
  face.rotation.x = 0.28;
  head.add(face);
  head.add(mesh(kit.rbox(0.24, 0.18, 0.16, 0.07), muzzleMat, 0, -0.14, 0.34));
  for (const s of [-1, 1])
    head.add(mesh(kit.box(0.04, 0.03, 0.02), hoofMat, s * 0.05, -0.11, 0.425, false));
  // Wool cap.
  for (const [x, y, z, r] of [
    [0, 0.14, 0.02, 0.12],
    [0.07, 0.11, -0.05, 0.1],
    [-0.07, 0.11, -0.05, 0.1],
  ]) {
    const cap = mesh(puff, wool, x, y, z);
    cap.scale.setScalar(r);
    head.add(cap);
  }
  // Drooping ears with pink insides.
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.17, 0.07, 0.03);
    ear.rotation.set(0.2, s * 0.35, s * -0.75);
    const outer = mesh(puff, skin, s * 0.1, 0, 0);
    outer.scale.set(0.12, 0.035, 0.065);
    const inner = mesh(puff, pink, s * 0.11, 0.015, 0.0);
    inner.scale.set(0.085, 0.02, 0.04);
    ear.add(outer, inner);
    head.add(ear);
  }
  // Big friendly eyes on the sides of the face.
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.15, 0.05, 0.22);
    eye.rotation.y = s * 0.55;
    const white = mesh(puff, kit.mat('#ffffff', { smooth: true, roughness: 0.4 }), 0, 0, 0, false);
    white.scale.set(0.055, 0.06, 0.03);
    const pupil = mesh(
      puff,
      kit.mat('#0d0d0d', { smooth: true, roughness: 0.3 }),
      0,
      -0.005,
      0.022,
      false,
    );
    pupil.scale.set(0.032, 0.04, 0.015);
    const glint = mesh(
      puff,
      kit.mat('#ffffff', { smooth: true, emissive: '#ffffff', emissiveIntensity: 0.6 }),
      0.012,
      0.015,
      0.034,
      false,
    );
    glint.scale.setScalar(0.01);
    eye.add(white, pupil, glint);
    head.add(eye);
  }
  root.add(head);

  const legs: THREE.Group[] = [];
  const legGeo = kit.rbox(0.1, 0.4, 0.1, 0.035);
  const hoofGeo = kit.rbox(0.12, 0.08, 0.13, 0.03);
  for (const [x, z] of [
    [0.16, 0.27],
    [-0.16, 0.27],
    [0.16, -0.3],
    [-0.16, -0.3],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.46, z);
    pivot.add(mesh(legGeo, skin, 0, -0.22, 0));
    pivot.add(mesh(hoofGeo, hoofMat, 0, -0.42, 0.01));
    const sleeve = mesh(puff, wool, 0, -0.03, 0);
    sleeve.scale.set(0.11, 0.1, 0.11);
    pivot.add(sleeve);
    root.add(pivot);
    legs.push(pivot);
  }

  const tail = new THREE.Group();
  tail.position.set(0, 0.78, -0.6);
  const tuft = mesh(puff, wool, 0, -0.05, -0.03);
  tuft.scale.set(0.09, 0.12, 0.08);
  tail.add(tuft);
  root.add(tail);

  root.scale.setScalar(lamb ? 0.62 : 0.92 + rnd() * 0.16);
  // Each moving part merges into a mesh or two (colours become vertex colours); the eyes are
  // baked into the head, so they no longer blink.
  for (const part of [head, tail, ...legs]) {
    part.userData.dynamic = true;
    bake(part, kit);
  }
  bake(root, kit);
  return { root, head, legs, eyes: [], tail };
}

// ------------------------------------------------------------------ farm

export function makeBarn(kit: Kit): THREE.Object3D {
  return kit.template('barn', () => {
    const g = new THREE.Group();
    const red = kit.mat('#7a5434', WOOD);
    const board = kit.mat('#5e3e24', WOOD);
    const trim = kit.mat('#d9c9a4', WOOD);
    const stone = kit.mat('#9a978f', STONE);
    const w = 5.2;
    const h = 3.3;
    const d = 6.4;
    const rise = 2.3;
    g.add(mesh(kit.rbox(w + 0.3, 0.5, d + 0.3, 0.08), stone, 0, 0.25, 0));
    for (let i = 0; i < 14; i++) {
      const sx = (i % 7) * ((w + 0.3) / 6) - (w + 0.3) / 2;
      const sz = i < 7 ? d / 2 + 0.16 : -d / 2 - 0.16;
      g.add(
        mesh(
          kit.rbox(0.55, 0.32, 0.12, 0.05),
          kit.mat(i % 2 ? '#8c8a84' : '#a8a59c', STONE),
          sx,
          0.22,
          sz,
          false,
        ),
      );
    }
    g.add(mesh(kit.box(w, h - 0.5, d), red, 0, 0.5 + (h - 0.5) / 2, 0));
    // Vertical board-and-batten siding.
    const batten = kit.box(0.1, h - 0.6, 0.05);
    for (let z = -d / 2 + 0.4; z < d / 2 - 0.2; z += 0.55)
      for (const s of [-1, 1]) {
        const b = mesh(batten, board, s * (w / 2 + 0.02), 0.5 + (h - 0.5) / 2, z, false);
        b.rotation.y = Math.PI / 2;
        g.add(b);
      }
    for (let x = -w / 2 + 0.35; x < w / 2 - 0.2; x += 0.55) {
      if (Math.abs(x) > 1.4)
        g.add(mesh(batten, board, x, 0.5 + (h - 0.5) / 2, d / 2 + 0.02, false));
      g.add(mesh(batten, board, x, 0.5 + (h - 0.5) / 2, -d / 2 - 0.02, false));
    }
    g.add(
      mesh(
        kit.geo('barnGable', () => gableGeo(w, rise, d)),
        red,
        0,
        h,
        0,
      ),
    );
    // White trim: corners, eaves band and the gable edges.
    for (const x of [-w / 2, w / 2])
      for (const z of [-d / 2, d / 2])
        g.add(mesh(kit.rbox(0.24, h - 0.4, 0.24, 0.04), trim, x, 0.5 + (h - 0.5) / 2, z, false));
    for (const z of [-d / 2 - 0.04, d / 2 + 0.04]) {
      g.add(mesh(kit.box(w + 0.2, 0.18, 0.08), trim, 0, h, z, false));
      for (const s of [-1, 1]) {
        const e = mesh(
          kit.box(Math.hypot(w / 2, rise) + 0.2, 0.2, 0.1),
          trim,
          (s * w) / 4,
          h + rise / 2,
          z,
          false,
        );
        e.rotation.z = -s * Math.atan2(rise, w / 2);
        g.add(e);
      }
    }
    const r = shingleRoof(kit, w / 2, rise, d, '#c2a25e', { rows: 6, overhang: 0.45, thickness: 0.24 });
    r.position.y = h;
    g.add(r);

    // Big front door with the classic white cross, and a lantern above it.
    const door = new THREE.Group();
    door.position.set(0, 1.55, d / 2 + 0.06);
    door.add(mesh(kit.box(2.5, 2.4, 0.1), kit.mat('#5e3a20', WOOD), 0, 0, 0));
    for (const [x, y, w2, h2, rot] of [
      [0, 1.18, 2.6, 0.18, 0],
      [0, -1.18, 2.6, 0.18, 0],
      [-1.22, 0, 0.18, 2.5, 0],
      [1.22, 0, 0.18, 2.5, 0],
      [0, 0, 0.16, 3.2, 0.79],
      [0, 0, 0.16, 3.2, -0.79],
    ] as const) {
      const b = mesh(kit.box(w2, h2, 0.08), trim, x, y, 0.07, false);
      b.rotation.z = rot;
      door.add(b);
    }
    g.add(door);
    g.add(
      mesh(
        kit.rbox(0.3, 0.38, 0.3, 0.05),
        kit.mat('#ffcf6b', { emissive: '#ffa030', emissiveIntensity: 0.8 }),
        0,
        3.15,
        d / 2 + 0.25,
        false,
      ),
    );
    g.add(mesh(kit.rbox(0.42, 0.1, 0.42, 0.03), kit.mat('#2f2a26'), 0, 3.38, d / 2 + 0.25, false));
    // Hay-loft hatch with hay peeking out.
    g.add(mesh(kit.rbox(1.3, 1.15, 0.1, 0.03), trim, 0, h + 0.8, d / 2 + 0.05, false));
    g.add(mesh(kit.box(1.0, 0.85, 0.12), kit.mat('#3a2a1e'), 0, h + 0.8, d / 2 + 0.06, false));
    g.add(mesh(kit.rbox(0.9, 0.3, 0.3, 0.1), kit.mat('#e6c35a'), 0, h + 0.5, d / 2 + 0.05, false));
    // Side windows.
    for (const s of [-1, 1])
      for (const z of [-1.6, 1.6]) {
        const win = windowPanel(kit, 0.7, 0.7);
        win.position.set(s * (w / 2 + 0.05), 2.1, z);
        win.rotation.y = (s * Math.PI) / 2;
        g.add(win);
      }
    // Cupola and weathervane on the ridge.
    const cup = new THREE.Group();
    cup.position.set(0, h + rise + 0.2, 0);
    cup.add(mesh(kit.rbox(1.1, 1.0, 1.1, 0.05), trim, 0, 0.5, 0));
    for (const s of [-1, 1]) {
      cup.add(mesh(kit.box(0.7, 0.55, 0.06), kit.mat('#3a2a1e'), 0, 0.55, s * 0.56, false));
      cup.add(mesh(kit.box(0.06, 0.55, 0.7), kit.mat('#3a2a1e'), s * 0.56, 0.55, 0, false));
    }
    const cupRoof = mesh(
      kit.geo('cupRoof', () => new THREE.ConeGeometry(1.0, 0.8, 4)),
      kit.mat('#a88a50'),
      0,
      1.4,
      0,
    );
    cupRoof.rotation.y = Math.PI / 4;
    cup.add(cupRoof);
    cup.add(mesh(kit.box(0.05, 1.0, 0.05), kit.mat('#3a3633', METAL), 0, 2.2, 0));
    cup.add(mesh(kit.box(0.08, 0.08, 0.9), kit.mat('#3a3633', METAL), 0, 2.45, 0));
    const arrow = mesh(
      kit.geo('vaneTip', () => new THREE.ConeGeometry(0.12, 0.3, 4)),
      kit.mat('#3a3633', METAL),
      0,
      2.45,
      0.5,
    );
    arrow.rotation.x = Math.PI / 2;
    cup.add(arrow);
    g.add(cup);
    return g;
  });
}

export function makeHayBale(kit: Kit): THREE.Group {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  g.rotation.z = Math.PI / 2;
  g.position.y = 0.65;
  g.add(
    mesh(
      kit.geo('hay', () => new THREE.CylinderGeometry(0.65, 0.65, 1.1, 16)),
      kit.mat('#e2bf55', { roughness: 0.95 }),
    ),
  );
  g.add(
    mesh(
      kit.geo('hayEnd', () => new THREE.CylinderGeometry(0.5, 0.5, 1.14, 16)),
      kit.mat('#c99f3e', { roughness: 0.95 }),
      0,
      0,
      0,
      false,
    ),
  );
  const strap = kit.geo('hayStrap', () =>
    new THREE.TorusGeometry(0.66, 0.035, 6, 20).rotateX(Math.PI / 2),
  );
  for (const y of [-0.28, 0.28]) g.add(mesh(strap, kit.mat('#8a6a2a'), 0, y, 0, false));
  outer.add(g);
  return outer;
}

export function makeTrough(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const wood = kit.mat('#8a5a32');
  const dark = kit.mat('#6b4426');
  for (const s of [-1, 1]) g.add(mesh(kit.rbox(2.2, 0.42, 0.1, 0.03), wood, 0, 0.42, s * 0.38));
  for (const s of [-1, 1]) g.add(mesh(kit.rbox(0.1, 0.42, 0.86, 0.03), wood, s * 1.05, 0.42, 0));
  g.add(mesh(kit.box(2.1, 0.08, 0.7), dark, 0, 0.24, 0));
  g.add(mesh(kit.box(2.0, 0.06, 0.66), kit.mat('#3f8fae', { roughness: 0.08 }), 0, 0.55, 0, false));
  for (const x of [-0.85, 0.85])
    for (const s of [-1, 1]) g.add(mesh(kit.rbox(0.12, 0.26, 0.12, 0.03), dark, x, 0.13, s * 0.3));
  return g;
}

export function makeFencePost(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(kit.rbox(0.22, 1.2, 0.22, 0.04), kit.mat('#7b5230'), 0, 0.6, 0));
  const cap = mesh(
    kit.geo('postCap', () => new THREE.ConeGeometry(0.17, 0.18, 4)),
    kit.mat('#6a4527'),
    0,
    1.29,
    0,
  );
  cap.rotation.y = Math.PI / 4;
  g.add(cap);
  return g;
}

export function makeFenceRail(kit: Kit, len: number, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  const rail = kit.rbox(Math.round(len * 10) / 10, 0.13, 0.08, 0.03);
  for (const y of [0.45, 0.9]) {
    const m = mesh(
      rail,
      kit.mat(rnd() < 0.5 ? '#9a6a3d' : '#a8784a'),
      0,
      y + (rnd() - 0.5) * 0.04,
      0,
    );
    m.rotation.z = (rnd() - 0.5) * 0.04;
    g.add(m);
  }
  return g;
}

// ------------------------------------------------------------------ fields

export function makeWindmill(kit: Kit): { root: THREE.Object3D; blades: THREE.Object3D } {
  const root = kit.template('windmill', () => {
    const g = new THREE.Group();
    const plaster = kit.mat('#f1e6cf');
    const timber = kit.mat('#6b4a2a');
    g.add(
      mesh(
        kit.geo('millBase', () => new THREE.CylinderGeometry(1.75, 1.85, 0.9, 12)),
        kit.mat('#9d978c'),
        0,
        0.45,
        0,
      ),
    );
    g.add(
      mesh(
        kit.geo('millTower', () => new THREE.CylinderGeometry(1.05, 1.6, 5.6, 12)),
        plaster,
        0,
        3.6,
        0,
      ),
    );
    for (const [y, r] of [
      [2.3, 1.42],
      [4.4, 1.22],
      [6.3, 1.06],
    ])
      g.add(
        mesh(
          kit.geo(`millBand${r}`, () => new THREE.CylinderGeometry(r, r + 0.03, 0.16, 12)),
          timber,
          0,
          y,
          0,
          false,
        ),
      );
    g.add(
      mesh(
        kit.geo('millCapRing', () => new THREE.CylinderGeometry(1.35, 1.2, 0.35, 12)),
        kit.mat('#a6372e'),
        0,
        6.55,
        0,
      ),
    );
    g.add(
      mesh(
        kit.geo('millCap', () => new THREE.ConeGeometry(1.35, 1.9, 12)),
        kit.mat('#c4473a'),
        0,
        7.65,
        0,
      ),
    );
    g.add(
      mesh(
        kit.geo('millFinial', () => new THREE.SphereGeometry(0.16, 8, 6)),
        kit.mat('#d9b44a'),
        0,
        8.65,
        0,
        false,
      ),
    );
    const door = new THREE.Group();
    door.position.set(0, 1.4, 1.62);
    door.rotation.x = -0.06;
    door.add(mesh(kit.rbox(1.15, 1.6, 0.1, 0.04), kit.mat('#f7f1e3'), 0, 0, 0, false));
    door.add(mesh(kit.box(0.9, 1.4, 0.1), kit.mat('#7a4f2b'), 0, -0.05, 0.03, false));
    g.add(door);
    for (const [y, a] of [
      [3.4, 0.8],
      [4.6, -0.7],
    ]) {
      const win = windowPanel(kit, 0.45, 0.5);
      const r = 1.6 - ((y - 0.8) / 5.6) * 0.55 + 0.04;
      win.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
      win.rotation.y = a;
      g.add(win);
    }
    return g;
  });
  const blades = kit.template('windmillSails', () => {
    const b = new THREE.Group();
    const wood = kit.mat('#6b4a2a');
    const cloth = kit.mat('#fbf6ea', { smooth: true });
    b.add(
      mesh(
        kit.geo('hub', () => new THREE.CylinderGeometry(0.28, 0.32, 0.6, 10).rotateX(Math.PI / 2)),
        wood,
        0,
        0,
        0,
      ),
    );
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2 + 0.2;
      arm.add(mesh(kit.rbox(0.16, 4.0, 0.14, 0.04), wood, 0, 2.1, 0.12));
      for (const x of [0.22, 0.98])
        arm.add(mesh(kit.box(0.06, 3.3, 0.06), wood, x, 2.45, 0.16, false));
      for (let y = 0.9; y <= 4.0; y += 0.42)
        arm.add(mesh(kit.box(0.84, 0.05, 0.06), wood, 0.6, y, 0.16, false));
      arm.add(mesh(kit.box(0.72, 3.2, 0.03), cloth, 0.6, 2.45, 0.2, false));
      b.add(arm);
    }
    return b;
  });
  blades.position.set(0, 6.0, 1.45);
  blades.userData.dynamic = true;
  root.add(blades);
  return { root, blades };
}

// ------------------------------------------------------------------ rocks & hills

const CRAG = {
  /** Cool slate with grass on the ledges and snow above the snow line. */
  slate: {
    rock: ['#7d8994', '#6a7681', '#929ca5', '#5f6a75'],
    ledge: '#6b9a47',
    snow: '#f2f5f7',
    snowLine: 0.68,
    top: 0.1,
    ledgeNy: 0.62,
    ledgeT: 0.8,
  },
  /** Terracotta clay banks: flat-topped, grass only on top, gentle strata. */
  clay: {
    rock: ['#c76e40', '#b9633a', '#cf7a4a', '#b25c35'],
    ledge: '#7aa54a',
    snow: '',
    snowLine: 9,
    top: 0.55,
    ledgeNy: 0.8,
    ledgeT: 2,
  },
} as const;
export type CragKind = keyof typeof CRAG;

/**
 * A rock mass: a tapering column of angular, flat-shaded faces whose rings step in and out like
 * strata, leaning a little, coloured per face: banded rock on the steep faces, grass on level
 * ledges and snow near the top. `coarse` drops the detail for the distant ranges.
 */
export function makeCrag(
  kit: Kit,
  rnd: () => number,
  radius: number,
  height: number,
  kind: CragKind,
  coarse = false,
): THREE.Mesh {
  const pal = CRAG[kind];
  const radial = coarse ? 7 : 11;
  const rings = coarse ? 4 : 8;
  const src = new THREE.CylinderGeometry(radius * pal.top, radius, height, radial, rings);
  src.translate(0, height / 2, 0);
  const seed = Math.floor(rnd() * 1e6);
  const ringK = Array.from({ length: rings + 1 }, (_, i) => (i === 0 ? 1 : 0.84 + rnd() * 0.3));
  const leanA = rnd() * Math.PI * 2;
  const lean = radius * (0.1 + rnd() * 0.25);
  const pos = src.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = y / height;
    const ring = Math.round(t * rings);
    // Noise from the position itself, so the seam's duplicate vertices move together.
    const n = fbm(x * 0.32 + y * 0.21, z * 0.32 - y * 0.17, seed, 3);
    const k = ringK[ring] * (1 + n * 0.3);
    const jy = ring > 0 && ring < rings ? (fbm(x * 0.5, z * 0.5, seed + 9, 2) * 0.35 * height) / rings : 0;
    pos.setXYZ(
      i,
      x * k + Math.cos(leanA) * lean * t * t,
      y + jy + (ring === rings ? (fbm(x * 0.7, z * 0.7, seed + 11, 1) * 0.5 + 0.5) * height * 0.06 : 0),
      z * k + Math.sin(leanA) * lean * t * t,
    );
  }
  const geo = src.toNonIndexed();
  src.dispose();
  geo.computeVertexNormals();
  const p = geo.attributes.position;
  const nr = geo.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const rock = pal.rock.map((h) => new THREE.Color(h));
  const ledge = new THREE.Color(pal.ledge);
  const snow = pal.snow ? new THREE.Color(pal.snow) : null;
  for (let f = 0; f < p.count; f += 3) {
    const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    const t = cy / height;
    const ny = (nr.getY(f) + nr.getY(f + 1) + nr.getY(f + 2)) / 3;
    const band = Math.floor(t * rings * 1.5 + fbm(p.getX(f) * 0.4, p.getZ(f) * 0.4, seed + 3, 2) * 1.5);
    c.copy(rock[((band % rock.length) + rock.length) % rock.length]);
    if (snow && t > pal.snowLine + fbm(p.getX(f) * 0.3, p.getZ(f) * 0.3, seed + 5, 2) * 0.1 && ny > 0.15) c.copy(snow);
    else if (ny > pal.ledgeNy && t < pal.ledgeT) c.lerp(ledge, 0.8);
    if (t < 0.12) c.multiplyScalar(0.82 + t * 1.5);
    for (let v = 0; v < 3; v++) col.set([c.r, c.g, c.b], (f + v) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  kit.own(geo);
  return mesh(geo, kit.mat('#ffffff', { vertexColors: true, roughness: 0.92 }));
}

/** A soft wisp of low haze (a camera-facing sprite). */
export function makeMist(kit: Kit, opacity = 0.4): THREE.Sprite {
  const s = new THREE.Sprite(kit.mist(opacity));
  s.renderOrder = 1;
  return s;
}

export function makeBoulder(kit: Kit, rnd: () => number, r: number, color: string): THREE.Mesh {
  const m = mesh(
    kit.geo('boulder', () => new THREE.DodecahedronGeometry(1, 0)),
    kit.mat(color),
    0,
    r * 0.55,
    0,
  );
  m.scale.set(r * (0.9 + rnd() * 0.4), r * (0.6 + rnd() * 0.3), r * (0.9 + rnd() * 0.4));
  m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
  return m;
}

/** A hexagonal crystal: a prism with a pointed tip. */
function crystalGeo(): THREE.BufferGeometry {
  const prism = new THREE.CylinderGeometry(0.16, 0.18, 0.7, 6).translate(0, 0.35, 0);
  const tip = new THREE.ConeGeometry(0.16, 0.3, 6).translate(0, 0.85, 0);
  const g = mergeGeometries([prism.toNonIndexed(), tip.toNonIndexed()])!;
  prism.dispose();
  tip.dispose();
  return g;
}

export function makeOreRock(kit: Kit, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  g.add(makeBoulder(kit, rnd, 0.95, '#5f6870'));
  g.add(makeBoulder(kit, rnd, 0.5, '#6e7882').translateX(0.8));
  const crystal = kit.geo('crystal', crystalGeo);
  const glow = kit.mat('#a9bccb', { roughness: 0.3, metalness: 0.75 });
  for (let i = 0; i < 5; i++) {
    const c = mesh(
      crystal,
      glow,
      (rnd() - 0.5) * 1.1,
      0.45 + rnd() * 0.3,
      (rnd() - 0.5) * 1.1,
      false,
    );
    c.scale.set(0.8 + rnd() * 0.5, 0.8 + rnd() * 0.9, 0.8 + rnd() * 0.5);
    c.rotation.set((rnd() - 0.5) * 1.0, rnd() * 3, (rnd() - 0.5) * 1.0);
    g.add(c);
  }
  return g;
}

/** A timber-framed mine entrance with a cart of ore on a short track. */
export function makeMine(kit: Kit): THREE.Object3D {
  return kit.template('mine', () => {
    const g = new THREE.Group();
    const wood = kit.mat('#6b4a2a');
    g.add(mesh(kit.box(2.2, 2.4, 0.6), kit.mat('#121214'), 0, 1.2, -0.25, false));
    for (const s of [-1, 1]) g.add(mesh(kit.rbox(0.3, 2.6, 0.3, 0.05), wood, s * 1.2, 1.3, 0));
    g.add(mesh(kit.rbox(3.0, 0.32, 0.36, 0.05), wood, 0, 2.7, 0));
    g.add(mesh(kit.rbox(0.9, 0.5, 0.08, 0.03), kit.mat('#c9a46a'), 0, 3.15, 0.12, false));
    for (const s of [-1, 1])
      g.add(mesh(kit.box(0.08, 0.08, 4.2), kit.mat('#8a9098', METAL), s * 0.45, 0.06, 1.7, false));
    for (let z = 0.0; z < 3.8; z += 0.55)
      g.add(mesh(kit.rbox(1.25, 0.08, 0.22, 0.02), wood, 0, 0.03, z, false));
    const cart = new THREE.Group();
    cart.position.set(0, 0, 2.6);
    cart.add(mesh(kit.rbox(1.1, 0.6, 1.4, 0.06), kit.mat('#7a6e62'), 0, 0.55, 0));
    cart.add(mesh(kit.box(0.95, 0.1, 1.25), kit.mat('#3a3a40'), 0, 0.82, 0, false));
    const wheel = kit.geo('cartWheel', () =>
      new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10).rotateZ(Math.PI / 2),
    );
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) cart.add(mesh(wheel, kit.mat('#4a4744', { roughness: 0.5, metalness: 0.7 }), sx * 0.5, 0.2, sz * 0.45));
    const ore = kit.geo('ore', () => new THREE.DodecahedronGeometry(0.2, 0));
    for (let i = 0; i < 6; i++)
      cart.add(
        mesh(
          ore,
          i % 3 ? kit.mat('#5f6870') : kit.mat('#a9bccb', { roughness: 0.3, metalness: 0.75 }),
          ((i % 3) - 1) * 0.3,
          0.92,
          (Math.floor(i / 3) - 0.5) * 0.45,
        ),
      );
    g.add(cart);
    return g;
  });
}

export function makeKiln(kit: Kit): THREE.Object3D {
  return kit.template('kiln', () => {
    const g = new THREE.Group();
    g.add(
      mesh(
        kit.geo(
          'kilnDome',
          () => new THREE.SphereGeometry(1.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        ),
        kit.mat('#a8573a'),
        0,
        0,
        0,
      ),
    );
    g.add(
      mesh(
        kit.geo('kilnRing', () => new THREE.CylinderGeometry(1.78, 1.82, 0.35, 14)),
        kit.mat('#8f4730'),
        0,
        0.17,
        0,
      ),
    );
    for (const y of [0.75, 1.25]) {
      const r = Math.sqrt(1.7 * 1.7 - y * y) + 0.03;
      g.add(
        mesh(
          kit.geo(`kilnBand${y}`, () =>
            new THREE.TorusGeometry(r, 0.06, 5, 18).rotateX(Math.PI / 2),
          ),
          kit.mat('#93492f'),
          0,
          y,
          0,
          false,
        ),
      );
    }
    g.add(mesh(kit.rbox(0.6, 2.4, 0.6, 0.05), kit.mat('#8a4430'), 0.6, 2.2, -0.6));
    g.add(mesh(kit.rbox(0.78, 0.18, 0.78, 0.04), kit.mat('#6e3524'), 0.6, 3.45, -0.6));
    g.add(mesh(kit.rbox(1.15, 1.0, 0.3, 0.12), kit.mat('#7d3a26'), 0, 0.55, 1.58));
    g.add(
      mesh(
        kit.box(0.8, 0.65, 0.32),
        kit.mat('#ff9a3c', { emissive: '#ff6a1a', emissiveIntensity: 1.6 }),
        0,
        0.45,
        1.62,
        false,
      ),
    );
    // Firewood stacked beside it.
    const log = kit.geo('kilnLog', () =>
      new THREE.CylinderGeometry(0.14, 0.14, 1.1, 7).rotateX(Math.PI / 2),
    );
    for (let i = 0; i < 6; i++)
      g.add(
        mesh(
          log,
          kit.mat(i % 2 ? '#7a4f2b' : '#8a5a32'),
          -1.9 + (i % 3) * 0.3,
          0.15 + Math.floor(i / 3) * 0.27,
          0.9,
        ),
      );
    return g;
  });
}

export function makeBrickStack(kit: Kit): THREE.Object3D {
  return kit.template('bricks', () => {
    const g = new THREE.Group();
    const brick = kit.rbox(0.5, 0.22, 0.25, 0.04);
    const tones = ['#b4553a', '#a94c33', '#c0613f'];
    let n = 0;
    for (let y = 0; y < 4; y++)
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 2; j++)
          g.add(
            mesh(
              brick,
              kit.mat(tones[n++ % 3]),
              (i - 1) * 0.53 + (y % 2) * 0.05,
              0.2 + y * 0.235,
              (j - 0.5) * 0.28,
            ),
          );
    g.add(mesh(kit.rbox(1.8, 0.1, 0.8, 0.03), kit.mat('#8a5a32'), 0, 0.05, 0));
    return g;
  });
}

// ------------------------------------------------------------------ player pieces

function houseParts(kit: Kit, roofColor: string, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry(seed);
  const plaster = kit.mat('#efe0c2', { roughness: 0.95 });
  const timber = kit.mat('#5a3c22', WOOD);
  const w = 2.7;
  const d = 3.0;
  const wallH = 1.85;
  const base = 0.35;
  const rise = 1.45;
  const top = base + wallH;
  // Stone footing with a few chunky stones.
  g.add(mesh(kit.rbox(w + 0.3, base, d + 0.3, 0.06), kit.mat('#9d9a92', STONE), 0, base / 2, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) * (w / 2 + 0.15);
    const z = Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) * (d / 2 + 0.15);
    g.add(
      mesh(
        kit.rbox(0.42, 0.26, 0.42, 0.08),
        kit.mat(rnd() < 0.5 ? '#8a8780' : '#b0aca2', STONE),
        x,
        0.16,
        z,
        false,
      ),
    );
  }
  g.add(mesh(kit.box(w, wallH, d), plaster, 0, base + wallH / 2, 0));
  g.add(
    mesh(
      kit.geo('houseGable', () => gableGeo(w, rise, d)),
      plaster,
      0,
      top,
      0,
    ),
  );
  // Half-timbering: corner posts, sill and plate beams, braces on the long walls.
  const post = kit.rbox(0.16, wallH, 0.16, 0.03);
  for (const x of [-w / 2, w / 2])
    for (const z of [-d / 2, d / 2]) g.add(mesh(post, timber, x, base + wallH / 2, z, false));
  for (const y of [base + 0.06, top - 0.06]) {
    for (const z of [-d / 2 - 0.02, d / 2 + 0.02])
      g.add(mesh(kit.box(w + 0.1, 0.12, 0.06), timber, 0, y, z, false));
    for (const x of [-w / 2 - 0.02, w / 2 + 0.02])
      g.add(mesh(kit.box(0.06, 0.12, d + 0.1), timber, x, y, 0, false));
  }
  for (const s of [-1, 1]) {
    g.add(mesh(kit.box(0.06, 0.1, d), timber, s * (w / 2 + 0.03), base + wallH * 0.55, 0, false));
    for (const k of [-1, 1]) {
      const br = mesh(
        kit.box(0.06, 0.1, 1.15),
        timber,
        s * (w / 2 + 0.03),
        base + wallH * 0.28,
        k * (d / 2 - 0.55),
        false,
      );
      br.rotation.x = k * 0.55;
      g.add(br);
    }
  }
  for (const z of [-d / 2 - 0.03, d / 2 + 0.03]) {
    for (const s of [-1, 1]) {
      const e = mesh(
        kit.box(Math.hypot(w / 2, rise) + 0.1, 0.14, 0.07),
        timber,
        (s * w) / 4,
        top + rise / 2,
        z,
        false,
      );
      e.rotation.z = -s * Math.atan2(rise, w / 2);
      g.add(e);
    }
    g.add(mesh(kit.box(0.1, rise * 0.75, 0.07), timber, 0, top + rise * 0.38, z, false));
  }
  const r = shingleRoof(kit, w / 2, rise, d, roofColor, {
    rows: 5,
    overhang: 0.32,
    thickness: 0.15,
  });
  r.position.y = top;
  g.add(r);
  // Chimney.
  g.add(mesh(kit.rbox(0.55, 1.5, 0.55, 0.05), kit.mat('#8f877d'), 0.72, top + 1.25, -0.75));
  g.add(mesh(kit.rbox(0.7, 0.14, 0.7, 0.04), kit.mat('#6f685f'), 0.72, top + 2.02, -0.75));
  // Front: door with frame and step, a window with shutters and a flower box.
  const door = new THREE.Group();
  door.position.set(-0.55, base, d / 2 + 0.04);
  door.add(mesh(kit.rbox(0.95, 1.45, 0.08, 0.03), timber, 0, 0.72, 0, false));
  door.add(mesh(kit.rbox(0.72, 1.28, 0.08, 0.02), kit.mat('#9a6a3d'), 0, 0.66, 0.03, false));
  for (const x of [-0.18, 0.18])
    door.add(mesh(kit.box(0.03, 1.2, 0.03), kit.mat('#7b5230'), x, 0.66, 0.08, false));
  door.add(
    mesh(
      kit.geo('knob', () => new THREE.SphereGeometry(0.05, 8, 6)),
      kit.mat('#c9a24a', METAL),
      0.24,
      0.66,
      0.1,
      false,
    ),
  );
  door.add(mesh(kit.rbox(1.1, 0.16, 0.5, 0.04), kit.mat('#a29a8e'), 0, -0.2, 0.25));
  g.add(door);
  const win = windowPanel(kit, 0.62, 0.62, roofColor);
  win.position.set(0.72, base + 1.15, d / 2 + 0.04);
  g.add(win);
  const fb = flowerBox(kit, 0.9, rnd);
  fb.position.set(0.72, base + 0.7, d / 2 + 0.14);
  g.add(fb);
  // Gable window.
  const gw = windowPanel(kit, 0.36, 0.36);
  gw.position.set(0, top + 0.45, d / 2 + 0.05);
  g.add(gw);
  // A window on each long side.
  for (const s of [-1, 1]) {
    const sw = windowPanel(kit, 0.55, 0.6, roofColor);
    sw.position.set(s * (w / 2 + 0.05), base + 1.1, 0.25);
    sw.rotation.y = (s * Math.PI) / 2;
    g.add(sw);
  }
  return g;
}

export function makeSettlement(kit: Kit, roofColor: string): THREE.Object3D {
  return kit.template(`settlement${roofColor}`, () => houseParts(kit, roofColor, 7));
}

export function makeCity(kit: Kit, roofColor: string): THREE.Object3D {
  return kit.template(`city${roofColor}`, () => {
    const g = new THREE.Group();
    const house = houseParts(kit, roofColor, 11);
    house.position.set(-1.5, 0, 0.9);
    house.scale.setScalar(0.92);
    g.add(house);

    // A stone keep with quoins, crenellations, a spire and a banner in the owner's colour.
    const keep = new THREE.Group();
    keep.position.set(1.5, 0, -0.9);
    const tw = 2.6;
    const th = 5.6;
    keep.add(mesh(kit.rbox(tw + 0.3, 0.5, tw + 0.3, 0.06), kit.mat('#8f877d'), 0, 0.25, 0));
    keep.add(mesh(kit.box(tw, th, tw), kit.mat('#d3cbbb'), 0, th / 2, 0));
    for (let y = 0.45; y < th; y += 0.42) {
      const big = Math.round(y / 0.42) % 2 === 0;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          keep.add(
            mesh(
              kit.rbox(big ? 0.62 : 0.4, 0.38, big ? 0.4 : 0.62, 0.05),
              kit.mat(big ? '#b9b0a0' : '#c7bfae'),
              sx * (tw / 2 - (big ? 0.24 : 0.14)),
              y,
              sz * (tw / 2 - (big ? 0.14 : 0.24)),
              false,
            ),
          );
    }
    keep.add(mesh(kit.rbox(tw + 0.5, 0.3, tw + 0.5, 0.05), kit.mat('#b9b0a0'), 0, th + 0.1, 0));
    for (let i = 0; i < 4; i++)
      for (const t of [-0.9, 0, 0.9]) {
        const a = (i * Math.PI) / 2;
        const out = tw / 2 + 0.12;
        keep.add(
          mesh(
            kit.rbox(0.5, 0.55, 0.5, 0.06),
            kit.mat('#c7bfae'),
            Math.sin(a) * out + Math.cos(a) * t,
            th + 0.52,
            Math.cos(a) * out - Math.sin(a) * t,
          ),
        );
      }
    const spire = mesh(
      kit.geo('spire', () => new THREE.ConeGeometry(1.45, 2.6, 4)),
      kit.mat(roofColor),
      0,
      th + 1.55,
      0,
    );
    spire.rotation.y = Math.PI / 4;
    keep.add(spire);
    keep.add(mesh(kit.box(0.07, 1.6, 0.07), kit.mat('#5a4636'), 0, th + 3.5, 0));
    keep.add(mesh(kit.rbox(1.0, 0.55, 0.05, 0.02), kit.mat(roofColor), 0.52, th + 3.95, 0));
    // Banner.
    keep.add(
      mesh(kit.rbox(0.95, 1.7, 0.06, 0.03), kit.mat(roofColor), 0, th - 1.6, tw / 2 + 0.05, false),
    );
    keep.add(
      mesh(kit.rbox(1.15, 0.1, 0.1, 0.03), kit.mat('#d9b44a'), 0, th - 0.72, tw / 2 + 0.08, false),
    );
    keep.add(
      mesh(
        kit.geo('crest', () =>
          new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12).rotateX(Math.PI / 2),
        ),
        kit.mat('#d9b44a'),
        0,
        th - 1.55,
        tw / 2 + 0.1,
        false,
      ),
    );
    for (const y of [1.8, 3.2]) {
      const slit = windowPanel(kit, 0.32, 0.6);
      slit.position.set(0, y, tw / 2 + 0.03);
      keep.add(slit);
      const s2 = windowPanel(kit, 0.32, 0.6);
      s2.position.set(tw / 2 + 0.03, y, 0);
      s2.rotation.y = Math.PI / 2;
      keep.add(s2);
    }
    keep.add(mesh(kit.rbox(1.0, 1.5, 0.1, 0.05), kit.mat('#6a4426', WOOD), 0, 1.0, tw / 2 + 0.03, false));
    keep.scale.setScalar(1.12);
    g.add(keep);

    // A second, smaller house tucked behind, and a crenellated curtain wall around the back.
    const annex = houseParts(kit, roofColor, 23);
    annex.position.set(-1.6, 0, -2.3);
    annex.rotation.y = Math.PI / 2;
    annex.scale.setScalar(0.72);
    g.add(annex);
    const wallMat = kit.mat('#c9c1b0', STONE);
    const capMat = kit.mat('#b4ab99', STONE);
    for (const [x, z, len, rot] of [
      [-0.4, -4.1, 6.6, 0],
      [-3.9, -1.2, 5.6, Math.PI / 2],
      [3.9, 1.2, 3.4, Math.PI / 2],
    ] as const) {
      const wall = new THREE.Group();
      wall.position.set(x, 0, z);
      wall.rotation.y = rot;
      wall.add(mesh(kit.rbox(len, 1.7, 0.55, 0.05), wallMat, 0, 0.85, 0));
      for (let t = -len / 2 + 0.3; t <= len / 2 - 0.25; t += 0.7)
        wall.add(mesh(kit.rbox(0.42, 0.4, 0.6, 0.04), capMat, t, 1.88, 0));
      g.add(wall);
    }
    return g;
  });
}

/**
 * A road along one edge (`len` metres, vertex to vertex): natural cobbles on a gravel bed with
 * timber edging rails and short posts painted in the owner's colour, so ownership reads from
 * far away without turning the whole road into a slab of colour.
 */
export function makeRoad(kit: Kit, len: number, color: string): THREE.Object3D {
  return kit.template(`road${color}${len.toFixed(2)}`, () => {
    const g = new THREE.Group();
    const rnd = mulberry(31);
    g.add(mesh(kit.rbox(len, 0.12, 1.9, 0.05), kit.mat('#8f8370', STONE), 0, 0.03, 0));
    const tones = ['#b9ae99', '#a69a84', '#c8bea9', '#9b9079'].map((c) => kit.mat(c, { roughness: 0.82 }));
    const cobble = kit.rbox(0.44, 0.1, 0.4, 0.07);
    for (let x = -len / 2 + 0.3; x < len / 2 - 0.2; x += 0.47)
      for (const [k, z] of [
        [0, -0.48],
        [1, 0],
        [0, 0.48],
      ]) {
        const c = mesh(cobble, tones[Math.floor(rnd() * tones.length)], x + k * 0.22, 0.1, z + (rnd() - 0.5) * 0.06, false);
        c.rotation.y = (rnd() - 0.5) * 0.3;
        g.add(c);
      }
    const paint = kit.mat(color, WOOD);
    const dark = kit.mat(shade(color, -0.12), WOOD);
    for (const z of [-0.9, 0.9]) g.add(mesh(kit.rbox(len - 1.2, 0.14, 0.14, 0.04), paint, 0, 0.16, z));
    for (let x = -len / 2 + 0.6; x <= len / 2 - 0.5; x += (len - 1.2) / 3)
      for (const z of [-0.9, 0.9]) {
        g.add(mesh(kit.rbox(0.18, 0.52, 0.18, 0.04), dark, x, 0.26, z));
        g.add(mesh(kit.rbox(0.22, 0.08, 0.22, 0.03), kit.mat('#e7d7b0', WOOD), x, 0.54, z, false));
      }
    return g;
  });
}

export function makeRobber(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const cloak = kit.mat('#4a4e53', CLOTH);
  const body = kit.template('robberBody', () => {
    const b = new THREE.Group();
    const profile = [
      [0.95, 0],
      [0.9, 0.2],
      [0.72, 0.9],
      [0.55, 1.6],
      [0.48, 2.0],
      [0.3, 2.25],
      [0.01, 2.3],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    b.add(
      mesh(
        kit.geo('cloak', () => new THREE.LatheGeometry(profile, 14)),
        cloak,
      ),
    );
    b.add(
      mesh(
        kit.geo('belt', () => new THREE.TorusGeometry(0.66, 0.06, 6, 18).rotateX(Math.PI / 2)),
        kit.mat('#5a4636'),
        0,
        1.05,
        0,
        false,
      ),
    );
    b.add(
      mesh(
        kit.rbox(0.2, 0.18, 0.08, 0.03),
        kit.mat('#c9a24a', METAL),
        0,
        1.05,
        0.66,
        false,
      ),
    );
    const hood = mesh(
      kit.geo(
        'hood',
        () => new THREE.SphereGeometry(0.52, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      ),
      cloak,
      0,
      2.3,
      -0.02,
    );
    hood.rotation.x = 0.25;
    b.add(hood);
    const peak = mesh(
      kit.geo('hoodPeak', () => new THREE.ConeGeometry(0.28, 0.5, 10)),
      cloak,
      0,
      2.85,
      -0.18,
    );
    peak.rotation.x = -0.6;
    b.add(peak);
    const face = mesh(
      kit.geo('void', () => new THREE.SphereGeometry(0.36, 12, 8)),
      kit.mat('#07060a', { smooth: true }),
      0,
      2.3,
      0.2,
      false,
    );
    face.scale.set(1, 1.05, 0.5);
    b.add(face);
    return b;
  });
  g.add(body);
  const eye = kit.geo('robberEye', () => new THREE.SphereGeometry(0.06, 8, 6));
  const glow = kit.mat('#ff6a3c', { emissive: '#ff3a1a', emissiveIntensity: 2.5, smooth: true });
  for (const side of [-1, 1]) g.add(mesh(eye, glow, side * 0.13, 2.33, 0.36, false));
  return g;
}

export function makeBoat(kit: Kit, sailColor: string): THREE.Object3D {
  return kit.template(`boat${sailColor}`, () => {
    const g = new THREE.Group();
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-0.85, 1.6);
    hullShape.lineTo(0.85, 1.6);
    hullShape.quadraticCurveTo(0.95, -0.6, 0, -2.2);
    hullShape.quadraticCurveTo(-0.95, -0.6, -0.85, 1.6);
    const hull = kit.geo('hull', () =>
      new THREE.ExtrudeGeometry(hullShape, {
        depth: 0.8,
        bevelEnabled: true,
        bevelThickness: 0.12,
        bevelSize: 0.1,
        bevelSegments: 2,
      })
        .rotateX(-Math.PI / 2)
        .translate(0, -0.2, 0),
    );
    g.add(mesh(hull, kit.mat('#7a5232', WOOD)));
    const deck = kit.geo('deck', () =>
      new THREE.ShapeGeometry(hullShape).rotateX(-Math.PI / 2).scale(0.85, 1, 0.85),
    );
    g.add(mesh(deck, kit.mat('#c79a62'), 0, 0.72, 0, false));
    g.add(mesh(kit.rbox(1.8, 0.14, 0.14, 0.04), kit.mat('#6b4426'), 0, 0.8, 1.5, false));
    g.add(mesh(kit.rbox(0.14, 4.0, 0.14, 0.04), kit.mat('#5a4636'), 0, 2.6, 0.1));
    g.add(mesh(kit.rbox(0.1, 0.1, 2.2, 0.03), kit.mat('#5a4636'), 0, 1.3, -0.9));
    const sail = new THREE.Shape();
    sail.moveTo(0, 0);
    sail.lineTo(0, 3.0);
    sail.quadraticCurveTo(-1.0, 1.4, -2.1, 0);
    sail.closePath();
    const sm = mesh(
      kit.geo('sail', () => new THREE.ExtrudeGeometry(sail, { depth: 0.04, bevelEnabled: false })),
      kit.mat(sailColor, CLOTH),
      0.05,
      1.4,
      0.05,
    );
    sm.rotation.y = -Math.PI / 2;
    g.add(sm);
    g.add(mesh(kit.box(0.5, 0.3, 0.03), kit.mat(sailColor), 0.25, 4.45, 0.1, false));
    for (const [x, z] of [
      [0.3, -0.9],
      [-0.25, -1.4],
    ])
      g.add(mesh(kit.rbox(0.5, 0.45, 0.5, 0.05), kit.mat('#b07a45'), x, 0.95, z));
    return g;
  });
}

export function makeDock(kit: Kit, len: number): THREE.Object3D {
  return kit.template(`dock${len}`, () => {
    const g = new THREE.Group();
    const tones = ['#9a6c40', '#8d6239', '#a87a4a'].map((c) => kit.mat(c, WOOD));
    for (let z = 0.2, i = 0; z < len; z += 0.42, i++)
      g.add(mesh(kit.rbox(2.3, 0.14, 0.38, 0.03), tones[i % 3], 0, 0, z));
    for (const x of [-1.0, 1.0])
      g.add(mesh(kit.box(0.14, 0.14, len), kit.mat('#7b5230'), x, -0.12, len / 2, false));
    const post = kit.rbox(0.28, 1.9, 0.28, 0.05);
    const rope = kit.geo('rope', () =>
      new THREE.TorusGeometry(0.18, 0.04, 5, 12).rotateX(Math.PI / 2),
    );
    for (let z = 0.6; z < len; z += 2.2)
      for (const x of [-1.2, 1.2]) {
        g.add(mesh(post, kit.mat('#6b4a2a'), x, -0.25, z));
        g.add(mesh(rope, kit.mat('#d8c08a'), x, 0.45, z, false));
      }
    return g;
  });
}

export function makeCloud(kit: Kit, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  const geo = kit.geo('cloud', () => new THREE.IcosahedronGeometry(1, 2));
  // Self-lit so the green bounce light from the ground doesn't tint them.
  const m = kit.mat('#ffffff', {
    roughness: 1,
    emissive: '#c9d6e4',
    emissiveIntensity: 0.55,
    smooth: true,
  });
  const n = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const mid = 1 - Math.abs(i - (n - 1) / 2) / n;
    const c = mesh(
      geo,
      m,
      (i - n / 2) * 2.4 + rnd(),
      mid * 1.4 + rnd() * 0.6,
      (rnd() - 0.5) * 3,
      false,
    );
    c.scale.setScalar(1.8 + mid * 2 + rnd());
    g.add(c);
  }
  g.scale.set(1.4, 0.75, 1);
  bake(g, kit);
  return g;
}

/** A round wooden plaque showing a number token and its pips. */
export function makeTokenSprite(n: number): THREE.Sprite {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const mid = size / 2;
  const wood = ctx.createRadialGradient(mid, mid, 60, mid, mid, mid);
  wood.addColorStop(0, '#9a6a3d');
  wood.addColorStop(1, '#6b4426');
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.arc(mid, mid, mid - 4, 0, Math.PI * 2);
  ctx.fill();
  const face = ctx.createRadialGradient(mid - 20, mid - 30, 10, mid, mid, mid - 22);
  face.addColorStop(0, '#fff6dc');
  face.addColorStop(1, '#ead6a6');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(mid, mid, mid - 22, 0, Math.PI * 2);
  ctx.fill();
  const hot = n === 6 || n === 8;
  ctx.fillStyle = hot ? '#b4231c' : '#2a1d14';
  ctx.font = 'bold 116px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), mid, mid - 12);
  const pips = 6 - Math.abs(7 - n);
  for (let i = 0; i < pips; i++) {
    ctx.beginPath();
    ctx.arc(mid + (i - (pips - 1) / 2) * 22, mid + 64, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Tinted down so the plaques sit in the dusk light instead of glowing white.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#f4ead8' }));
  s.scale.setScalar(1.7);
  return s;
}

/** A soft radial glow for the sun. */
export function makeSunSprite(): THREE.Sprite {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,246,214,1)');
  g.addColorStop(0.12, 'rgba(255,214,140,1)');
  g.addColorStop(0.3, 'rgba(255,150,80,0.45)');
  g.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      fog: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    }),
  );
  return s;
}
