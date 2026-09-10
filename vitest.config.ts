import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'apps/server/src/__tests__/integration/**/*.spec.ts',
      'apps/client/src/**/__tests__/**/*.integration.spec.ts',
    ],
    testTimeout: 15000,
    hookTimeout: 15000,
    isolate: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['apps/server/src/**/*.ts'],
      thresholds: {
        perFile: true,
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/*.bench.ts',
        'apps/client/**',
        'apps/e2e/**',
        'shared/**',
        'tools/**',
        'infra/**',
        'apps/server/src/**/__tests__/**',
        'apps/server/src/index.ts',
        '**/mock_*.ts',
        '**/*.mock.ts',
        '**/null_*.ts',
      ],
    },
  },
});
