import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDecisions } from './instructions.js';
import type { Reading } from '../ingest/types.js';

/** Sprayable unless overridden; ts given as a UTC hour on the sample day. */
const at = (hourUtc: number, over: Partial<Reading> = {}): Reading => ({
  ts: `2026-09-01T${String(hourUtc).padStart(2, '0')}:00:00.000Z`,
  tempC: 24,
  humidityPct: 50,
  wetBulbC: 18,
  wbgtC: 20,
  pressureHpa: 853,
  windSpeedMs: 1.2,
  windDirDeg: 110,
  windGustMs: 1.5,
  visCounts: 700,
  irCounts: 5000,
  rainMm: 0,
  ...over,
});

const calm = (h: number) => at(h, { windSpeedMs: 0 });
const noRain = new Set<string>();

test('advice points forward to a window that has not opened yet', () => {
  const day = [calm(6), calm(7), at(8), at(9)];
  // Evaluated at 07:00, the 08:00 window is still in the future.
  const d = buildDecisions(day, noRain, [calm(6), calm(7)]);
  assert.equal(d?.spray.status, 'wait');
  // 08:00 UTC renders as 11:00 East Africa Time.
  assert.match(d!.spray.headline, /wait until 11:00/);
});

test('a day whose windows have all passed says so', () => {
  const day = [at(6), calm(7), calm(8)];
  const d = buildDecisions(day, noRain, day);
  assert.equal(d?.spray.status, 'stop');
  assert.match(d!.spray.headline, /no safe window left/);
});

test('an open window reports only an end time that is still ahead', () => {
  const day = [at(8), at(9), at(10)];
  const mid = buildDecisions(day, noRain, [at(8), at(9)]);
  assert.equal(mid?.spray.status, 'go');
  assert.match(mid!.spray.headline, /until 13:00/);

  // At the final sample of the window there is no future end to promise.
  const end = buildDecisions(day, noRain, day);
  assert.equal(end?.spray.status, 'go');
  assert.equal(end!.spray.headline, 'Spray now');
});

test('every instruction carries a Swahili rendering', () => {
  const day = [at(8), at(9)];
  const d = buildDecisions(day, noRain, day);
  assert.ok(d!.spray.headlineSw.length > 0);
  assert.ok(d!.drying.headlineSw.length > 0);
  assert.notEqual(d!.spray.headlineSw, d!.spray.headline);
});

test('forecast rain overrides otherwise perfect spray conditions', () => {
  const day = [at(8), at(9)];
  const rainy = new Set(['2026-09-01T08', '2026-09-01T09']);
  const d = buildDecisions(day, rainy, day);
  assert.equal(d?.spray.status, 'stop');
  assert.match(d!.spray.detail, /rain/i);
});

test('no readings yields no decision rather than a fabricated one', () => {
  assert.equal(buildDecisions([], noRain), null);
});
