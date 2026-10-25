import { test, type CDPSession, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installProbe, type FrameRec, type Stats } from './probe';

/**
 * Browser benchmark for the 3D walk and the 2D board, run against a production build:
 *   pnpm --filter @hexfall/web bench            (see playwright.perf.config.ts for the options)
 * Scenarios (PERF_SCENARIOS, comma-separated; default all but `soak`):
 * - `entry`: time from the 3D walk button to the first frame, download and long tasks, then the
 *   first seconds of frames (shader and upload stalls on first visit).
 * - `route`: a scripted walk through wheat, forest, a city, the mountains and the coast, twice
 *   (first visit, then warm); real time drives it, so it is frame-rate independent.
 * - `views`: the fixed viewpoints, PERF_REPEAT times each.
 * - `late`: the same route and views on a busy late-game board.
 * - `cycle`: enter and leave the walk repeatedly, resize it, and check for resource growth.
 * - `soak`: PERF_SOAK_MIN minutes of walking the route in a loop, sampled every minute.
 * Results go to PERF_OUT (default perf-results/<label>) as report.txt and results.json.
 */
test.skip(!process.env.PERF, 'run through playwright.perf.config.ts');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LABEL = process.env.PERF_LABEL ?? 'run';
// Not under test-results: Playwright empties that folder at the start of every run.
const OUT = process.env.PERF_OUT ?? path.join('perf-results', LABEL);
const EFFECTS = process.env.PERF_EFFECTS ?? 'full';
/** The 3D resolution setting (1, 0.75 or 0.5). */
const RENDER_SCALE = Number(process.env.PERF_RENDER_SCALE ?? 1);
const REPEAT = Number(process.env.PERF_REPEAT ?? 2);
const SAMPLE_MS = Number(process.env.PERF_SAMPLE_MS ?? 3000);
const SCEN = new Set((process.env.PERF_SCENARIOS ?? 'entry,route,views,late,cycle').split(','));
/** Optional stress preset, e.g. `density:2,sheep:4` (see src/components/world/stress.ts). */
const STRESS = process.env.PERF_STRESS ?? '';
const HOME = STRESS ? `/?stress=${STRESS}` : '/';
/** Leave the GPU timer queries off (frame pacing only). */
const GPU_TIMING = !process.env.PERF_NOGPU;

const report: string[] = [];
const results: Record<string, unknown> = {};
const log = (s: string) => {
  report.push(s);
  console.log(`[perf] ${s}`);
};

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '  -');
function row(name: string, s: Stats): string {
  const g = s.gpu;
  return (
    `${name.padEnd(18)} fps ${s.fps.toFixed(0).padStart(3)}  int p50/p95/p99 ${f1(s.interval.p50)}/${f1(s.interval.p95)}/${f1(s.interval.p99)}  ` +
    `miss60 ${String(s.interval.over60).padStart(3)}  cpu p50/p95/max ${f1(s.cpu.p50)}/${f1(s.cpu.p95)}/${f1(s.cpu.max)}  ` +
    (g ? `gpu p50/p95/p99 ${f1(g.p50)}/${f1(g.p95)}/${f1(g.p99)} (shadow ${f1(g.shadowMean)} x${(g.shadowShare * 100).toFixed(0)}%, main ${f1(g.mainMean)})  ` : 'gpu -  ') +
    `calls ${s.calls.main}+${Number.isFinite(s.calls.shadow) ? s.calls.shadow : 0}s  tris ${(s.tris.main / 1000).toFixed(0)}k+${Number.isFinite(s.tris.shadow) ? (s.tris.shadow / 1000).toFixed(0) : 0}ks  ` +
    `long ${s.longTasks.n}/${s.longTasks.ms.toFixed(0)}ms`
  );
}

async function open(page: Page, fixture: 'early' | 'late') {
  const save = fs.readFileSync(path.join(HERE, 'fixtures', `${fixture}.json`), 'utf8');
  await page.addInitScript(
    ([save, effects, renderScale, reduceMotion]) => {
      if (sessionStorage.getItem('perf')) return;
      localStorage.clear();
      localStorage.setItem('hexfall.settings', JSON.stringify({ botSpeed: 'normal', rookieTips: false, muted: true, effects, turnTimer: 0, renderScale, reduceMotion }));
      localStorage.setItem('hexfall.save', save);
      sessionStorage.setItem('perf', '1');
    },
    [save, EFFECTS, RENDER_SCALE, !!process.env.PERF_REDUCE] as const,
  );
  await page.addInitScript(() => {
    // Long tasks from page start, so the walk's own build shows up when it opens.
    const w = window as unknown as { __longTasks: { t: number; d: number }[]; __ltObs?: boolean };
    w.__longTasks = [];
    w.__ltObs = true;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__longTasks.push({ t: e.startTime, d: e.duration }))).observe({ type: 'longtask' });
  });
  await page.goto(HOME);
  await page.getByTestId('continue').click();
  await page.getByRole('button', { name: '3D walk' }).waitFor();
  await page.waitForTimeout(1500);
}

type ProfNode = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] };

/** Inclusive main-thread time per function of the app and three.js, from a CPU profile. */
async function logProfile(cdp: CDPSession, label: string) {
  const { profile } = (await cdp.send('Profiler.stop')) as unknown as { profile: { nodes: ProfNode[]; samples: number[]; timeDeltas: number[] } };
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  profile.nodes.forEach((n) => n.children?.forEach((c) => parent.set(c, n.id)));
  const incl = new Map<string, number>();
  const self = new Map<string, number>();
  const name = (n: ProfNode) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()?.split('?')[0]}:${n.callFrame.lineNumber + 1}`;
  profile.samples.forEach((id, i) => {
    const dt = (profile.timeDeltas[i] ?? 0) / 1000;
    const leaf = byId.get(id)!;
    self.set(name(leaf), (self.get(name(leaf)) ?? 0) + dt);
    const seen = new Set<string>();
    for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
      const k = name(byId.get(cur)!);
      if (seen.has(k) || !byId.get(cur)!.callFrame.url) continue;
      seen.add(k);
      incl.set(k, (incl.get(k) ?? 0) + dt);
    }
  });
  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()].filter(([k]) => !/^\((idle|program|root|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(5)} ms  ${k}`);
  const NL = '\n    ';
  log(`profile ${label}, inclusive:${NL}${top(incl, 28).join(NL)}`);
  log(`profile ${label}, self:${NL}${top(self, 14).join(NL)}`);
  log(`profile ${label}, gc ${(self.get('(garbage collector) :0') ?? 0).toFixed(0)} ms`);
}

