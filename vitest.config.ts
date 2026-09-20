import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests only: pure logic, no browser, no server, no network, no database.
// Browser behaviour is Playwright's job, and the whole-corpus data check stays
// in `npm run check`.
export default defineConfig({
  // One test file reaches into a .tsx component for a pure helper. tsconfig
  // says "preserve" because Next compiles JSX itself, so the transform Vitest
  // uses (oxc) has to be told how to read it.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
