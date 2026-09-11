/*
 * KIVULI service worker.
 *
 * Plain JavaScript in `public/` rather than TypeScript in `src/`, because a
 * service worker must be served from the origin root under a stable filename,
 * and Vite emits `src/` as content-hashed bundles under `/assets/`. Standing up
 * a second build to share twenty lines of dispatch was not worth it.
 *
 * The routing table below duplicates `web/src/lib/cachePolicy.ts`, which is the
 * tested source of truth. **Change the two together.** A test asserts that this
 * file still excludes the hero video, which is the one rule whose loss would be
 * expensive rather than merely wrong.
 *
 * What is cached: the shell, the hashed bundles, two photographs, and exactly
 * one API response — `/api/today`, the station's own reading. Everything else
 * is fetched or it fails. An old measurement is still a measurement and can be
 * shown with its age attached; an old forecast shown without one is the sort of
 * confident wrong answer this project exists to avoid.
 */

const VERSION = 'kivuli-v1';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;

/** The one API response allowed to be served stale. */
const CACHEABLE_API = '/api/today';

/** 8.7 MB. Caching it would evict the reading that actually matters. */
const NEVER_CACHE = ['/hero-farmer.mp4'];

const CACHEABLE_MEDIA = ['/hero-community.jpg', '/hero-farmer-poster.jpg'];

/** Enough to boot offline. The bundles fill in on first visit. */
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest'];

/** Mirrors strategyFor() in web/src/lib/cachePolicy.ts. */
function strategyFor(path, method) {
  if (method !== 'GET') return 'network-only';
  if (NEVER_CACHE.includes(path)) return 'network-only';
  if (path === CACHEABLE_API) return 'network-first-then-cache';
  if (path.startsWith('/api/')) return 'network-only';
  if (path.startsWith('/assets/')) return 'cache-first';
  if (CACHEABLE_MEDIA.includes(path)) return 'cache-first';
  if (path === '/manifest.webmanifest' || path.startsWith('/icons/')) return 'cache-first';
  if (path === '/' || path === '/index.html') return 'stale-while-revalidate';
  return 'network-only';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Individually, so one missing file cannot fail the whole install and
      // leave the app with no worker at all.
      .then((cache) => Promise.allSettled(PRECACHE.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Escape hatch. If a bad build is ever cached, this unregisters the worker and
 * clears everything without needing devtools:
 *
 *   navigator.serviceWorker.controller.postMessage({ type: 'KIVULI_RESET' })
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'KIVULI_RESET') {
    event.waitUntil(
      caches
        .keys()
        .then((names) => Promise.all(names.map((n) => caches.delete(n))))
        .then(() => self.registration.unregister()),
    );
  }
});

/**
 * Stores the reading with the time *we fetched it*.
 *
 * `/api/today` carries no `generatedAt`, and `latest.ts` is when the instrument
 * read the air — not when this device last heard from the server. Reporting one
 * as the other would misstate how old the advice is, so the retrieval time is
 * recorded here as a header rather than inferred later.
 */
async function putStamped(cache, key, response) {
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set('X-Kivuli-Cached-At', new Date().toISOString());
  await cache.put(
    key,
    new Response(body, { status: response.status, statusText: response.statusText, headers }),
  );
}

/** Marks a cached response so the app knows to show its age. */
async function fromCache(response) {
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set('X-Kivuli-From-Cache', '1');
  return new Response(body, { status: 200, statusText: 'OK', headers });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch another origin: Mapbox tiles, Google Fonts and the like must
  // pass straight through.
  if (url.origin !== self.location.origin) return;

  const strategy = strategyFor(url.pathname, request.method);
  if (strategy === 'network-only') return;

  if (strategy === 'cache-first') {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (strategy === 'stale-while-revalidate') {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match('/index.html');
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put('/index.html', res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
    return;
  }

  // network-first-then-cache — /api/today only.
  event.respondWith(
    (async () => {
      const cache = await caches.open(DATA);
      try {
        const res = await fetch(request);
        if (res.ok) await putStamped(cache, CACHEABLE_API, res);
        return res;
      } catch (err) {
        // Query string dropped on purpose: one endpoint, one stored reading.
        const hit = await cache.match(CACHEABLE_API);
        if (hit) return fromCache(hit);
        throw err;
      }
    })(),
  );
});
