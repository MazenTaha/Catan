import { defineConfig, devices } from '@playwright/test';

const PORT = 4319;
const SERVER_PORT = 4320;

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      // The online game server; the dev server forwards /ws to it.
      command: `pnpm --filter @hexfall/server exec tsx src/main.ts`,
      url: `http://localhost:${SERVER_PORT}/health`,
      env: { PORT: String(SERVER_PORT), WEB_DIST: '/nonexistent' },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm exec vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      env: { HEXFALL_SERVER_PORT: String(SERVER_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
