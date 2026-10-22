import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Chunky, toy-like models for the 3D walk, built from primitives (no asset files).
 * Every model faces +Z and stands on y = 0. Materials and geometries are shared through a
 * per-world `Kit` so the whole scene can be disposed in one sweep, and static models are
 * "baked" (merged per material) so a detailed house costs a handful of draw calls.
 */
/** Warm rim light on silhouettes, shared by every cel-shaded material. */
export const RIM = { color: new THREE.Color('#ffb07a'), strength: 0.3 };

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

/**
 * Turns a toon material into the game's anime look: banded light from `gradientMap`, a soft
 * rim of warm light along silhouettes (not on faces turned to the sky, so ground and grass
 * don't glow) and, for foliage, a wind sway. Each variant gets its own shader cache key.
 */
export function celShade(
  m: THREE.Material,
  sway?: { uTime: { value: number }; amount: number },
): void {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = { value: RIM.color };
    sh.uniforms.rimStrength = { value: RIM.strength };
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;',
      )
      .replace(
        '#include <opaque_fragment>',
        `float rimF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
        float rimSide = 1.0 - smoothstep(0.5, 0.9, abs(normal.y));
        outgoingLight += rimColor * smoothstep(0.35, 0.6, rimF) * rimSide * rimStrength;
        #include <opaque_fragment>`,
      );
    if (sway) {
      sh.uniforms.uTime = sway.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>${swayGlsl(sway.amount)}`);
    }
  };
  m.customProgramCacheKey = () => `cel${sway ? `-sway${sway.amount}` : ''}`;
}

export class Kit {
  private mats = new Map<string, THREE.Material>();
  private ramp: THREE.DataTexture | null = null;

  /** Three bands of light (shadow, mid, lit) with hard steps: the cel-shaded look. */
  toonRamp(): THREE.DataTexture {
    if (!this.ramp) {
      const steps = new Uint8Array([92, 172, 255]);
      this.ramp = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
      this.ramp.minFilter = this.ramp.magFilter = THREE.NearestFilter;
      this.ramp.generateMipmaps = false;
      this.ramp.needsUpdate = true;
    }
    return this.ramp;
  }

  /** A cel-shaded material from a colour, slightly brighter and richer than the flat swatch. */
  toon(
    color: string | THREE.Color,
    extra?: {
      emissive?: string;
      emissiveIntensity?: number;
      map?: THREE.Texture;
      vertexColors?: boolean;
      side?: THREE.Side;
    },
  ): THREE.MeshToonMaterial {
    const c = new THREE.Color(color);
    c.offsetHSL(0, 0.06, 0.02);
    const m = new THREE.MeshToonMaterial({
      color: c,
      gradientMap: this.toonRamp(),
      emissive: extra?.emissive ?? '#000000',
      emissiveIntensity: extra?.emissiveIntensity ?? 1,
      map: extra?.map ?? null,
      vertexColors: extra?.vertexColors ?? false,
      side: extra?.side ?? THREE.FrontSide,
    });
    celShade(m);
    return m;
  }
  private geos = new Map<string, THREE.BufferGeometry>();
  private templates = new Map<string, THREE.Object3D>();

  /** Shared cel-shaded material for a colour (roughness/smooth are accepted for older callers). */
  mat(
    color: string,
    extra?: { emissive?: string; emissiveIntensity?: number; roughness?: number; smooth?: boolean },
  ): THREE.MeshToonMaterial {
    const key = `toon|${color}|${extra?.emissive ?? ''}|${extra?.emissiveIntensity ?? ''}`;
    let m = this.mats.get(key) as THREE.MeshToonMaterial | undefined;
    if (!m) {
      m = this.toon(color, extra);
      this.mats.set(key, m);
    }
    return m;
  }

  /** An unlit, see-through material (contact shadows, foam). */
  basic(color: string, opacity: number): THREE.MeshBasicMaterial {
    const key = `basic|${color}|${opacity}`;
    let m = this.mats.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      m.userData.outlineParameters = { visible: false };
      this.mats.set(key, m);
    }
    return m;
  }

  /** A blurry rose-white puff for low mist; shared per opacity. */
  mist(opacity: number): THREE.SpriteMaterial {
    const key = `mist|${opacity}`;
    let m = this.mats.get(key) as THREE.SpriteMaterial | undefined;
    if (!m) {
      const size = 128;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, 'rgba(255,226,214,0.9)');
      g.addColorStop(0.5, 'rgba(255,206,196,0.35)');
      g.addColorStop(1, 'rgba(255,200,190,0)');
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
      g.addColorStop(0, 'rgba(10,26,6,0.5)');
      g.addColorStop(0.6, 'rgba(10,26,6,0.22)');
      g.addColorStop(1, 'rgba(10,26,6,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const map = new THREE.CanvasTexture(c);
      m = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false });
      m.userData.outlineParameters = { visible: false };
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

  /** A box with softened edges — the toy-like look of the reference. */
  rbox(w: number, h: number, d: number, r = 0.06): THREE.BufferGeometry {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    return this.geo(`rbox${w},${h},${d},${rr}`, () => new RoundedBoxGeometry(w, h, d, 2, rr));
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
    this.ramp?.dispose();
    this.mats.forEach((m) => {
      (m as THREE.MeshStandardMaterial).map?.dispose();
      m.dispose();
    });
    this.geos.forEach((g) => g.dispose());
    this.mats.clear();
    this.geos.clear();
    this.templates.clear();
  }
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
 * Merges every static mesh under `root` into one mesh per material (children flagged
 * `userData.dynamic` are left alone so they can still move).
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
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv)
      g.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2),
      );
    g.clearGroups();
    rel.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(rel);
    const key = `${m.material.uuid}|${m.castShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, geos: [] }));
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
      kit.mat('#ffd98a', { emissive: '#ffa336', emissiveIntensity: 1.3 }),
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
  const colors = ['#ff6b8a', '#ffd84a', '#ffffff', '#b07cff', '#ff8a3d'];
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
    const wool = kit.mat(color, { smooth: true, roughness: 1 });
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
  const wool = kit.mat(woolColor, { smooth: true, roughness: 1 });
  const skin = kit.mat(black ? '#1d1714' : '#2e2420', { smooth: true });
  const muzzleMat = kit.mat(black ? '#2b2420' : '#4a3b34', { smooth: true });
  const pink = kit.mat('#d99a8e', { smooth: true });
  const hoofMat = kit.mat('#17110f');
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
  const eyes: THREE.Object3D[] = [];
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
    eyes.push(eye);
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
  return { root, head, legs, eyes, tail };
}

