import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NasaPowerClient, parseSolarDays } from './power.js';
import { SITE } from '../forecast/openMeteo.js';

/**
 * The fill value is the whole risk in this module.
 *
 * NASA POWER reports -999 where it has nothing. It is a number, it parses, it
 * averages, and it looks entirely plausible in a JSON payload — so a fill that
 * reaches a chart would render as a confident reading of a day nobody
 * observed. Everything below exists to keep that from happening quietly.
 */

const envelope = (values: Record<string, number>) => ({
  properties: { parameter: { ALLSKY_SFC_SW_DWN: values } },
  header: { sources: ['FLASHFLUX'] },
});

function stubNetwork(body: unknown): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function severNetwork(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('ENETUNREACH (simulated venue network)');
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const fixture = () => mkdtemp(path.join(tmpdir(), 'kivuli-solar-'));

test('a fill value becomes null, never a number', () => {
  const days = parseSolarDays(envelope({ '20260901': -999 }));
  assert.equal(days.length, 1);
  // Not 0, not -999, not dropped: null, so a consumer can say "no reading"
  // rather than draw a very dark day.
  assert.equal(days[0].allSkyMJ, null);
});

test('a real value survives intact', () => {
  const days = parseSolarDays(envelope({ '20260901': 19.7 }));
  assert.equal(days[0].allSkyMJ, 19.7);
  assert.equal(days[0].date, '2026-09-01');
});

test('fills and readings in the same response are separated, not averaged', () => {
  const days = parseSolarDays(
    envelope({ '20260901': 19.7, '20260902': -999, '20260903': 21.3 }),
  );
  assert.deepEqual(
    days.map((d) => d.allSkyMJ),
    [19.7, null, 21.3],
  );
  // The mean of the usable days is 20.5. If the fill had leaked in it would
  // be -319.3, which is the kind of number that survives a code review.
  const usable = days.map((d) => d.allSkyMJ).filter((v): v is number => v !== null);
  assert.equal(usable.length, 2);
});

test('a negative that is not the fill is still refused', () => {
  // Irradiance cannot be negative. Whatever it means, it is not a reading.
  assert.equal(parseSolarDays(envelope({ '20260901': -12 }))[0].allSkyMJ, null);
});

test('dates are returned in order, whatever the object key order', () => {
  const days = parseSolarDays(envelope({ '20260903': 3, '20260901': 1, '20260902': 2 }));
  assert.deepEqual(days.map((d) => d.date), ['2026-09-01', '2026-09-02', '2026-09-03']);
});

test('an unrecognised envelope yields nothing rather than throwing', () => {
  // POWER changing shape must cost this panel, not the page it sits on.
  assert.deepEqual(parseSolarDays({}), []);
  assert.deepEqual(parseSolarDays(null), []);
  assert.deepEqual(parseSolarDays({ properties: {} }), []);
});

test('the client caches under its own prefix, so no other route is disturbed', async () => {
  const dir = await fixture();
  const restore = stubNetwork(envelope({ '20260901': 19.7 }));
  try {
    const client = new NasaPowerClient(dir);
    await client.dailySolar(SITE, '2026-09-01', '2026-09-01');
  } finally {
    restore();
  }

  const files = await readdir(dir);
  assert.equal(files.length, 1);
  // `solar_` and the site key: the same discipline the archive cache follows,
  // so one location can never serve another's figures.
  assert.match(files[0], /^solar_-1\.095_37\.014_2026-09-01_2026-09-01\.json$/);
});

test('a dead network falls back to the warm cache rather than failing', async () => {
  const dir = await fixture();
  await writeFile(
    path.join(dir, 'solar_-1.095_37.014_2026-09-01_2026-09-01.json'),
    JSON.stringify({ at: 0, body: envelope({ '20260901': 19.7 }) }),
  );

  const restore = severNetwork();
  try {
    const client = new NasaPowerClient(dir);
    const days = await client.dailySolar(SITE, '2026-09-01', '2026-09-01');
    // `at: 0` is long expired, so this can only be the stale-fallback path.
    assert.equal(days[0].allSkyMJ, 19.7);
  } finally {
    restore();
  }
});

test('a dead network with no cache reports the failure', async () => {
  // Degrading to a stale reading is right; inventing one is not.
  const dir = await fixture();
  const restore = severNetwork();
  try {
    const client = new NasaPowerClient(dir);
    await assert.rejects(() => client.dailySolar(SITE, '2026-09-01', '2026-09-01'));
  } finally {
    restore();
  }
});
