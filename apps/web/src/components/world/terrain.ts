import * as THREE from 'three';
import type { Terrain } from '@hexfall/engine';

/**
 * The ground of the 3D walk: one gently shaped surface per land tile (pastures roll, hills
 * mound, dunes ripple, fields stay nearly flat), painted with vertex colours (meadow patches,
 * worn paths, clay pits, scree) over a neutral per-terrain detail texture.
 *
 * Heights are zero along every tile edge (where roads run and settlements stand), calm around
 * the centre sign, and flattened under props, so world placement never depends on the mesh.
 * Everything is a pure function of the tile's own seed: no game RNG, no `Math.random`.
 */

/** Hex circumradius in metres: a land tile is ~24 m across, a few seconds' walk. */
export const R = 14;
const APOTHEM = (R * Math.sqrt(3)) / 2;

// ------------------------------------------------------------------ noise

function hash(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [-1, 1]. */
export function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm(x: number, z: number, seed: number, octaves = 3): number {
  let s = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    s += vnoise(x, z, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    z *= 2.03;
  }
  return s / norm;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Distance from a tile-local point to the tile's edge (positive inside). */
export function edgeDistance(x: number, z: number): number {
  const k = Math.sqrt(3) / 2;
  return APOTHEM - Math.max(Math.abs(x), Math.abs(x / 2 + z * k), Math.abs(x / 2 - z * k));
}

// ------------------------------------------------------------------ tiles

/** A level patch under a prop (`h` = 0) or a dug pit (`h` < 0), in tile-local metres. */
export interface Flat {
  x: number;
  z: number;
  r: number;
  h?: number;
}

/** A worn path painted on the ground, tile-local. */
export interface Path {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  w: number;
}

export interface TileGround {
  terrain: Terrain;
  cx: number;
  cz: number;
  seed: number;
  /** The direction the wind has shaped the dunes (desert only). */
  grain: number;
  flats: Flat[];
  paths: Path[];
  /** Dark, mossy ground under trees. */
  shade: { x: number; z: number; r: number }[];
  /** Field plots: a function telling which plot a point is in (-1 = none). */
  plot?: (x: number, z: number) => number;
  plotTone?: string[];
}

const AMP: Record<Terrain, number> = {
  moors: 0.55,
  witchwood: 0.4,
  fields: 0.12,
  ashen: 1.0,
  peaks: 0.8,
  waste: 0.75,
};

/** Unflattened relief of a tile at a tile-local point. */
function relief(t: TileGround, x: number, z: number): number {
  const s = t.seed;
  switch (t.terrain) {
    case 'waste': {
      // Long crescent dunes across the wind, steeper on the lee side.
      const dx = Math.cos(t.grain);
      const dz = Math.sin(t.grain);
      const u = (x * dx + z * dz) / 4.2 + fbm(x / 9, z / 9, s) * 1.4;
      const w = Math.sin(u);
      const crest = w > 0 ? Math.pow(w, 1.6) : w * 0.35;
      return crest * 0.9 + fbm(x / 5, z / 5, s + 7) * 0.12;
    }
    case 'ashen': {
      // Rounded clay mounds.
      const m = fbm(x / 7.5, z / 7.5, s, 3);
      return Math.max(-0.3, m) * 1.1 + 0.15;
    }
    case 'peaks':
      return Math.abs(fbm(x / 5.5, z / 5.5, s, 4)) * 1.2 - 0.2;
    default:
      return fbm(x / 8, z / 8, s, 3);
  }
}

/** Ground height at a tile-local point, in metres. */
export function tileHeight(t: TileGround, x: number, z: number): number {
  const e = edgeDistance(x, z);
  if (e <= 0) return 0;
  let h = relief(t, x, z) * AMP[t.terrain] * smooth(0.8, 4.2, e) * smooth(1.4, 3.8, Math.hypot(x, z));
  for (const f of t.flats) {
    const d = Math.hypot(x - f.x, z - f.z);
    const k = smooth(f.r, f.r + 2.4, d);
    const target = f.h ?? 0;
    if (target < 0) {
      // A pit: stepped walls, like a worked clay face.
      const inner = 1 - smooth(f.r * 0.3, f.r, d);
      const steps = Math.round(inner * 3) / 3;
      h = h * k + target * steps;
    } else {
      h = h * k + target * (1 - k);
    }
  }
  return h;
}

// ------------------------------------------------------------------ colours

const C = (hex: string) => new THREE.Color(hex);

/** Per-terrain ground colours: light, middle and shadow values, a worn path and a grass tone. */
const PALETTE: Record<
  Terrain,
  { a: THREE.Color; b: THREE.Color; c: THREE.Color; path: THREE.Color; grass: THREE.Color }
> = {
  moors: { a: C('#86c450'), b: C('#62a83e'), c: C('#438a36'), path: C('#a9915a'), grass: C('#62a83e') },
  witchwood: { a: C('#5f9c44'), b: C('#4a8338'), c: C('#356a30'), path: C('#86704a'), grass: C('#4a8338') },
  fields: { a: C('#b99748'), b: C('#a07e3a'), c: C('#8a6a30'), path: C('#c9ae74'), grass: C('#8aa63e') },
  ashen: { a: C('#d68a52'), b: C('#bf6a3c'), c: C('#9a4c2c'), path: C('#a86a44'), grass: C('#7aa54a') },
  peaks: { a: C('#9aa5ad'), b: C('#808c96'), c: C('#66727c'), path: C('#8f938c'), grass: C('#6f9a4c') },
  waste: { a: C('#f6dfa6'), b: C('#eccb88'), c: C('#d7ac6c'), path: C('#dcb87a'), grass: C('#c2b077') },
};
const VERGE = C('#7f8a4a');
const PIT = C('#8a3f24');
const MOSS = C('#2b4a2a');

function segDist(x: number, z: number, p: Path): number {
  const vx = p.bx - p.ax;
  const vz = p.bz - p.az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - p.ax) * vx + (z - p.az) * vz) / l2)) : 0;
  return Math.hypot(x - (p.ax + vx * t), z - (p.az + vz * t));
}

