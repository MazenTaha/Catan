import { defineConfig } from '@playwright/test';

/**
 * The browser benchmark (e2e/perf): a production build with the inspection hooks compiled in
 * (VITE_PERF=1, into dist-perf), served by `vite preview`, measured in Chromium on a real GPU.
 *   PERF_GPU=intel|nvidia   which GPU Chromium uses on a dual-GPU laptop (default intel)
 *   PERF_HEADED=1           a visible window, paced by the display (else headless, 60 Hz)
 *   PERF_W, PERF_H, PERF_DPR  window size (default 1440x900) and device pixel ratio (default 1)
 *   PERF_LABEL, PERF_OUT, PERF_SCENARIOS, PERF_REPEAT, PERF_EFFECTS, PERF_STRESS: see bench.spec.ts
 *   PERF_REUSE=1            reuse a running preview server (skips the rebuild)
 */
const PORT = 4331;
const gpu = process.env.PERF_GPU ?? 'intel';
process.env.PERF = '1';

export default defineConfig({
  testDir: './e2e/perf',
  timeout: 3_600_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: Number(process.env.PERF_W ?? 1440), height: Number(process.env.PERF_H ?? 900) },
    deviceScaleFactor: Number(process.env.PERF_DPR ?? 1),
    headless: !process.env.PERF_HEADED,
    trace: 'off',
    launchOptions: {
      args: [
        '--use-angle=d3d11',
        '--enable-gpu-rasterization',
        '--ignore-gpu-blocklist',
        gpu === 'nvidia' ? '--force-high-performance-gpu' : '--force-low-power-gpu',
      ],
    },
  },
  webServer: {
    command: `pnpm exec vite build --outDir dist-perf --emptyOutDir && pnpm exec vite preview --outDir dist-perf --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { VITE_PERF: '1' },
    reuseExistingServer: !!process.env.PERF_REUSE,
    timeout: 300_000,
  },
});