// ------------------------------------------------------------------ farm

export function makeBarn(kit: Kit): THREE.Object3D {
  return kit.template('barn', () => {
    const g = new THREE.Group();
    const red = kit.mat('#b8392f');
    const board = kit.mat('#a3302a');
    const trim = kit.mat('#f4efe4');
    const stone = kit.mat('#9a958c');
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
          kit.mat(i % 2 ? '#8d887f' : '#a7a298'),
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
    const r = shingleRoof(kit, w / 2, rise, d, '#55463f', { rows: 6, overhang: 0.45 });
    r.position.y = h;
    g.add(r);

    // Big front door with the classic white cross, and a lantern above it.
    const door = new THREE.Group();
    door.position.set(0, 1.55, d / 2 + 0.06);
    door.add(mesh(kit.box(2.5, 2.4, 0.1), kit.mat('#8f2a22'), 0, 0, 0));
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
        kit.mat('#ffcf6b', { emissive: '#ffa030', emissiveIntensity: 2.4 }),
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
      kit.mat('#55463f'),
      0,
      1.4,
      0,
    );
    cupRoof.rotation.y = Math.PI / 4;
    cup.add(cupRoof);
    cup.add(mesh(kit.box(0.05, 1.0, 0.05), kit.mat('#2f2a26'), 0, 2.2, 0));
    cup.add(mesh(kit.box(0.08, 0.08, 0.9), kit.mat('#2f2a26'), 0, 2.45, 0));
    const arrow = mesh(
      kit.geo('vaneTip', () => new THREE.ConeGeometry(0.12, 0.3, 4)),
      kit.mat('#2f2a26'),
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
      kit.mat('#e2bf55', { roughness: 1 }),
    ),
  );
  g.add(
    mesh(
      kit.geo('hayEnd', () => new THREE.CylinderGeometry(0.5, 0.5, 1.14, 16)),
      kit.mat('#d3ab45', { roughness: 1 }),
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
  g.add(mesh(kit.box(2.0, 0.06, 0.66), kit.mat('#5fb8e8', { roughness: 0.15 }), 0, 0.55, 0, false));
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

/** A jittered low-poly cone for mountains, with a snow cap and a few rock ledges. */
export function makeMountain(
  kit: Kit,
  rnd: () => number,
  radius: number,
  height: number,
  ledges = false,
): THREE.Group {
  const g = new THREE.Group();
  const geo = kit.own(new THREE.ConeGeometry(radius, height, 8, 4));
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > height / 2 - 0.01) continue; // keep the apex
    const k = (height / 2 - y) / height;
    pos.setX(i, pos.getX(i) * (1 + (rnd() - 0.5) * 0.32 * k));
    pos.setZ(i, pos.getZ(i) * (1 + (rnd() - 0.5) * 0.32 * k));
    pos.setY(i, y + (rnd() - 0.5) * 0.5 * k);
  }
  geo.computeVertexNormals();
  const tone = rnd() < 0.5 ? '#8a8d99' : '#7d818e';
  g.add(mesh(geo, kit.mat(tone), 0, height / 2, 0));
  const capH = height * 0.34;
  g.add(
    mesh(
      kit.geo(
        `cap${radius.toFixed(2)},${height.toFixed(2)}`,
        () => new THREE.ConeGeometry(radius * 0.36, capH, 8),
      ),
      kit.mat('#f7f9fc'),
      0,
      height - capH / 2 + 0.03,
      0,
    ),
  );
  if (ledges) {
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2;
      const y = height * (0.15 + rnd() * 0.3);
      const rr = radius * (1 - y / height) * 0.95;
      const b = makeBoulder(kit, rnd, 0.7 + rnd() * 0.5, shade(tone, -0.04));
      b.position.set(Math.sin(a) * rr, y, Math.cos(a) * rr);
      g.add(b);
    }
  }
  return g;
}