/** Is a tile-local point on one of the tile's paths (within `pad` metres)? */
export function onPath(t: TileGround, x: number, z: number, pad = 0): boolean {
  return t.paths.some((p) => segDist(x, z, p) < p.w / 2 + pad);
}

function groundColor(t: TileGround, x: number, z: number, h: number, slope: number, out: THREE.Color) {
  const p = PALETTE[t.terrain];
  const n = fbm(x / 6, z / 6, t.seed + 31, 2);
  const m = fbm(x / 2.2, z / 2.2, t.seed + 57, 2);
  if (n > 0) out.copy(p.b).lerp(p.a, Math.min(1, n * 1.6));
  else out.copy(p.b).lerp(p.c, Math.min(1, -n * 1.6));
  out.multiplyScalar(1 + m * 0.07);

  switch (t.terrain) {
    case 'waste':
      // Sun on the dune crests, the lee faces in soft shade.
      out.lerp(p.a, smooth(0.2, 0.7, h) * 0.6).lerp(p.c, smooth(0.0, -0.3, h) * 0.5);
      break;
    case 'ashen':
      // Grass on the tops of the mounds, bare clay on their flanks.
      out.lerp(p.grass, smooth(0.55, 0.95, h) * (1 - smooth(0.15, 0.4, slope)) * 0.75);
      break;
    case 'peaks':
      // Scree, with alpine grass only in sheltered, level patches.
      out.lerp(p.grass, (1 - smooth(0.1, 0.25, slope)) * smooth(0.25, 0.6, n) * 0.5);
      break;
    case 'fields':
      if (t.plot && t.plotTone) {
        const k = t.plot(x, z);
        if (k >= 0) out.lerp(C(t.plotTone[k]), 0.75);
      }
      break;
  }
  for (const s of t.shade) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r) out.lerp(MOSS, (1 - d / s.r) * 0.25);
  }
  for (const f of t.flats)
    if ((f.h ?? 0) < 0) {
      const d = Math.hypot(x - f.x, z - f.z);
      out.lerp(PIT, 1 - smooth(f.r * 0.6, f.r + 0.8, d));
    }
  let path = 0;
  for (const pth of t.paths) path = Math.max(path, 1 - smooth(pth.w * 0.3, pth.w * 0.55, segDist(x, z, pth)));
  if (path > 0) out.lerp(p.path, path * (0.75 + m * 0.15));
  // A worn verge along the tile's edge, where the roads run.
  const e = edgeDistance(x, z);
  if (t.terrain !== 'waste' && t.terrain !== 'peaks') out.lerp(VERGE, (1 - smooth(0.2, 1.1, e)) * 0.55);
}

