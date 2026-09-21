import express from 'express';
import path from 'node:path';
import { createRouter } from '../server/api/routes.js';

/**
 * The API as a single Vercel serverless function.
 *
 * ## Why one function rather than eleven
 *
 * Every route shares the same station source, the same Open-Meteo client and
 * the same on-disk cache directory. Split across eleven functions, each cold
 * start would re-read and re-parse the 18,364-reading GeoCSV export for one
 * endpoint's worth of work, and the in-process caches that make the second
 * request fast would never be shared. `vercel.json` rewrites `/api/*` here and
 * Express does the routing it already knows how to do.
 *
 * ## Why `root` is the repository root
 *
 * `createRouter(root)` resolves `data/conduit`, `data/cache` and
 * `data/coefficients.json` beneath whatever it is given. In the bundle this
 * file sits at `/var/task/api/`, so the root is its parent — and `vercel.json`
 * declares `includeFiles: "data/**"` to make sure those files are actually
 * deployed alongside the code rather than tree-shaken away as unreferenced.
 *
 * ## What is different from `server/index.ts`
 *
 * That entry also serves the built client and calls `listen()`. Here Vercel
 * serves `dist/` as static output and owns the socket, so this exports the
 * Express app and does neither. The API surface is identical because it is
 * literally the same router.
 *
 * The filesystem is read-only apart from `/tmp`. The cache layer already
 * treats a failed write as a non-event — the fetch it just completed is still
 * returned — so the app runs correctly here, it simply re-fetches more often
 * than it would on a host with a writable disk.
 */
const app = express();

const root = path.resolve(process.cwd());

app.use(createRouter(root));

export default app;
