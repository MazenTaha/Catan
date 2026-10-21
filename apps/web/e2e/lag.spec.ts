import { test, type Page } from '@playwright/test';
import { hostWithBots } from './helpers';

/**
 * Opt-in responsiveness probe: `LAG=1 pnpm e2e lag` (add LAG_GPU=1 for hardware rendering,
 * LAG_CPU=4 to throttle the CPU). Measures frame pacing and long tasks on the title menu,
 * the new-game screen and the game screen while idle, hovering and while bots play.
 */
test.skip(!process.env.LAG, 'set LAG=1 to measure');
test.use({
  launchOptions: { args: process.env.LAG_GPU ? ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] : [] },
  deviceScaleFactor: Number(process.env.LAG_DPR ?? 1),
  // Tracing snapshots the DOM on every mouse move and would dominate the numbers.
  trace: 'off',
  ...(process.env.LAG_URL ? { baseURL: process.env.LAG_URL } : {}),
});

type Node = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] };

async function probe(page: Page, label: string, during: () => Promise<void>) {
  const cdp = process.env.LAG_PROFILE ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
  }
  await page.evaluate(() => {
    const w = window as unknown as { __lag: { frames: number[]; long: number[]; stop: boolean; obs?: PerformanceObserver } };
    w.__lag?.obs?.disconnect();
    const lag: { frames: number[]; long: number[]; stop: boolean; obs?: PerformanceObserver } = { frames: [], long: [], stop: false };
    w.__lag = lag;
    let last = performance.now();
    const tick = (now: number) => {
      lag.frames.push(now - last);
      last = now;
      if (!lag.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    lag.obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => lag.long.push(e.duration)));
    lag.obs.observe({ type: 'longtask' });
  });
  const t0 = Date.now();
  await during();
  const secs = (Date.now() - t0) / 1000;
  const r = await page.evaluate(() => {
    const w = window as unknown as { __lag: { frames: number[]; long: number[]; stop: boolean } };
    w.__lag.stop = true;
    return { frames: w.__lag.frames, long: w.__lag.long };
  });
  if (cdp) {
    const { profile } = (await cdp.send('Profiler.stop')) as unknown as { profile: { nodes: Node[]; samples: number[]; timeDeltas: number[] } };
    const self = new Map<string, number>();
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    profile.samples.forEach((id, i) => {
      const n = byId.get(id)!;
      const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/').split('?')[0]}:${n.callFrame.lineNumber + 1}`;
      self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
    });
    const top = [...self.entries()].filter(([k]) => !k.startsWith('(idle)') && !k.startsWith('(program)')).sort((a, b) => b[1] - a[1]).slice(0, 14);
    // Inclusive time per app-source function (components, store, engine).
    const parent = new Map<number, number>();
    profile.nodes.forEach((n) => n.children?.forEach((c) => parent.set(c, n.id)));
    const incl = new Map<string, number>();
    profile.samples.forEach((id, i) => {
      const seen = new Set<string>();
      for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
        const n = byId.get(cur)!;
        if (!/\/(src|engine)\//.test(n.callFrame.url)) continue;
        const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/').split('?')[0]}`;
        if (seen.has(k)) continue;
        seen.add(k);
        incl.set(k, (incl.get(k) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000);
      }
    });
    const topIncl = [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
    const NL = String.fromCharCode(10);
    console.log(`[incl] ${label}` + NL + topIncl.map(([k, v]) => `    ${v.toFixed(0).padStart(6)}ms  ${k}`).join(NL));
    console.log(`[prof] ${label}` + NL + top.map(([k, v]) => `    ${v.toFixed(0).padStart(6)}ms  ${k}`).join(NL));
  }
  const f = r.frames.slice(1).sort((a, b) => a - b);
  const pct = (p: number) => f[Math.min(f.length - 1, Math.floor(f.length * p))]?.toFixed(0);
  console.log(
    `[lag] ${label.padEnd(22)} fps ${(f.length / secs).toFixed(0).padStart(3)}  p50 ${pct(0.5)}ms  p95 ${pct(0.95)}ms  max ${f.at(-1)?.toFixed(0)}ms  ` +
      `janky(>50ms) ${f.filter((x) => x > 50).length}  longtasks ${r.long.length} / ${r.long.reduce((a, b) => a + b, 0).toFixed(0)}ms (max ${Math.max(0, ...r.long).toFixed(0)})`,
  );
}

async function wiggle(page: Page, x0: number, y0: number, x1: number, y1: number, ms: number) {
  const end = Date.now() + ms;
  let k = 0;
  while (Date.now() < end) {
    const t = (Math.sin(k / 6) + 1) / 2;
    await page.mouse.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * ((k * 7) % 20) / 20);
    await page.waitForTimeout(16);
    k++;
  }
}

test('responsiveness across screens', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript((e) => {
    if (!sessionStorage.getItem('lag')) {
      localStorage.clear();
      localStorage.setItem('hexfall.settings', JSON.stringify({ botSpeed: 'normal', rookieTips: false, muted: true, effects: e }));
      sessionStorage.setItem('lag', '1');
    }
  }, process.env.LAG_EFFECTS ?? 'auto');
  if (process.env.LAG_CPU) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.LAG_CPU) });
  }
  if (process.env.LAG_CSS) {
    await page.addInitScript((css) => {
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent = css;
        document.head.appendChild(st);
      });
    }, process.env.LAG_CSS);
  }
  await page.goto('/');
  await page.getByTestId('new-game').waitFor();
  await page.waitForTimeout(2500);
  await probe(page, 'title idle', () => page.waitForTimeout(4000));
  const nav = await page.getByRole('navigation', { name: 'Main menu' }).boundingBox();
  await probe(page, 'title hover menu', () => wiggle(page, nav!.x + 20, nav!.y, nav!.x + 240, nav!.y + nav!.height, 4000));

  await hostWithBots(page);
  await page.waitForTimeout(800);
  await probe(page, 'setup idle', () => page.waitForTimeout(3000));
  await probe(page, 'setup hover', () => wiggle(page, 200, 150, 1200, 800, 3000));

  await page.getByTestId('seed').fill('lag-board');
  await page.getByRole('button', { name: 'Seat 1' }).click();
  await page.getByTestId('begin').click();
  await page.locator('[aria-label^="Place a Settlement"]').first().waitFor();
  await page.waitForTimeout(1000);
  await probe(page, 'game setup idle', () => page.waitForTimeout(3000));
  const board = await page.getByRole('group', { name: 'The board' }).boundingBox();
  await probe(page, 'game hover targets', () => wiggle(page, board!.x + 80, board!.y + 80, board!.x + board!.width - 80, board!.y + board!.height - 80, 4000));
  for (let i = 0; i < 2; i++) {
    await page.locator('[aria-label^="Place a Settlement"]').first().click({ force: true });
    await page.locator('[aria-label^="Build a Road"]').first().click({ force: true });
  }
  await page.getByTestId('roll').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  await probe(page, 'game main idle', () => page.waitForTimeout(3000));
  await probe(page, 'game hover tiles', () => wiggle(page, board!.x + 80, board!.y + 80, board!.x + board!.width - 80, board!.y + board!.height - 80, 4000));
  await probe(page, 'roll + bots playing', async () => {
    await page.getByTestId('roll').click();
    await page.waitForTimeout(1500);
    const end = page.getByRole('button', { name: /End turn/i });
    if (await end.isEnabled().catch(() => false)) await end.click().catch(() => {});
    await page.waitForTimeout(8000);
  });
});
