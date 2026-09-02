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
app.use(createRouter(root));

app.listen(port, () => {
  const live = process.env.CONDUIT_API_KEY && process.env.CONDUIT_EMAIL;
  console.log(`KIVULI server on http://localhost:${port}`);
  console.log(`Station source: ${live ? 'Conduit live API' : 'bundled CSV sample'}`);
});
