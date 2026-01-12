import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src-langchain/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src-langchain/**/*.ts'],
      exclude: ['src-langchain/**/*.test.ts'],
    },
    testTimeout: 30000, // 30 seconds for API calls
  },
  resolve: {
    alias: {
      '@langchain': path.resolve(__dirname, 'node_modules/@langchain'),
    },
  },
});
