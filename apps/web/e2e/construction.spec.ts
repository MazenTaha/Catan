import { expect, test } from '@playwright/test';
import type { Action, GameState } from '@hexfall/engine';

test.use({
  launchOptions: {
    args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
  },
});

interface WorldProbe {
  construction: { started: number; plane: { constant: number } }[];
  homes: { key: string; kind: string; x: number; z: number; rot: number }[];
  setPieces(state: GameState): void;
  goToBuilding(vertex: string): boolean;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  renderer: { info: { render: { calls: number; triangles: number } } };
  setHour(hour: number): void;
}
interface Dev {
  __world3d: { world: WorldProbe; state(): GameState };
  __hexfall: {
    getState(): {
      session: { state: GameState };
      dispatch(action: Action): void;
      fx: { buildings: { vertex: string; at: number }[] };
    };
  };
}

test('knight and long cape render in the actual character preview', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Character', exact: true }).click();
  await page
    .getByRole('radiogroup', { name: 'Cape', exact: true })
    .getByRole('radio', { name: 'Long', exact: true })
    .click();
  const preview = page.getByTestId('character-preview');
  await expect(preview.locator('canvas')).toBeVisible();
  await page.waitForTimeout(2000);
  await preview.screenshot({ path: 'test-results/knight-long-cape.png' });
});

for (const reduceMotion of [false, true]) {
  test(`confirmed city construction ${reduceMotion ? 'respects reduced motion' : 'builds for five seconds without restarting'}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((reduce) => {
      localStorage.setItem(
        'hexfall.settings',
        JSON.stringify({
          effects: 'full',
          renderScale: 1,
          muted: true,
          reduceMotion: reduce,
          botSpeed: 'instant',
          rookieTips: false,
        }),
      );
    }, reduceMotion);
    await page.goto('/?scene=village');
    await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
    expect(
      await page.evaluate(() => (window as unknown as Dev).__world3d.world.construction.length),
    ).toBe(0);
    await page.evaluate(() => {
      const w = (window as unknown as Dev).__world3d.world;
      const h = w.homes.find((home) => home.key === '-2,4')!;
      w.setHour(14);
      w.x = h.x + Math.sin(h.rot + 0.55) * 13;
      w.z = h.z + Math.cos(h.rot + 0.55) * 13;
      w.yaw = Math.atan2(-(h.x - w.x), -(h.z - w.z));
      w.pitch = 0.12;
    });
    if (!reduceMotion) await page.screenshot({ path: 'test-results/cottage-review.png' });
    await page.evaluate(() => {
      const dev = window as unknown as Dev;
      dev.__hexfall.getState().dispatch({ type: 'BuildCitadel', player: 0, vertex: '-2,4' });
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as Dev).__hexfall.getState().session.state.buildings['-2,4'].kind,
        ),
      )
      .toBe('citadel');
    if (reduceMotion) {
      expect(
        await page.evaluate(() => (window as unknown as Dev).__world3d.world.construction.length),
      ).toBe(0);
    } else {
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as Dev).__world3d.world.construction.length),
        )
        .toBe(1);
      const start = await page.evaluate(
        () => (window as unknown as Dev).__world3d.world.construction[0].started,
      );
      const initial = await page.evaluate(
        () => (window as unknown as Dev).__world3d.world.construction[0].plane.constant,
      );
      await page.waitForTimeout(1000);
      expect(
        await page.evaluate(
          () => (window as unknown as Dev).__world3d.world.construction[0].plane.constant,
        ),
      ).toBeGreaterThan(initial);
      await page.evaluate(() => {
        const dev = window as unknown as Dev;
        dev.__world3d.world.setPieces(dev.__world3d.state());
      });
      expect(
        await page.evaluate(
          () => (window as unknown as Dev).__world3d.world.construction[0].started,
        ),
      ).toBe(start);
      await page.screenshot({ path: 'test-results/construction-progress.png' });
      await expect
        .poll(
          () => page.evaluate(() => (window as unknown as Dev).__world3d.world.construction.length),
          { timeout: 7000 },
        )
        .toBe(0);
      const elapsed = await page.evaluate((started) => Date.now() - started, start);
      expect(elapsed).toBeGreaterThanOrEqual(5000);
      expect(elapsed).toBeLessThan(7000);
      await page.evaluate(() => {
        const w = (window as unknown as Dev).__world3d.world;
        const h = w.homes.find((home) => home.key === '-2,4')!;
        w.setHour(14);
        w.x = h.x + Math.sin(h.rot + 0.55) * 17;
        w.z = h.z + Math.cos(h.rot + 0.55) * 17;
        w.yaw = Math.atan2(-(h.x - w.x), -(h.z - w.z));
        w.pitch = 0.15;
      });
      await page.waitForTimeout(250);
      await page.screenshot({ path: 'test-results/city-finished.png' });
    }
    expect(errors).toEqual([]);
  });
}

test('2D city placement carries its construction event into the 3D visit', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'hexfall.settings',
      JSON.stringify({ effects: 'lite', muted: true, rookieTips: false }),
    ),
  );
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: '2D board', exact: true }).click();
  await page.getByTestId('build-citadel').click();
  await page
    .getByRole('button', { name: /Upgrade to a City at/ })
    .first()
    .click();
  const event = await page.evaluate(() =>
    (window as unknown as Dev).__hexfall.getState().fx.buildings.at(-1)!,
  );
  expect(event.vertex).toBeTruthy();
  await page.getByRole('button', { name: '3D walk', exact: true }).click();
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  const age = await page.evaluate((at) => Date.now() - at, event.at);
  // Old buildings never replay on entry. A still-live placement resumes its real event clock.
  if (age < 4800)
    expect(
      await page.evaluate(() => (window as unknown as Dev).__world3d.world.construction.length),
    ).toBe(1);
  await expect
    .poll(
      () => page.evaluate(() => (window as unknown as Dev).__world3d.world.construction.length),
      { timeout: 7000 },
    )
    .toBe(0);
});

test('a newly confirmed settlement builds its cottage in the live 3D world', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'hexfall.settings',
      JSON.stringify({ effects: 'lite', muted: true, rookieTips: false }),
    ),
  );
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  // Trade for the missing lumber, then build at the legal end of seat zero's road.
  await page.evaluate(() =>
    (window as unknown as Dev).__hexfall
      .getState()
      .dispatch({ type: 'BankTrade', player: 0, give: 'ore', receive: 'wood' }),
  );
  await page.evaluate(() =>
    (window as unknown as Dev).__hexfall
      .getState()
      .dispatch({ type: 'BuildOutpost', player: 0, vertex: '-4,4' }),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as Dev).__world3d.world.homes.find((home) => home.key === '-4,4')
            ?.kind,
      ),
    )
    .toBe('cottage');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Dev).__world3d.world.construction.length))
    .toBe(1);
  const started = await page.evaluate(
    () => (window as unknown as Dev).__world3d.world.construction[0].started,
  );
  await expect
    .poll(
      () => page.evaluate(() => (window as unknown as Dev).__world3d.world.construction.length),
      { timeout: 7000 },
    )
    .toBe(0);
  expect(await page.evaluate((at) => Date.now() - at, started)).toBeGreaterThanOrEqual(5000);
});
