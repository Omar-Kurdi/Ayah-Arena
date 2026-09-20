import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests: real route handlers, real SQLite, one throwaway database
// per test. Still no browser, no server and no network.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['tests/integration/setup.ts'],
    // Each file gets its own database through a cached global handle, so they
    // must not share a worker.
    fileParallelism: false,
  },
});
