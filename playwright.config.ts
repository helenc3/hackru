import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './apps/web/tests', testMatch: '**/*.spec.ts', fullyParallel: true, forbidOnly: Boolean(process.env.CI), retries: process.env.CI ? 1 : 0, reporter: 'list', use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' }, projects: [
  { name: 'firefox', testIgnore: '**/world/**', use: { ...devices['Desktop Firefox'] } },
  // Firefox on Linux CI has no GL driver at all (FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS); Chromium bundles SwiftShader.
  { name: 'chromium-world', testMatch: '**/world/**', use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } } },
], webServer: { command: 'npm run start', url: 'http://127.0.0.1:4173/api/health', reuseExistingServer: false, env: { NODE_ENV: 'production', PORT: '4173', ENABLE_VALIDATION_HARNESS: 'false', ENABLE_DEMO_FIXTURES: 'false' }, timeout: 120000 } });