/** Opens the walk and times it from the click to the first drawn frame. */
async function enter(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __enter: { click: number; ready: number } };
    w.__enter = { click: 0, ready: 0 };
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '3D walk')!;
    btn.addEventListener('click', () => (w.__enter.click = performance.now()), { capture: true, once: true });
    const mo = new MutationObserver(() => {
      if (document.querySelector('[data-testid="world-location"]')) {
        w.__enter.ready = performance.now();
        mo.disconnect();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  });
  const cdp = process.env.PERF_PROFILE_ENTRY ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
    await cdp.send('Profiler.start');
  }
  await page.getByRole('button', { name: '3D walk' }).click();
  await page.getByTestId('world-location').waitFor({ timeout: 60_000 });
  if (cdp) await logProfile(cdp, 'entry');
  const t = await page.evaluate(() => {
    const w = window as unknown as { __enter: { click: number; ready: number }; __longTasks?: { t: number; d: number }[] };
    const res = performance
      .getEntriesByType('resource')
      .filter((e) => e.startTime >= w.__enter.click - 5) as PerformanceResourceTiming[];
    const lt = (w.__longTasks ?? []).filter((e) => e.t >= w.__enter.click && e.t <= w.__enter.ready);
    return {
      ms: w.__enter.ready - w.__enter.click,
      downloads: res.length,
      kb: Math.round(res.reduce((a, e) => a + (e.transferSize || 0), 0) / 1024),
      fetchMs: Math.round(Math.max(0, ...res.map((e) => e.responseEnd)) - w.__enter.click),
      longest: Math.round(Math.max(0, ...lt.map((e) => e.d))),
      longMs: Math.round(lt.reduce((a, e) => a + e.d, 0)),
    };
  });
  await page.evaluate(installProbe);
  // The HUD hides the scene in screenshots and costs a compositing layer; the walk itself is measured.
  return t;
}

async function exit(page: Page) {
  await page.getByRole('button', { name: '2D board' }).click();
  await page.locator('[data-world3d]').waitFor({ state: 'detached' });
}

async function sample(page: Page, ms = SAMPLE_MS, gpu = GPU_TIMING): Promise<{ stats: Stats; rec: FrameRec[] }> {
  return page.evaluate(
    ([ms, gpu]) => (window as unknown as { __probe: { sample(ms: number, gpu: boolean): Promise<{ stats: Stats; rec: FrameRec[] }> } }).__probe.sample(ms, gpu),
    [ms, gpu] as const,
  );
}

interface View {
  name: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  y?: number;
}

/** The fixed viewpoints (as in look3d.spec.ts), placed from the board so every seed has them. */
async function views(page: Page): Promise<View[]> {
  return page.evaluate(() => {
    type W = {
      landHexes: { id: number; x: number; z: number }[];
      walkable: { ax: number; az: number; bx: number; bz: number }[];
      fields: { group: { name: string }; items: { m: { elements: number[] } }[] }[];
    };
    type S = { board: { hexes: { terrain: string }[] }; buildings: Record<string, { kind: string }> };
    const dev = (window as unknown as { __world3d: { world: W; state: () => S } }).__world3d;
    const w = dev.world;
    const s = dev.state();
    const R = 14;
    const lookAt = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));
    const first = (t: string) => w.landHexes.find((h) => s.board.hexes[h.id].terrain === t)!;
    const out: View[] = [];
    const f = first('fields');
    {
      const items = w.fields.find((fl) => fl.group.name === 'wheat')!.items;
      let best = { x: f.x + 5, z: f.z, d: 1e9 };
      for (const it of items) {
        const x = it.m.elements[12];
        const z = it.m.elements[14];
        const d = Math.abs(Math.hypot(x - f.x, z - f.z) - 5) + Math.abs(z - f.z) * 0.3;
        if (d < best.d && Math.hypot(x - f.x, z - f.z) < 12) best = { x, z, d };
      }
      const rx = (best.x - f.x) / 5;
      const rz = (best.z - f.z) / 5;
      out.push({ name: 'wheat', x: best.x, z: best.z, yaw: lookAt(best.x, best.z, best.x - rz * 10, best.z + rx * 10), pitch: -0.16 });
    }
    const fo = first('witchwood');
    {
      const x = fo.x + R * 0.95;
      const z = fo.z + 2;
      out.push({ name: 'forest-edge', x, z, yaw: lookAt(x, z, fo.x, fo.z), pitch: 0.02 });
      const cx = fo.x + 1.5;
      const cz = fo.z - 1.2;
      out.push({ name: 'forest-clearing', x: cx, z: cz, yaw: lookAt(cx, cz, fo.x - 8, fo.z - 6), pitch: 0.12 });
    }
    const m = first('peaks');
    out.push({ name: 'mountains', x: m.x - R * 0.95, z: m.z, yaw: lookAt(m.x - R * 0.95, m.z, m.x, m.z), pitch: 0.12 });
    const h = first('ashen');
    out.push({ name: 'hills', x: h.x, z: h.z + R * 0.92, yaw: lookAt(h.x, h.z + R * 0.92, h.x, h.z), pitch: -0.05 });
    const p = first('moors');
    out.push({ name: 'pasture', x: p.x + R * 0.9, z: p.z - 3, yaw: lookAt(p.x + R * 0.9, p.z - 3, p.x, p.z), pitch: -0.08 });
    const d = first('waste');
    if (d) out.push({ name: 'desert', x: d.x - 3, z: d.z + R * 0.85, yaw: lookAt(d.x - 3, d.z + R * 0.85, d.x, d.z), pitch: -0.08 });
    // A settlement and a city: the first of each, or the first two buildings.
    const colliders = (w as unknown as { pieceColliders: { ax: number; az: number }[] }).pieceColliders;
    const kinds = Object.values(s.buildings).map((b) => b.kind);
    const iS = Math.max(0, kinds.indexOf('outpost'));
    const iC = kinds.indexOf('citadel') >= 0 ? kinds.indexOf('citadel') : 1;
    for (const [name, b] of [
      ['settlement', colliders[iS]],
      ['city', colliders[iC]],
    ] as const) {
      const len = Math.hypot(b.ax, b.az) || 1;
      const x = b.ax - (b.ax / len) * 11 + (b.az / len) * 3;
      const z = b.az - (b.az / len) * 11 - (b.ax / len) * 3;
      out.push({ name, x, z, yaw: lookAt(x, z, b.ax, b.az), pitch: 0.02 });
    }
    const k = w.walkable[0];
    {
      const nx = k.bx - k.ax;
      const nz = k.bz - k.az;
      const l = Math.hypot(nx, nz);
      const x = k.ax - (nx / l) * 2 + (nz / l) * 7;
      const z = k.az - (nz / l) * 2 - (nx / l) * 7;
      out.push({ name: 'dock', x, z, yaw: lookAt(x, z, k.bx, k.bz), pitch: -0.06 });
    }
    out.push({ name: 'elevated', x: -62, z: 58, y: 42, yaw: lookAt(-62, 58, 0, 0), pitch: -0.42 });
    return out;
  });
}

