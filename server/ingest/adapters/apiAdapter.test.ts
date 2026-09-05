import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiAdapter } from './apiAdapter.js';

/**
 * Tests for the live Conduit feed.
 *
 * This path is the one that matters in production and the one that was never
 * exercised: `fetchRange` guesses at three possible payload shapes
 * (`[...]`, `{data: [...]}`, `{records: [...]}`) because the station's real
 * response envelope was unknown when it was written. A guess with no test is
 * just a hope, so each branch is pinned here — and so is the behaviour that
 * matters more than any of them: that a rejection from the station is
 * surfaced verbatim rather than quietly swallowed into empty sample data.
 */

/** One valid station row. Only the three required fields must be present. */
function row(over: Record<string, string> = {}): Record<string, string> {
  return {
    ts: '2026-09-01T09:00:00Z',
    temp_bmx: '21.4',
    humidity_sht: '62.0',
    wet_bulb_temp: '16.8',
    wet_bulb_globe_temp: '19.1',
    press_bmx: '853.0',
    wind_spd: '1.2',
    wind_dir: '110',
    wind_gust: '2.0',
    si1145_vis: '700',
    si1145_ir: '520',
    rg1tp: '0',
    rg2tp: '0',
    ...over,
  };
}

/**
 * Replaces global fetch for one assertion and hands back a restore function.
 * Always call it in a `finally` — a leaked stub would silently poison every
 * later test file in the same process.
 */
function stubFetch(status: number, body: unknown, contentIsJson = true) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(contentIsJson ? JSON.stringify(body) : String(body), {
      status,
      headers: { 'Content-Type': contentIsJson ? 'application/json' : 'text/html' },
    })) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

const adapter = () => new ApiAdapter('test-key', 'test@example.com');
const DAY = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-09-01T23:59:00Z') };

test('a bare array payload is parsed', async () => {
  const restore = stubFetch(200, [row()]);
  try {
    const rows = await adapter().getHistory(DAY.from, DAY.to);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tempC, 21.4);
  } finally {
    restore();
  }
});

test('rows wrapped under data are parsed', async () => {
  const restore = stubFetch(200, { data: [row(), row({ ts: '2026-09-01T10:00:00Z' })] });
  try {
    const rows = await adapter().getHistory(DAY.from, DAY.to);
    assert.equal(rows.length, 2);
  } finally {
    restore();
  }
});

test('rows wrapped under records are parsed', async () => {
  const restore = stubFetch(200, { records: [row()] });
  try {
    const rows = await adapter().getHistory(DAY.from, DAY.to);
    assert.equal(rows.length, 1);
  } finally {
    restore();
  }
});

test("the station's own rejection is surfaced verbatim, not swallowed", async () => {
  // The real 401 body. Falling back to sample data here would present a
  // credentials failure as a working station, which is the exact dishonesty
  // this project refuses everywhere else.
  const restore = stubFetch(401, { status: 'error', message: 'Wrong Email or APIKey' });
  try {
    await assert.rejects(
      () => adapter().getHistory(DAY.from, DAY.to),
      (err: Error) => {
        assert.match(err.message, /Wrong Email or APIKey/);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('an error status in a 200 body is still treated as a rejection', async () => {
  // data.php has been observed answering 200 with an error envelope, so the
  // HTTP status alone is not a sufficient health signal.
  const restore = stubFetch(200, { status: 'error', message: 'Quota exceeded' });
  try {
    await assert.rejects(
      () => adapter().getHistory(DAY.from, DAY.to),
      (err: Error) => {
        assert.match(err.message, /Quota exceeded/);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('a non-JSON body reports the status and a snippet rather than a parse error', async () => {
  // A gateway error page is HTML. `JSON.parse` would throw "Unexpected token
  // <", which tells an operator nothing about what actually happened.
  const restore = stubFetch(502, '<html><body>Bad Gateway</body></html>', false);
  try {
    await assert.rejects(
      () => adapter().getHistory(DAY.from, DAY.to),
      (err: Error) => {
        assert.match(err.message, /non-JSON/);
        assert.match(err.message, /502/);
        return true;
      },
    );
  } finally {
    restore();
  }
});

test('readings come back in timestamp order regardless of payload order', async () => {
  const restore = stubFetch(200, [
    row({ ts: '2026-09-01T12:00:00Z' }),
    row({ ts: '2026-09-01T08:00:00Z' }),
    row({ ts: '2026-09-01T10:00:00Z' }),
  ]);
  try {
    const rows = await adapter().getHistory(DAY.from, DAY.to);
    const stamps = rows.map((r) => r.ts);
    assert.deepEqual(stamps, [...stamps].sort());
  } finally {
    restore();
  }
});

test('rows missing a required field are dropped rather than emitted as holes', async () => {
  const restore = stubFetch(200, [row(), { ts: '2026-09-01T11:00:00Z' }]);
  try {
    const rows = await adapter().getHistory(DAY.from, DAY.to);
    assert.equal(rows.length, 1, 'the row with no temperature cannot produce a decision');
  } finally {
    restore();
  }
});

test('getLatest returns the most recent reading, or null when there are none', async () => {
  const restore = stubFetch(200, [
    row({ ts: '2026-09-01T08:00:00Z' }),
    row({ ts: '2026-09-01T12:00:00Z' }),
  ]);
  try {
    const latest = await adapter().getLatest();
    assert.equal(latest?.ts, '2026-09-01T12:00:00.000Z');
  } finally {
    restore();
  }

  const restoreEmpty = stubFetch(200, []);
  try {
    assert.equal(await adapter().getLatest(), null);
  } finally {
    restoreEmpty();
  }
});
