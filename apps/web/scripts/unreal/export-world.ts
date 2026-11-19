import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { BoxGeometry, CylinderGeometry } from 'three';
import {
  generateBoard,
  getTopology,
  hashSeed,
  hexToPixel,
  Rng,
  vertexToPixel,
  type Terrain,
} from '@hexfall/engine';
import {
  buildGround,
  edgeDistance,
  R as BASE_RADIUS,
  tileHeight,
  type TileGround,
} from '../../src/components/world/terrain';
import { IslandGlb } from './glb';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const output = resolve(repo, 'apps/unreal/SourceArt/Generated');
const seed = process.argv[2] ?? 'catan-night-unreal';
const radius = 84;
const scale = radius / BASE_RADIUS;
const heightScale = 3;
const board = generateBoard(seed, 'balanced');
const topology = getTopology();
const glb = new IslandGlb();
for (const family of ['flora', 'rocks', 'village', 'props', 'concept_kit'])
  await glb.addFamily(resolve(repo, `apps/web/public/models/${family}.glb`), family);

interface Placement {
  position: [number, number, number];
  yaw: number;
  scale: number;
}
interface Group {
  model: string;
  prototype: string;
  collision: 'none' | 'trunk' | 'mesh';
  cullDistance: number;
  instances: Placement[];
}
const groups = new Map<string, Group>();
const biomeStats: Record<string, { terrain: Terrain; trees: number; instances: number }> = {};
const probes: { hex: number; terrain: Terrain; position: number[] }[] = [];
const groundMaterial = glb.material('Ground_VertexPaint', [1, 1, 1]);
const beachMaterial = glb.material('Beach_Sand', [0.72, 0.52, 0.27]);
glb.geometry(
  'Sea_Blockout_ReplaceWithUnrealWater',
  new BoxGeometry(3000, 0.4, 3000),
  glb.material('Sea_Blockout', [0.025, 0.23, 0.32], 0.4),
  [0, -1.0, 0],
);
const labels: Record<Terrain, string> = {
  witchwood: 'Forest',
  ashen: 'Hills',
  moors: 'Pasture',
  fields: 'Fields',
  peaks: 'Mountains',
  waste: 'Desert',
};

function scatter(
  model: string,
  position: [number, number, number],
  yaw: number,
  size: number,
  collision: Group['collision'] = 'none',
) {
  let group = groups.get(model);
  if (!group) {
    group = {
      model,
      prototype: `Depot_${model.replace('/', '_')}`,
      collision,
      cullDistance:
        model.startsWith('flora/') &&
        !model.includes('Oak') &&
        !model.includes('Lime') &&
        !model.includes('Spruce') &&
        !model.includes('Fir')
          ? 95
          : 350,
      instances: [],
    };
    groups.set(model, group);
  }
  group.instances.push({ position, yaw, scale: size });
}

