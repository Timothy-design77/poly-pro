import { defineConfig, devices } from '@playwright/test';

// Parallel worktrees can each run a preview server; PW_PORT keeps them apart.
const port = Number(process.env.PW_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}/poly-pro/`,
    serviceWorkers: 'allow',
    permissions: ['microphone'],
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/poly-pro/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'fold-cover',
      use: { ...devices['Desktop Chrome'], viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 884, height: 1104 },
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
  ],
});
