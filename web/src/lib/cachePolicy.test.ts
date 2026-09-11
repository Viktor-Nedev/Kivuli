import { describe, test, expect } from 'vitest';
import { cacheKeyFor, isCacheableApi, strategyFor } from './cachePolicy';

/**
 * The most important assertion in this file is that the 8.7 MB hero video is
 * never cached. Everything else is policy; that one is a storage budget the
 * single cached reading depends on.
 */

describe('strategyFor', () => {
  test('the hero video is never cached, at any size or for any reason', () => {
    expect(strategyFor('/hero-farmer.mp4')).toBe('network-only');
    expect(strategyFor('http://host/hero-farmer.mp4')).toBe('network-only');
  });

  test('only /api/today may be served stale', () => {
    expect(strategyFor('/api/today')).toBe('network-first-then-cache');
    expect(strategyFor('/api/today?at=13:00')).toBe('network-first-then-cache');
  });

  test('every other endpoint is network-only, so nothing is silently stale', () => {
    for (const path of [
      '/api/climate',
      '/api/validation',
      '/api/outlook',
      '/api/water',
      '/api/ask?q=hello',
      '/api/config',
      '/api/health',
    ]) {
      expect(strategyFor(path), path).toBe('network-only');
    }
  });

  test('hashed bundles are cache-first, because they cannot go stale', () => {
    expect(strategyFor('/assets/index-Bx5gAgtM.js')).toBe('cache-first');
    expect(strategyFor('/assets/index-BllB8Vmz.css')).toBe('cache-first');
  });

  test('the shell revalidates, so a deploy is picked up without a version bump', () => {
    expect(strategyFor('/')).toBe('stale-while-revalidate');
    expect(strategyFor('/index.html')).toBe('stale-while-revalidate');
  });

  test('the manifest and icons are cached, the two photographs too', () => {
    expect(strategyFor('/manifest.webmanifest')).toBe('cache-first');
    expect(strategyFor('/icons/icon-512.png')).toBe('cache-first');
    expect(strategyFor('/hero-community.jpg')).toBe('cache-first');
    expect(strategyFor('/hero-farmer-poster.jpg')).toBe('cache-first');
  });

  test('a non-GET is never cached', () => {
    expect(strategyFor('/api/today', 'POST')).toBe('network-only');
    expect(strategyFor('/', 'HEAD')).toBe('network-only');
  });

  test('an unrecognised path defaults to the network', () => {
    // The default must be to fetch: a new endpoint added later must not
    // silently start being served from storage.
    expect(strategyFor('/api/something-new')).toBe('network-only');
    expect(strategyFor('/whatever')).toBe('network-only');
  });
});

describe('cacheKeyFor', () => {
  test('/api/today drops its query so one reading is stored, not one per time', () => {
    // The app pins ?at=13:00 for the sample day and a reader can override it.
    // Keying on the full URL would write an entry per time and find none.
    expect(cacheKeyFor('/api/today?at=13:00')).toBe('/api/today');
    expect(cacheKeyFor('/api/today?at=09:00')).toBe('/api/today');
    expect(cacheKeyFor('/api/today')).toBe('/api/today');
  });

  test('other paths key on themselves', () => {
    expect(cacheKeyFor('/assets/index-abc.js')).toBe('/assets/index-abc.js');
  });
});

describe('isCacheableApi', () => {
  test('is true for exactly one endpoint', () => {
    expect(isCacheableApi('/api/today?at=13:00')).toBe(true);
    expect(isCacheableApi('/api/validation')).toBe(false);
    expect(isCacheableApi('/api/climate')).toBe(false);
  });
});
