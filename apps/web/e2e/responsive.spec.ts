import { expect, test } from '@playwright/test';
import { hostWithBots } from './helpers';

const SETTINGS = { botSpeed: 'instant', rookieTips: false, muted: true, reduceMotion: true };

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 1024, height: 768 },
]) {
  test(`${vp.name}: game layout fits without horizontal scroll`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.addInitScript((s) => {
      localStorage.clear();
      localStorage.setItem('hexfall.settings', JSON.stringify(s));
    }, SETTINGS);
    await page.goto('/');
    await hostWithBots(page);
    await page.getByRole('button', { name: 'Seat 1' }).click();
    await page.getByTestId('begin').click();
    await expect(page.locator('[aria-label^="Place a Settlement"]').first()).toBeAttached();
    await expect(page.getByTestId('hand')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const board = await page.getByRole('group', { name: 'The board' }).boundingBox();
    expect(board!.width).toBeLessThanOrEqual(vp.width);
    if (vp.width < 900) {
      await expect(page.getByRole('button', { name: /Hide hand/ })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
