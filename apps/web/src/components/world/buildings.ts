import plans from './buildings.json';

/**
 * Enterable buildings: what the walker collides with, where the floor is and how the doors
 * swing, all read from the same plan the Blender builders use (`buildings.json`, sources in
 * `assets/blender/homes.py`). Collision never comes from the meshes: walls are capsules along
 * their centre lines with gaps at the doorways, furniture boxes become capsules, and the few
 * solid things outside (the hall's tower and buttresses, a log pile) are listed here from the
 * same dimensions the builder uses.
 *
 * Scale convention (metres, docs/BLENDER_ASSET_PIPELINE.md): a land tile is 14 m centre to
 * corner, the eye is 1.7 m above the floor, doors are 2.1-2.5 m high and 1.05-1.5 m wide,
 * rooms 2.6-3.6 m to the ceiling. A building stands on its board corner, front towards the
 * island's centre; the board itself is never stretched.
 */

export type BuildingKind = 'cottage' | 'hall' | 'mill';

/** A capsule on the ground in building-local metres (x, z), as the world's colliders. */
export interface Capsule {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

export interface DoorSpec {
  /** Node name in the model. */
  node: string;
  /** Hinge (local) and the closed leaf's direction from it. */
  hx: number;
  hz: number;
  ax: number;
  az: number;
  len: number;
  /** +1 or -1: the sign of rotation about +Y that swings the leaf inwards. */
  sign: number;
  /** Open angle, radians. */
  open: number;
  /** Middle of the doorway, its outward normal, and a safe spot outside it. */
  cx: number;
  cz: number;
  nx: number;
  nz: number;
}

export interface BuildingShape {
  kind: BuildingKind;
  /** The model's child node holding furniture and props. */
  interior: string;
  floor: number;
  ceiling: number;
  colliders: Capsule[];
  doors: DoorSpec[];
  /** Inside the room (clear floor area). */
  inside(x: number, z: number): boolean;
  /** On the building's floor (room plus walls and thresholds). */
  onFloor(x: number, z: number): boolean;
}

interface WallPlan {
  wall: string;
  at: number;
  w: number;
  h: number;
  hinge?: string;
  open?: number;
}
interface FurniturePlan {
  kind: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}
interface RoomPlan {
  node: string;
  inner?: number[];
  radius?: number;
  sides?: number;
  wall: number;
  floor: number;
  ceiling: number;
  doors: WallPlan[];
  windows: unknown[];
  furniture: FurniturePlan[];
}

const PLANS = plans as unknown as Record<BuildingKind, RoomPlan>;

/** A wall's inner-face centre, its direction (along which 'at' grows), outward normal and length. */
interface Wall {
  bx: number;
  bz: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  len: number;
}

function wallsOf(kind: BuildingKind, p: RoomPlan): Record<string, Wall> {
  if (kind === 'mill') {
    const k = p.sides!;
    const a = p.radius!;
    const out: Record<string, Wall> = {};
    for (let i = 0; i < k; i++) {
      const ang = (i * Math.PI * 2) / k;
      const nx = Math.sin(ang);
      const nz = Math.cos(ang);
      out[i === 0 ? 'front' : `side${i}`] = { bx: nx * a, bz: nz * a, ux: Math.cos(ang), uz: -Math.sin(ang), nx, nz, len: 2 * a * Math.tan(Math.PI / k) };
    }
    return out;
  }
  const [w, d] = p.inner!;
  return {
    front: { bx: 0, bz: d / 2, ux: 1, uz: 0, nx: 0, nz: 1, len: w },
    back: { bx: 0, bz: -d / 2, ux: 1, uz: 0, nx: 0, nz: -1, len: w },
    left: { bx: -w / 2, bz: 0, ux: 0, uz: 1, nx: -1, nz: 0, len: d },
    right: { bx: w / 2, bz: 0, ux: 0, uz: 1, nx: 1, nz: 0, len: d },
  };
}

/** A box as a capsule along its longer side. */
function boxCapsule(x: number, z: number, w: number, d: number, pad = 0): Capsule {
  if (w >= d) return { ax: x - (w - d) / 2, az: z, bx: x + (w - d) / 2, bz: z, r: d / 2 + pad };
  return { ax: x, az: z - (d - w) / 2, bx: x, bz: z + (d - w) / 2, r: w / 2 + pad };
}

function build(kind: BuildingKind): BuildingShape {
  const p = PLANS[kind];
  const t = p.wall;
  const r = t / 2;
  const walls = wallsOf(kind, p);
  const colliders: Capsule[] = [];
  // Walls along their centre lines, corner to corner, broken at each doorway so the capsule's
  // rounded end lines up with the jamb.
  for (const [name, wl] of Object.entries(walls)) {
    const cx = wl.bx + wl.nx * r;
    const cz = wl.bz + wl.nz * r;
    // Centre-line length: rectangles run to the corner centre lines, polygons to the corners.
    const half = kind === 'mill' ? (wl.len / 2) * (1 + t / 2 / p.radius!) : wl.len / 2 + r;
    const gaps = p.doors.filter((dr) => dr.wall === name).map((dr) => [dr.at - dr.w / 2 - r, dr.at + dr.w / 2 + r]);
    let s = -half;
    for (const [g0, g1] of gaps.sort((x, y) => x[0] - y[0])) {
      if (g0 > s) colliders.push({ ax: cx + wl.ux * s, az: cz + wl.uz * s, bx: cx + wl.ux * g0, bz: cz + wl.uz * g0, r });
      s = g1;
    }
    if (half > s) colliders.push({ ax: cx + wl.ux * s, az: cz + wl.uz * s, bx: cx + wl.ux * half, bz: cz + wl.uz * half, r });
  }
  for (const f of p.furniture) if (f.h > 0) colliders.push(boxCapsule(f.x, f.z, f.w, f.d, 0.02));
  // Solid things outside, from the same dimensions as in homes.py.
  if (kind === 'cottage') {
    const [w, d] = p.inner!;
    colliders.push({ ax: -w / 2 - t - 0.3, az: -0.85, bx: -w / 2 - t - 0.3, bz: 1.0, r: 0.22 }); // log pile
    colliders.push({ ax: w / 2 + t + 0.4, az: d / 2 - 0.2, bx: w / 2 + t + 0.4, bz: d / 2 - 0.2, r: 0.36 }); // water butt
  } else if (kind === 'hall') {
    const [w, d] = p.inner!;
    const W = w + 2 * t;
    const D = d + 2 * t;
    colliders.push({ ax: -W / 2 - 0.9, az: -D / 2 - 0.7, bx: -W / 2 - 0.9, bz: -D / 2 - 0.7, r: 1.55 }); // tower
    for (const sx of [-1, 1])
      for (const zz of [-d / 2 + 0.2, d / 2 - 0.2]) colliders.push(boxCapsule(sx * (W / 2 + 0.22), zz, 0.44, 0.7));
    for (const sx of [-1, 1]) colliders.push({ ax: sx * 1.25, az: d / 2 + t + 1.25, bx: sx * 1.25, bz: d / 2 + t + 1.25, r: 0.12 }); // porch posts
  } else {
    const a = p.radius!;
    colliders.push({ ax: 1.2, az: a + t + 0.5, bx: 2.0, bz: a + t + 0.5, r: 0.26 }); // sacks by the door
  }
  const names = p.doors.length > 1 ? p.doors.map((_, i) => `${p.node}Door${'AB'[i]}`) : [`${p.node}Door`];
  const doors: DoorSpec[] = p.doors.map((dr, i) => {
    const wl = walls[dr.wall];
    const sh = dr.hinge === 'b' ? dr.at + dr.w / 2 - 0.02 : dr.at - dr.w / 2 + 0.02;
    const dir = dr.hinge === 'b' ? -1 : 1;
    const ax = wl.ux * dir;
    const az = wl.uz * dir;
    // d/dθ of the leaf's direction rotated about +Y is (az, -ax): pick the sign that swings inwards.
    const sign = az * -wl.nx + -ax * -wl.nz >= 0 ? 1 : -1;
    return {
      node: names[i],
      hx: wl.bx + wl.ux * sh + wl.nx * (t * 0.3),
      hz: wl.bz + wl.uz * sh + wl.nz * (t * 0.3),
      ax,
      az,
      len: dr.w - 0.04,
      sign,
      open: ((dr.open ?? 90) * Math.PI) / 180,
      cx: wl.bx + wl.ux * dr.at + wl.nx * r,
      cz: wl.bz + wl.uz * dr.at + wl.nz * r,
      nx: wl.nx,
      nz: wl.nz,
    };
  });
  let inside: (x: number, z: number) => boolean;
  let onFloor: (x: number, z: number) => boolean;
  if (kind === 'mill') {
    const a = p.radius!;
    inside = (x, z) => Math.hypot(x, z) < a;
    onFloor = (x, z) => Math.hypot(x, z) < a + t + 0.05;
  } else {
    const [w, d] = p.inner!;
    inside = (x, z) => Math.abs(x) < w / 2 && Math.abs(z) < d / 2;
    onFloor = (x, z) => Math.abs(x) < w / 2 + t + 0.05 && Math.abs(z) < d / 2 + t + 0.05;
  }
  return { kind, interior: `${p.node}Interior`, floor: p.floor, ceiling: p.ceiling, colliders, doors, inside, onFloor };
}

const cache = new Map<BuildingKind, BuildingShape>();

export function buildingShape(kind: BuildingKind): BuildingShape {
  let s = cache.get(kind);
  if (!s) cache.set(kind, (s = build(kind)));
  return s;
}

/** Building-local (x, z) to world for a building at (px, pz) turned by `rot` about +Y (three's convention). */
export function toWorld(x: number, z: number, px: number, pz: number, rot: number): [number, number] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [px + x * c + z * s, pz - x * s + z * c];
}

export function toLocal(x: number, z: number, px: number, pz: number, rot: number): [number, number] {
  const dx = x - px;
  const dz = z - pz;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [dx * c - dz * s, dx * s + dz * c];
}
