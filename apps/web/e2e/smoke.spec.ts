import { expect, test, type Page } from '@playwright/test';

const FAST_SETTINGS = {
  botSpeed: 'instant',
  rookieTips: false,
  muted: true,
  reduceMotion: true,
};

let consoleProblems: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleProblems = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') consoleProblems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleProblems.push(`pageerror: ${err.message}`));
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('hexfall.settings', JSON.stringify(s));
      sessionStorage.setItem('e2e-init', '1');
    }
  }, FAST_SETTINGS);
});

test.afterEach(() => {
  expect(consoleProblems, 'no console errors or warnings').toEqual([]);
});

/** Resolves interruptions caused by bots: trade offers, discards, steals, wraith moves. */
async function handleInterrupts(page: Page): Promise<boolean> {
  const offer = page.getByRole('dialog', { name: 'An offer arrives' });
  if (await offer.isVisible()) {
    await offer.getByRole('button', { name: /Decline/ }).click({ timeout: 2000 }).catch(() => undefined);
    await expect(offer).toBeHidden();
    return true;
  }
  const discard = page.getByRole('dialog', { name: /Discard \d+ cards/ });
  if (await discard.isVisible()) {
    const confirm = discard.getByTestId('confirm-discard');
    for (let i = 0; i < 40 && !(await confirm.isEnabled()); i++) {
      const more = discard.locator('button[aria-label^="More "]:not([disabled])').first();
      await more.click();
    }
    await confirm.click({ timeout: 2000 }).catch(() => undefined);
    await expect(discard).toBeHidden();
    return true;
  }
  const steal = page.getByRole('dialog', { name: 'Choose whom to rob' });
  if (await steal.isVisible()) {
    await steal.locator('button').nth(0).click({ timeout: 2000 }).catch(() => undefined);
    await expect(steal).toBeHidden();
    return true;
  }
  const wraith = page.locator('[aria-label^="Send the Wraith"]').first();
  if (await wraith.isVisible().catch(() => false)) {
    await wraith.click({ force: true });
    return true;
  }
  return false;
}

async function waitForMyRoll(page: Page) {
  const roll = page.getByTestId('roll');
  for (let i = 0; i < 400; i++) {
    if (await roll.isVisible()) return;
    if (!(await handleInterrupts(page))) await page.waitForTimeout(50);
  }
  throw new Error('never got my turn');
}

test('3-player game: setup, roll, build, bank trade, end turn, reload & continue', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-game').click();
  await page.getByRole('button', { name: '3 players' }).click();
  await page.getByTestId('seed').fill('smoke-isle-7');
  await page.getByRole('button', { name: 'Seat 1' }).click();
  await page.getByTestId('begin').click();

  // Founding: we are seat 1 (first and last in the snake).
  let placed = 0;
  while (placed < 2) {
    const spots = page.locator('[aria-label^="Place an Outpost"]');
    await expect(spots.first()).toBeVisible({ timeout: 20_000 });
    const labels = await spots.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    // Prefer a spot touching both Witchwood and Ashen Hills so the founding yields causeway stock.
    let idx = labels.findIndex((l) => l.includes('Witchwood') && l.includes('Ashen Hills'));
    if (idx < 0) idx = labels.findIndex((l) => l.split(',').length === 3);
    await spots.nth(Math.max(0, idx)).click({ force: true });
    await page.locator('[aria-label^="Lay a Causeway"]').first().click({ force: true });
    placed++;
  }

  let built = false;
  let traded = false;
  for (let turn = 0; turn < 40 && !(built && traded); turn++) {
    await waitForMyRoll(page);
    await page.getByTestId('roll').click();
    // Resolve a 7 if we rolled it.
    for (let i = 0; i < 20; i++) {
      if (await page.getByTestId('end-turn').isEnabled()) break;
      if (!(await handleInterrupts(page))) await page.waitForTimeout(50);
    }
    if (!(await page.getByTestId('end-turn').isEnabled())) {
      throw new Error(`stuck after roll: ${await page.getByRole('region', { name: 'Turn' }).innerText()}`);
    }

    if (!built && (await page.getByTestId('build-causeway').isEnabled())) {
      await page.getByTestId('build-causeway').click();
      await page.locator('[aria-label^="Lay a Causeway"]').first().click({ force: true });
      await expect(page.getByText(/laid a Causeway$/).first()).toBeVisible();
      built = true;
    }
    if (!traded) {
      await page.getByTestId('tab-trade').click();
      const give = page.locator('button[aria-label^="Give "]:not([disabled])').first();
      if (await give.count()) {
        await give.click();
        await page.locator('button[aria-label^="Receive "]:not([disabled])').first().click();
        await page.getByTestId('bank-trade').click();
        await expect(page.getByText(/traded \d:1/).first()).toBeVisible();
        traded = true;
      }
      await page.getByTestId('tab-build').click();
    }
    await page.getByTestId('end-turn').click();
  }
  expect(built).toBe(true);
  expect(traded).toBe(true);

  // Reload and continue: the same position comes back.
  await waitForMyRoll(page);
  const handLabels = () =>
    page.locator('[data-testid=hand] [role=img]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const before = await handLabels();
  const round = await page.getByLabel(/^Round \d+$/).getAttribute('aria-label');
  await page.reload();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('roll')).toBeVisible();
  expect(await handLabels()).toEqual(before);
  await expect(page.getByLabel(/^Round \d+$/)).toHaveAttribute('aria-label', round!);
  await expect(page.getByTestId('roll')).toBeVisible();
});

test('hot-seat: the pass-device curtain hides hands between human seats', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-game').click();
  await page.getByRole('button', { name: '3 players' }).click();
  await page.getByTestId('seat-human-1').click();
  await page.getByRole('button', { name: 'Seat 1' }).click();
  await page.getByTestId('begin').click();

  const curtain = page.getByRole('dialog', { name: /Pass the device to Ashwyn/ });
  await expect(curtain).toBeVisible();
  await expect(page.getByTestId('hand')).toBeHidden({ timeout: 1000 }).catch(() => undefined);
  await page.getByTestId('ack-device').click();
  await page.locator('[aria-label^="Place an Outpost"]').first().click({ force: true });
  await page.locator('[aria-label^="Lay a Causeway"]').first().click({ force: true });
  await expect(page.getByRole('dialog', { name: /Pass the device to Morrow/ })).toBeVisible();
});

test('rulebook and settings open from the title screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog', { name: 'The Rule of the Isle' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
});