async function place(page: Page, v: View) {
  await page.evaluate((v) => {
    type W = { x: number; z: number; yaw: number; pitch: number; camY: number; groundAt(x: number, z: number): number; __ground?: (x: number, z: number) => number };
    const w = (window as unknown as { __world3d: { world: W } }).__world3d.world;
    w.__ground ??= w.groundAt.bind(w);
    const g = w.__ground;
    // Lift only the walker's own eye for the elevated view; everything else keeps its ground.
    w.groundAt = v.y === undefined ? g : (x, z) => (x === w.x && z === w.z ? v.y! - 1.7 : g(x, z));
    w.x = v.x;
    w.z = v.z;
    w.yaw = v.yaw;
    w.pitch = v.pitch;
    w.camY = v.y ?? g(v.x, v.z) + 1.7;
  }, v);
}

/** Starts the scripted walk: wheat, forest, a city, the mountains, then along the coast. */
async function startRoute(page: Page, speed = 5): Promise<{ length: number; secs: number; legs: string[] }> {
  return page.evaluate((speed) => {
    type W = {
      x: number;
      z: number;
      yaw: number;
      pitch: number;
      landHexes: { id: number; x: number; z: number }[];
      pieceColliders: { ax: number; az: number }[];
      groundAt(x: number, z: number): number;
      __ground?: (x: number, z: number) => number;
    };
    type S = { board: { hexes: { terrain: string }[] }; buildings: Record<string, { kind: string }> };
    const win = window as unknown as { __world3d: { world: W; state: () => S }; __probe: { P: { hook: null | ((t: number) => void); seg: number } } };
    const w = win.__world3d.world;
    if (w.__ground) w.groundAt = w.__ground;
    const s = win.__world3d.state();
    const R = 14;
    const of = (t: string) => w.landHexes.filter((h) => s.board.hexes[h.id].terrain === t);
    const near = <T extends { x: number; z: number }>(list: T[], p: { x: number; z: number }) =>
      list.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
    const toward = (a: { x: number; z: number }, b: { x: number; z: number }, d: number) => {
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: a.x + ((b.x - a.x) / l) * d, z: a.z + ((b.z - a.z) / l) * d };
    };
    const fields = of('fields')[0];
    const forest = near(of('witchwood'), fields);
    const kinds = Object.values(s.buildings).map((b) => b.kind);
    const iC = kinds.indexOf('citadel') >= 0 ? kinds.indexOf('citadel') : 1;
    const city = { x: w.pieceColliders[iC].ax, z: w.pieceColliders[iC].az };
    const peaks = near(of('peaks'), city);
    // The outermost land tile nearest the mountains, and its beach.
    const outer = w.landHexes.filter((h) => Math.hypot(h.x, h.z) > R * 3);
    const coastHex = near(outer, peaks);
    const out = { x: coastHex.x / Math.hypot(coastHex.x, coastHex.z), z: coastHex.z / Math.hypot(coastHex.x, coastHex.z) };
    const beach = { x: coastHex.x + out.x * R * 0.95, z: coastHex.z + out.z * R * 0.95 };
    const along = { x: beach.x - out.z * 22, z: beach.z + out.x * 22 };
    const pts = [
      { p: toward(fields, forest, -R * 0.75), leg: 'wheat' },
      { p: { x: fields.x + 1.5, z: fields.z + 2.5 }, leg: 'wheat' },
      { p: toward(forest, fields, R * 0.8), leg: 'forest' },
      { p: { x: forest.x + 1.5, z: forest.z - 1.2 }, leg: 'forest' },
      { p: toward(city, forest, 7), leg: 'city' },
      { p: toward(city, peaks, 4), leg: 'city' },
      { p: toward(peaks, city, R * 0.7), leg: 'mountains' },
      { p: toward(coastHex, peaks, -R * 0.3), leg: 'mountains' },
      { p: beach, leg: 'coast' },
      { p: along, leg: 'coast' },
    ];
    const segs: { a: { x: number; z: number }; b: { x: number; z: number }; l: number; at: number; leg: number }[] = [];
    const legs = [...new Set(pts.map((p) => p.leg))];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1].p;
      const b = pts[i].p;
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      segs.push({ a, b, l, at: total, leg: legs.indexOf(pts[i].leg) });
      total += l;
    }
    let t0 = -1;
    let yaw = Math.atan2(-(segs[0].b.x - segs[0].a.x), -(segs[0].b.z - segs[0].a.z));
    w.x = segs[0].a.x;
    w.z = segs[0].a.z;
    w.yaw = yaw;
    w.pitch = -0.06;
    win.__probe.P.hook = (now) => {
      if (t0 < 0) t0 = now;
      const d = Math.min(total - 1e-3, ((now - t0) / 1000) * speed);
      const sg = segs.find((g) => d >= g.at && d < g.at + g.l) ?? segs[segs.length - 1];
      const k = (d - sg.at) / sg.l;
      w.x = sg.a.x + (sg.b.x - sg.a.x) * k;
      w.z = sg.a.z + (sg.b.z - sg.a.z) * k;
      // Turn smoothly towards the direction of travel, as a player would.
      const want = Math.atan2(-(sg.b.x - sg.a.x), -(sg.b.z - sg.a.z));
      let diff = want - yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      yaw += diff * 0.08;
      w.yaw = yaw;
      win.__probe.P.seg = sg.leg;
    };
    return { length: total, secs: total / speed, legs };
  }, speed);
}

