import * as THREE from 'three';

/**
 * Low-poly, chunky models for the 3D walk, built from primitives (no asset files).
 * Every model faces +Z and stands on y = 0. Materials and geometries are shared through a
 * per-world `Kit` so the whole scene can be disposed in one sweep.
 */
export class Kit {
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private geos = new Map<string, THREE.BufferGeometry>();

  mat(
    color: string,
    extra?: { emissive?: string; emissiveIntensity?: number; roughness?: number },
  ): THREE.MeshStandardMaterial {
    const key = `${color}|${extra?.emissive ?? ''}|${extra?.emissiveIntensity ?? ''}|${extra?.roughness ?? ''}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        flatShading: true,
        roughness: extra?.roughness ?? 0.85,
        metalness: 0,
        emissive: extra?.emissive ?? '#000000',
        emissiveIntensity: extra?.emissiveIntensity ?? 1,
      });
      this.mats.set(key, m);
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

  dispose(): void {
    this.mats.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
    this.geos.forEach((g) => g.dispose());
    this.mats.clear();
    this.geos.clear();
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

/** Two roof slabs over a gable of half-width `hw` and rise `h`, running along z. */
function roof(
  kit: Kit,
  hw: number,
  h: number,
  d: number,
  color: string,
  overhang = 0.35,
): THREE.Group {
  const g = new THREE.Group();
  const len = Math.hypot(hw, h) + overhang;
  const ang = Math.atan2(h, hw);
  const slab = kit.box(len, 0.22, d + overhang * 2);
  for (const side of [-1, 1]) {
    const m = mesh(slab, kit.mat(color));
    m.rotation.z = -side * ang;
    m.position.set((side * (hw - overhang * Math.cos(ang))) / 2, h / 2 + 0.08, 0);
    g.add(m);
  }
  return g;
}

// ------------------------------------------------------------------ sheep

export interface SheepRig {
  root: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
}

export function makeSheep(kit: Kit, rnd: () => number): SheepRig {
  const root = new THREE.Group();
  const wool = kit.mat(rnd() < 0.15 ? '#d9d2c3' : '#f6f2ea', { roughness: 1 });
  const skin = kit.mat('#3a2e28');
  const puff = kit.geo('puff', () => new THREE.IcosahedronGeometry(0.3, 0));
  const bodyGeo = kit.geo('sheepBody', () => new THREE.IcosahedronGeometry(0.5, 1));

  const body = mesh(bodyGeo, wool, 0, 0.66, 0);
  body.scale.set(0.82, 0.72, 1.18);
  root.add(body);
  const puffs: [number, number, number][] = [
    [0, 0.98, 0.18],
    [0, 0.96, -0.22],
    [0.26, 0.82, 0.05],
    [-0.26, 0.82, -0.05],
    [0, 0.72, -0.5],
  ];
  for (const [x, y, z] of puffs) root.add(mesh(puff, wool, x, y, z));

  const head = new THREE.Group();
  head.position.set(0, 0.8, 0.52);
  const face = mesh(kit.box(0.28, 0.3, 0.38), skin, 0, -0.04, 0.17);
  head.add(face);
  const tuft = mesh(puff, wool, 0, 0.12, 0.08);
  tuft.scale.setScalar(0.55);
  head.add(tuft);
  const ear = kit.box(0.18, 0.06, 0.1);
  for (const side of [-1, 1]) {
    const e = mesh(ear, skin, side * 0.2, 0.04, 0.08);
    e.rotation.z = side * -0.4;
    head.add(e);
  }
  const eye = kit.box(0.05, 0.05, 0.02);
  for (const side of [-1, 1])
    head.add(mesh(eye, kit.mat('#111111'), side * 0.1, 0.03, 0.365, false));
  root.add(head);

  const legs: THREE.Group[] = [];
  const legGeo = kit.box(0.11, 0.46, 0.11);
  for (const [x, z] of [
    [0.2, 0.3],
    [-0.2, 0.3],
    [0.2, -0.32],
    [-0.2, -0.32],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.46, z);
    pivot.add(mesh(legGeo, skin, 0, -0.23, 0));
    root.add(pivot);
    legs.push(pivot);
  }
  root.scale.setScalar(0.9 + rnd() * 0.25);
  return { root, head, legs };
}

// ------------------------------------------------------------------ farm

export function makeBarn(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const red = kit.mat('#b8392f');
  const trim = kit.mat('#f4efe4');
  const w = 5.2;
  const h = 3.2;
  const d = 6.4;
  g.add(mesh(kit.box(w, h, d), red, 0, h / 2, 0));
  const gable = mesh(
    kit.geo('barnGable', () => gableGeo(w, 2.2, d)),
    red,
    0,
    h,
    0,
  );
  g.add(gable);
  const r = roof(kit, w / 2, 2.2, d, '#5b4a44');
  r.position.y = h;
  g.add(r);
  // Big front door with the classic white cross.
  const door = new THREE.Group();
  door.position.set(0, 1.25, d / 2 + 0.06);
  door.add(mesh(kit.box(2.4, 2.5, 0.1), kit.mat('#8f2a22'), 0, 0, 0));
  for (const [x, y, w2, h2, rot] of [
    [0, 1.2, 2.5, 0.16, 0],
    [0, -1.2, 2.5, 0.16, 0],
    [-1.2, 0, 0.16, 2.5, 0],
    [1.2, 0, 0.16, 2.5, 0],
    [0, 0, 0.14, 3.3, 0.76],
    [0, 0, 0.14, 3.3, -0.76],
  ] as const) {
    const b = mesh(kit.box(w2, h2, 0.08), trim, x, y, 0.07, false);
    b.rotation.z = rot;
    door.add(b);
  }
  g.add(door);
  // Hay-loft hatch.
  g.add(mesh(kit.box(1.1, 1.0, 0.1), trim, 0, h + 0.75, d / 2 + 0.05, false));
  g.add(mesh(kit.box(0.8, 0.7, 0.12), kit.mat('#6b4a2a'), 0, h + 0.75, d / 2 + 0.06, false));
  // Corner trims.
  for (const x of [-w / 2, w / 2])
    for (const z of [-d / 2, d / 2]) g.add(mesh(kit.box(0.2, h, 0.2), trim, x, h / 2, z, false));
  return g;
}

export function makeHayBale(kit: Kit): THREE.Mesh {
  const m = mesh(
    kit.geo('hay', () => new THREE.CylinderGeometry(0.65, 0.65, 1.1, 10)),
    kit.mat('#e2bf55', { roughness: 1 }),
  );
  m.rotation.z = Math.PI / 2;
  m.position.y = 0.65;
  return m;
}

export function makeTrough(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const wood = kit.mat('#8a5a32');
  g.add(mesh(kit.box(2.2, 0.5, 0.8), wood, 0, 0.35, 0));
  g.add(mesh(kit.box(2.0, 0.08, 0.6), kit.mat('#4aa3d8', { roughness: 0.2 }), 0, 0.58, 0, false));
  return g;
}

export function makeFencePost(kit: Kit): THREE.Mesh {
  return mesh(kit.box(0.2, 1.2, 0.2), kit.mat('#7b5230'), 0, 0.6, 0);
}

export function makeFenceRail(kit: Kit, len: number): THREE.Group {
  const g = new THREE.Group();
  const rail = kit.box(len, 0.12, 0.08);
  const m = kit.mat('#9a6a3d');
  g.add(mesh(rail, m, 0, 0.45, 0));
  g.add(mesh(rail, m, 0, 0.9, 0));
  return g;
}

// ------------------------------------------------------------------ fields

export function makeWindmill(kit: Kit): { root: THREE.Group; blades: THREE.Group } {
  const root = new THREE.Group();
  const tower = mesh(
    kit.geo('millTower', () => new THREE.CylinderGeometry(1.0, 1.6, 6, 8)),
    kit.mat('#f1e6cf'),
    0,
    3,
    0,
  );
  root.add(tower);
  root.add(
    mesh(
      kit.geo('millCap', () => new THREE.ConeGeometry(1.4, 1.8, 8)),
      kit.mat('#c4473a'),
      0,
      6.9,
      0,
    ),
  );
  root.add(mesh(kit.box(0.9, 1.4, 0.1), kit.mat('#6b4a2a'), 0, 0.7, 1.45, false));
  const blades = new THREE.Group();
  blades.position.set(0, 5.6, 1.25);
  blades.add(mesh(kit.box(0.4, 0.4, 0.5), kit.mat('#6b4a2a'), 0, 0, 0));
  const sail = kit.box(0.9, 3.4, 0.06);
  const spar = kit.box(0.14, 3.6, 0.12);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI) / 2;
    arm.add(mesh(spar, kit.mat('#6b4a2a'), 0, 1.9, 0.1));
    arm.add(mesh(sail, kit.mat('#fbf6ea'), 0.5, 2.0, 0.12));
    blades.add(arm);
  }
  root.add(blades);
  return { root, blades };
}

// ------------------------------------------------------------------ rocks & hills

/** A jittered low-poly cone for mountains, with an optional snow cap. */
export function makeMountain(
  kit: Kit,
  rnd: () => number,
  radius: number,
  height: number,
): THREE.Group {
  const g = new THREE.Group();
  const geo = kit.own(new THREE.ConeGeometry(radius, height, 7, 3));
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > height / 2 - 0.01) continue; // keep the apex
    const k = (height / 2 - y) / height;
    pos.setX(i, pos.getX(i) * (1 + (rnd() - 0.5) * 0.3 * k));
    pos.setZ(i, pos.getZ(i) * (1 + (rnd() - 0.5) * 0.3 * k));
    pos.setY(i, y + (rnd() - 0.5) * 0.4 * k);
  }
  geo.computeVertexNormals();
  const rock = mesh(geo, kit.mat(rnd() < 0.5 ? '#8a8d99' : '#7b7f8c'), 0, height / 2, 0);
  g.add(rock);
  const capH = height * 0.32;
  const cap = mesh(
    kit.geo(
      `cap${radius.toFixed(2)},${height.toFixed(2)}`,
      () => new THREE.ConeGeometry(radius * 0.34, capH, 7),
    ),
    kit.mat('#f7f9fc'),
    0,
    height - capH / 2 + 0.02,
    0,
  );
  g.add(cap);
  return g;
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

export function makeOreRock(kit: Kit, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  g.add(makeBoulder(kit, rnd, 0.95, '#767b8a'));
  const crystal = kit.geo('crystal', () => new THREE.OctahedronGeometry(0.35, 0));
  const glow = kit.mat('#7fe0ff', { emissive: '#2aa8d8', emissiveIntensity: 0.6, roughness: 0.3 });
  for (let i = 0; i < 4; i++) {
    const c = mesh(
      crystal,
      glow,
      (rnd() - 0.5) * 1.2,
      0.7 + rnd() * 0.4,
      (rnd() - 0.5) * 1.2,
      false,
    );
    c.scale.set(0.7, 1.4 + rnd(), 0.7);
    c.rotation.set((rnd() - 0.5) * 0.8, rnd() * 3, (rnd() - 0.5) * 0.8);
    g.add(c);
  }
  return g;
}

export function makeKiln(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const clay = kit.mat('#a8573a');
  const dome = mesh(
    kit.geo('kilnDome', () => new THREE.SphereGeometry(1.7, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
    clay,
    0,
    0,
    0,
  );
  g.add(dome);
  g.add(mesh(kit.box(0.6, 2.2, 0.6), kit.mat('#8a4430'), 0.6, 2.2, -0.6));
  const mouth = mesh(
    kit.box(0.9, 0.8, 0.3),
    kit.mat('#ff9a3c', { emissive: '#ff6a1a', emissiveIntensity: 1.2 }),
    0,
    0.45,
    1.55,
    false,
  );
  g.add(mouth);
  return g;
}

export function makeBrickStack(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const brick = kit.box(0.5, 0.22, 0.25);
  const m = kit.mat('#b4553a');
  for (let y = 0; y < 4; y++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++) {
        const b = mesh(
          brick,
          m,
          (i - 1) * 0.52,
          0.11 + y * 0.23,
          (j - 0.5) * 0.27 + (y % 2) * 0.03,
        );
        g.add(b);
      }
  g.add(mesh(kit.box(1.7, 0.12, 0.7), kit.mat('#7b5230'), 0, 0.03, 0));
  return g;
}

// ------------------------------------------------------------------ desert

export function makeCactus(kit: Kit, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  const green = kit.mat('#4f9a4a');
  const h = 2 + rnd() * 1.5;
  g.add(
    mesh(
      kit.geo(`cactus${h.toFixed(1)}`, () => new THREE.CylinderGeometry(0.3, 0.34, h, 7)),
      green,
      0,
      h / 2,
      0,
    ),
  );
  const arm = kit.geo('cactusArm', () => new THREE.CylinderGeometry(0.2, 0.2, 0.9, 6));
  for (const side of [-1, 1]) {
    if (rnd() < 0.3) continue;
    const y = h * (0.4 + rnd() * 0.25);
    g.add(mesh(kit.box(0.6, 0.3, 0.3), green, side * 0.45, y, 0));
    g.add(mesh(arm, green, side * 0.7, y + 0.45, 0));
  }
  return g;
}

// ------------------------------------------------------------------ player pieces

export function makeSettlement(kit: Kit, roofColor: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(kit.box(2.6, 2.0, 3.0), kit.mat('#efe2c4'), 0, 1.0, 0));
  g.add(
    mesh(
      kit.geo('houseGable', () => gableGeo(2.6, 1.5, 3.0)),
      kit.mat('#efe2c4'),
      0,
      2.0,
      0,
    ),
  );
  const r = roof(kit, 1.3, 1.5, 3.0, roofColor, 0.3);
  r.position.y = 2.0;
  g.add(r);
  g.add(mesh(kit.box(0.8, 1.3, 0.1), kit.mat('#6b4a2a'), 0, 0.65, 1.52, false));
  g.add(
    mesh(
      kit.box(0.6, 0.6, 0.1),
      kit.mat('#ffd36b', { emissive: '#ffb84a', emissiveIntensity: 0.5 }),
      0.85,
      1.25,
      1.52,
      false,
    ),
  );
  g.add(mesh(kit.box(0.45, 1.2, 0.45), kit.mat('#8d8478'), 0.75, 3.2, -0.6));
  return g;
}

export function makeCity(kit: Kit, roofColor: string): THREE.Group {
  const g = new THREE.Group();
  const wall = kit.mat('#e3d6b8');
  const house = makeSettlement(kit, roofColor);
  house.position.set(-1.2, 0, 0.6);
  g.add(house);
  g.add(mesh(kit.box(2.4, 5.0, 2.4), wall, 1.4, 2.5, -0.6));
  g.add(
    mesh(
      kit.geo('cityTowerRoof', () => new THREE.ConeGeometry(1.95, 2.2, 4)),
      kit.mat(roofColor),
      1.4,
      6.1,
      -0.6,
    ).rotateY(Math.PI / 4),
  );
  for (const x of [0.6, 2.2])
    g.add(
      mesh(
        kit.box(0.5, 0.7, 0.1),
        kit.mat('#ffd36b', { emissive: '#ffb84a', emissiveIntensity: 0.5 }),
        x,
        3.4,
        0.62,
        false,
      ),
    );
  // Flag
  g.add(mesh(kit.box(0.08, 2.2, 0.08), kit.mat('#5a4636'), 1.4, 8.2, -0.6));
  g.add(mesh(kit.box(1.1, 0.6, 0.05), kit.mat(roofColor), 1.95, 8.9, -0.6));
  return g;
}

export function makeRoad(kit: Kit, len: number, color: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(kit.box(len, 0.18, 1.3), kit.mat(color), 0, 0.09, 0));
  // Little stones along the edges give it some texture.
  const stone = kit.box(0.35, 0.12, 0.2);
  const sm = kit.mat('#d8cfbf');
  for (let x = -len / 2 + 0.4; x < len / 2 - 0.2; x += 0.9) {
    g.add(mesh(stone, sm, x, 0.2, 0.55, false));
    g.add(mesh(stone, sm, x + 0.45, 0.2, -0.55, false));
  }
  return g;
}

export function makeRobber(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const cloak = kit.mat('#2b2238');
  g.add(
    mesh(
      kit.geo('robberBody', () => new THREE.ConeGeometry(0.9, 2.4, 8)),
      cloak,
      0,
      1.2,
      0,
    ),
  );
  g.add(
    mesh(
      kit.geo('robberHead', () => new THREE.IcosahedronGeometry(0.45, 1)),
      cloak,
      0,
      2.5,
      0,
    ),
  );
  const eye = kit.box(0.12, 0.07, 0.05);
  const glow = kit.mat('#ff5a3c', { emissive: '#ff3a1a', emissiveIntensity: 2 });
  for (const side of [-1, 1]) g.add(mesh(eye, glow, side * 0.15, 2.55, 0.4, false));
  return g;
}

export function makeBoat(kit: Kit, sailColor: string): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(kit.box(1.6, 0.6, 3.6), kit.mat('#8a5a32'), 0, 0.2, 0));
  g.add(
    mesh(
      kit.geo('bow', () => new THREE.ConeGeometry(0.8, 1.2, 4)),
      kit.mat('#8a5a32'),
      0,
      0.2,
      2.3,
    )
      .rotateX(Math.PI / 2)
      .rotateY(Math.PI / 4),
  );
  g.add(mesh(kit.box(0.12, 3.2, 0.12), kit.mat('#5a4636'), 0, 1.9, 0));
  g.add(mesh(kit.box(0.06, 2.0, 1.6), kit.mat(sailColor), 0, 2.2, -0.2));
  return g;
}

export function makeDock(kit: Kit, len: number): THREE.Group {
  const g = new THREE.Group();
  const plank = kit.mat('#a0703f');
  g.add(mesh(kit.box(2.2, 0.2, len), plank, 0, 0.0, len / 2));
  const post = kit.box(0.25, 1.6, 0.25);
  for (let z = 0.6; z < len; z += 2.2)
    for (const x of [-1.05, 1.05]) g.add(mesh(post, kit.mat('#6b4a2a'), x, -0.4, z));
  return g;
}

export function makeCloud(kit: Kit, rnd: () => number): THREE.Group {
  const g = new THREE.Group();
  const geo = kit.geo('cloud', () => new THREE.IcosahedronGeometry(1, 0));
  // Self-lit so the green bounce light from the ground doesn't tint them.
  const m = kit.mat('#ffffff', { roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.55 });
  const n = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const c = mesh(geo, m, (i - n / 2) * 2.6 + rnd(), rnd() * 1.2, (rnd() - 0.5) * 3, false);
    c.scale.setScalar(2 + rnd() * 2);
    g.add(c);
  }
  g.scale.set(1.4, 0.7, 1);
  return g;
}

/** A round parchment plaque showing a number token and its pips. */
export function makeTokenSprite(n: number): THREE.Sprite {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f3e6c4';
  ctx.strokeStyle = '#6b4a2a';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const hot = n === 6 || n === 8;
  ctx.fillStyle = hot ? '#b4231c' : '#2a1d14';
  ctx.font = 'bold 120px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), size / 2, size / 2 - 14);
  const pips = 6 - Math.abs(7 - n);
  for (let i = 0; i < pips; i++) {
    ctx.beginPath();
    ctx.arc(size / 2 + (i - (pips - 1) / 2) * 22, size / 2 + 66, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  s.scale.setScalar(1.6);
  return s;
}

/** A speckled ground texture so each terrain reads as grass, soil, sand or stone. */
export function groundTexture(
  base: string,
  speck: string[],
  seed: number,
  strokes = false,
): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let s = seed >>> 0 || 1;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = speck[i % speck.length];
    const x = rnd() * size;
    const y = rnd() * size;
    if (strokes) {
      ctx.fillRect(x, y, 2, 5 + rnd() * 6);
    } else {
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 1 + rnd() * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.anisotropy = 4;
  return tex;
}
