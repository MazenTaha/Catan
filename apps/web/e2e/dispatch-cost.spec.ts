import { test } from '@playwright/test';

/** Opt-in: `LAG=1 pnpm e2e dispatch-cost` splits each action's cost into store work and React render. */
test.skip(!process.env.LAG, 'set LAG=1 to measure');
test.use({ trace: 'off' });

test('per-action cost', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('hexfall.settings', JSON.stringify({ botSpeed: 'fast', rookieTips: false, muted: true, effects: 'full' }));
  });
  if (process.env.LAG_CPU) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.LAG_CPU) });
  }
  await page.goto('/');
  await page.getByTestId('new-game').click();
  await page.getByTestId('seed').fill('lag-isle');
  // Make every seat a bot so the game plays itself.
  const bots = page.getByRole('button', { name: /^Bot$/ });
  for (let i = 0; i < (await bots.count()); i++) await bots.nth(i).click();
  await page.getByTestId('begin').click();
  await page.evaluate(() => {
    type S = { getState(): { dispatch: (a: { type: string }) => unknown }; setState(p: object): void };
    const w = window as unknown as { __hexfall: S; __cost: { type: string; store: number; render: number }[] };
    w.__cost = [];
    const orig = w.__hexfall.getState().dispatch;
    w.__hexfall.setState({
      dispatch: (a: { type: string }) => {
        const t0 = performance.now();
        const r = orig(a);
        const t1 = performance.now();
        queueMicrotask(() => setTimeout(() => {}, 0));
        Promise.resolve().then(() => w.__cost.push({ type: a.type, store: t1 - t0, render: performance.now() - t1 }));
        return r;
      },
    });
  });
  await page.evaluate(() => (window as unknown as { __hexfall: { getState(): { dismissRollOff(): void } } }).__hexfall.getState().dismissRollOff());
  await page.waitForTimeout(40_000);
  const cost = await page.evaluate(() => (window as unknown as { __cost: { type: string; store: number; render: number }[] }).__cost);
  const by = new Map<string, { n: number; store: number; render: number; max: number }>();
  for (const c of cost) {
    const e = by.get(c.type) ?? { n: 0, store: 0, render: 0, max: 0 };
    e.n++;
    e.store += c.store;
    e.render += c.render;
    e.max = Math.max(e.max, c.store + c.render);
    by.set(c.type, e);
  }
  const think = await page.evaluate(() => {
    const w = window as unknown as { __hexfall: { getState(): { session: { state: unknown } } }; __hexfallAI(s: unknown, level?: string): unknown };
    const s = w.__hexfall.getState().session.state;
    const out: Record<string, number> = {};
    for (const level of ['wanderer', 'warlord', 'archdemon']) {
      const t0 = performance.now();
      for (let i = 0; i < 20; i++) w.__hexfallAI(s, level);
      out[level] = (performance.now() - t0) / 20;
    }
    return out;
  });
  console.log(`[cost] bot think per decision: ${JSON.stringify(think)}`);
  for (const [k, e] of [...by.entries()].sort((a, b) => b[1].max - a[1].max)) {
    console.log(`[cost] ${k.padEnd(20)} n=${String(e.n).padStart(3)}  store ${(e.store / e.n).toFixed(1)}ms  render ${(e.render / e.n).toFixed(1)}ms  max ${e.max.toFixed(1)}ms`);
  }
});