async function stopRoute(page: Page) {
  await page.evaluate(() => ((window as unknown as { __probe: { P: { hook: unknown } } }).__probe.P.hook = null));
}

/** Debug: which programs and textures the renderer has set up so far. */
async function gpuInventory(page: Page): Promise<{ programs: string[]; textures: string[] }> {
  return page.evaluate(() => {
    type T = { isTexture?: boolean; name: string; uuid: string; image?: { width?: number; height?: number } };
    type R = { info: { programs?: { name: string; cacheKey: string }[] }; properties: { get(o: unknown): { __webglTexture?: unknown } } };
    type O = { material?: Record<string, unknown> | Record<string, unknown>[]; children: O[] };
    const w = (window as unknown as { __world3d: { world: { renderer: R; scene: O } } }).__world3d.world;
    const programs = (w.renderer.info.programs ?? []).map((p) => `${p.name} ${p.cacheKey.length > 60 ? p.cacheKey.slice(0, 60) + '…' : p.cacheKey}`);
    const textures = new Set<string>();
    const walk = (o: O) => {
      o.children.forEach(walk);
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms)
        for (const [k, v] of Object.entries(m))
          if ((v as T)?.isTexture && w.renderer.properties.get(v).__webglTexture)
            textures.add(`${(m as { name?: string }).name || (m as { type?: string }).type}.${k} ${(v as T).image?.width}x${(v as T).image?.height}`);
    };
    walk(w.scene);
    return { programs, textures: [...textures] };
  });
}

async function route(page: Page, name: string) {
  const inv0 = process.env.PERF_INVENTORY ? await gpuInventory(page) : null;
  const r = await startRoute(page);
  const { stats, rec } = await sample(page, r.secs * 1000 + 200);
  await stopRoute(page);
  log(row(name, stats));
  // Frames that took over 50 ms of main-thread time, and what the renderer created in them.
  for (let i = 0; i < rec.length; i++)
    if (rec[i].cpu > 50)
      log(`  stall ${rec[i].cpu.toFixed(0)} ms in ${r.legs[rec[i].seg]} (textures/geometries/programs ${rec[i - 1]?.res.join('/')} -> ${rec[i].res.join('/')})`);
  if (process.env.PERF_DUMP) fs.writeFileSync(path.join(OUT, `rec-${name}.json`), JSON.stringify(rec));
  if (inv0) {
    const inv1 = await gpuInventory(page);
    log(`  new programs: ${inv1.programs.filter((p) => !inv0.programs.includes(p)).join(' | ') || '-'}`);
    log(`  new textures: ${inv1.textures.filter((p) => !inv0.textures.includes(p)).join(' | ') || '-'}`);
  }
  const legs: Record<string, Stats> = {};
  for (const [i, leg] of r.legs.entries()) {
    const part = rec.filter((f) => f.seg === i);
    if (part.length < 10) continue;
    legs[leg] = await page.evaluate(
      ([part]) => {
        const p = (window as unknown as { __probe: { stats(r: FrameRec[], a: number, b: number): Stats } }).__probe;
        return p.stats(part, part[0].t, part[part.length - 1].t);
      },
      [part] as const,
    );
    log(row(`  ${leg}`, legs[leg]));
  }
  results[name] = { route: { length: r.length, secs: r.secs }, stats, legs };
  if (EFFECTS === 'auto') log(`  after ${name}: ${JSON.stringify(await info(page))}`);
}

async function info(page: Page) {
  return page.evaluate(() => (window as unknown as { __probe: { info(): Record<string, unknown> } }).__probe.info());
}

