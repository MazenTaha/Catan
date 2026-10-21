import type { Page } from '@playwright/test';

/** Title → Play → Host a game, with every open seat turned into a bot. */
export async function hostWithBots(page: Page) {
  await page.getByTestId('new-game').click();
  await page.getByTestId('host').click();
  const fill = page.getByTestId('fill-bots');
  // Online the seats start open; offline they're already bots and the button is gone.
  await fill.click({ timeout: 6000 }).catch(() => undefined);
}
