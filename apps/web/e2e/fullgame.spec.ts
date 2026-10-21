import { expect, test, type Page } from '@playwright/test';
import { hostWithBots } from './helpers';

const SETTINGS = { botSpeed: 'instant', rookieTips: false, muted: true, reduceMotion: true };

interface Hooks {
  __hexfall: {
    getState(): {
      session: { state: { phase: { kind: string }; handoff: number | null; players: { kind: string }[]; winner: number | null } } | null;
      dispatch(a: unknown): unknown;
    };
  };
  __hexfallAI(state: unknown): unknown;
}

/** Plays every human decision with the Warlord AI; hand-offs go through the real curtain. */
async function playToVictory(page: Page, maxSteps = 4000) {
  let curtains = 0;
  for (let step = 0; step < maxSteps; step++) {
    const status = await page.evaluate(() => {
      const w = window as unknown as Hooks;
      const s = w.__hexfall.getState().session!.state;
      if (s.phase.kind === 'ended') return 'ended';
      if (s.handoff !== null) return 'handoff';
      const actorIsHuman = (() => {
        const st = s as unknown as { phase: { kind: string; pending?: number[]; offer?: { targets: number[]; declined: number[] } }; currentPlayer: number };
        let actor = st.currentPlayer;
        if (st.phase.kind === 'discard') {
          const n = s.players.length;
          for (let k = 0; k < n; k++) {
            const p = (st.currentPlayer + k) % n;
            if (st.phase.pending![p] > 0) {
              actor = p;
              break;
            }
          }
        }
        if (st.phase.kind === 'trade') {
          const next = st.phase.offer!.targets.find((t) => !st.phase.offer!.declined.includes(t));
          if (next !== undefined) actor = next;
        }
        return s.players[actor].kind === 'human';
      })();
      if (!actorIsHuman) return 'bot';
      w.__hexfall.getState().dispatch(w.__hexfallAI(s));
      return 'acted';
    });
    if (status === 'ended') return;
    if (status === 'handoff') {
      // The first hand-offs go through the real curtain button; later ones via the store for speed.
      if (curtains++ < 30) await page.getByTestId('ack-device').click();
      else {
        await page.evaluate(() => {
          const w = window as unknown as Hooks;
          const s = w.__hexfall.getState().session!.state;
          w.__hexfall.getState().dispatch({ type: 'AckPassDevice', player: s.handoff });
        });
      }
    }
    else if (status === 'bot') await page.waitForTimeout(5);
  }
  throw new Error('game did not finish');
}

let problems: string[] = [];
test.beforeEach(async ({ page }) => {
  problems = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('init')) {
      localStorage.clear();
      localStorage.setItem('hexfall.settings', JSON.stringify(s));
      sessionStorage.setItem('init', '1');
    }
  }, SETTINGS);
});
test.afterEach(() => expect(problems).toEqual([]));

test('1 human + 3 bots: title → victory → rematch', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await hostWithBots(page);
  await page.getByTestId('seed').fill('full-game-1');
  await page.getByTestId('begin').click();
  await page.getByTestId('begin-founding').click();
  await playToVictory(page);
  await expect(page.getByRole('dialog', { name: 'Victory' })).toBeVisible();
  await expect(page.getByText(/ wins!?/).first()).toBeVisible();
  await expect(page.getByText('Final reckoning')).toBeVisible();
  await page.getByRole('button', { name: /Rematch/ }).click();
  // A rematch opens a fresh game (new-game screen or straight into setup).
  await expect(page.getByLabel('Seed').or(page.getByRole('region', { name: 'Turn' }))).toBeVisible();
});

test('4-player hot-seat: curtains between every human, to victory', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  await hostWithBots(page);
  for (const i of [1, 2, 3]) await page.getByTestId(`seat-human-${i}`).click();
  await page.getByTestId('seed').fill('hotseat-full-2');
  await page.getByRole('button', { name: 'Seat 1' }).click();
  await page.getByTestId('begin').click();
  await expect(page.getByRole('dialog', { name: /Pass the device/ })).toBeVisible();
  await playToVictory(page, 8000);
  await expect(page.getByRole('dialog', { name: 'Victory' })).toBeVisible();
});