async function runViews(page: Page, prefix: string) {
  const only = process.env.PERF_VIEWS?.split(',');
  const list = (await views(page)).filter((v) => !only || only.includes(v.name));
  const all: Record<string, Stats[]> = {};
  for (let rep = 0; rep < REPEAT; rep++) {
    for (const v of list) {
      await place(page, v);
      await page.waitForTimeout(1200);
      const vprof = process.env.PERF_PROFILE_VIEW === v.name && rep === 0 ? await page.context().newCDPSession(page) : null;
      if (vprof) {
        await vprof.send('Profiler.enable');
        await vprof.send('Profiler.setSamplingInterval', { interval: 100 });
        await vprof.send('Profiler.start');
      }
      const { stats, rec } = await sample(page);
      if (vprof) await logProfile(vprof, `view ${v.name}`);
      (all[v.name] ??= []).push(stats);
      if (process.env.PERF_VIEW_EVAL && rep === 0) log(`  ${v.name} eval ${JSON.stringify(await page.evaluate(process.env.PERF_VIEW_EVAL))}`);
      if (process.env.PERF_DUMP) fs.writeFileSync(path.join(OUT, `rec-${prefix}${v.name}-${rep}.json`), JSON.stringify(rec));
      log(row(`${prefix}${v.name}${REPEAT > 1 ? `#${rep + 1}` : ''}`, stats));
      if (process.env.PERF_SHOTS && rep === 0) await page.locator('[data-world3d] canvas').screenshot({ path: path.join(OUT, `${prefix}${v.name}.png`) });
      if (process.env.PERF_SYNTH && rep === 0) {
        // Synthetic comparison only (not frame pacing): back-to-back renders, each forced to finish.
        const ms = await page.evaluate(() => {
          type R = { render(s: unknown, c: unknown): void; getContext(): WebGL2RenderingContext; shadowMap: { needsUpdate: boolean } };
          const w = (window as unknown as { __world3d: { world: { renderer: R; scene: unknown; camera: unknown } } }).__world3d.world;
          const gl = w.renderer.getContext();
          const px = new Uint8Array(4);
          const once = () => {
            w.renderer.shadowMap.needsUpdate = true;
            w.renderer.render(w.scene, w.camera);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          };
          for (let i = 0; i < 5; i++) once();
          const t0 = performance.now();
          for (let i = 0; i < 30; i++) once();
          return (performance.now() - t0) / 30;
        });
        log(`  ${v.name} synthetic forced-finish ${ms.toFixed(1)} ms`);
        (results[`${prefix}synthetic`] ??= {} as Record<string, number>);
        (results[`${prefix}synthetic`] as Record<string, number>)[v.name] = ms;
      }
    }
  }
  results[`${prefix}views`] = all;
}

/**
 * Diagnostic only (changes what is drawn): hides one family of objects at a time at a few views
 * and records how much GPU time and how many draws go away, to find where frame time goes.
 */
async function attribution(page: Page) {
  const buckets = await classify(page);
  await attributionRun(page, buckets);
}

/** Sorts every mesh into a family (sky, sea, wheat tiers, pre-pass twins, sheep...) as window.__buckets. */
async function classify(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    type O = {
      isMesh?: boolean;
      isInstancedMesh?: boolean;
      renderOrder: number;
      visible: boolean;
      parent: O | null;
      children: O[];
      castShadow: boolean;
      geometry?: { parameters?: { width?: number } };
      material?: { customProgramCacheKey?: () => string; name?: string; transparent?: boolean };
      count?: number;
      userData: Record<string, unknown>;
    };
    type W = { scene: O; fields: { group: O }[]; pieces: O; sheep: { rig: { root: O } }[] };
    const w = (window as unknown as { __world3d: { world: W } }).__world3d.world;
    const within = (o: O, root: O) => {
      for (let p: O | null = o; p; p = p.parent) if (p === root) return true;
      return false;
    };
    const map: Record<string, O[]> = {};
    const add = (k: string, o: O) => (map[k] ??= []).push(o);
    const walk = (o: O) => {
      for (const c of o.children) walk(c);
      if (!o.isMesh) return;
      const key = o.material?.customProgramCacheKey?.() ?? '';
      const named = (o as unknown as { name: string }).name;
      if (named === 'sky' || o.renderOrder === -2) add('sky', o);
      else if (named === 'sea' || o.geometry?.parameters?.width === 1800) add('sea', o);
      else if (w.fields.some((f) => within(o, f.group))) {
        const f = w.fields.find((f) => within(o, f.group))! as unknown as { group: { name: string }; cells: { near: O; mid: O | null; far: O | null }[] };
        const cell = f.cells.find((c) => within(o, c.near) || (c.mid && within(o, c.mid)) || (c.far && within(o, c.far)));
        const tier = cell && within(o, cell.near) ? 'near' : cell?.mid && within(o, cell.mid) ? 'mid' : 'far';
        add(`${f.group.name}-${tier}`, o);
        if (o.renderOrder === -1) add(`prepass-${f.group.name}`, o);
      } else if (within(o, w.pieces)) add('pieces', o);
      else if (named === 'flock' || w.sheep.some((s) => within(o, s.rig.root))) add('sheep', o);
      else if (o.isInstancedMesh) {
        add('instanced', o);
        if (o.renderOrder === -1) add('prepass-leaf', o);
      } else if (key === 'ground') add('ground', o);
      else if (o.parent === w.scene) add('scene-mesh', o);
      else add('statics', o);
    };
    walk(w.scene);
    const win = window as unknown as { __buckets: Record<string, O[]> };
    win.__buckets = map;
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.length]));
  });
}

/**
 * Interleaved A/B of hiding one family (PERF_AB, e.g. `prepass-wheat`) at a few views: rounds
 * alternate shown/hidden so drift cancels; only meaningful for families whose hiding keeps
 * the picture identical (the depth pre-pass twins).
 */
async function abToggle(page: Page) {
  await classify(page);
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const all = await views(page);
  const pick = (process.env.PERF_AB_VIEWS ?? 'wheat,forest-edge,forest-clearing').split(',');
  for (const fam of (process.env.PERF_AB ?? 'prepass-wheat').split(',')) {
    for (const v of all.filter((v) => pick.includes(v.name))) {
      await place(page, v);
      await page.waitForTimeout(800);
      const res: Record<string, { gpu: number[]; cpu: number[] }> = { shown: { gpu: [], cpu: [] }, hidden: { gpu: [], cpu: [] } };
      for (let round = 0; round < Number(process.env.PERF_AB_ROUNDS ?? 6); round++) {
        for (const mode of ['shown', 'hidden'] as const) {
          await page.evaluate(
            ([fam, hide]) => {
              const win = window as unknown as { __buckets: Record<string, { visible: boolean }[]> };
              for (const o of win.__buckets[fam] ?? []) o.visible = !hide;
            },
            [fam, mode === 'hidden'] as const,
          );
          await page.waitForTimeout(200);
          const { stats } = await sample(page, 1500);
          res[mode].gpu.push(stats.gpu?.mean ?? NaN);
          res[mode].cpu.push(stats.cpu.p50);
        }
      }
      await page.evaluate((fam) => {
        const win = window as unknown as { __buckets: Record<string, { visible: boolean }[]> };
        for (const o of win.__buckets[fam] ?? []) o.visible = true;
      }, fam);
      log(
        `ab ${fam} at ${v.name}: GPU mean ms shown ${med(res.shown.gpu).toFixed(2)} vs hidden ${med(res.hidden.gpu).toFixed(2)}; ` +
          `CPU p50 ${med(res.shown.cpu).toFixed(2)} vs ${med(res.hidden.cpu).toFixed(2)}  (GPU rounds ${res.shown.gpu.map((x) => x.toFixed(1)).join('/')} | ${res.hidden.gpu.map((x) => x.toFixed(1)).join('/')})`,
      );
      ((results.ab ??= {}) as Record<string, unknown>)[`${fam}@${v.name}`] = res;
    }
  }
}

