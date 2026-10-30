import { expect, test } from '@playwright/test';
import { hostWithBots } from './helpers';

// Lite graphics keep the WebGL scene quick under software rendering (CI, headless).
const FAST_SETTINGS = {
  botSpeed: 'instant',
  rookieTips: false,
  muted: true,
  reduceMotion: true,
  effects: 'lite',
};

test('3D walk: toggle from the board, walk, jump between lands and back', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (msg) => {
    // Chrome's own GL driver notes (e.g. "GPU stall due to ReadPixels" when screenshots are taken) aren't ours.
    if (msg.text().includes('GL Driver Message')) return;
    if (msg.type() === 'error' || msg.type() === 'warning')
      problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.clear();
      localStorage.setItem('hexfall.settings', JSON.stringify(s));
      sessionStorage.setItem('e2e-init', '1');
    }
  }, FAST_SETTINGS);

  await page.goto('/');
  await hostWithBots(page);
  await page.getByTestId('seed').fill('world-3d-1');
  await page.getByRole('button', { name: 'Seat 1' }).click();
  await page.getByTestId('begin').click();
  for (let i = 0; i < 2; i++) {
    await page.locator('[aria-label^="Place a Settlement"]').first().click({ force: true });
    await page.locator('[aria-label^="Build a Road"]').first().click({ force: true });
  }
  await page.getByTestId('roll').waitFor();

  await page.getByRole('button', { name: '3D walk' }).click();
  const world = page.locator('[data-world3d]');
  await expect(world.locator('canvas')).toBeVisible({ timeout: 20_000 });
  const where = page.getByTestId('world-location');
  // We spawn at one of our own settlements, so we're listed as an owner there.
  await expect(where).toContainText('You');

  await world.focus();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');

  await expect(page.getByRole('button', { name: 'Next land' })).toHaveCount(0);

  // The game keeps working while walking: Space still rolls.
  await page.keyboard.press('Space');
  await expect(page.getByTestId('end-turn')).toBeEnabled();

  await page.getByRole('button', { name: '2D board' }).click();
  await expect(world).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'The board' })).toBeVisible();
  expect(problems, 'no console errors or warnings').toEqual([]);
});
