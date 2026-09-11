import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouter } from './api/routes.js';

// Load .env if present. Node 22 supports this natively; a missing file is fine
// because the CSV adapter needs no configuration.
try {
  process.loadEnvFile();
} catch {
  // No .env — run on bundled sample data.
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8787);

const app = express();

// API first, so a built asset can never shadow an endpoint.
app.use(createRouter(root));

// Serve the built client from the same process and port. Without this the
// project is only viewable through `npm run dev` — two processes behind Vite's
// proxy — which means it cannot be deployed or opened by anyone who is not
// running it locally. `index: false` so the SPA fallback below owns `/` rather
// than static short-circuiting it.
const dist = path.join(root, 'dist');

// `maxAge: '1h'` is right for the content-hashed bundles under /assets and
// wrong for these three. A bad sw.js pinned in the HTTP cache for an hour
// cannot be recovered from without devtools, and index.html carries the
// *names* of the hashed bundles, so a stale copy points at files a new deploy
// has already deleted — a white screen that survives a reload.
const NO_STORE = new Set(['/sw.js', '/manifest.webmanifest', '/index.html', '/']);
app.use((req, res, next) => {
  if (NO_STORE.has(req.path)) res.setHeader('Cache-Control', 'no-cache');
  next();
});

app.use(express.static(dist, { maxAge: '1h', index: false }));

// SPA fallback. Strictly redundant today: the client uses HashRouter, so every
// route is `/#/climate` and the server only ever sees `/`. Kept because it is
// one line and stops a future switch to BrowserRouter from silently 404ing
// every deep link.
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(dist, 'index.html'));
});

// Bind on all interfaces: a container's health check reaches the process from
// outside its network namespace, and a loopback-only bind fails it.
app.listen(port, '0.0.0.0', () => {
  const live = process.env.CONDUIT_API_KEY && process.env.CONDUIT_EMAIL;
  console.log(`KIVULI server on http://localhost:${port}`);
  console.log(`Station source: ${live ? 'Conduit live API' : 'bundled CSV sample'}`);
});