async function attributionRun(page: Page, buckets: Record<string, number>) {
  log(`attribution buckets ${JSON.stringify(buckets)}`);
  const all = await views(page);
  const pick = (process.env.PERF_ATTRIB_VIEWS ?? 'wheat,forest-edge,forest-clearing,city,pasture,dock,elevated').split(',');
  const out: Record<string, Record<string, { gpu: number; shadow: number; main: number; calls: number }>> = {};
  for (const v of all.filter((v) => pick.includes(v.name))) {
    await place(page, v);
    await page.waitForTimeout(1000);
    const res: Record<string, { gpu: number; shadow: number; main: number; calls: number }> = {};
    for (const b of ['none', ...Object.keys(buckets)]) {
      await page.evaluate((b) => {
        const win = window as unknown as { __buckets: Record<string, { visible: boolean }[]> };
        for (const list of Object.values(win.__buckets)) for (const o of list) o.visible = true;
        for (const o of win.__buckets[b] ?? []) o.visible = false;
      }, b);
      await page.waitForTimeout(300);
      const { stats } = await sample(page, 1500);
      res[b] = { gpu: stats.gpu?.mean ?? NaN, shadow: (stats.gpu?.shadowMean ?? NaN) * (stats.gpu?.shadowShare ?? 0), main: stats.gpu?.mainMean ?? NaN, calls: stats.calls.main };
    }
    await page.evaluate(() => {
      const win = window as unknown as { __buckets: Record<string, { visible: boolean }[]> };
      for (const list of Object.values(win.__buckets)) for (const o of list) o.visible = true;
    });
    const base = res.none;
    log(
      `attrib ${v.name.padEnd(16)} total ${f1(base.gpu)} ms (main ${f1(base.main)}, shadow/frame ${f1(base.shadow)}), calls ${base.calls}; saved by hiding: ` +
        Object.entries(res)
          .filter(([k]) => k !== 'none')
          .map(([k, r]) => `${k} ${f1(base.gpu - r.gpu)}`)
          .join(', '),
    );
    out[v.name] = res;
  }
  results.attribution = out;
}

/**
 * Interleaved A/B of the static-matrix freeze (World.freezeStatic) on the walking route, all in
 * one page so drift and heat cancel out: 'frozen' as built, 'flags' with only the matrix flags,
 * 'none' with everything recomputed each frame as before.
 */
