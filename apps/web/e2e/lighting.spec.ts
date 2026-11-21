import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import type { GameState } from '@hexfall/engine';

// Opt-in art review at fixed cameras and hours; keep screenshots outside test-results.
test.skip(!process.env.LIGHT_LOOK, 'set LIGHT_LOOK=1 to review lighting');
test.use({
  viewport: { width: 1440, height: 900 },
  launchOptions: {
    args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
  },
});

interface World {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  camY: number;
  landHexes: { id: number; x: number; z: number }[];
  homes: { key: string; x: number; z: number; rot: number }[];
  setHour(hour: number): void;
  groundAt(x: number, z: number): number;
  renderer: {
    info: { memory: { textures: number }; render: { calls: number; triangles: number } };
  };
  sunDir: { x: number; y: number; z: number };
  scene: { environment: { id: number } };
}
interface Dev {
  __world3d: { world: World; state(): GameState };
}

test('daylight, dusk and moonlight keep the same world readable', async ({ page }) => {
  test.setTimeout(180_000);
  const out = process.env.LIGHT_OUT ?? 'test-results/lighting';
  fs.mkdirSync(out, { recursive: true });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      'hexfall.settings',
      JSON.stringify({
        effects: 'full',
        renderScale: 1,
        muted: true,
        reduceMotion: true,
        rookieTips: false,
      }),
    );
  });
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  const views = await page.evaluate(() => {
    const d = (window as unknown as Dev).__world3d;
    const w = d.world;
    const hexes = d.state().board.hexes;
    const at = (name: string, x: number, z: number, tx: number, tz: number, pitch = 0.08) => ({
      name,
      x,
      z,
      yaw: Math.atan2(-(tx - x), -(tz - z)),
      pitch,
    });
    const forest = w.landHexes.find((h) => hexes[h.id].terrain === 'witchwood')!;
    const field = w.landHexes.find((h) => hexes[h.id].terrain === 'fields')!;
    const h = w.homes.find((home) => home.key === '-2,4')!;
    return [
      at('forest', forest.x + 13, forest.z + 2, forest.x, forest.z),
      at('canopy', forest.x + 1.5, forest.z - 1.2, forest.x - 8, forest.z - 6, 0.18),
      at('field', field.x + 7, field.z - 2, field.x, field.z + 10, -0.05),
      at(
        'cottage',
        h.x + Math.sin(h.rot + 0.55) * 13,
        h.z + Math.cos(h.rot + 0.55) * 13,
        h.x,
        h.z,
        0.12,
      ),
    ];
  });
  const rows = [];
  for (const hour of [13, 18.3, 0]) {
    for (const v of views) {
      await page.evaluate(
        ({ hour, v }) => {
          const w = (window as unknown as Dev).__world3d.world;
          w.setHour(hour);
          Object.assign(w, { x: v.x, z: v.z, yaw: v.yaw, pitch: v.pitch });
          w.camY = w.groundAt(v.x, v.z) + 1.7;
        },
        { hour, v },
      );
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/${v.name}-${hour}.png` });
      rows.push({
        name: v.name,
        hour,
        ...(await page.evaluate(() => {
          const r = (window as unknown as Dev).__world3d.world.renderer.info;
          return { ...r.render, textures: r.memory.textures };
        })),
      });
    }
  }
  const textures = await page.evaluate(() => {
    const w = (window as unknown as Dev).__world3d.world;
    const before = w.renderer.info.memory.textures;
    for (let i = 0; i < 20; i++) w.setHour((i * 3.5) % 24);
    return { before, after: w.renderer.info.memory.textures };
  });
  expect(textures.after).toBeLessThanOrEqual(textures.before);
  const clock = await page.evaluate(() => {
    const w = (window as unknown as Dev).__world3d.world;
    w.setHour(13);
    const noon = w.scene.environment.id;
    w.setHour(37);
    const repeated = w.scene.environment.id;
    w.setHour(0);
    const midnight = w.scene.environment.id;
    const gaps = [5.5, 19.5, 24].map((h) => {
      w.setHour(h - 0.001);
      const a = { ...w.sunDir };
      w.setHour(h + 0.001);
      return Math.hypot(w.sunDir.x - a.x, w.sunDir.y - a.y, w.sunDir.z - a.z);
    });
    return { noon, repeated, midnight, gaps };
  });
  expect(clock.repeated).toBe(clock.noon);
  expect(clock.midnight).not.toBe(clock.noon);
  for (const gap of clock.gaps) expect(gap).toBeLessThan(0.01);
  expect(problems).toEqual([]);
  fs.writeFileSync(
    `${out}/review.json`,
    JSON.stringify({ rows, textures, clock, problems }, null, 2),
  );
});
