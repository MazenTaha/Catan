import { test } from '@playwright/test';

declare const process: { env: Record<string, string | undefined> };

/** Opt-in: `PERF=1 pnpm e2e perf` logs main-thread cost while the game screen idles. */
test.skip(!process.env.PERF, 'set PERF=1 to profile');

// Real GPU when available (headless defaults to software rendering).
test.use({ launchOptions: { args: process.env.PERF_GPU ? ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] : [] } });

const VARIANTS: Record<string, string> = {
  all: '',
  'no-grain': '.grain::after{animation:none!important;display:none!important}',
  'no-embers': 'canvas{display:none!important}',
  'no-sea-anim': '[data-board] svg:first-child *{animation:none!important}',
  'no-dynamic-anim': '[data-board] > svg *{animation:none!important}',
  'no-ui-anim': 'header *, aside *, section *{animation:none!important}',
};
const variants = process.env.PERF === 'bisect' ? Object.keys(VARIANTS) : ['all'];

for (const variant of variants)
for (const reduce of variant === 'all' ? [false, true] : [false])
test(`idle main-thread cost (${variant}, reduce motion: ${reduce})`, async ({ page }) => {
  await page.addInitScript((r) => {
    (window as unknown as { __reduce?: boolean }).__reduce = r;
    if (!sessionStorage.getItem('perf')) {
      localStorage.clear();
      localStorage.setItem('hexfall.settings', JSON.stringify({ botSpeed: 'instant', rookieTips: false, muted: true, reduceMotion: !!(window as unknown as { __reduce?: boolean }).__reduce }));
      sessionStorage.setItem('perf', '1');
    }
  }, reduce);
  await page.goto('/');
  await page.getByTestId('new-game').click();
  await page.getByTestId('seed').fill('perf-isle');
  await page.getByRole('button', { name: 'Seat 1' }).click();
  await page.getByTestId('begin').click();
  for (let i = 0; i < 2; i++) {
    await page.locator('[aria-label^="Place an Outpost"]').first().click({ force: true });
    await page.locator('[aria-label^="Lay a Causeway"]').first().click({ force: true });
  }
  await page.getByTestId('roll').waitFor();
  if (VARIANTS[variant]) await page.addStyleTag({ content: VARIANTS[variant] });
  await page.waitForTimeout(1500);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const read = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  };
  const frames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const start = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - start < 5000) requestAnimationFrame(tick);
          else resolve(n / 5);
        };
        requestAnimationFrame(tick);
      }),
  );
  const a = await read();
  await page.waitForTimeout(5000);
  const b = await read();
  const per = (k: string) => (((b[k] - a[k]) / 5) * 1000).toFixed(1);
  console.log(
    `[perf ${variant} reduce=${reduce}] fps≈${frames.toFixed(0)}  per-second main thread: task ${per('TaskDuration')}ms, ` +
      `script ${per('ScriptDuration')}ms, layout ${per('LayoutDuration')}ms, style ${per('RecalcStyleDuration')}ms`,
  );
});