for (const hex of board.hexes) {
  const rng = Rng.fromSeed(`${seed}:biome:${hex.id}`);
  const center = hexToPixel(hex, radius);
  const paths = Array.from({ length: 6 }, (_, i) => {
    const angle = (i * Math.PI) / 3;
    return {
      ax: 0,
      az: 0,
      bx: Math.cos(angle) * BASE_RADIUS,
      bz: Math.sin(angle) * BASE_RADIUS,
      w: 0.3,
    };
  });
  const ground: TileGround = {
    terrain: hex.terrain,
    cx: center.x,
    cz: center.y,
    seed: hashSeed(`${seed}:${hex.id}`),
    grain: rng.next() * Math.PI,
    paths,
    flats: [
      { x: 14 / scale, z: 10 / scale, r: 11 / scale },
      { x: 0, z: 0, r: 3.0 / scale },
    ],
    shade: [],
  };
  const label = `Hex_${String(hex.id).padStart(2, '0')}_${labels[hex.terrain]}_${hex.token ?? 'Robber'}`;
  glb.geometry(label, buildGround(ground, 32).scale(scale, heightScale, scale), groundMaterial, [
    center.x,
    0,
    center.y,
  ]);
  glb.geometry(
    `${label}_Beach`,
    new CylinderGeometry(radius * 1.025, radius * 1.045, 0.6, 6),
    beachMaterial,
    [center.x, -0.85, center.y],
  );
  const height = (x: number, z: number) => tileHeight(ground, x / scale, z / scale) * heightScale;
  const nearPath = (x: number, z: number, clearance: number) =>
    paths.some((path) => {
      const bx = path.bx * scale,
        bz = path.bz * scale;
      const t = Math.max(0, Math.min(1, (x * bx + z * bz) / (bx * bx + bz * bz)));
      return Math.hypot(x - bx * t, z - bz * t) < clearance;
    });
  const clear = (x: number, z: number, gap = 2.3) =>
    edgeDistance(x / scale, z / scale) * scale > 3 &&
    !nearPath(x, z, gap) &&
    Math.hypot(x, z) > 5 &&
    Math.hypot(x - 14, z - 10) > 12;
  const stats = { terrain: hex.terrain, trees: 0, instances: 0 };
  biomeStats[String(hex.id)] = stats;
  function plants(
    models: string[],
    count: number,
    low = 0.85,
    high = 1.2,
    collision: Group['collision'] = 'none',
    spacing = 0,
  ) {
    const used: { x: number; z: number }[] = [];
    for (let tries = 0; used.length < count && tries < count * 50; tries++) {
      const x = (rng.next() * 2 - 1) * radius;
      const z = (rng.next() * 2 - 1) * radius;
      if (
        !clear(x, z, collision === 'none' ? 2.3 : 4.0) ||
        (spacing > 0 && used.some((p) => Math.hypot(x - p.x, z - p.z) < spacing))
      )
        continue;
      scatter(
        rng.pick(models),
        [center.x + x, height(x, z), center.y + z],
        rng.next() * Math.PI * 2,
        low + rng.next() * (high - low),
        collision,
      );
      used.push({ x, z });
    }
    stats.instances += used.length;
    if (collision === 'trunk') stats.trees += used.length;
  }
  function prop(model: string, name: string, x: number, z: number, yaw = 0, size = 1) {
    glb.place(model, `${label}_${name}`, [center.x + x, height(x, z), center.y + z], yaw, size);
  }
  if (hex.terrain === 'witchwood') {
    plants(
      ['flora/Oak', 'flora/OakB', 'flora/Lime', 'flora/LimeB', 'flora/Spruce', 'flora/Fir'],
      145,
      0.85,
      1.25,
      'trunk',
      5.2,
    );
    plants(['flora/Sapling'], 35, 0.9, 1.15, 'trunk', 3);
    plants(['flora/ShrubA', 'flora/ShrubB'], 110);
    plants(['props/MushRed', 'props/MushBrown'], 120, 0.85, 1.5);
    plants(['flora/GrassA', 'flora/GrassB', 'flora/Daisy', 'flora/Buttercup'], 1100);
    prop('props/LogPile', 'WoodlandWorksite', 14, 10);
    prop('props/AxeStump', 'AxeStump', 18, 8);
    prop('props/StumpB', 'BrokenStump', 12, 15);
    prop('props/Log', 'FelledLog', 18, 13, 1.1);
  } else if (hex.terrain === 'fields') {
    // Narrow crop rows form four plots. The cross-path and margins remain clear to walk.
    for (const px of [-30, 30])
      for (const pz of [-29, 29]) {
        for (let ix = 0; ix < 27; ix++)
          for (let iz = 0; iz < 32; iz++) {
            const x = px - 8 + ix * 0.6 + rng.next() * 0.15;
            const z = pz - 10 + iz * 0.65 + rng.next() * 0.15;
            if (!clear(x, z)) continue;
            scatter(
              rng.pick(['flora/WheatA', 'flora/WheatB', 'flora/WheatC']),
              [center.x + x, height(x, z), center.y + z],
              rng.next() * 0.45,
              0.92 + rng.next() * 0.15,
            );
            stats.instances++;
          }
      }
    plants(['flora/Stook', 'village/HayBale'], 22, 0.9, 1.1, 'mesh', 4);
    plants(['flora/GrassA', 'flora/Poppy', 'flora/Daisy'], 700);
    prop('village/Mill', 'Mill', 14, 10);
    prop('concept_kit/StorageCrate', 'MillCrate', 18, 11);
    prop('concept_kit/GrainSack', 'GrainSack', 18, 13);
  } else if (hex.terrain === 'moors') {
    plants(['village/Sheep'], 26, 0.9, 1.12, 'none', 5);
    plants(['flora/OakB', 'flora/LimeB'], 12, 0.85, 1.1, 'trunk', 10);
    plants(['flora/ShrubA', 'flora/ShrubB'], 50);
    plants(
      ['flora/GrassA', 'flora/GrassB', 'flora/Daisy', 'flora/Buttercup', 'flora/Lavender'],
      1500,
    );
    prop('concept_kit/BarnA', 'Barn', 14, 10);
    prop('props/TroughA', 'WaterTrough', 20, 10);
    prop('props/Gate', 'PastureGate', 20, 17, 0.3);
    for (let i = 0; i < 5; i++) prop('props/FenceRail', `Fence_${i}`, 21 + i * 2, 17);
  } else if (hex.terrain === 'ashen') {
    plants(['rocks/ClayA', 'rocks/ClayB'], 12, 0.9, 1.3, 'mesh', 12);
    plants(['props/BrickStack', 'rocks/BoulderA'], 20, 0.8, 1.15, 'mesh', 5);
    plants(['flora/GrassA', 'flora/DryScrub', 'flora/Poppy'], 900);
    prop('village/Kiln', 'Kiln', 14, 10);
    prop('concept_kit/StorageCrate', 'BrickCrate', 18, 11);
    prop('props/BrickStack', 'BrickStock', 20, 9);
  } else if (hex.terrain === 'peaks') {
    plants(['rocks/CragA', 'rocks/CragB', 'rocks/CragC'], 15, 1.0, 1.8, 'mesh', 17);
    plants(
      ['rocks/BoulderA', 'rocks/BoulderB', 'rocks/BoulderC', 'rocks/OreFace', 'rocks/Ledge'],
      55,
      0.9,
      1.4,
      'mesh',
      5,
    );
    plants(['flora/GrassA', 'flora/DryScrub', 'flora/Lavender'], 700);
    prop('village/Mine', 'Mine', 14, 10);
    prop('concept_kit/StorageCrate', 'OreCrate', 20, 11);
    prop('rocks/OreFace', 'WorkedOreSeam', 19, 15);
  } else {
    plants(['props/SandRidge'], 30, 1.4, 2.5);
    plants(['props/DesertStones', 'rocks/BoulderA'], 28, 0.8, 1.3, 'mesh', 6);
    plants(['flora/DryScrub'], 120, 0.8, 1.25);
    prop('props/Ruin', 'Ruins', 14, 10);
    prop('props/Column', 'BrokenColumn', 22, 15);
    prop('props/Lintel', 'FallenLintel', 19, 7, 1.1);
  }
  probes.push({
    hex: hex.id,
    terrain: hex.terrain,
    position: [center.x - 10, height(-10, 0), center.y],
  });
}

