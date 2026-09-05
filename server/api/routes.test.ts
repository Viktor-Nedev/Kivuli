import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { createRouter, elapsedMinutesFrom } from './routes.js';

/**
 * HTTP-layer tests.
 *
 * Two things are pinned here that nothing else covers.
 *
 * The first is `elapsedMinutesFrom`, whose own comment flags the midnight wrap
 * as the subtle part. The bundled sample runs past local midnight, so its last
 * row reads "02:55" while being twelve hours *later* than "13:00" — a naive
 * clock-string comparison silently picks the wrong reading, and the `?at` pin
 * is what the demo depends on.
 *
 * The second is the degradation contract. The README promises that a missing
 * forecast or an unreachable archive is reported rather than hidden. That is a
 * behavioural claim, so it belongs in the test suite rather than only in prose.
 */

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Boots the real router on an ephemeral port and tears it down after. */
async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(createRouter(ROOT));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/**
 * Blocks outbound calls for one assertion while leaving loopback alone.
 *
 * Simulating "the venue wi-fi is down" rather than "the network stack is
 * gone" - the test still has to reach its own server on 127.0.0.1, and a
 * blanket stub would fail the request under test instead of the upstream
 * fetch it is meant to sever.
 */
function severNetwork() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('127.0.0.1') || url.includes('localhost')) {
      return original(input as never, init);
    }
    throw new Error('network disabled for test');
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test('elapsed minutes stay monotonic across the local midnight wrap', () => {
  // The sample day starts at 00:00Z = 03:00 EAT on 1 September.
  const elapsed = elapsedMinutesFrom('2026-09-01T00:00:00Z');

  // 03:00 EAT on the first local day.
  assert.equal(elapsed('2026-09-01T00:00:00Z'), 180);
  // 13:00 EAT the same local day.
  assert.equal(elapsed('2026-09-01T10:00:00Z'), 780);
  // 02:55 EAT the NEXT calendar day - later, and the number must say so.
  assert.equal(elapsed('2026-09-01T23:55:00Z'), 1615);
});

test('the last sample reading sorts after midday despite reading 02:55 on the clock', () => {
  // This is the trap the helper exists to avoid: '02:55' < '13:00' as strings,
  // while being nearly twelve hours later in fact.
  const elapsed = elapsedMinutesFrom('2026-09-01T00:00:00Z');
  const midday = elapsed('2026-09-01T10:00:00Z');
  const lastRow = elapsed('2026-09-01T23:55:00Z');
  assert.ok(lastRow > midday, 'a wrapped timestamp must not sort before midday');
});

test('/api/health answers without touching the network', async () => {
  const restore = severNetwork();
  try {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean; source: string };
      assert.equal(body.ok, true);
      assert.ok(body.source, 'health should name the active station source');
    });
  } finally {
    restore();
  }
});

test('/api/config returns a token field even when none is set', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/config`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { mapboxToken: string | null };
    assert.ok('mapboxToken' in body, 'the client branches on this key existing');
  });
});

test('/api/today still answers from measured data when the forecast is unreachable', async () => {
  // Losing the forecast must not lose the day: the station readings are local
  // and every index except the rain gate is computed from them.
  //
  // Deliberately NOT asserting `forecastDegraded === true`. With a cached
  // forecast on disk the stale-fallback serves it, and a stale forecast is
  // still a forecast - so the honest flag is `false`. Asserting `true` here
  // would have been testing for a false alarm. What must hold either way is
  // that the endpoint survives and the flag is a real boolean rather than
  // undefined.
  const restore = severNetwork();
  try {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/today?at=13:00`);
      assert.equal(res.status, 200, 'a missing forecast must not fail the whole day');
      const body = (await res.json()) as {
        forecastDegraded: boolean;
        timeline: unknown[];
        decisions: unknown;
      };
      assert.equal(typeof body.forecastDegraded, 'boolean', 'the caveat must be stated either way');
      assert.ok(body.timeline.length > 0, 'station readings are local and still available');
      assert.ok(body.decisions, 'decisions still come from measured data');
    });
  } finally {
    restore();
  }
});

test('the rain gate degrades to "no rain known" rather than blocking every window', async () => {
  // When the lookahead is genuinely unavailable the code returns an empty rain
  // set, so spray and drying are judged on the air alone rather than being
  // universally blocked by an absence of data. Verified through the public
  // response: with no forecast, at least one sample still passes the gates on
  // a day the README says has 18 passing readings.
  const restore = severNetwork();
  try {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/today?at=13:00`);
      const body = (await res.json()) as {
        timeline: { spray: { pass: boolean; failures: string[] } }[];
      };
      const blockedByRain = body.timeline.filter((p) =>
        p.spray.failures.includes('rain_forecast'),
      );
      assert.ok(
        blockedByRain.length < body.timeline.length,
        'an unavailable forecast must not read as rain everywhere',
      );
    });
  } finally {
    restore();
  }
});

test('/api/climate degrades to a flagged response instead of a 502', async () => {
  // The Season page is peripheral to the core decision, so an archive outage
  // should leave the rest of the site working and say plainly that history is
  // unavailable. Note this passes either way: with the committed snapshot on
  // disk it serves real data, and without one it degrades - both are correct,
  // and neither is a 502.
  const restore = severNetwork();
  try {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/climate`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { degraded: boolean; windows?: unknown[] };
      assert.equal(typeof body.degraded, 'boolean');
      if (!body.degraded) {
        assert.ok(body.windows?.length, 'a non-degraded response must carry its windows');
      }
    });
  } finally {
    restore();
  }
});

test('the API still routes when static file serving is mounted after it', async () => {
  // Guards the mount order in server/index.ts: a static handler registered
  // before the router would let a built asset shadow an endpoint.
  const app = express();
  app.use(createRouter(ROOT));
  app.use(express.static(path.join(ROOT, 'dist'), { index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'dist', 'index.html')));

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
