import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts', 'src/**/*.spec.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      thresholds: {
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
        'src/**/__tests__/**',
        'src/index.ts',
        '**/mock_*.ts',
        '**/*.mock.ts',
        '**/null_*.ts',
      ],
    },
  },
});