const firstField = board.hexes.find((hex) => hex.terrain === 'fields')!;
for (const [i, vertex] of topology.hexVertices[firstField.id]
  .filter((_, i) => i % 2 === 0)
  .entries()) {
  const p = vertexToPixel(vertex, radius);
  glb.place(
    ['concept_kit/CottageA', 'concept_kit/HallB', 'concept_kit/CottageC'][i],
    `Village_${i}_${vertex}`,
    [p.x, 0, p.y],
    i * 2,
  );
}
for (const harbor of board.harbors) {
  const a = vertexToPixel(harbor.vertices[0], radius),
    b = vertexToPixel(harbor.vertices[1], radius);
  const center = hexToPixel(board.hexes[harbor.hex], radius);
  const x = (a.x + b.x) / 2,
    z = (a.y + b.y) / 2;
  const angle = Math.atan2(x - center.x, z - center.y);
  const dx = Math.sin(angle),
    dz = Math.cos(angle);
  glb.place(
    harbor.id % 2 ? 'concept_kit/DockB' : 'concept_kit/DockA',
    `Harbor_${harbor.id}_${harbor.kind}`,
    [x + dx * 2.5, -0.2, z + dz * 2.5],
    angle,
  );
  glb.place(
    ['village/Boat', 'village/BoatSloop', 'village/BoatStriped'][harbor.id % 3],
    `Harbor_${harbor.id}_Boat`,
    [x + dx * 8, -0.65, z + dz * 8],
    angle,
  );
}
// Only one exemplar per repeated model is imported. Unreal builds HISM groups from the
// placements, avoiding tens of thousands of independent editor actors.
const depot: [number, number, number] = [0, -40, 0];
for (const template of glb.templateNames)
  glb.place(template, `Depot_${template.replace('/', '_')}`, depot);
const spawn = probes.find((probe) => probe.terrain === 'fields')!;
await mkdir(output, { recursive: true });
const bytes = glb.build();
await writeFile(resolve(output, 'island.glb'), bytes);
await writeFile(
  resolve(output, 'island.json'),
  JSON.stringify(
    {
      format: 'catan-night-unreal-island',
      version: 2,
      seed,
      units: 'metres',
      up: '+Y',
      hexRadius: radius,
      previewRadius: BASE_RADIUS,
      horizontalScale: scale,
      heightScale,
      board,
      vertices: Object.fromEntries(
        Object.entries(topology.vertexPos).map(([id, p]) => [id, [p.x * radius, 0, p.y * radius]]),
      ),
      edges: topology.edgeVertices,
      sceneRoots: glb.doc.scenes[0].nodes.length,
      depot,
      instanceGroups: [...groups.values()],
      assetLibrary: glb.templateNames,
      biomeStats,
      walkProbes: probes,
      spawn: spawn.position,
      walkSpeed: 4,
      estimatedCrossingSeconds: (radius * Math.sqrt(3) * 5) / 4,
      note: 'Large design world; board topology unchanged. Foliage is instanced. Runtime Catan rules are not connected.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Exported ${radius} m hex radius, ${[...groups.values()].reduce((n, g) => n + g.instances.length, 0)} biome instances in ${groups.size} groups; ${(bytes.length / 1048576).toFixed(1)} MB GLB.`,
);
