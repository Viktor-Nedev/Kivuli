import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');

/**
 * Component tests only.
 *
 * The server suite stays on `node:test` via `npm test` — it needs no DOM and
 * no transform, and moving it here would trade a zero-dependency runner for a
 * bundler. This config exists solely so React components can be rendered, and
 * its glob is scoped to `*.test.tsx` so the two pure-math files under
 * `web/src/map` keep running under the node runner where they already pass.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Relative to this config's directory, and forward slashes: a Windows
    // absolute path with backslashes is not a valid glob.
    root: here,
    // `.ts` as well as `.tsx`, so pure-logic modules under src/lib can be
    // tested at all — the narrower glob silently ran neither runner for them,
    // which is worse than a failing test. `src/map` stays excluded because
    // those two files already run under the node runner (see package.json)
    // and would otherwise be executed twice.
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/map/**'],
    setupFiles: ['src/test-setup.ts'],
  },
});
