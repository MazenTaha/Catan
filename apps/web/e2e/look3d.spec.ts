import { test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { hostWithBots } from './helpers';

/**
 * Opt-in look-and-cost probe for the 3D walk: `LOOK=1 pnpm e2e look3d` (LOOK_OUT=dir for the
 * screenshots, LOOK_EFFECTS=lite|full, LOOK_SWIFTSHADER=1 for software rendering). Places the
 * camera at fixed viewpoints (wheat, forest edge and clearing, mountains, hills, pasture, desert,
 * a settlement and a city, a dock, an elevated view), takes a screenshot of each and logs frame
 * rate, a synthetic GPU time per frame (back-to-back renders each forced to finish: throughput,
 * not frame pacing), draw calls and triangles. The same seed and viewpoints are used every run,
 * so results compare before and after. For real frame pacing, GPU timer queries and a production
 * build, use `pnpm bench` (e2e/perf).
 */
test.skip(!process.env.LOOK, 'set LOOK=1 to capture');
test.use({
  launchOptions: {
    args: process.env.LOOK_SWIFTSHADER ? [] : ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
  },
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  trace: 'off',
});

const OUT = process.env.LOOK_OUT ?? 'test-results/look3d';

interface View {
  name: string;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Eye height above sea level, or undefined to stand on the ground. */
  y?: number;
}

async function views(page: Page): Promise<View[]> {
  return page.evaluate(() => {
    type W = {
      landHexes: { id: number; x: number; z: number }[];
      walkable: { ax: number; az: number; bx: number; bz: number }[];
      pieceColliders: { ax: number; az: number; r: number }[];
    };
    const dev = (window as unknown as { __world3d: { world: W; state: () => { board: { hexes: { terrain: string }[] } } } }).__world3d;
    const w = dev.world;
    const hexes = dev.state().board.hexes;
    const R = 14;
    const lookAt = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));
    const first = (t: string) => w.landHexes.find((h) => hexes[h.id].terrain === t)!;
    const out: View[] = [];
    // Inside the wheat: off-centre, looking across the field towards the tile's edge.
    const f = first('fields');
    {
      // Standing in the crop: the wheat clump nearest a point 5 m from the tile's centre,
      // looking across the field past the centre.
      type Items = { items: { m: { elements: number[] } }[] };
      const ww = w as unknown as { fields?: (Items & { group: { name: string } })[]; wheat?: Items };
      const items = (ww.fields?.find((fl) => fl.group.name === 'wheat') ?? ww.wheat)!.items;
      let best = { x: f.x + 5, z: f.z, d: 1e9 };
      for (const it of items) {
        const x = it.m.elements[12];
        const z = it.m.elements[14];
        const d = Math.abs(Math.hypot(x - f.x, z - f.z) - 5) + Math.abs(z - f.z) * 0.3;
        if (d < best.d && Math.hypot(x - f.x, z - f.z) < 12) best = { x, z, d };
      }
      // Look along the crop (across the radius), not back through the centre sign.
      const rx = (best.x - f.x) / 5;
      const rz = (best.z - f.z) / 5;
      out.push({ name: 'wheat', x: best.x, z: best.z, yaw: lookAt(best.x, best.z, best.x - rz * 10, best.z + rx * 10), pitch: -0.16 });
    }
    // A forest edge, seen from the tile boundary, and a clearing inside the wood.
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
    {
      const x = m.x - R * 0.95;
      const z = m.z;
      out.push({ name: 'mountains', x, z, yaw: lookAt(x, z, m.x, m.z), pitch: 0.12 });
    }
    const h = first('ashen');
    {
      const x = h.x;
      const z = h.z + R * 0.92;
      out.push({ name: 'hills', x, z, yaw: lookAt(x, z, h.x, h.z), pitch: -0.05 });
    }
    const p = first('moors');
    {
      const x = p.x + R * 0.9;
      const z = p.z - 3;
      out.push({ name: 'pasture', x, z, yaw: lookAt(x, z, p.x, p.z), pitch: -0.08 });
    }
    const d = first('waste');
    if (d) {
      const x = d.x - 3;
      const z = d.z + R * 0.85;
      out.push({ name: 'desert', x, z, yaw: lookAt(x, z, d.x, d.z), pitch: -0.08 });
    }
    // Settlement and city (the first two buildings; the probe upgrades the second to a city).
    const [b0, b1] = w.pieceColliders;
    for (const [name, b] of [
      ['settlement', b0],
      ['city', b1],
    ] as const) {
      const len = Math.hypot(b.ax, b.az) || 1;
      const x = b.ax - (b.ax / len) * 11 + (b.az / len) * 3;
      const z = b.az - (b.az / len) * 11 - (b.ax / len) * 3;
      out.push({ name, x, z, yaw: lookAt(x, z, b.ax, b.az), pitch: 0.02 });
    }
    // A dock from the beach beside it.
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

test('3D walk look and cost', async ({ page }) => {
  test.setTimeout(300_000);
  fs.mkdirSync(OUT, { recursive: true });
  const effects = process.env.LOOK_EFFECTS ?? 'full';
  await page.addInitScript((e) => {
    if (!sessionStorage.getItem('look')) {
      localStorage.clear();
      localStorage.setItem('hexfall.settings', JSON.stringify({ botSpeed: 'instant', rookieTips: false, muted: true, effects: e }));
      sessionStorage.setItem('look', '1');
    }
  }, effects);
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().includes('GL Driver Message')) return;
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));

  await page.goto('/');
  await hostWithBots(page);
  await page.getByTestId('seed').fill('look-3d');
  await page.getByRole('button', { name: 'Seat 1' }).click();
  await page.getByTestId('begin').click();
  for (let i = 0; i < 2; i++) {
    await page.locator('[aria-label^="Place a Settlement"]').first().click({ force: true });
    await page.locator('[aria-label^="Build a Road"]').first().click({ force: true });
  }
  await page.getByTestId('roll').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'board-2d.png') });

  const t0 = Date.now();
  await page.getByRole('button', { name: '3D walk' }).click();
  await page.getByTestId('world-location').waitFor({ timeout: 60_000 });
  const openMs = Date.now() - t0;
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log(`[look] gpu ${gpu}`);
  console.log(`[look] effects ${effects}, opening the walk ${openMs} ms`);
  await page.waitForTimeout(2500);

  // Show a city too: the walk mirrors whatever state it is given.
  await page.evaluate(() => {
    type S = { buildings: Record<string, { owner: number; kind: string }> };
    const dev = (window as unknown as { __world3d: { world: { setPieces(s: S): void }; state: () => S } }).__world3d;
    const s = dev.state();
    const keys = Object.keys(s.buildings);
    const b = { ...s.buildings, [keys[1]]: { ...s.buildings[keys[1]], kind: 'citadel' } };
    dev.world.setPieces({ ...s, buildings: b });
  });
  // Hide the overlays so the pictures show the scene.
  await page.addStyleTag({ content: '[data-world3d] > :not(:has(canvas)) { display: none !important; }' });

  const list = await views(page);
  const rows: string[] = [];
  for (const v of list) {
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
      w.camY = (v.y ?? g(v.x, v.z) + 1.7);
    }, v);
    await page.waitForTimeout(1200);
    const r = await page.evaluate(
      () =>
        new Promise<{ fps: number; p95: number; calls: number; tris: number }>((resolve) => {
          const w = (window as unknown as { __world3d: { world: { renderer: { info: { render: { calls: number; triangles: number } } } } } }).__world3d.world;
          const frames: number[] = [];
          let last = performance.now();
          let calls = 0;
          let tris = 0;
          const start = last;
          const tick = (now: number) => {
            frames.push(now - last);
            last = now;
            calls = Math.max(calls, w.renderer.info.render.calls);
            tris = Math.max(tris, w.renderer.info.render.triangles);
            if (now - start < 2500) requestAnimationFrame(tick);
            else {
              const f = frames.slice(1).sort((a, b) => a - b);
              resolve({ fps: (f.length / (now - start)) * 1000, p95: f[Math.floor(f.length * 0.95)], calls, tris });
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    // GPU time per frame, independent of vsync: back-to-back renders, each forced to finish.
    const gpuMs = await page.evaluate(() => {
      type R = { render(s: unknown, c: unknown): void; getContext(): WebGL2RenderingContext; shadowMap: { needsUpdate: boolean } };
      const w = (window as unknown as { __world3d: { world: { renderer: R; scene: unknown; camera: unknown } } }).__world3d.world;
      const gl = w.renderer.getContext();
      const px = new Uint8Array(4);
      const once = () => {
        // Worst case: every measured frame redraws the shadow map too.
        w.renderer.shadowMap.needsUpdate = true;
        w.renderer.render(w.scene, w.camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      };
      for (let i = 0; i < 5; i++) once();
      const t0 = performance.now();
      for (let i = 0; i < 30; i++) once();
      return (performance.now() - t0) / 30;
    });
    const row = `${v.name.padEnd(15)} fps ${r.fps.toFixed(0).padStart(3)}  p95 ${r.p95.toFixed(1).padStart(5)} ms  gpu ${gpuMs.toFixed(1).padStart(5)} ms  calls ${String(r.calls).padStart(5)}  tris ${(r.tris / 1000).toFixed(0).padStart(5)}k`;
    rows.push(row);
    console.log(`[look] ${row}`);
    await page.locator('[data-world3d] canvas').screenshot({ path: path.join(OUT, `${v.name}.png`) });
  }
  const mem = await page.evaluate(() => {
    const w = (window as unknown as { __world3d: { world: { renderer: { info: { memory: { geometries: number; textures: number }; programs?: unknown[] } } } } }).__world3d.world;
    return { ...w.renderer.info.memory, programs: w.renderer.info.programs?.length ?? 0 };
  });
  console.log(`[look] memory ${JSON.stringify(mem)}`);
  fs.writeFileSync(
    path.join(OUT, 'report.txt'),
    [`gpu ${gpu}`, `effects ${effects}`, `open ${openMs} ms`, ...rows, `memory ${JSON.stringify(mem)}`, ...problems].join('\n'),
  );
  if (problems.length) console.log(`[look] console problems:\n${problems.join('\n')}`);
});
