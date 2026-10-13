import { test } from '@playwright/test';

/** Opt-in visual capture: `SHOTS=1 pnpm e2e shots` writes PNGs to test-results/shots. */
test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture screenshots');

const SETTINGS = { botSpeed: 'instant', rookieTips: false, muted: true, reduceMotion: true };

for (const vp of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 1024, height: 768 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`capture ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.addInitScript((s) => {
      if (!sessionStorage.getItem('shots')) {
        localStorage.clear();
        localStorage.setItem('hexfall.settings', JSON.stringify(s));
        sessionStorage.setItem('shots', '1');
      }
    }, SETTINGS);
    await page.goto('/');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `test-results/shots/${vp.name}-title.png` });
    await page.getByTestId('new-game').click();
    await page.screenshot({ path: `test-results/shots/${vp.name}-setup.png`, fullPage: true });
    await page.getByTestId('seed').fill('shots-board-3');
    await page.getByRole('button', { name: 'Seat 1' }).click();
    await page.getByTestId('begin').click();
    // On phones the hand sheet covers the lower board; fold it away while placing.
    const hide = page.getByRole('button', { name: /Hide hand/ });
    if (vp.width < 900 && (await hide.isVisible())) await hide.click();
    // Set up twice, then roll once so production effects are visible.
    for (let i = 0; i < 2; i++) {
      await page.locator('[aria-label^="Place a Settlement"]').first().click({ force: true });
      await page.locator('[aria-label^="Build a Road"]').first().click({ force: true });
    }
    const show = page.getByRole('button', { name: /Show hand/ });
    if (await show.isVisible()) await show.click();
    await page.getByTestId('roll').waitFor();
    await page.getByTestId('roll').click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test-results/shots/${vp.name}-game.png`, fullPage: vp.width < 900 });
    if (vp.name === 'desktop') {
      await page.getByRole('group', { name: 'The board' }).screenshot({ path: 'test-results/shots/desktop-board.png' });
    }
  });
}
