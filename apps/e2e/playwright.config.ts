import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../../');

/**
 * Playwright End-to-End Test Suite Configuration for Fun Chess.
 * Cleanly partitioned into 'api' and 'ui' projects with dual webServer orchestration.
 */
export default defineConfig({
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api',
      testDir: './api',
      testMatch: ['**/*.api.spec.ts', '**/*.api.e2e.test.ts'],
    },
    {
      name: 'ui',
      testDir: './ui',
      testMatch: ['**/*.e2e.test.ts', '**/*.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
      },
    },
    {
      name: 'mobile-chrome',
      testDir: './ui',
      testMatch: ['**/*.e2e.test.ts', '**/*.spec.ts'],
      use: {
        ...devices['Pixel 5'],
        channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @fun-chess/server dev',
      url: 'http://localhost:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: workspaceRoot,
      env: {
        ...process.env,
        RATE_LIMIT_MAX_REQUESTS: '1000',
        RATE_LIMIT_ROOM_CREATE_MAX: '1000',
        TRUST_PROXY: 'true',
      },
    },
    {
      command: 'pnpm --filter @fun-chess/client dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: workspaceRoot,
    },
  ],
});
