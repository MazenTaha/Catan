import * as THREE from 'three';

/**
 * The built-in wheat clump, used when the Blender-made clumps (`flora.glb`) aren't available:
 * five stalks, each with a stem, two narrow leaves and a shaped head of kernels with awns
 * (about 90 triangles); the far version keeps each stalk's silhouette in 6 triangles. Each
 * vertex carries its stalk's `wphase` for the wind shader. Fixed seeds, never the game's RNG.
 */

export type WheatDetail = 'near' | 'far';

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

interface Stalk {
  x: number;
  z: number;
  h: number;
  lean: number;
  dir: number;
  rot: number;
  head: number;
  tone: THREE.Color;
  phase: number;
}

const STEM_LO = new THREE.Color('#6f8f3c');
const STEM_HI = new THREE.Color('#d8b24e');
const LEAF = new THREE.Color('#a9a24a');
const HEAD_LO = new THREE.Color('#c8922e');
const HEAD_HI = new THREE.Color('#f4d478');
const AWN = new THREE.Color('#f6e2a6');
/** Ripe gold mostly, some deeper amber, a few paler or still a little green. */
const TONES = ['#ffffff', '#ffffff', '#fff2dc', '#ffe0b0', '#f2ffd8'].map((c) => new THREE.Color(c));

class Builder {
  pos: number[] = [];
  col: number[] = [];
  phase: number[] = [];
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, ph: number) {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
    this.phase.push(ph, ph, ph);
  }
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ca: THREE.Color, cc: THREE.Color, ph: number) {
    // a-b along the bottom, d-c along the top
    this.tri(a, b, c, ca, ca, cc, ph);
    this.tri(a, c, d, ca, cc, cc, ph);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('wphase', new THREE.Float32BufferAttribute(this.phase, 1));
    g.computeVertexNormals();
    return g;
  }
}

/** The stalk's centre line: it leans more and more towards its tip. */
function spine(s: Stalk, t: number, out: THREE.Vector3): THREE.Vector3 {
  const bend = s.lean * t * t;
  return out.set(s.x + Math.cos(s.dir) * bend, s.h * t, s.z + Math.sin(s.dir) * bend);
}

const tmp = () => new THREE.Vector3();

function nearStalk(b: Builder, s: Stalk) {
  const tone = (c: THREE.Color) => c.clone().multiply(s.tone);
  const headStart = 1 - s.head / s.h;
  // Stem: a thin three-sided tube in three segments.
  const rings: THREE.Vector3[][] = [];
  for (let k = 0; k <= 3; k++) {
    const t = (k / 3) * headStart;
    const c = spine(s, t, tmp());
    const r = 0.011 * (1 - t * 0.35);
    rings.push([0, 1, 2].map((i) => {
      const a = s.rot + (i * Math.PI * 2) / 3;
      return new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
    }));
  }
  for (let k = 0; k < 3; k++) {
    const lo = tone(STEM_LO.clone().lerp(STEM_HI, k / 3));
    const hi = tone(STEM_LO.clone().lerp(STEM_HI, (k + 1) / 3));
    for (let i = 0; i < 3; i++)
      b.quad(rings[k][i], rings[k][(i + 1) % 3], rings[k + 1][(i + 1) % 3], rings[k + 1][i], lo, hi, s.phase);
  }
  // Two narrow leaves arching out and drooping.
  for (const [t0, side] of [
    [0.22, 0],
    [0.42, 2.4],
  ]) {
    const base = spine(s, t0, tmp());
    const a = s.rot + side;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const L = 0.3 + (s.h - 1) * 0.2;
    const pts: THREE.Vector3[][] = [];
    for (let k = 0; k <= 3; k++) {
      const u = k / 3;
      const w = 0.016 * Math.sin(Math.PI * (0.12 + u * 0.8));
      const out = L * u;
      const up = L * (0.55 * u - 0.75 * u * u);
      const cx = base.x + dx * out;
      const cz = base.z + dz * out;
      pts.push([
        new THREE.Vector3(cx - dz * w, base.y + up, cz + dx * w),
        new THREE.Vector3(cx + dz * w, base.y + up, cz - dx * w),
      ]);
    }
    const lc = tone(LEAF);
    for (let k = 0; k < 3; k++) b.quad(pts[k][0], pts[k][1], pts[k + 1][1], pts[k + 1][0], lc, lc, s.phase);
  }
  // The head: kernels in a braided spindle, slightly flattened, closed with a tip.
  const RAD = 5;
  const RINGS = 5;
  const hr: THREE.Vector3[][] = [];
  for (let j = 0; j <= RINGS; j++) {
    const u = j / RINGS;
    const c = spine(s, headStart + (1 - headStart) * u * 0.94, tmp());
    const bump = 1 + 0.25 * Math.abs(Math.sin(u * Math.PI * 4.5));
    const r = 0.021 * Math.pow(Math.sin(Math.PI * (0.18 + 0.82 * u)), 0.6) * bump;
    hr.push(
      Array.from({ length: RAD }, (_, i) => {
        const a = s.rot + (i + (j % 2) * 0.5) * ((Math.PI * 2) / RAD);
        return new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r * 0.72);
      }),
    );
  }
  for (let j = 0; j < RINGS; j++) {
    const lo = tone(HEAD_LO.clone().lerp(HEAD_HI, j / RINGS)).multiplyScalar(j % 2 ? 0.92 : 1);
    const hi = tone(HEAD_LO.clone().lerp(HEAD_HI, (j + 1) / RINGS));
    for (let i = 0; i < RAD; i++)
      b.quad(hr[j][i], hr[j][(i + 1) % RAD], hr[j + 1][(i + 1) % RAD], hr[j + 1][i], lo, hi, s.phase);
  }
  const tip = spine(s, 1, tmp());
  const tc = tone(HEAD_HI);
  for (let i = 0; i < RAD; i++) b.tri(hr[RINGS][i], hr[RINGS][(i + 1) % RAD], tip, tc, tc, tc, s.phase);
  // Awns: fine bristles fanning up from the upper half of the head.
  const ac = tone(AWN);
  for (let i = 0; i < 5; i++) {
    const j = 2 + (i % 4);
    const root = hr[j][i % RAD];
    const a = s.rot + i * 1.3;
    const len = 0.06 + (i % 3) * 0.012;
    const top = new THREE.Vector3(root.x + Math.cos(a) * len * 0.35, root.y + len, root.z + Math.sin(a) * len * 0.35);
    const side = new THREE.Vector3(root.x + 0.004, root.y + 0.004, root.z);
    b.tri(root, side, top, tone(HEAD_HI), tone(HEAD_HI), ac, s.phase);
  }
}

