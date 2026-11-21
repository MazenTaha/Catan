import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import type { Object3D, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

// Opt-in art review: the real island, lighting and animated, instanced flock.
for (const reduceMotion of [false, true]) {
  test(`review redesigned creatures and distance detail (${reduceMotion ? 'reduced motion' : 'full motion'})`, async ({
    page,
  }) => {
    test.skip(process.env.CREATURES !== '1', 'CREATURES=1 saves creature art-review images');
    const out =
      (process.env.CREATURE_OUT ?? 'test-results/creatures') + (reduceMotion ? '/reduced' : '');
    fs.mkdirSync(out, { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      (reduce) =>
        localStorage.setItem(
          'hexfall.settings',
          JSON.stringify({
            effects: 'full',
            renderScale: 1,
            muted: true,
            rookieTips: false,
            reduceMotion: reduce,
          }),
        ),
      reduceMotion,
    );
    await page.goto('/?scene=village');
    await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
    const report = await page.evaluate(() => {
      const w = (
        window as unknown as {
          __world3d: {
            world: {
              sheep: { rig: { root: Object3D }; heading: number; mode: string; timer: number }[];
              scene: Scene;
              camera: PerspectiveCamera;
              renderer: WebGLRenderer;
              setHour(h: number): void;
              thirdPersonCamera(dt: number): void;
              combat: { me: { root: Object3D } };
              flocks: { near: boolean }[];
            };
          };
        }
      ).__world3d.world;
      w.setHour(13);
      w.combat.me.root.scale.setScalar(0);
      const s = w.sheep[0];
      s.heading = 0;
      s.mode = 'look';
      s.timer = 1000;
      const target = s.rig.root.position.clone();
      target.y += 0.65;
      w.thirdPersonCamera = () => {
        w.camera.position.copy(target).add({ x: 1.6, y: 0.95, z: 2.4 } as typeof target);
        w.camera.lookAt(target);
      };
      return {
        sheep: w.sheep.length,
        bodyVertices: (
          s.rig.root.getObjectByName('Sheep') as unknown as {
            geometry: { attributes: { position: { count: number } } };
          }
        ).geometry.attributes.position.count,
      };
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/sheep-game.png` });
    const close = await page.evaluate(() =>
      (
        window as unknown as {
          __world3d: { world: { flocks: { near: boolean }[] } };
        }
      ).__world3d.world.flocks.some((f) => f.near),
    );
    await page.evaluate(() => {
      const w = (
        window as unknown as {
          __world3d: {
            world: {
              camera: PerspectiveCamera;
              thirdPersonCamera(dt: number): void;
            };
          };
        }
      ).__world3d.world;
      w.thirdPersonCamera = () => w.camera.position.set(1000, 1000, 1000);
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          (
            window as unknown as {
              __world3d: { world: { flocks: { near: boolean }[] } };
            }
          ).__world3d.world.flocks.every((f) => !f.near),
        ),
      )
      .toBe(true);
    expect(close).toBe(true);
    fs.writeFileSync(`${out}/flock.json`, JSON.stringify({ ...report, errors }, null, 2));
    expect(report.sheep).toBeGreaterThan(10);
    expect(errors).toEqual([]);
  });
}
