import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  root,
  plugins: [react()],
  server: {
    // Deliberately off the default 5173: another dev server commonly holds it,
    // and Vite silently moving to a new port mid-demo is worse than failing.
    port: 5180,
    strictPort: true,
    // The API runs as a separate process; proxy so the client uses same-origin paths.
    proxy: { '/api': 'http://localhost:8787' },
  },
  build: { outDir: path.resolve(root, '../dist'), emptyOutDir: true },
});