function farStalk(b: Builder, s: Stalk) {
  const tone = (c: THREE.Color) => c.clone().multiply(s.tone);
  const headStart = 1 - s.head / s.h;
  const base = spine(s, 0, tmp());
  const top = spine(s, headStart, tmp());
  const ax = Math.cos(s.rot) * 0.014;
  const az = Math.sin(s.rot) * 0.014;
  b.quad(
    new THREE.Vector3(base.x - ax, base.y, base.z - az),
    new THREE.Vector3(base.x + ax, base.y, base.z + az),
    new THREE.Vector3(top.x + ax, top.y, top.z + az),
    new THREE.Vector3(top.x - ax, top.y, top.z - az),
    tone(STEM_LO),
    tone(STEM_HI),
    s.phase,
  );
  const tip = spine(s, 1, tmp());
  for (const a of [s.rot, s.rot + Math.PI / 2]) {
    const wx = Math.cos(a) * 0.024;
    const wz = Math.sin(a) * 0.024;
    b.quad(
      new THREE.Vector3(top.x - wx, top.y, top.z - wz),
      new THREE.Vector3(top.x + wx, top.y, top.z + wz),
      new THREE.Vector3(tip.x + wx * 0.4, tip.y + 0.04, tip.z + wz * 0.4),
      new THREE.Vector3(tip.x - wx * 0.4, tip.y + 0.04, tip.z - wz * 0.4),
      tone(HEAD_LO),
      tone(HEAD_HI),
      s.phase,
    );
  }
}

/** One clump of five stalks (four in lite mode); near and far share the same layout. */
export function wheatClumpGeometry(detail: WheatDetail, lite: boolean): THREE.BufferGeometry {
  const rnd = mulberry(0x3eed);
  const n = lite ? 4 : 5;
  const common = rnd() * Math.PI * 2;
  const stalks: Stalk[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.8;
    const r = 0.04 + rnd() * 0.11;
    stalks.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      h: 0.95 + rnd() * 0.3,
      lean: 0.04 + rnd() * 0.12,
      dir: common + (rnd() - 0.5) * 1.6,
      rot: rnd() * Math.PI * 2,
      head: 0.12 + rnd() * 0.05,
      tone: TONES[Math.floor(rnd() * TONES.length)],
      phase: rnd(),
    });
  }
  const b = new Builder();
  for (const s of stalks) (detail === 'near' ? nearStalk : farStalk)(b, s);
  return b.geometry();
}
