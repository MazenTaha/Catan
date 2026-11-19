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
} from '@hexfall/engine';
import {
  buildGround,
  edgeDistance,
  R,
  tileHeight,
  type TileGround,
} from '../../src/components/world/terrain';
import { IslandGlb } from './glb';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const output = resolve(repo, 'apps/unreal/SourceArt/Generated');
const seed = process.argv[2] ?? 'catan-night-unreal';
const board = generateBoard(seed, 'balanced');
const rng = Rng.fromSeed(`${seed}:unreal-decoration`);
const glb = new IslandGlb();
for (const family of ['flora', 'rocks', 'village', 'props'])
  await glb.addFamily(resolve(repo, `apps/web/public/models/${family}.glb`), family);

const groundMaterial = glb.material('Ground_VertexPaint', [1, 1, 1]);
const beachMaterial = glb.material('Beach_Sand', [0.72, 0.52, 0.27]);
const waterMaterial = glb.material('Sea_Blockout', [0.025, 0.23, 0.32], 0.28);
glb.geometry(
  'Sea_Blockout_ReplaceWithUnrealWater',
  new BoxGeometry(500, 0.4, 500),
  waterMaterial,
  [0, -0.85, 0],
);

const labels: Record<string, string> = {
  witchwood: 'Forest',
  ashen: 'Hills',
  moors: 'Pasture',
  fields: 'Fields',
  peaks: 'Mountains',
  waste: 'Desert',
};
const features: Record<string, string[]> = {
  witchwood: ['flora/Oak', 'flora/Lime', 'flora/Spruce', 'flora/ShrubA'],
  ashen: ['rocks/ClayA', 'rocks/ClayB', 'props/BrickStack'],
  moors: ['village/Sheep', 'flora/ShrubB', 'flora/GrassA'],
  fields: ['flora/WheatA', 'flora/WheatB', 'flora/Stook'],
  peaks: ['rocks/CragA', 'rocks/BoulderB', 'rocks/OreFace'],
  waste: ['props/SandRidge', 'props/DesertStones', 'flora/DryScrub'],
};

for (const hex of board.hexes) {
  const center = hexToPixel(hex, R);
  const ground: TileGround = {
    terrain: hex.terrain,
    cx: center.x,
    cz: center.y,
    seed: hashSeed(`${seed}:${hex.id}`),
    grain: rng.next() * Math.PI,
    flats: [{ x: 0, z: 0, r: 3.5 }],
    paths: [],
    shade: [],
  };
  const label = `Hex_${String(hex.id).padStart(2, '0')}_${labels[hex.terrain]}_${hex.token ?? 'Robber'}`;
  glb.geometry(label, buildGround(ground, 16), groundMaterial, [center.x, 0, center.y]);
  glb.geometry(
    `${label}_Beach`,
    new CylinderGeometry(R * 1.035, R * 1.055, 0.4, 6),
    beachMaterial,
    [center.x, -0.55, center.y],
  );
  const count = hex.terrain === 'fields' ? 45 : hex.terrain === 'witchwood' ? 18 : 7;
  const points: { x: number; z: number }[] = [];
  for (let attempt = 0; points.length < count && attempt < count * 80; attempt++) {
    const x = (rng.next() * 2 - 1) * R;
    const z = (rng.next() * 2 - 1) * R;
    const spacing = hex.terrain === 'fields' ? 1.2 : hex.terrain === 'witchwood' ? 3.1 : 3.6;
    if (
      edgeDistance(x, z) < 2.2 ||
      Math.hypot(x, z) < 4.5 ||
      points.some((p) => Math.hypot(p.x - x, p.z - z) < spacing)
    )
      continue;
    const variants = features[hex.terrain];
    const model = variants[points.length % variants.length];
    glb.place(
      model,
      `${label}_Scenery_${points.length}`,
      [center.x + x, tileHeight(ground, x, z), center.y + z],
      rng.next() * Math.PI * 2,
      0.85 + rng.next() * 0.3,
    );
    points.push({ x, z });
  }
  const landmark = {
    witchwood: 'props/LogPile',
    fields: 'village/Mill',
    moors: 'village/Barn',
    ashen: 'village/Kiln',
    peaks: 'village/Mine',
    waste: 'props/Ruin',
  }[hex.terrain];
  glb.place(landmark, `${label}_Landmark`, [center.x, 0, center.y]);
}

// A small design vignette on canonical corners; these are examples, not saved game pieces.
const topology = getTopology();
const firstField = board.hexes.find((h) => h.terrain === 'fields')!;
for (const [i, vertex] of topology.hexVertices[firstField.id]
  .filter((_, i) => i % 2 === 0)
  .entries()) {
  const p = vertexToPixel(vertex, R);
  glb.place(
    i === 1 ? 'village/Hall' : 'village/Cottage',
    `Village_${i}_${vertex}`,
    [p.x, 0, p.y],
    i * 2,
  );
}
for (const harbor of board.harbors) {
  const a = vertexToPixel(harbor.vertices[0], R);
  const b = vertexToPixel(harbor.vertices[1], R);
  const center = hexToPixel(board.hexes[harbor.hex], R);
  const x = (a.x + b.x) / 2;
  const z = (a.y + b.y) / 2;
  const angle = Math.atan2(x - center.x, z - center.y);
  const dx = Math.sin(angle);
  const dz = Math.cos(angle);
  glb.place(
    'village/Dock',
    `Harbor_${harbor.id}_${harbor.kind}`,
    [x + dx * 2.5, -0.2, z + dz * 2.5],
    angle,
  );
  glb.place('village/Boat', `Harbor_${harbor.id}_Boat`, [x + dx * 8, -0.65, z + dz * 8], angle);
}

const bytes = glb.build();
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'island.glb'), bytes);
await writeFile(
  resolve(output, 'island.json'),
  JSON.stringify(
    {
      format: 'catan-night-unreal-island',
      version: 1,
      seed,
      units: 'metres',
      up: '+Y',
      hexRadius: R,
      note: 'Design prototype. Decorations and example buildings are not a live game snapshot.',
      board,
      vertices: Object.fromEntries(
        Object.entries(topology.vertexPos).map(([id, point]) => [
          id,
          [point.x * R, 0, point.y * R],
        ]),
      ),
      edges: topology.edgeVertices,
      sceneRoots: glb.doc.scenes[0].nodes.length,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Exported ${board.hexes.length} hexes, ${glb.doc.scenes[0].nodes.length} scene roots, ${(bytes.length / 1048576).toFixed(1)} MB to ${output}`,
);
