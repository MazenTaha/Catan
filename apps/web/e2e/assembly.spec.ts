import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import type * as Three from 'three';

/** Full model inventory is opt-in; the low-angle mill regression always runs. */
test('windmill cap has a solid underside and all reviewed model parts stay finite', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'hexfall.settings',
      JSON.stringify({ effects: 'lite', muted: true, rookieTips: false }),
    ),
  );
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  const out = process.env.ASSEMBLY_OUT ?? 'test-results/assembly';
  fs.mkdirSync(out, { recursive: true });
  const inventory = process.env.ASSEMBLY_REVIEW === '1';
  const report = await page.evaluate(
    async ({ inventory, baseline }) => {
      type Asset = { name: string; root: Three.Object3D };
      type W = {
        renderer: Three.WebGLRenderer;
        scene: Three.Scene;
        camera: Three.PerspectiveCamera;
        assets: { models: Map<string, Asset[]> };
      };
      const w = (window as unknown as { __world3d: { world: W } }).__world3d.world;
      w.renderer.setAnimationLoop(null);
      const url = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .find((n) => /\/three\.js/.test(n))!;
      const T = (await import(/* @vite-ignore */ url)) as typeof Three;
      const originals: Three.Object3D[] = [];
      if (baseline) {
        const loaderURL = performance
          .getEntriesByType('resource')
          .map((r) => r.name)
          .find((n) => n.includes('GLTFLoader') && n.includes('.js'))!;
        const { GLTFLoader } = await import(/* @vite-ignore */ loaderURL);
        for (const file of ['village', 'props'])
          originals.push(
            (
              await new GLTFLoader().loadAsync(
                `/@fs/E:/Catan/design/assembly-audit/before/${file}.glb`,
              )
            ).scene,
          );
      }
      const scene = new T.Scene();
      scene.background = new T.Color('#9ec5df');
      scene.environment = w.scene.environment;
      scene.add(new T.HemisphereLight('#fff4df', '#546477', 2));
      const sun = new T.DirectionalLight('#fff0d0', 3);
      sun.position.set(-5, 9, 4);
      scene.add(sun);
      const floor = new T.Mesh(
        new T.PlaneGeometry(200, 200),
        new T.MeshStandardMaterial({ color: '#65735a', roughness: 1 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.21;
      scene.add(floor);
      w.renderer.setSize(640, 640, false);
      w.camera.aspect = 1;
      w.camera.fov = 50;
      w.camera.updateProjectionMatrix();
      const records: {
        name: string;
        meshes: number;
        minY: number;
        maxY: number;
        finite: boolean;
        png?: string;
      }[] = [];
      const seen = new Set<string>();
      let object: Three.Object3D | null = null;
      const set = (a: Asset) => {
        object?.removeFromParent();
        const source = originals.map((s) => s.getObjectByName(a.name)).find(Boolean) ?? a.root;
        object = source.clone(true);
        object.position.set(0, 0, 0);
        object.quaternion.identity();
        object.scale.set(1, 1, 1);
        scene.add(object);
        object.updateMatrixWorld(true);
        return object;
      };
      if (inventory) {
        const review: Asset[] = [];
        for (const [slot, assets] of w.assets.models) {
          if (slot === 'character.knight' || slot === 'animal.horse') continue; // Dedicated skinned-pose suite.
          review.push(...assets);
        }
        const assetModule = '/src/components/world/assets.ts',
          gearModule = '/src/components/world/gear.ts';
        const [{ GEAR_NODES }, { cloneGear }] = await Promise.all([
          import(/* @vite-ignore */ assetModule),
          import(/* @vite-ignore */ gearModule),
        ]);
        for (const name of GEAR_NODES as string[]) {
          const root = cloneGear(name) as Three.Object3D | null;
          if (!root) throw Error(`Missing equipment model ${name}`);
          review.push({ name, root });
        }
        for (const a of review) {
          if (seen.has(a.name)) continue;
          seen.add(a.name);
          const root = set(a);
          const box = new T.Box3().setFromObject(root);
          const size = box.getSize(new T.Vector3());
          const centre = box.getCenter(new T.Vector3());
          floor.position.y = box.min.y - 0.02;
          let finite = true,
            meshes = 0;
          root.traverse((o) => {
            const m = o as Three.Mesh;
            if (!m.isMesh) return;
            meshes++;
            const p = m.geometry.attributes.position;
            for (let i = 0; i < p.count; i++)
              if (![p.getX(i), p.getY(i), p.getZ(i)].every(Number.isFinite)) finite = false;
          });
          const distance = Math.max(size.x, size.y, size.z) * 1.8 + 0.1;
          w.camera.position
            .copy(centre)
            .add(new T.Vector3(0.75, 0.45, 1).normalize().multiplyScalar(distance));
          w.camera.lookAt(centre);
          w.renderer.render(scene, w.camera);
          records.push({
            name: a.name,
            meshes,
            minY: box.min.y,
            maxY: box.max.y,
            finite,
            png: w.renderer.domElement.toDataURL('image/png'),
          });
        }
      }
      const mill = set(w.assets.models.get('prop.windmill')![0]);
      const top = 0.24 + 2.75 + 0.35 + 4.6;
      const bodyRadius = ((1.95 + 0.34) / Math.cos(Math.PI / 8)) * 0.72;
      const ray = new T.Raycaster();
      const misses: number[] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i * Math.PI) / 24;
        ray.set(
          new T.Vector3(
            Math.cos(a) * (bodyRadius + 0.18),
            top - 0.5,
            Math.sin(a) * (bodyRadius + 0.18),
          ),
          new T.Vector3(0, 1, 0),
        );
        ray.far = 0.75;
        if (!ray.intersectObject(mill, true).length) misses.push(i);
      }
      w.camera.position.set(4.2, top - 3.6, 5);
      w.camera.lookAt(0, top + 0.4, 0);
      w.renderer.render(scene, w.camera);
      const low = w.renderer.domElement.toDataURL('image/png');
      w.camera.position.set(4, top + 2.8, 5);
      w.camera.lookAt(0, top + 0.5, 0);
      w.renderer.render(scene, w.camera);
      const high = w.renderer.domElement.toDataURL('image/png');
      const log = set(w.assets.models.get('prop.log')![0]);
      const logMisses: string[] = [];
      for (const end of [-1, 1])
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          ray.set(
            new T.Vector3(end * 1.3, 0.27 + Math.cos(a) * 0.18, Math.sin(a) * 0.18),
            new T.Vector3(-end, 0, 0),
          );
          ray.far = 0.7;
          if (!ray.intersectObject(log, true).length) logMisses.push(`${end}:${i}`);
        }
      const stump = set(w.assets.models.get('prop.stump')![0]);
      const stumpMisses: string[] = [],
        rim = new Map<string, Three.Vector3>();
      stump.traverse((o) => {
        const m = o as Three.Mesh;
        if (!m.isMesh) return;
        const p = m.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const v = new T.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
          if (Math.abs(v.y - 0.55) > 0.0001 || Math.hypot(v.x, v.z) < 0.4) continue;
          rim.set(`${v.x.toFixed(4)},${v.z.toFixed(4)}`, v);
        }
      });
      for (const [key, v] of rim) {
        ray.set(new T.Vector3(v.x * 0.98, 1, v.z * 0.98), new T.Vector3(0, -1, 0));
        ray.far = 0.5;
        if (!ray.intersectObject(stump, true).length) stumpMisses.push(key);
      }
      const decorURL = '/src/components/world/decor.ts',
        shapeURL = '/src/components/world/buildings.ts';
      const [{ DecorBuilder }, { buildingShape }] = await Promise.all([
        import(/* @vite-ignore */ decorURL),
        import(/* @vite-ignore */ shapeURL),
      ]);
      const builder = new DecorBuilder();
      // Inspect placements before render batching removes their individual subgroups.
      builder.rig.bake = () => {};
      const roomPictures: { name: string; png: string }[] = [];
      const knightHeight = new T.Box3().setFromObject(
        w.assets.models.get('character.knight')![0].root,
      ).max.y;
      const furnishingChecks: {
        room: string;
        kind: string;
        ceilingOverlap: number;
        supportGap?: number;
        fixtureGap?: number;
        headroom?: number;
      }[] = [];
      for (const room of ['cottage', 'hall']) {
        const shape = buildingShape(room) as { floor: number; ceiling: number };
        const home = set(
          w.assets.models.get(room === 'cottage' ? 'building.settlement' : 'building.city')![0],
        );
        for (const kind of [
          'rug',
          'banner',
          'tapestry',
          'antlers',
          'chandelier',
          'bookshelf',
          'plants',
          'armor',
          'candles',
          'shield',
        ]) {
          const { group } = builder.room(room, [kind], 0, shape.floor) as { group: Three.Group };
          group.updateMatrixWorld(true);
          for (const item of group.children) {
            const box = new T.Box3().setFromObject(item);
            const entry: {
              room: string;
              kind: string;
              ceilingOverlap: number;
              supportGap?: number;
              fixtureGap?: number;
              headroom?: number;
            } = { room, kind, ceilingOverlap: box.max.y - shape.floor - shape.ceiling };
            if (kind === 'chandelier') {
              entry.headroom = box.min.y - shape.floor - knightHeight;
              // The hall's original 0.6 m candle ring remains over the table.
              if (room === 'hall') entry.fixtureGap = Math.max(box.min.x, -box.max.x) - 0.65;
            }
            if (['rug', 'bookshelf', 'plants', 'armor', 'candles'].includes(kind)) {
              ray.set(
                new T.Vector3(item.position.x, item.position.y + 0.05, item.position.z),
                new T.Vector3(0, -1, 0),
              );
              ray.far = 1;
              const hit = ray.intersectObject(home, true)[0];
              entry.supportGap = hit ? item.position.y - hit.point.y : 10;
            }
            furnishingChecks.push(entry);
          }
        }
        const { group: furnished } = builder.room(
          room,
          [
            'rug',
            'banner',
            'tapestry',
            'antlers',
            'chandelier',
            'bookshelf',
            'plants',
            'armor',
            'candles',
            'shield',
          ],
          0,
          shape.floor,
        ) as { group: Three.Group };
        home.add(furnished);
        const fill = new T.PointLight('#ffe4b5', 12, 12);
        fill.position.set(0, shape.floor + 2, 0);
        scene.add(fill);
        w.camera.position.set(
          room === 'cottage' ? -1.2 : -2.5,
          shape.floor + 1.6,
          room === 'cottage' ? 1.4 : 1.8,
        );
        w.camera.lookAt(room === 'cottage' ? 1 : 0, shape.floor + 1.6, -0.7);
        w.renderer.render(scene, w.camera);
        roomPictures.push({
          name: `${room}-furnished`,
          png: w.renderer.domElement.toDataURL('image/png'),
        });
        fill.removeFromParent();
      }
      builder.dispose();
      return {
        records,
        misses,
        logMisses,
        stumpMisses,
        rimSamples: rim.size,
        furnishingChecks,
        knightHeight,
        roomPictures,
        low,
        high,
      };
    },
    { inventory, baseline: process.env.ASSEMBLY_BASELINE === '1' },
  );
  for (const r of report.roomPictures)
    fs.writeFileSync(`${out}/${r.name}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
  for (const r of report.records) {
    fs.writeFileSync(`${out}/${r.name}.png`, Buffer.from(r.png!.split(',')[1], 'base64'));
    delete r.png;
  }
  for (const [name, data] of [
    ['mill-low', report.low],
    ['mill-high', report.high],
  ])
    fs.writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  fs.writeFileSync(
    `${out}/report.json`,
    JSON.stringify(
      {
        records: report.records,
        misses: report.misses,
        logMisses: report.logMisses,
        stumpMisses: report.stumpMisses,
        rimSamples: report.rimSamples,
        furnishingChecks: report.furnishingChecks,
        knightHeight: report.knightHeight,
      },
      null,
      2,
    ),
  );
  expect(report.misses, 'No sky should show through the overhanging cap from underneath').toEqual(
    [],
  );
  expect(report.records.every((r) => r.finite && r.meshes > 0)).toBe(true);
  expect(report.logMisses, 'Both exposed log ends must face outwards').toEqual([]);
  expect(report.rimSamples).toBeGreaterThanOrEqual(14);
  expect(report.stumpMisses, 'The cut surface must meet the bark rim').toEqual([]);
  expect(
    report.furnishingChecks.filter((c) => c.headroom !== undefined && c.headroom < 0.05),
    'Hanging lights must clear the knight and plume',
  ).toEqual([]);
  expect(
    report.furnishingChecks.filter((c) => c.fixtureGap !== undefined && c.fixtureGap < 0.1),
    'Optional lights must clear the built-in hall chandelier',
  ).toEqual([]);
  expect(
    report.furnishingChecks.filter((c) => c.ceilingOverlap > 0.01),
    'Furnishings must stay below the room ceiling',
  ).toEqual([]);
  expect(
    report.furnishingChecks.filter(
      (c) => c.supportGap !== undefined && Math.abs(c.supportGap) > 0.025,
    ),
    'Floor and table furnishings need a supporting surface',
  ).toEqual([]);
});
