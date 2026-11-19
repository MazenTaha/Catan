import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, unlink, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BoxGeometry } from 'three';
import { IslandGlb, readGlb } from './glb';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));

test('original families retain embedded textures, painted colours and shared geometry', async () => {
  const scene = new IslandGlb();
  for (const family of ['flora', 'rocks', 'village', 'props'])
    await scene.addFamily(join(repo, `apps/web/public/models/${family}.glb`), family);
  const before = scene.doc.meshes.length;
  for (let i = 0; i < 5; i++) scene.place('flora/Oak', `Tree_${i}`, [i * 6, 0, 0]);
  scene.place('village/Cottage', 'Cottage', [0, 0, 10]);
  scene.place('props/Ruin', 'Ruin', [20, 0, 0]);
  assert.equal(scene.doc.meshes.length, before, 'instances must share mesh data');
  assert.equal(scene.doc.scenes[0].nodes.length, 7);
  const roots = scene.doc.scenes[0].nodes.map((i) => scene.doc.nodes[i]);
  assert.deepEqual(roots[0].translation, [0, 0, 0], 'remove the Blender gallery offset');
  assert.deepEqual(roots[4].translation, [24, 0, 0]);
  assert.ok(
    scene.doc.meshes.some((m) => m.primitives.some((p) => p.attributes.COLOR_0 !== undefined)),
  );
  const directory = await mkdtemp(join(tmpdir(), 'catan-unreal-test-'));
  try {
    const path = join(directory, 'scene.glb');
    await writeFile(path, scene.build());
    const { doc, bin } = await readGlb(path);
    for (const image of doc.images) {
      const view = doc.bufferViews[image.bufferView];
      const data = bin.subarray(view.byteOffset ?? 0);
      assert.ok(
        image.mimeType === 'image/png'
          ? data.subarray(1, 4).toString() === 'PNG'
          : data.readUInt16BE(0) === 0xffd8,
      );
    }
    for (const material of doc.materials) {
      const visit = (value: unknown, key = '') => {
        if (!value || typeof value !== 'object') return;
        for (const [k, v] of Object.entries(value)) {
          if (k === 'index' && key.endsWith('Texture'))
            assert.ok(typeof v === 'number' && v < doc.textures.length);
          else visit(v, k);
        }
      };
      visit(material);
    }
    for (const view of doc.bufferViews)
      assert.ok((view.byteOffset ?? 0) + view.byteLength <= bin.length);
    const parents = new Set<number>();
    const walk = (index: number) => {
      assert.ok(!parents.has(index), 'scene must be a tree, without shared child nodes or cycles');
      parents.add(index);
      const node = doc.nodes[index];
      if (node.mesh !== undefined) assert.ok(doc.meshes[node.mesh]);
      for (const child of node.children ?? []) walk(child);
    };
    doc.scenes[0].nodes.forEach(walk);
  } finally {
    await unlink(join(directory, 'scene.glb'));
    await rmdir(directory);
  }
});

test('generated geometry encodes positions, bounds, normals and indices as glTF accessors', () => {
  const scene = new IslandGlb();
  const material = scene.material('Test', [0.1, 0.2, 0.3]);
  scene.geometry('Cube', new BoxGeometry(2, 4, 6), material, [1, 2, 3]);
  const primitive = scene.doc.meshes[0].primitives[0];
  const position = scene.doc.accessors[primitive.attributes.POSITION];
  assert.deepEqual(position.min, [-1, -2, -3]);
  assert.deepEqual(position.max, [1, 2, 3]);
  assert.equal(scene.doc.accessors[primitive.indices!].count, 36);
  assert.equal(scene.doc.accessors[primitive.attributes.NORMAL].count, position.count);
  assert.deepEqual(scene.build(), scene.build(), 'export must be deterministic');
});

test('exported design island has the canonical board and valid triangle data', async () => {
  const source = join(repo, 'apps/unreal/SourceArt/Generated/island.glb');
  const { doc, bin } = await readGlb(source);
  const metadata = JSON.parse(await readFile(source.replace(/\.glb$/, '.json'), 'utf8'));
  assert.equal(metadata.board.hexes.length, 19);
  assert.equal(metadata.board.harbors.length, 9);
  assert.equal(Object.keys(metadata.vertices).length, 54);
  assert.equal(Object.keys(metadata.edges).length, 72);
  for (const [a, b] of Object.values(metadata.edges) as [string, string][]) {
    const start = metadata.vertices[a] as number[];
    const end = metadata.vertices[b] as number[];
    assert.ok(
      Math.abs(Math.hypot(start[0] - end[0], start[2] - end[2]) - metadata.hexRadius) < 1e-8,
    );
  }
  const tiles = doc.nodes.filter((n) =>
    /^Hex_\d+_(Forest|Hills|Pasture|Fields|Mountains|Desert)_(\d+|Robber)$/.test(n.name ?? ''),
  );
  assert.equal(tiles.length, 19);
  assert.equal(metadata.hexRadius, 84);
  assert.equal(metadata.horizontalScale, 6);
  assert.equal(metadata.walkProbes.length, 19);
  assert.equal(new Set(metadata.walkProbes.map((p: { terrain: string }) => p.terrain)).size, 6);
  const roots = new Set(doc.scenes[0].nodes.map((i) => doc.nodes[i].name));
  let instances = 0;
  for (const group of metadata.instanceGroups) {
    assert.ok(roots.has(group.prototype), `missing native exemplar for ${group.model}`);
    assert.ok(['none', 'mesh', 'trunk'].includes(group.collision));
    instances += group.instances.length;
    for (const item of group.instances) {
      assert.ok(item.position.every(Number.isFinite));
      assert.ok(item.scale > 0 && item.scale <= 2.5, 'props must retain human scale');
    }
  }
  assert.ok(instances > 30000);
  assert.equal(
    metadata.assetLibrary.filter((name: string) => name.startsWith('concept_kit/')).length,
    28,
  );
  for (const mesh of doc.meshes)
    for (const primitive of mesh.primitives) {
      const position = doc.accessors[primitive.attributes.POSITION];
      const index = doc.accessors[primitive.indices!];
      assert.ok(position && index);
      assert.equal(index.count % 3, 0);
      const view = doc.bufferViews[index.bufferView];
      const start = (view.byteOffset ?? 0) + (index.byteOffset ?? 0);
      const width = index.componentType === 5125 ? 4 : index.componentType === 5123 ? 2 : 1;
      for (let i = 0; i < index.count; i++) {
        const offset = start + i * (view.byteStride ?? width);
        const vertex =
          width === 4
            ? bin.readUInt32LE(offset)
            : width === 2
              ? bin.readUInt16LE(offset)
              : bin[offset];
        assert.ok(vertex < position.count, `out-of-range triangle in ${mesh.name}`);
      }
    }
});
