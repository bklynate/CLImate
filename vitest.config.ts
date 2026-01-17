import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**/*.ts'],
    },
    testTimeout: 60000, // 60 seconds for ML model loading
  },
  resolve: {
    alias: {
      '@langchain': path.resolve(__dirname, 'node_modules/@langchain'),
      '@src': path.resolve(__dirname, 'src'),
    },
  },
});
