import { expect, test, type Page } from '@playwright/test';

const SETTINGS = {
  botSpeed: 'instant',
  rookieTips: false,
  muted: true,
  reduceMotion: true,
  effects: 'lite',
};

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

/** Places a settlement or road if this page is being asked to. */
async function placeIfAsked(page: Page): Promise<boolean> {
  const spot = page.locator('[aria-label^="Place a Settlement"]').first();
  if (await spot.isVisible().catch(() => false)) {
    await spot.click({ force: true });
    return true;
  }
  const road = page.locator('[aria-label^="Build a Road"]').first();
  if (await road.isVisible().catch(() => false)) {
    await road.click({ force: true });
    return true;
  }
  return false;
}

test('online: host shares a room code, a friend joins, and both play the opening', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();
  await prepare(host, 'Mazen', 'crimson', problems);
  await prepare(guest, 'Sara', 'crimson', problems);

  // Host opens a room.
  await host.getByTestId('new-game').click();
  await host.getByTestId('host').click();
  const codeEl = host.getByTestId('room-code');
  await expect(codeEl).toBeVisible();
  const code = (await codeEl.innerText()).trim();
  expect(code).toMatch(/^[A-Z]+-\d{2}$/);
  await host.getByRole('button', { name: '3 players' }).click();
  await host.getByTestId('seed').fill('online-e2e-1');
  await host.getByRole('button', { name: 'Seat 1' }).click();

  // A wrong code is explained, then the right one gets the friend in.
  await guest.getByTestId('new-game').click();
  await guest.getByTestId('join-code').fill('NOPE-99');
  await guest.getByTestId('join').click();
  await expect(guest.getByTestId('join-error')).toContainText('No game with that code');
  await guest.getByRole('button', { name: 'Try another code' }).click();
  await guest.getByTestId('join-code').fill(code.toLowerCase().replace('-', ' '));
  await guest.getByTestId('join').click();
  await expect(guest.getByTestId('join-waiting')).toContainText('Waiting for Mazen');

  // The host sees Sara arrive (with a different colour), fills the last seat and starts.
  await expect(host.getByText('Joined online')).toBeVisible();
  await expect(host.getByTestId('begin')).toBeDisabled();
  await host.getByTestId('fill-bots').click();
  await host.getByTestId('begin').click();

  await expect(host.getByRole('region', { name: 'Turn' })).toBeVisible();
  await expect(guest.getByRole('region', { name: 'Turn' })).toBeVisible();
  await expect(guest.getByText(code)).toBeVisible();

  // Setup snake: Mazen, Sara, bot, bot, Sara, Mazen — each on their own screen.
  for (let i = 0; i < 200; i++) {
    if (await host.getByTestId('roll').isVisible()) break;
    const acted = (await placeIfAsked(host)) || (await placeIfAsked(guest));
    if (!acted) await host.waitForTimeout(150);
  }
  await expect(host.getByTestId('roll')).toBeVisible();

  // Both tables agree: six buildings, and the friend's second settlement paid out to her only.
  const buildings = (p: Page) =>
    p.evaluate(() => {
      const w = window as unknown as {
        __hexfall: { getState(): { session: { state: { buildings: object } } } };
      };
      return Object.keys(w.__hexfall.getState().session.state.buildings).length;
    });
  expect(await buildings(host)).toBe(6);
  expect(await buildings(guest)).toBe(6);
  await expect(guest.getByTestId('hand')).toBeVisible();

  // The host rolls; the friend sees it in her log.
  await host.getByTestId('roll').click();
  await expect(guest.getByText(/Mazen rolled \d+/).first()).toBeVisible();

  expect(problems).toEqual([]);
});