async function abFreeze(page: Page) {
  await page.evaluate(() => {
    type O = { matrixAutoUpdate: boolean; matrixWorldAutoUpdate: boolean; updateMatrixWorld: unknown; children: O[]; traverse(f: (o: O) => void): void };
    const w = (window as unknown as { __world3d: { world: { scene: O } } }).__world3d.world;
    const frozen: { o: O; fn: unknown; auto: boolean }[] = [];
    w.scene.traverse((o) => {
      if (Object.prototype.hasOwnProperty.call(o, 'updateMatrixWorld') || !o.matrixAutoUpdate) frozen.push({ o, fn: Object.prototype.hasOwnProperty.call(o, 'updateMatrixWorld') ? o.updateMatrixWorld : null, auto: o.matrixAutoUpdate });
    });
    (window as unknown as { __ab: (mode: string) => void }).__ab = (mode) => {
      for (const f of frozen) {
        if (mode === 'frozen' && f.fn) f.o.updateMatrixWorld = f.fn;
        else delete (f.o as unknown as Record<string, unknown>).updateMatrixWorld;
        f.o.matrixAutoUpdate = f.o.matrixWorldAutoUpdate = mode === 'none';
      }
    };
  });
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const all = await views(page);
  for (const v of all.filter((v) => ['forest-edge', 'pasture', 'city'].includes(v.name))) {
    await place(page, v);
    await page.waitForTimeout(800);
    const res: Record<string, number[]> = { frozen: [], flags: [], none: [] };
    for (let round = 0; round < Number(process.env.PERF_AB_ROUNDS ?? 8); round++) {
      for (const mode of ['frozen', 'flags', 'none']) {
        await page.evaluate((m) => (window as unknown as { __ab: (mode: string) => void }).__ab(m), mode);
        await page.waitForTimeout(200);
        const { stats } = await sample(page, 1500, false);
        res[mode].push(stats.cpu.p50);
      }
    }
    log(`ab-freeze ${v.name} cpu p50 median of rounds: ${Object.entries(res).map(([k, x]) => `${k} ${med(x).toFixed(2)}`).join(', ')}  (rounds ${Object.entries(res).map(([k, x]) => `${k} ${x.map((y) => y.toFixed(1)).join('/')}`).join('; ')})`);
    (results.abFreeze ??= {} as Record<string, unknown>);
    (results.abFreeze as Record<string, unknown>)[v.name] = res;
  }
  await page.evaluate(() => (window as unknown as { __ab: (mode: string) => void }).__ab('frozen'));
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

test.afterAll(() => {
  fs.writeFileSync(path.join(OUT, 'report.txt'), report.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
});

function watchConsole(page: Page, problems: string[]) {
  page.on('console', (m) => {
    if (m.text().includes('GL Driver Message')) return;
    if (m.type() === 'error' || m.type() === 'warning') {
      problems.push(`${m.type()}: ${m.text()}`);
      if (problems.length <= 3) console.log(`[perf] console ${m.type()}: ${m.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (e) => {
    problems.push(`pageerror: ${e.message}`);
    console.log(`[perf] pageerror: ${e.message}
${e.stack?.slice(0, 600)}`);
  });
}

test('3D walk: entry, route and viewpoints', async ({ page, browserName }) => {
  test.skip(!['entry', 'route', 'views', 'attrib', 'ab-freeze', 'ab', 'late', 'soak'].some((s) => SCEN.has(s)));
  test.setTimeout(3_600_000);
  const problems: string[] = [];
  watchConsole(page, problems);
  if (process.env.PERF_CPU) {
    // Emulates a slower CPU (e.g. 4 = four times slower), to see how much main-thread headroom is left.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PERF_CPU) });
  }
  await open(page, 'early');
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')!;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });
  const ua = await page.evaluate(() => navigator.userAgent);
  log(`label ${LABEL}  cpu throttle ${process.env.PERF_CPU ?? 1}x  viewport ${page.viewportSize()?.width}x${page.viewportSize()?.height}  effects ${EFFECTS}  scale ${RENDER_SCALE}  stress ${STRESS || '-'}  browser ${browserName} ${ua.match(/Chrome\/[\d.]+/)?.[0] ?? ''}  headless ${!process.env.PERF_HEADED}`);
  log(`gpu ${gpu}`);
  results.meta = { label: LABEL, effects: EFFECTS, renderScale: RENDER_SCALE, viewport: page.viewportSize(), stress: STRESS, gpu, ua, headless: !process.env.PERF_HEADED, repeat: REPEAT, sampleMs: SAMPLE_MS, date: new Date().toISOString() };

  const e = await enter(page);
  const inf = await info(page);
  log(`entry ${e.ms.toFixed(0)} ms (downloads ${e.downloads}, ${e.kb} kB, fetch done ${e.fetchMs} ms; long tasks ${e.longMs} ms, longest ${e.longest} ms)`);
  log(`render ${JSON.stringify(inf)}`);
  results.entry = { ...e, info: inf };
  if (SCEN.has('entry')) {
    const { stats } = await sample(page, 2000);
    log(row('after entry', stats));
    results.afterEntry = stats;
  }
  await page.addStyleTag({ content: '[data-world3d] > :not(canvas) { display: none !important; }' });
  if (SCEN.has('route')) {
    await route(page, 'route-first');
    const cdp = process.env.PERF_PROFILE_ROUTE ? await page.context().newCDPSession(page) : null;
    if (cdp) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
      await cdp.send('Profiler.start');
    }
    await route(page, 'route-warm');
    if (cdp) await logProfile(cdp, 'route-warm');
  }
  if (SCEN.has('views')) await runViews(page, '');
  if (SCEN.has('attrib')) await attribution(page);
  if (SCEN.has('ab-freeze')) await abFreeze(page);
  if (SCEN.has('ab')) await abToggle(page);
  const evalSrc = process.env.PERF_EVAL ?? (process.env.PERF_EVAL_FILE ? fs.readFileSync(process.env.PERF_EVAL_FILE, 'utf8') : '');
  if (evalSrc) log(`eval ${JSON.stringify(await page.evaluate(evalSrc))}`);
  if (SCEN.has('soak')) {
    const mins = Number(process.env.PERF_SOAK_MIN ?? 15);
    const soak: { min: number; stats: Stats; mem: unknown; heap: number }[] = [];
    const soakCdp = await page.context().newCDPSession(page);
    const end = Date.now() + mins * 60_000;
    let k = 0;
    while (Date.now() < end) {
      // A minute of walking the route in a loop, then one sample at a fixed heavy view.
      const t1 = Date.now() + 60_000;
      const r = await startRoute(page);
      let rec: Stats | null = null;
      while (Date.now() < t1) {
        const { stats } = await sample(page, Math.min(r.secs * 1000, t1 - Date.now()));
        rec = stats;
        await startRoute(page);
      }
      await stopRoute(page);
      const mem = (await info(page)).memory;
      const heap = ((await soakCdp.send('Runtime.getHeapUsage')) as { usedSize: number }).usedSize;
      k++;
      soak.push({ min: k, stats: rec!, mem, heap });
      log(row(`soak min ${k}`, rec!) + `  heap ${(heap / 1048576).toFixed(0)}MB mem ${JSON.stringify(mem)}`);
    }
    results.soak = soak;
  }
  await exit(page);

  if (SCEN.has('late')) {
    await page.evaluate(() => sessionStorage.removeItem('perf'));
    const late = fs.readFileSync(path.join(HERE, 'fixtures', 'late.json'), 'utf8');
    await page.evaluate((s) => {
      localStorage.setItem('hexfall.save', s);
      sessionStorage.setItem('perf', '1');
    }, late);
    await page.goto(HOME);
    await page.getByTestId('continue').click();
    await page.getByRole('button', { name: '3D walk' }).waitFor();
    await page.waitForTimeout(1500);
    const e2 = await enter(page);
    log(`late entry ${e2.ms.toFixed(0)} ms (long tasks ${e2.longMs} ms, longest ${e2.longest} ms)`);
    results.lateEntry = e2;
    await page.addStyleTag({ content: '[data-world3d] > :not(canvas) { display: none !important; }' });
    await route(page, 'late-route');
    await runViews(page, 'late-');
    await exit(page);
  }
  if (problems.length) log(`console: ${problems.slice(0, 10).join(' | ')}`);
  results.problems = problems;
});

test('3D walk: enter, leave and resize repeatedly', async ({ page }) => {
  test.skip(!SCEN.has('cycle'));
  test.setTimeout(900_000);
  const problems: string[] = [];
  watchConsole(page, problems);
  // Counts every WebGL draw on the page, so a world left drawing after it closes shows up.
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
      for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const) {
        const p = C.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
        const orig = p[k];
        if (!orig) continue;
        p[k] = function (this: unknown, ...a: unknown[]) {
          w.__draws++;
          return orig.apply(this, a);
        };
      }
    }
  });
  await open(page, 'early');
  const cdp = await page.context().newCDPSession(page);
  // performance.memory is bucketed in headless Chrome; the inspector's heap figure is exact.
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    return ((await cdp.send('Runtime.getHeapUsage')) as { usedSize: number }).usedSize;
  };
  const base = await heap();
  log(`cycle: heap on the 2D board before ${(base / 1048576).toFixed(1)} MB`);
  const rows: unknown[] = [];
  // More than Chrome's 16 live WebGL contexts, so a context left alive would show up as a warning.
  const N = Number(process.env.PERF_CYCLES ?? 20);
  for (let i = 0; i < N; i++) {
    const e = await enter(page);
    await page.waitForTimeout(800);
    const inf = await info(page);
    if (i === 1) {
      // Resize while inside: the drawing buffer follows and nothing is reallocated per resize.
      for (const [w, h] of [
        [1280, 800],
        [1920, 1080],
        [1100, 700],
        [1440, 900],
      ]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(400);
        const r = await info(page);
        log(`  resize ${w}x${h}: buffer ${JSON.stringify(r.buffer)} css ${JSON.stringify(r.css)} memory ${JSON.stringify(r.memory)}`);
      }
    }
    await exit(page);
    const d0 = await page.evaluate(() => (window as unknown as { __draws: number }).__draws);
    await page.waitForTimeout(1000);
    const d1 = await page.evaluate(() => (window as unknown as { __draws: number }).__draws);
    const h = await heap();
    rows.push({ i, enterMs: e.ms, memory: inf.memory, heapMB: h / 1048576, drawsAfterExit: d1 - d0 });
    log(`  cycle ${String(i + 1).padStart(2)}: enter ${e.ms.toFixed(0)} ms, memory ${JSON.stringify(inf.memory)}, heap after exit ${(h / 1048576).toFixed(1)} MB, draws in 1 s after exit ${d1 - d0}`);
  }
  results.cycle = { baseHeapMB: base / 1048576, rows, problems };
  if (problems.length) log(`cycle console: ${problems.slice(0, 10).join(' | ')}`);
});

/** Frame intervals and long tasks on the page (no 3D world), over `during`. */
async function pageFrames(page: Page, during: () => Promise<void>) {
  await page.evaluate(() => {
    const w = window as unknown as { __pf: { frames: number[]; stop: boolean; t0: number } };
    const pf = { frames: [] as number[], stop: false, t0: performance.now() };
    w.__pf = pf;
    let last = performance.now();
    const tick = (now: number) => {
      pf.frames.push(now - last);
      last = now;
      if (!pf.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await during();
  return page.evaluate(() => {
    const w = window as unknown as { __pf: { frames: number[]; stop: boolean; t0: number }; __longTasks: { t: number; d: number }[] };
    w.__pf.stop = true;
    const f = w.__pf.frames.slice(1).sort((a, b) => a - b);
    const q = (p: number) => f[Math.min(f.length - 1, Math.floor(f.length * p))] ?? NaN;
    const t1 = performance.now();
    const lt = w.__longTasks.filter((e) => e.t >= w.__pf.t0 && e.t <= t1);
    return {
      fps: f.length / ((t1 - w.__pf.t0) / 1000),
      p50: q(0.5),
      p95: q(0.95),
      p99: q(0.99),
      max: f.at(-1) ?? NaN,
      miss60: f.filter((x) => x > 16.7 * 1.25).length,
      long: lt.length,
      longMs: lt.reduce((a, e) => a + e.d, 0),
      longMax: Math.max(0, ...lt.map((e) => e.d)),
    };
  });
}

async function wiggle(page: Page, box: { x: number; y: number; width: number; height: number }, ms: number) {
  const end = Date.now() + ms;
  for (let k = 0; Date.now() < end; k++) {
    const t = (Math.sin(k / 6) + 1) / 2;
    await page.mouse.move(box.x + 60 + (box.width - 120) * t, box.y + 60 + ((box.height - 120) * ((k * 7) % 20)) / 20);
    await page.waitForTimeout(16);
  }
}

test('2D board: hover, placement preview and bot turns on a late game', async ({ page }) => {
  test.skip(!SCEN.has('2d'));
  test.setTimeout(600_000);
  const problems: string[] = [];
  watchConsole(page, problems);
  if (process.env.PERF_CPU) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PERF_CPU) });
  }
  await open(page, 'late');
  log(`2d: late game, cpu throttle ${process.env.PERF_CPU ?? 1}x, effects ${EFFECTS}`);
  const out: Record<string, unknown> = {};
  const board = (await page.getByRole('group', { name: 'The board' }).boundingBox())!;
  const fmt = (r: Awaited<ReturnType<typeof pageFrames>>) =>
    `fps ${r.fps.toFixed(0).padStart(3)}  int p50/p95/p99/max ${r.p50.toFixed(1)}/${r.p95.toFixed(1)}/${r.p99.toFixed(1)}/${r.max.toFixed(0)}  miss60 ${r.miss60}  long ${r.long}/${r.longMs.toFixed(0)}ms (max ${r.longMax.toFixed(0)})`;
  const prof = process.env.PERF_PROFILE_2D ? await page.context().newCDPSession(page) : null;
  const profiled = async <T,>(name: string, fn: () => Promise<T>) => {
    if (!prof) return fn();
    await prof.send('Profiler.enable');
    await prof.send('Profiler.setSamplingInterval', { interval: 200 });
    await prof.send('Profiler.start');
    const r = await fn();
    await logProfile(prof, `2d ${name}`);
    return r;
  };
  for (const [name, during] of [
    ['idle', () => page.waitForTimeout(4000)],
    ['hover tiles', () => wiggle(page, board, 5000)],
  ] as const) {
    const r = await profiled(name, () => pageFrames(page, during));
    out[name] = r;
    log(`2d ${name.padEnd(22)} ${fmt(r)}`);
  }
  // A build preview: pick a road to show every legal spot, then hover across them.
  const road = page.getByRole('button', { name: /^Build Road/ });
  if (await road.isEnabled().catch(() => false)) {
    await road.click();
    const r = await pageFrames(page, () => wiggle(page, board, 5000));
    out['placement preview'] = r;
    log(`2d ${'placement preview'.padEnd(22)} ${fmt(r)}`);
    await page.keyboard.press('Escape');
  }
  // End the turn: three bot turns with dice, production, trades and building. If a bot asks
  // the human seat something (a discard on a 7, a trade offer), the engine's bot answers for it.
  const r = await profiled('bot round', () => pageFrames(page, async () => {
    await page.evaluate(() => {
      type A = { player?: number };
      type St = { session: { state: { phase: { kind: string }; currentPlayer: number } }; dispatch(a: A): void };
      const w = window as unknown as { __hexfall: { getState(): St }; __hexfallAI(s: unknown): A; __answer?: number };
      w.__answer = window.setInterval(() => {
        const st = w.__hexfall.getState();
        const s = st.session.state;
        if (s.currentPlayer === 0 || !['discard', 'trade'].includes(s.phase.kind)) return;
        const a = w.__hexfallAI(s);
        if (a.player === 0) st.dispatch(a);
      }, 400);
    });
    await page.getByTestId('end-turn').click();
    // A slow in-page check: Playwright's own waiting polls the DOM every frame and would be
    // measured as the page's work.
    await page.waitForFunction(
      () => {
        const s = (window as unknown as { __hexfall: { getState(): { session: { state: { phase: { kind: string }; currentPlayer: number } } } } }).__hexfall.getState().session.state;
        return s.currentPlayer === 0 && s.phase.kind === 'roll';
      },
      null,
      { polling: 500, timeout: 180_000 },
    );
    await page.evaluate(() => window.clearInterval((window as unknown as { __answer: number }).__answer));
    await page.waitForTimeout(500);
  }));
  out['bot round'] = r;
  log(`2d ${'bot round'.padEnd(22)} ${fmt(r)}`);
  const r2 = await pageFrames(page, async () => {
    await page.getByTestId('roll').click();
    await page.waitForTimeout(3000);
  });
  out['roll + production'] = r2;
  log(`2d ${'roll + production'.padEnd(22)} ${fmt(r2)}`);
  results.board2d = out;
  if (problems.length) log(`2d console: ${problems.slice(0, 10).join(' | ')}`);
});

