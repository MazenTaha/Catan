import * as THREE from 'three';

/**
 * Small plants in quantity (wheat, grass, flowers), instanced in square cells. Each cell draws
 * its near visuals (one instanced mesh per variant part) close to the walker, its mid and far
 * visuals further out, and nothing beyond `maxDist`, so the clumps you stand among have detail
 * while distant fields stay cheap and empty cells cost nothing. Placement comes from the world's own
 * seeded RNG; the GPU does all the motion.
 */

/** A circle on the ground kept clear of plants and props (round a building). */
export interface Circle {
  x: number;
  z: number;
  r: number;
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Every instance of the scattered plants and props, so the ones standing where a building goes
 * up can be hidden (scaled to nothing) and shown again if it goes. Placement itself never
 * changes: buildings come from the game, scenery from the world's own seed.
 */
export class Clearings {
  private entries: { mesh: THREE.InstancedMesh; i: number; m: THREE.Matrix4; x: number; z: number; hidden: boolean }[] = [];

  add(mesh: THREE.InstancedMesh, i: number, m: THREE.Matrix4) {
    this.entries.push({ mesh, i, m, x: m.elements[12], z: m.elements[14], hidden: false });
  }

  /** Hides every instance inside one of `circles` and shows the others again. */
  apply(circles: Circle[]) {
    const touched = new Set<THREE.InstancedMesh>();
    for (const e of this.entries) {
      let hide = false;
      for (const c of circles) {
        const dx = e.x - c.x;
        const dz = e.z - c.z;
        if (dx * dx + dz * dz < c.r * c.r) {
          hide = true;
          break;
        }
      }
      if (hide === e.hidden) continue;
      e.hidden = hide;
      e.mesh.setMatrixAt(e.i, hide ? HIDDEN : e.m);
      touched.add(e.mesh);
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }
}

export interface PlantVisual {
  /** `depth`: an optional depth-only pre-pass material (cut-out foliage). */
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material; depth?: THREE.Material }[];
}

interface Item {
  v: number;
  m: THREE.Matrix4;
  c: THREE.Color;
}

interface Cell {
  cx: number;
  cz: number;
  near: THREE.Group;
  mid: THREE.Group | null;
  far: THREE.Group | null;
}

/** An optional middle level of detail, used out to `dist` metres. */
export interface MidTier {
  visual: PlantVisual;
  dist: number;
}

export class Field {
  private items: Item[] = [];
  private cells: Cell[] = [];
  readonly group = new THREE.Group();

  /**
   * @param near one visual per variant
   * @param far drawn beyond `nearDist` (null: nothing)
   * @param cell cell size, metres
   * @param nearDist cells closer than this draw the near visuals
   * @param maxDist cells further than this draw nothing
   * @param mid an optional middle level of detail between near and far
   */
  constructor(
    name: string,
    private near: PlantVisual[],
    private far: PlantVisual | null,
    private cell: number,
    private nearDist: number,
    private maxDist = Infinity,
    private mid: MidTier | null = null,
  ) {
    this.group.name = name;
  }

  get count(): number {
    return this.items.length;
  }

  get variants(): number {
    return this.near.length;
  }

  add(variant: number, m: THREE.Matrix4, tint: THREE.Color) {
    this.items.push({ v: variant % this.near.length, m, c: tint });
  }

  build(scene: THREE.Scene, clearings?: Clearings) {
    const byCell = new Map<string, Item[]>();
    const p = new THREE.Vector3();
    for (const it of this.items) {
      p.setFromMatrixPosition(it.m);
      const key = `${Math.floor(p.x / this.cell)},${Math.floor(p.z / this.cell)}`;
      let list = byCell.get(key);
      if (!list) byCell.set(key, (list = []));
      list.push(it);
    }
    for (const [key, list] of byCell) {
      const [i, j] = key.split(',').map(Number);
      const near = new THREE.Group();
      this.near.forEach((vis, v) => {
        const mine = list.filter((it) => it.v === v);
        if (!mine.length) return;
        for (const part of vis.parts) {
          const im = instanced(part, mine, clearings);
          near.add(im);
          if (part.depth) {
            // Depth pre-pass twin (shares the instance buffer), drawn before everything else.
            const pre = new THREE.InstancedMesh(part.geometry, part.depth, mine.length);
            pre.instanceMatrix = im.instanceMatrix;
            pre.boundingSphere = im.boundingSphere;
            pre.renderOrder = -1;
            near.add(pre);
          }
        }
      });
      const tier = (vis: PlantVisual | null) => {
        if (!vis) return null;
        const g = new THREE.Group();
        for (const part of vis.parts) g.add(instanced(part, list, clearings));
        g.visible = false;
        this.group.add(g);
        return g;
      };
      this.group.add(near);
      const mid = tier(this.mid?.visual ?? null);
      const far = tier(this.far);
      this.cells.push({ cx: (i + 0.5) * this.cell, cz: (j + 0.5) * this.cell, near, mid, far });
    }
    scene.add(this.group);
  }

  /** Near detail around the walker, then mid, then far, nothing past `maxDist`. */
  update(x: number, z: number) {
    const midDist = this.mid ? this.mid.dist : this.nearDist;
    for (const c of this.cells) {
      const d = Math.hypot(c.cx - x, c.cz - z);
      const near = d < this.nearDist;
      const mid = !near && !!c.mid && d < midDist;
      c.near.visible = near;
      if (c.mid) c.mid.visible = mid;
      if (c.far) c.far.visible = !near && !mid && d < this.maxDist;
      else if (d > this.maxDist) c.near.visible = false;
    }
  }
}

function instanced(part: PlantVisual['parts'][number], items: Item[], clearings?: Clearings): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(part.geometry, part.material, items.length);
  items.forEach((it, k) => {
    im.setMatrixAt(k, it.m);
    im.setColorAt(k, it.c);
    clearings?.add(im, k, it.m);
  });
  im.castShadow = false;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  return im;
}

/** A stable variant index for a world position (decorative only; never the game RNG). */
export function variantAt(x: number, z: number, n: number): number {
  let h = Math.imul(Math.round(x * 100), 374761393) ^ Math.imul(Math.round(z * 100), 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % n;
}
