/**
 * What the service worker is allowed to keep, and what it must never keep.
 *
 * This is the whole offline policy as one pure function, extracted from the
 * worker so the rules that decide whether a farmer can be shown an old number
 * are unit-tested rather than trusted. `web/public/sw.js` is a thin dispatcher
 * over the same table.
 *
 * ## Why almost nothing is cached
 *
 * Exactly one API response is stored: `/api/today`. That is the station's own
 * reading, and an old measurement is still a measurement — it can be shown
 * with its age attached and remain honest. Everything else is refused on
 * purpose:
 *
 *   - `/api/climate`, `/api/validation`, `/api/water`, `/api/outlook` are model
 *     output over long windows. A stale forecast presented without a way to
 *     see how stale is the kind of confident wrong answer this project exists
 *     to avoid, and building a staleness marker for six more endpoints is not
 *     a job for the week before a deadline. Offline, those fetches fail and
 *     each page's existing degraded path says so.
 *   - The hero video is 8.7 MB. Caching it would consume the storage budget
 *     that the one reading depends on, and it would contradict the
 *     bandwidth argument the app makes everywhere else.
 *
 * The result is a cache measured in hundreds of kilobytes, holding the shell,
 * the hashed bundles, two photographs and one JSON document.
 */

export type CacheStrategy =
  /** Fetched every time; never read from or written to the cache. */
  | 'network-only'
  /** Content-hashed or effectively immutable: serve from cache, fill on miss. */
  | 'cache-first'
  /** Serve the cached copy, refresh it in the background. */
  | 'stale-while-revalidate'
  /** Try the network, fall back to the stored copy, stamp what is stored. */
  | 'network-first-then-cache';

/** The one API response allowed to be served stale. */
const CACHEABLE_API = '/api/today';

// The hero video is gone — its container had no sync-sample table, which is
// why scrubbing it stuttered, and the sequence is CSS now. The rule stays as a
// standing guard: nothing that large may enter the cache the one stored
// reading depends on, whatever it is called.
const NEVER_CACHE = ['/hero-farmer.mp4'];

/** Worth the bytes: the header photo is the app's identity offline. */
const CACHEABLE_MEDIA = ['/hero-community.jpg', '/hero-farmer-poster.jpg'];

function pathOf(url: string): string {
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url;
  }
}

/** True only for the one API response that may be served from storage. */
export function isCacheableApi(url: string): boolean {
  return pathOf(url) === CACHEABLE_API;
}

/**
 * The cache key for a request.
 *
 * `/api/today` drops its query string. The app pins `?at=13:00` for the
 * bundled sample day and a reader can override it in the URL, so keying on
 * the full string would write one entry per time and find none of them on the
 * next visit. One endpoint, one stored reading.
 */
export function cacheKeyFor(url: string): string {
  const path = pathOf(url);
  return path === CACHEABLE_API ? CACHEABLE_API : path;
}

/**
 * Which strategy a request gets, from its method and URL alone.
 *
 * Anything not recognised is `network-only`: the default must be to fetch, so
 * a new endpoint added later cannot silently start being served stale.
 */
export function strategyFor(url: string, method = 'GET'): CacheStrategy {
  if (method !== 'GET') return 'network-only';

  const path = pathOf(url);

  if (NEVER_CACHE.includes(path)) return 'network-only';
  if (path === CACHEABLE_API) return 'network-first-then-cache';
  if (path.startsWith('/api/')) return 'network-only';

  // Vite emits content-hashed bundles, so these can never go stale.
  if (path.startsWith('/assets/')) return 'cache-first';
  if (CACHEABLE_MEDIA.includes(path)) return 'cache-first';
  if (path === '/manifest.webmanifest' || path.startsWith('/icons/')) return 'cache-first';

  // The shell. Network-first would make every navigation wait on a timeout
  // offline; revalidating in the background picks up a deploy on the next load.
  if (path === '/' || path === '/index.html') return 'stale-while-revalidate';

  return 'network-only';
}
