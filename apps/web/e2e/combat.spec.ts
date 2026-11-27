import { expect, test } from '@playwright/test';
import { Combat } from '../src/components/world/combat';

const run = (c: Combat, frames: number, yaw = 0, clear: (x: number, z: number) => boolean = () => true) => {
  for (let i = 0; i < frames; i++) c.update(1 / 60, 0, 0, 0, yaw, 0, clear);
};

test('fists until the chest: one hit per swing, range, facing, obstruction and recovery', () => {
  const hits: number[] = [];
  const c = new Combat(
    false,
    () => {},
    (hp, hit) => {
      if (hit) hits.push(hp);
    },
  );
  expect(c.weapon).toBe('fist');
  expect(c.selectWeapon('sword')).toBe(false);
  c.practice(0, 0, -1.5);
  expect(c.attack(0)).toBe(true);
  expect(c.attack(0)).toBe(false);
  run(c, 40);
  expect(hits).toEqual([90]);
  c.attack(Math.PI);
  run(c, 40, Math.PI);
  expect(hits).toEqual([90]);
  c.attack(0);
  run(c, 40, 0, () => false);
  expect(hits).toEqual([90]);
  // Opening the chest hands over the sword: 25 a blow, four more finish the dummy.
  c.setArms(true, 5);
  expect(c.weapon).toBe('sword');
  c.practice(0, 0, -2);
  for (let i = 0; i < 4; i++) {
    c.attack(0);
    run(c, 45);
  }
  expect(c.health).toBe(0);
  run(c, 180);
  expect(c.health).toBe(100);
});

test('guarding stops attacks; reduced motion keeps damage without shake or particles', () => {
  const c = new Combat(true, () => {}, () => {});
  c.setArms(true, 5);
  c.setBlock(true);
  expect(c.attack(0)).toBe(false);
  c.setBlock(false);
  c.practice(0, 0, -2);
  c.attack(0);
  run(c, 15);
  expect(c.health).toBe(75);
  expect(c.shake).toBe(0);
  expect(c.sparks.visible).toBe(false);
  expect(c.dummy.position.z).toBe(-2);
});

test('retired revolver cannot be equipped, displayed or fired', () => {
  const sounds: string[] = [];
  let fired = 0;
  const c = new Combat(
    false,
    (s) => sounds.push(s),
    () => {},
    undefined,
    undefined,
    () => fired++,
  );
  c.setArms(true, 5);
  expect(c.selectWeapon('revolver')).toBe(false);
  expect(c.weapon).toBe('sword');
  c.practice(0, 0, -10);
  c.attack(0);
  run(c, 45);
  expect(c.health).toBe(100);
  expect(fired).toBe(0);
  expect(sounds).not.toContain('shot');
  expect(c.me.root.getObjectByName('Revolver')).toBeUndefined();
});

test('live fights: a blow that lands on another player is reported, the nearest first', () => {
  const struck: [number, string][] = [];
  const c = new Combat(false, () => {}, () => {}, undefined, (seat, w) => struck.push([seat, w]));
  c.setArms(true, 5);
  c.targets = [
    { seat: 2, x: 0, y: 0, z: -2.2 },
    { seat: 1, x: 0, y: 0, z: -1.6 },
    { seat: 3, x: 0, y: 0, z: 2 },
  ];
  c.attack(0);
  run(c, 40);
  expect(struck).toEqual([[1, 'sword']]);
  c.attack(Math.PI);
  run(c, 40, Math.PI);
  expect(struck).toEqual([
    [1, 'sword'],
    [3, 'sword'],
  ]);
});

test('third-person practice in a game from before weapon chests: sword-only equipment', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('hexfall.settings', JSON.stringify({ effects: 'lite', muted: true, rookieTips: false }));
  });
  // The village fixture predates weapon chests: its players carry both weapons from the start.
  await page.goto('/?scene=village');
  await expect(page.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('minimap')).toBeVisible();
  await expect(page.getByTestId('dive-in')).toBeVisible();
  await expect(page.getByTestId('world-time')).not.toBeEmpty();
  const setup = await page.evaluate(() => {
    type W = { x: number; z: number; yaw: number; goTo(h: number): void; practice(): boolean };
    const d = window as unknown as {
      __world3d: { world: W };
      __hexfall: { getState(): { session: { actions: unknown[] } } };
    };
    const w = d.__world3d.world;
    for (let h = 0; h < 19; h++) {
      w.goTo(h);
      for (let a = 0; a < 8; a++) {
        w.yaw = (a * Math.PI) / 4;
        if (w.practice()) return d.__hexfall.getState().session.actions.length;
      }
    }
    return -1;
  });
  expect(setup).toBeGreaterThanOrEqual(0);
  const world = page.locator('[data-world3d]');
  await world.focus();
  await expect(page.getByRole('button', { name: /^Sword/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('KeyF');
  await expect(page.getByTestId('combat-target')).toContainText('75 / 100');
  const view = await page.evaluate(() => {
    const d = window as unknown as {
      __world3d: { world: { x: number; z: number; camera: { position: { x: number; z: number } }; combat: { hits: number } } };
      __hexfall: { getState(): { session: { actions: unknown[] } } };
    };
    const w = d.__world3d.world;
    return {
      actions: d.__hexfall.getState().session.actions.length,
      hits: w.combat.hits,
      cameraDistance: Math.hypot(w.x - w.camera.position.x, w.z - w.camera.position.z),
    };
  });
  expect(view.actions).toBe(setup);
  expect(view.hits).toBe(1);
  expect(view.cameraDistance).toBeGreaterThan(0.1);
  // Old saves also have no third slot or local-ammo fallback.
  await page.waitForTimeout(800);
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Digit3');
  await expect(page.getByRole('button', { name: /^Sword/ })).toHaveAttribute('aria-pressed', 'true',
  );
  await expect(page.getByRole('button', { name: /Revolver/ })).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __hexfall: { getState(): { session: { actions: unknown[] } } } }).__hexfall.getState()
          .session.actions.length,
    ),
  ).toBe(setup);
  await page.keyboard.press('Escape');
  await expect(world).toHaveCount(0);
  expect(errors).toEqual([]);
});
