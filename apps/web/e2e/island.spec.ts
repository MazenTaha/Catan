import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import type * as Three from 'three';

for (const effects of ['lite', 'full'])
  test(`larger island trails and work yards remain reachable (${effects})`, async ({ page }) => {
    test.setTimeout(180_000);
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(e.message));
    await page.addInitScript(
      (effects) =>
        localStorage.setItem(
          'hexfall.settings',
          JSON.stringify({ effects, muted: true, rookieTips: false }),
        ),
      effects,
    );
    await page.goto('/?scene=village');
    await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 90_000 });
    const report = await page.evaluate(async () => {
      type Path = { ax: number; az: number; bx: number; bz: number; w: number };
      type W = {
        radius: number;
        assets: { models: Map<string, { root: Three.Object3D }[]> };
        x: number;
        z: number;
        mount: number;
        horses: { yaw: number }[];
        bridges: { x: number; z: number; ux: number; uz: number; half: number; crossing: number }[];
        tryMove(x: number, z: number): boolean;
        nearbySolids(
          x: number,
          z: number,
          r: number,
        ): { ax: number; az: number; bx: number; bz: number; r: number; low?: boolean }[];
        tiles: Map<number, { cx: number; cz: number; paths: Path[] }>;
        marks: { name: string; x: number; z: number }[];
        blockedAt(x: number, z: number, r: number): boolean;
        isWalkable(x: number, z: number): boolean;
        groundAt(x: number, z: number): number;
      };
      const w = (window as unknown as { __world3d: { world: W } }).__world3d.world;
      const blocked: { tile: number; path: number; x: number; z: number; solids: object[] }[] = [];
      let samples = 0,
        maxStep = 0;
      for (const [id, tile] of w.tiles) {
        // The first 45 paths are the connected loop, six exits, centre and two yard spurs.
        for (const [index, p] of tile.paths.slice(0, 45).entries()) {
          const length = Math.hypot(p.bx - p.ax, p.bz - p.az);
          const steps = Math.ceil(length / 0.5);
          const nx = -(p.bz - p.az) / length,
            nz = (p.bx - p.ax) / length;
          for (const offset of [-0.55, 0, 0.55]) {
            let prior: number | undefined;
            for (let j = 0; j <= steps; j++) {
              const x = tile.cx + p.ax + ((p.bx - p.ax) * j) / steps + nx * offset;
              const z = tile.cz + p.az + ((p.bz - p.az) * j) / steps + nz * offset;
              const y = w.groundAt(x, z);
              samples++;
              if (w.blockedAt(x, z, 0.7) || !w.isWalkable(x, z))
                blocked.push({
                  tile: id,
                  path: index,
                  x,
                  z,
                  solids: w
                    .nearbySolids(x, z, 1)
                    .filter((c) => {
                      const dx = c.bx - c.ax,
                        dz = c.bz - c.az,
                        t = Math.max(
                          0,
                          Math.min(
                            1,
                            ((x - c.ax) * dx + (z - c.az) * dz) / (dx * dx + dz * dz || 1),
                          ),
                        );
                      return Math.hypot(x - c.ax - dx * t, z - c.az - dz * t) < c.r + 0.4;
                    })
                    .map(({ ax, az, bx, bz, r, low }) => ({ ax, az, bx, bz, r, low })),
                });
              if (prior !== undefined) maxStep = Math.max(maxStep, Math.abs(y - prior));
              prior = y;
            }
          }
        }
      }
      // Collision and the visible open gate must agree: no walking through a closed leaf.
      const threeURL = performance
        .getEntriesByType('resource')
        .map((r) => r.name)
        .find((n) => /\/three\.js/.test(n))!;
      const T = (await import(/* @vite-ignore */ threeURL)) as typeof Three;
      const gate = w.assets.models.get('prop.gate')![0].root;
      gate.updateMatrixWorld(true);
      const ray = new T.Raycaster();
      ray.far = 4;
      const gateHits: object[] = [];
      for (const x of [-0.7, 0, 0.7])
        for (const y of [0.65, 1.1])
          for (const side of [-1, 1]) {
            ray.set(new T.Vector3(x, y, side * 2), new T.Vector3(0, 0, -side));
            if (ray.intersectObject(gate, true).length) gateHits.push({ x, y, side });
          }
      const crossingFailures: object[] = [];
      let crossingSteps = 0;
      const prior = { x: w.x, z: w.z, mount: w.mount, yaw: w.horses[0]?.yaw };
      for (const mounted of [false, true]) {
        if (mounted && !w.horses.length) continue;
        w.mount = mounted ? 0 : -1;
        for (const b of w.bridges) {
          const cx = b.x + b.ux * b.crossing,
            cz = b.z + b.uz * b.crossing;
          if (mounted) w.horses[0].yaw = Math.atan2(-b.uz, b.ux);
          w.x = cx - b.uz * 5;
          w.z = cz + b.ux * 5;
          for (let i = 1; i <= 100; i++) {
            const distance = 5 - i * 0.1;
            const x = cx - b.uz * distance,
              z = cz + b.ux * distance;
            crossingSteps++;
            if (!w.tryMove(x, z) || Math.hypot(w.x - x, w.z - z) > 0.05)
              crossingFailures.push({ mounted, x, z });
          }
        }
      }
      w.x = prior.x;
      w.z = prior.z;
      w.mount = prior.mount;
      if (w.horses[0]) w.horses[0].yaw = prior.yaw!;
      return {
        gateHits,
        crossingSteps,
        crossingFailures,
        radius: w.radius,
        samples,
        maxStep,
        blocked,
        yards: w.marks.filter((m) => m.name.endsWith('-worksite')).length,
      };
    });
    const out = process.env.ISLAND_OUT ?? 'test-results/island';
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(`${out}/routes-${effects}.json`, JSON.stringify(report, null, 2));
    expect(report.gateHits).toEqual([]);
    expect(report.crossingSteps).toBeGreaterThan(0);
    expect(report.crossingFailures).toEqual([]);
    expect(report.radius).toBe(34);
    expect(report.yards).toBe(38);
    expect(report.samples).toBeGreaterThan(20_000);
    expect(report.blocked).toEqual([]);
    expect(report.maxStep).toBeLessThan(0.38);
    if (effects === 'full' && process.env.ISLAND_LOOK === '1') {
      const views = await page.evaluate(() => {
        type W = {
          marks: { name: string; x: number; z: number }[];
          tiles: Map<number, { cx: number; cz: number }>;
        };
        const w = (window as unknown as { __world3d: { world: W } }).__world3d.world;
        return ['witchwood', 'fields', 'moors', 'ashen', 'peaks', 'waste'].map((terrain) => {
          const p = w.marks.find((m) => m.name === `${terrain}-worksite`)!;
          const c = [...w.tiles.values()].sort(
            (a, b) => Math.hypot(a.cx - p.x, a.cz - p.z) - Math.hypot(b.cx - p.x, b.cz - p.z),
          )[0];
          const angle = Math.atan2(p.x - c.cx, p.z - c.cz);
          return { terrain, x: p.x + Math.sin(angle) * 3.5, z: p.z + Math.cos(angle) * 3.5, angle };
        });
      });
      for (const v of views) {
        await page.evaluate((v) => {
          type W = {
            x: number;
            z: number;
            yaw: number;
            pitch: number;
            camY: number;
            setHour(h: number): void;
            groundAt(x: number, z: number): number;
          };
          const w = (window as unknown as { __world3d: { world: W } }).__world3d.world;
          w.setHour(13);
          w.x = v.x;
          w.z = v.z;
          w.yaw = v.angle;
          w.pitch = -0.08;
          w.camY = w.groundAt(v.x, v.z) + 1.7;
        }, v);
        await page.waitForTimeout(750);
        await page
          .locator('[data-world3d] canvas[data-engine]')
          .screenshot({ path: `${out}/${v.terrain}-yard.png` });
      }
      const aerial = await page.evaluate(() => {
        type W = {
          renderer: Three.WebGLRenderer;
          scene: Three.Scene;
          camera: Three.PerspectiveCamera;
          combat: { player: Three.Object3D };
        };
        const w = (window as unknown as { __world3d: { world: W } }).__world3d.world;
        w.renderer.setAnimationLoop(null);
        w.combat.player.visible = false;
        w.camera.position.set(190, 240, 250);
        w.camera.lookAt(0, 0, 0);
        w.camera.fov = 50;
        w.camera.updateProjectionMatrix();
        w.renderer.render(w.scene, w.camera);
        return w.renderer.domElement.toDataURL('image/png');
      });
      fs.writeFileSync(`${out}/island-aerial.png`, Buffer.from(aerial.split(',')[1], 'base64'));
    }
    expect(problems).toEqual([]);
  });