// ------------------------------------------------------------------ mesh

/**
 * A triangulated hex (six fans subdivided `n` times) with heights and colours, plus a short
 * skirt down to the beach so coastal edges never show a gap. Tile-local, y up.
 */
export function buildGround(t: TileGround, n: number): THREE.BufferGeometry {
  const corners: [number, number][] = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 3;
    corners.push([Math.cos(a) * R, -Math.sin(a) * R]);
  }
  const pos: number[] = [];
  const idx: number[] = [];
  const keyOf = new Map<string, number>();
  const vert = (x: number, z: number): number => {
    const key = `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
    let i = keyOf.get(key);
    if (i === undefined) {
      i = pos.length / 3;
      keyOf.set(key, i);
      pos.push(x, tileHeight(t, x, z), z);
    }
    return i;
  };
  for (let k = 0; k < 6; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[(k + 1) % 6];
    // Barycentric grid over the triangle (centre, a, b).
    const at = (i: number, j: number) => {
      const u = i / n;
      const v = j / n;
      return vert(ax * u + bx * v, az * u + bz * v);
    };
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n - i; j++) {
        const p0 = at(i, j);
        const p1 = at(i + 1, j);
        const p2 = at(i, j + 1);
        idx.push(p0, p1, p2);
        if (j < n - i - 1) {
          const p3 = at(i + 1, j + 1);
          idx.push(p1, p3, p2);
        }
      }
  }
  // Skirt.
  for (let k = 0; k < 6; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[(k + 1) % 6];
    const a0 = vert(ax, az);
    const b0 = vert(bx, bz);
    const a1 = pos.length / 3;
    pos.push(ax * 1.02, -0.5, az * 1.02);
    const b1 = a1 + 1;
    pos.push(bx * 1.02, -0.5, bz * 1.02);
    idx.push(a0, a1, b0, b0, a1, b1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  const count = pos.length / 3;
  const col = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3];
    const y = pos[i * 3 + 1];
    const z = pos[i * 3 + 2];
    const slope = 1 - nrm.getY(i);
    if (y < -0.45) c.copy(PALETTE[t.terrain].c).multiplyScalar(0.6);
    else groundColor(t, x, z, y, slope, c);
    col.set([c.r, c.g, c.b], i * 3);
    uv.set([x, z], i * 2);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * A neutral detail texture (values around 0.9) multiplied over the vertex colours: blades of
 * grass, soil crumbs, sand ripples or rock grain. It carries texture, not colour.
 */
export function detailTexture(kind: 'grass' | 'soil' | 'sand' | 'rock', seed: number): THREE.CanvasTexture {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#e6e6e6';
  ctx.fillRect(0, 0, size, size);
  let s = seed >>> 0 || 1;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const tone = (v: number, a: number) => `rgba(${v},${v},${v},${a})`;
  for (let i = 0; i < 24; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 20 + rnd() * 50;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = rnd() < 0.5 ? 255 : 190;
    gr.addColorStop(0, tone(v, 0.35));
    gr.addColorStop(1, tone(v, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const n = kind === 'grass' ? 2600 : kind === 'sand' ? 900 : 1600;
  for (let i = 0; i < n; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const v = rnd() < 0.5 ? 255 : 178 + rnd() * 34;
    ctx.fillStyle = tone(Math.round(v), kind === 'sand' ? 0.22 : kind === 'grass' ? 0.4 : 0.3);
    if (kind === 'grass') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rnd() - 0.5) * 0.7);
      ctx.fillRect(0, 0, 1.5, 4 + rnd() * 6);
      ctx.restore();
    } else if (kind === 'sand') {
      ctx.fillRect(x, y, 6 + rnd() * 10, 1);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + rnd() * (kind === 'rock' ? 3 : 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

export const DETAIL_KIND: Record<Terrain, 'grass' | 'soil' | 'sand' | 'rock'> = {
  moors: 'grass',
  witchwood: 'grass',
  fields: 'soil',
  ashen: 'soil',
  peaks: 'rock',
  waste: 'sand',
};
