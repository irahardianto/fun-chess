import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import baseConfig from '../playwright.config.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../../../');

/**
 * Playwright configuration for Fun Chess HTTP API automated verification suite.
 */
export default defineConfig({
  ...baseConfig,
  testDir: '.',
  testMatch: ['**/*.api.spec.ts', '**/*.api.e2e.test.ts'],
  webServer: {
    command: 'pnpm --filter @fun-chess/server dev',
    url: 'http://localhost:3000/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: workspaceRoot,
  },
});
