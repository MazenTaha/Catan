import type { BufferGeometry } from 'three';

interface Triangle {
  x: number;
  z: number;
  y: number;
  ux: number;
  uz: number;
  uy: number;
  vx: number;
  vz: number;
  vy: number;
  inv: number;
}

/** Height of the rendered triangles, rather than the noise function between their vertices. */
export class GroundSurface {
  private cells = new Map<string, Triangle[]>();

  constructor(geometry: BufferGeometry) {
    const p = geometry.attributes.position;
    const idx = geometry.index;
    for (let i = 0; i < (idx?.count ?? p.count); i += 3) {
      const a = idx?.getX(i) ?? i,
        b = idx?.getX(i + 1) ?? i + 1,
        c = idx?.getX(i + 2) ?? i + 2;
      const t: Triangle = {
        x: p.getX(a),
        z: p.getZ(a),
        y: p.getY(a),
        ux: p.getX(b) - p.getX(a),
        uz: p.getZ(b) - p.getZ(a),
        uy: p.getY(b) - p.getY(a),
        vx: p.getX(c) - p.getX(a),
        vz: p.getZ(c) - p.getZ(a),
        vy: p.getY(c) - p.getY(a),
        inv: 0,
      };
      const det = t.ux * t.vz - t.uz * t.vx;
      if (Math.abs(det) < 1e-8) continue; // Vertical skirts cannot support a foot.
      t.inv = 1 / det;
      const x0 = Math.floor(Math.min(t.x, t.x + t.ux, t.x + t.vx) / 2);
      const x1 = Math.floor(Math.max(t.x, t.x + t.ux, t.x + t.vx) / 2);
      const z0 = Math.floor(Math.min(t.z, t.z + t.uz, t.z + t.vz) / 2);
      const z1 = Math.floor(Math.max(t.z, t.z + t.uz, t.z + t.vz) / 2);
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const key = `${x},${z}`;
          const list = this.cells.get(key);
          if (list) list.push(t);
          else this.cells.set(key, [t]);
        }
    }
  }

  height(x: number, z: number): number | undefined {
    const list = this.cells.get(`${Math.floor(x / 2)},${Math.floor(z / 2)}`);
    if (!list) return undefined;
    for (const t of list) {
      const dx = x - t.x,
        dz = z - t.z;
      const u = (dx * t.vz - dz * t.vx) * t.inv;
      const v = (t.ux * dz - t.uz * dx) * t.inv;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1.000001) return t.y + t.uy * u + t.vy * v;
    }
    return undefined;
  }
}
