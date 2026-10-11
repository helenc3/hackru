import { defineConfig, devices } from '@playwright/test';

// Real-server journeys: no scripted API. The player world runs against the production
// bundle; the validation harness path uses a development server because production
// deliberately rejects validation sessions. Neither loads .env, so no provider keys.
// E2E_PORT lets parallel runs coexist: player server on E2E_PORT, harness server on E2E_PORT + 1.
const port = Number(process.env.E2E_PORT ?? 4174);
process.env.E2E_HARNESS_URL = `http://127.0.0.1:${port + 1}`;
export default defineConfig({
  timeout: 90_000,
  testDir: '.', testMatch: '**/*.spec.ts', fullyParallel: false, forbidOnly: Boolean(process.env.CI), retries: process.env.CI ? 1 : 0, reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  // Chromium: the Linux CI runner's Firefox has no GL driver, and these journeys walk the 3D world.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } } }],
  webServer: [
    { command: 'node apps/server/dist/index.js', cwd: '../..', url: `http://127.0.0.1:${port}/api/health`, reuseExistingServer: false, timeout: 120000, env: { NODE_ENV: 'production', PORT: String(port), ENABLE_DEMO_FIXTURES: 'true', ENABLE_VALIDATION_HARNESS: 'false' } },
    { command: 'node apps/server/dist/index.js', cwd: '../..', url: `http://127.0.0.1:${port + 1}/api/health`, reuseExistingServer: false, timeout: 120000, env: { NODE_ENV: 'development', PORT: String(port + 1), ENABLE_DEMO_FIXTURES: 'true', ENABLE_VALIDATION_HARNESS: 'true' } },
  ],
});
