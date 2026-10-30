import { expect, test, type Page } from '@playwright/test';

// Live combat online (DECISIONS #40): two people in the 3D walk see each other, a sword blow
// is checked by the server and applied by the engine, and the board shows who's walking.
const SETTINGS = { botSpeed: 'instant', rookieTips: false, muted: true, reduceMotion: true, effects: 'lite' };

async function prepare(page: Page, name: string, color: string, problems: string[]) {
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${name}: ${m.text()}`);
  });
  await page.addInitScript(
    ([s, profile]) => {
      if (!sessionStorage.getItem('e2e-init')) {
        localStorage.clear();
        localStorage.setItem('hexfall.settings', JSON.stringify(s));
        localStorage.setItem('hexfall.profile', JSON.stringify(profile));
        sessionStorage.setItem('e2e-init', '1');
      }
    },
    [SETTINGS, { name, color, sigil: 'skull' }] as const,
  );
  await page.goto('/');
}

async function placeIfAsked(page: Page): Promise<boolean> {
  for (const label of ['Place a Settlement', 'Build a Road']) {
    const spot = page.locator(`[aria-label^="${label}"]`).first();
    if (await spot.isVisible().catch(() => false)) {
      await spot.click({ force: true });
      return true;
    }
  }
  return false;
}

type Dev = {
  __world3d: {
    world: {
      x: number;
      z: number;
      yaw: number;
      remotes: Map<number, { present: boolean; position: { x: number; z: number } }>;
    };
  };
  __hexfall: {
    getState(): {
      session: { online: { seats: number[] }; state: { arms: { health: number[]; armed: boolean[] } } };
      dispatch(a: object): void;
    };
  };
};

test('online: players in the 3D walk see each other and a sword blow lands', async ({ browser }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await prepare(host, 'Mazen', 'crimson', problems);
  await prepare(guest, 'Sara', 'frost', problems);

  await host.getByTestId('new-game').click();
  await host.getByTestId('host').click();
  const codeEl = host.getByTestId('room-code');
  await expect(codeEl).toHaveText(/^[A-Z]+-\d{2}$/, { timeout: 15_000 });
  const code = (await codeEl.textContent())!.trim();
  await host.getByRole('button', { name: '3 players' }).click();
  await host.getByTestId('seed').fill('pvp-e2e-1');
  await host.getByRole('button', { name: 'Seat 1' }).click();
  await guest.getByTestId('new-game').click();
  await guest.getByTestId('join-code').fill(code);
  await guest.getByTestId('join').click();
  await expect(host.getByText('Joined online')).toBeVisible();
  await host.getByTestId('fill-bots').click();
  await host.getByTestId('begin').click();

  for (let i = 0; i < 120; i++) {
    if (await host.getByTestId('roll').isVisible()) break;
    const acted = (await placeIfAsked(host)) || (await placeIfAsked(guest));
    if (!acted) await host.waitForTimeout(150);
  }
  await expect(host.getByTestId('roll')).toBeVisible();

  // Both walk the island: each sees the other.
  for (const p of [host, guest]) {
    await p.getByTestId('walk-3d').click();
    await expect(p.getByTestId('world-location')).toBeVisible({ timeout: 60_000 });
  }
  const seats = await Promise.all(
    [host, guest].map((p) => p.evaluate(() => (window as unknown as Dev).__hexfall.getState().session.online.seats[0])),
  );
  await expect
    .poll(() => host.evaluate((s) => !!(window as unknown as Dev).__world3d.world.remotes.get(s)?.present, seats[1]), {
      timeout: 10_000,
    })
    .toBe(true);
  await expect
    .poll(() => guest.evaluate((s) => !!(window as unknown as Dev).__world3d.world.remotes.get(s)?.present, seats[0]))
    .toBe(true);

  // The host finds the chest's weapons, steps up to the friend and strikes.
  await host.evaluate((me) => (window as unknown as Dev).__hexfall.getState().dispatch({ type: 'OpenChest', player: me }), seats[0]);
  await expect
    .poll(() => host.evaluate((me) => (window as unknown as Dev).__hexfall.getState().session.state.arms.armed[me], seats[0]))
    .toBe(true);
  await guest.evaluate(() => {
    const w = (window as unknown as Dev).__world3d.world;
    // Stand still on open ground the host can reach.
    w.yaw = 0;
  });
  await host.waitForTimeout(500);
  await host.evaluate((them) => {
    const w = (window as unknown as Dev).__world3d.world;
    const p = w.remotes.get(them)!.position;
    w.x = p.x;
    w.z = p.z + 1.5;
    w.yaw = 0;
  }, seats[1]);
  await host.waitForTimeout(400);
  await host.locator('[data-world3d]').focus();
  await host.keyboard.press('Digit1');
  await host.keyboard.press('KeyF');
  await expect
    .poll(() => guest.evaluate((me) => (window as unknown as Dev).__hexfall.getState().session.state.arms.health[me], seats[1]), {
      timeout: 5_000,
    })
    .toBe(75);
  await expect(guest.getByTestId('my-health')).toContainText('75');

  // Back on the board, the friend sees a marker where the host walks.
  await guest.locator('[data-world3d]').focus();
  await guest.keyboard.press('Escape');
  await expect(guest.getByTestId('walk-presence')).toBeVisible();
  expect(problems).toEqual([]);
});
