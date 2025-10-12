import { defineConfig } from '@playwright/test';

const useProd = process.env.USE_PROD_SERVER === '1';

export default defineConfig({
  // testDir is relative to this config file location (repo root)
  // Set to 'tests' so only files in tests folder are scanned
  testDir: './tests',
  // Only run our Playwright E2E spec here
  testMatch: ['trust-engine.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