/**
 * A karst pillar from a stone forest: a tall, slightly tapered column of banded rock with a
 * mossy green crown and, on bigger ones, a few tiny pines clinging to the top.
 */
export function makeKarst(
  kit: Kit,
  rnd: () => number,
  radius: number,
  height: number,
): THREE.Group {
  const g = new THREE.Group();
  const rings = 6;
  const geo = kit.own(new THREE.CylinderGeometry(radius * 0.74, radius, height, 10, rings));
  const pos = geo.attributes.position;
  // Each ring bulges or pinches a little, like stacked strata; the column leans slightly.
  const ringK = Array.from({ length: rings + 1 }, () => 1 + (rnd() - 0.5) * 0.18);
  const lean = (rnd() - 0.5) * 0.08;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const row = Math.round(((y + height / 2) / height) * rings);
    const k = ringK[row] * (1 + (rnd() - 0.5) * 0.06);
    pos.setX(i, pos.getX(i) * k + lean * (y + height / 2));
    pos.setZ(i, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const tone = ['#c4b8a4', '#b8ad9a', '#cdbfa8'][Math.floor(rnd() * 3)];
  g.add(mesh(geo, kit.mat(tone), 0, height / 2, 0));
  // A darker band of strata partway up.
  const bandY = height * (0.3 + rnd() * 0.3);
  const bandR = radius * (1 - (bandY / height) * 0.26) * 1.04;
  g.add(
    mesh(
      kit.own(new THREE.CylinderGeometry(bandR, bandR * 1.02, height * 0.06, 10)),
      kit.mat(shade(tone, -0.08)),
      lean * bandY,
      bandY,
      0,
    ),
  );
  // The mossy crown.
  const topR = radius * 0.74 * ringK[rings];
  const crown = mesh(
    kit.geo('karstCrown', () => new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
    kit.mat(rnd() < 0.5 ? '#4f8f36' : '#5a9a3c'),
    lean * height,
    height - 0.05,
    0,
  );
  crown.scale.set(topR * 1.08, Math.max(0.5, topR * 0.42), topR * 1.08);
  g.add(crown);
  // A collar of moss hanging over the rim.
  g.add(
    mesh(
      kit.own(
        new THREE.CylinderGeometry(topR * 1.09, topR * 1.0, Math.min(1.2, height * 0.08), 10),
      ),
      kit.mat('#3f7a2e'),
      lean * height,
      height - Math.min(0.6, height * 0.04),
      0,
    ),
  );
  if (radius > 1.6) {
    const pines = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < pines; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * topR * 0.55;
      const s = 0.5 + rnd() * 0.5 + radius * 0.04;
      const pine = mesh(
        kit.geo('karstPine', () => new THREE.ConeGeometry(0.7, 2.2, 7).translate(0, 1.1, 0)),
        kit.mat('#245f35'),
        lean * height + Math.sin(a) * d,
        height + topR * 0.2,
        Math.cos(a) * d,
      );
      pine.scale.setScalar(s);
      g.add(pine);
    }
  }
  return g;
}

/** A soft, glowing wisp of evening mist (a camera-facing sprite). */
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
  g.add(makeBoulder(kit, rnd, 0.95, '#6f7483'));
  g.add(makeBoulder(kit, rnd, 0.5, '#7d8291').translateX(0.8));
  const crystal = kit.geo('crystal', crystalGeo);
  const glow = kit.mat('#8fe8ff', {
    emissive: '#2aa8d8',
    emissiveIntensity: 0.75,
    roughness: 0.25,
  });
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
      g.add(mesh(kit.box(0.08, 0.08, 4.2), kit.mat('#5a5f69'), s * 0.45, 0.06, 1.7, false));
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
      for (const sz of [-1, 1]) cart.add(mesh(wheel, kit.mat('#2f2a26'), sx * 0.5, 0.2, sz * 0.45));
    const ore = kit.geo('ore', () => new THREE.DodecahedronGeometry(0.2, 0));
    for (let i = 0; i < 6; i++)
      cart.add(
        mesh(
          ore,
          kit.mat(
            i % 3 ? '#6f7483' : '#8fe8ff',
            i % 3 ? undefined : { emissive: '#2aa8d8', emissiveIntensity: 0.6 },
          ),
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

// ------------------------------------------------------------------ desert

export function makeCactus(kit: Kit, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  const green = kit.mat('#4f9a4a', { smooth: true });
  const h = 2 + rnd() * 1.5;
  const trunk = kit.geo(
    `cactus${h.toFixed(1)}`,
    () => new THREE.CapsuleGeometry(0.32, h - 0.6, 4, 10),
  );
  g.add(mesh(trunk, green, 0, h / 2, 0));
  const arm = kit.geo('cactusArm', () => new THREE.CapsuleGeometry(0.2, 0.6, 4, 8));
  const elbow = kit.geo('cactusElbow', () =>
    new THREE.CapsuleGeometry(0.2, 0.35, 4, 8).rotateZ(Math.PI / 2),
  );
  for (const side of [-1, 1]) {
    if (rnd() < 0.3) continue;
    const y = h * (0.35 + rnd() * 0.25);
    g.add(mesh(elbow, green, side * 0.45, y, 0));
    g.add(mesh(arm, green, side * 0.72, y + 0.42, 0));
  }
  if (rnd() < 0.6)
    g.add(
      mesh(
        kit.geo('cactusFlower', () => new THREE.IcosahedronGeometry(0.13, 0)),
        kit.mat('#ff6b8a'),
        0,
        h + 0.05,
        0,
        false,
      ),
    );
  return g;
}

// ------------------------------------------------------------------ player pieces

function houseParts(kit: Kit, roofColor: string, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rnd = mulberry(seed);
  const plaster = kit.mat('#f7e6c4');
  const timber = kit.mat('#6b4a2a');
  const w = 2.7;
  const d = 3.0;
  const wallH = 1.85;
  const base = 0.35;
  const rise = 1.45;
  const top = base + wallH;
  // Stone footing with a few chunky stones.
  g.add(mesh(kit.rbox(w + 0.3, base, d + 0.3, 0.06), kit.mat('#a29a8e'), 0, base / 2, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = Math.max(-1, Math.min(1, Math.sin(a) * 1.5)) * (w / 2 + 0.15);
    const z = Math.max(-1, Math.min(1, Math.cos(a) * 1.5)) * (d / 2 + 0.15);
    g.add(
      mesh(
        kit.rbox(0.42, 0.26, 0.42, 0.08),
        kit.mat(rnd() < 0.5 ? '#8f877d' : '#b0a89b'),
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
      kit.mat('#d9b44a', { roughness: 0.3 }),
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
    keep.add(mesh(kit.rbox(1.0, 1.5, 0.1, 0.05), kit.mat('#7a4f2b'), 0, 1.0, tw / 2 + 0.03, false));
    g.add(keep);
    return g;
  });
}

export function makeRoad(kit: Kit, len: number, color: string): THREE.Object3D {
  return kit.template(`road${color}${len.toFixed(2)}`, () => {
    const g = new THREE.Group();
    const rnd = mulberry(31);
    g.add(mesh(kit.rbox(len, 0.14, 1.5, 0.05), kit.mat('#b89a6e'), 0, 0.05, 0));
    // Cobbles in the owner's colour, two abreast, offset like real paving.
    const tones = [color, shade(color, -0.06), shade(color, 0.05)];
    const cobble = kit.rbox(0.5, 0.12, 0.5, 0.08);
    for (let x = -len / 2 + 0.35; x < len / 2 - 0.25; x += 0.56)
      for (const [k, z] of [
        [0, -0.3],
        [1, 0.3],
      ]) {
        const c = mesh(cobble, kit.mat(tones[Math.floor(rnd() * 3)]), x + k * 0.26, 0.15, z, false);
        c.rotation.y = (rnd() - 0.5) * 0.25;
        g.add(c);
      }
    const curb = kit.rbox(0.42, 0.14, 0.18, 0.05);
    for (let x = -len / 2 + 0.3; x < len / 2 - 0.2; x += 0.46)
      for (const z of [-0.72, 0.72])
        g.add(mesh(curb, kit.mat(rnd() < 0.5 ? '#d8cfbf' : '#c6bcaa'), x, 0.14, z, false));
    return g;
  });
}

export function makeRobber(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const cloak = kit.mat('#2b2238', { smooth: true });
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
        kit.mat('#d9b44a', { roughness: 0.3 }),
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
    g.add(mesh(hull, kit.mat('#8a5a32')));
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
      kit.mat(sailColor, { smooth: true }),
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
    const tones = ['#a0703f', '#946638', '#ab7a48'];
    for (let z = 0.2, i = 0; z < len; z += 0.42, i++)
      g.add(mesh(kit.rbox(2.3, 0.14, 0.38, 0.03), kit.mat(tones[i % 3]), 0, 0, z));
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
  const m = kit.mat('#f2b49a', {
    roughness: 1,
    emissive: '#d9707a',
    emissiveIntensity: 0.45,
    smooth: true,
  });
  m.userData.outlineParameters = { visible: false };
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
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#e6c9a8' }));
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

/** A speckled ground texture so each terrain reads as grass, soil, sand or stone. */
export function groundTexture(
  base: string,
  speck: string[],
  seed: number,
  strokes = false,
): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let s = seed >>> 0 || 1;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  // Large soft patches first, then fine detail.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 30 + rnd() * 70;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, speck[i % speck.length] + '55');
    grad.addColorStop(1, speck[i % speck.length] + '00');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = speck[i % speck.length];
    const x = rnd() * size;
    const y = rnd() * size;
    if (strokes) {
      ctx.globalAlpha = 0.8;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rnd() - 0.5) * 0.6);
      ctx.fillRect(0, 0, 2, 5 + rnd() * 7);
      ctx.restore();
    } else {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 1 + rnd() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}
