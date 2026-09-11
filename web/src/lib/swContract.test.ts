import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strategyFor } from './cachePolicy';

/**
 * `web/public/sw.js` duplicates the routing table in `cachePolicy.ts`, because
 * a service worker must be served from the origin root under a stable filename
 * and Vite emits `src/` as hashed bundles. The duplication is deliberate and
 * small, but it can drift — and a drift here is silent, because the tested
 * copy would keep passing while the shipped copy did something else.
 *
 * These are crude string assertions on purpose. They cannot prove the two
 * agree; they can prove the rules whose loss would be expensive are still
 * written down in the file that actually runs.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SW = readFileSync(join(here, '..', '..', 'public', 'sw.js'), 'utf8');

describe('sw.js still encodes the policy it is supposed to', () => {
  test('the hero video is excluded by name', () => {
    // 8.7 MB. Caching it would consume the budget the one stored reading
    // depends on, and contradict the bandwidth argument the app makes
    // everywhere else. This is the single most important line in the file.
    expect(SW).toContain('/hero-farmer.mp4');
    expect(SW).toContain('NEVER_CACHE');
    expect(strategyFor('/hero-farmer.mp4')).toBe('network-only');
  });

  test('exactly one API response is cacheable, and it is the station reading', () => {
    expect(SW).toContain("CACHEABLE_API = '/api/today'");
    expect(strategyFor('/api/today')).toBe('network-first-then-cache');
    // Any other endpoint being added here would need a staleness marker of
    // its own before it could honestly be served from storage.
    expect(strategyFor('/api/climate')).toBe('network-only');
  });

  test('a cached reading is stamped with when it was stored', () => {
    // /api/today carries no generatedAt, and latest.ts is the observation
    // time. Without this header the UI would report the age of the reading as
    // the age of the cache.
    expect(SW).toContain('X-Kivuli-Cached-At');
    expect(SW).toContain('X-Kivuli-From-Cache');
  });

  test('the cache is versioned so a deploy can evict cleanly', () => {
    expect(SW).toMatch(/const VERSION = 'kivuli-v\d+'/);
  });

  test('there is a reset path that needs no devtools', () => {
    expect(SW).toContain('KIVULI_RESET');
    expect(SW).toContain('unregister');
  });

  test('cross-origin requests are passed straight through', () => {
    // Mapbox tiles and Google Fonts must not be intercepted.
    expect(SW).toContain('self.location.origin');
  });
});
