import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCsv } from '../ingest/parse.js';
import { SITE } from '../forecast/openMeteo.js';
import { buildSolarCrossCheck, sinSolarElevation } from './crosscheck.js';
import type { Reading } from '../ingest/types.js';

/**
 * The claims this panel makes about the bundled day, pinned.
 *
 * Every figure below was computed independently in Python against the same CSV
 * before the TypeScript existed, and the two agree exactly. If a parse change
 * or a threshold edit moves them, the page's copy becomes wrong while still
 * rendering confidently — which is the failure mode worth a test.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CSV = join(here, '..', '..', 'data', 'weatherdata_september.csv');
const sample = (): Reading[] => parseCsv(readFileSync(CSV, 'utf8'));

const DAY = [{ date: '2026-09-01', allSkyMJ: 19.7 }];

function reading(over: Partial<Reading> = {}): Reading {
  return {
    ts: '2026-09-01T09:00:00.000Z',
    tempC: 22,
    humidityPct: 55,
    wetBulbC: 16,
    wbgtC: 18,
    pressureHpa: 853,
    windSpeedMs: 1.5,
    windDirDeg: 120,
    windGustMs: 2,
    visCounts: 600,
    irCounts: 3000,
    rainMm: 0,
    ...over,
  };
}

test('the sun is up at local midday and down at local midnight', () => {
  // Sanity on the astronomy before anything is built on it. JKUAT is at
  // longitude 37, so solar noon lands near 09:00 UTC.
  const noon = sinSolarElevation('2026-09-01T09:00:00.000Z', SITE);
  const night = sinSolarElevation('2026-09-01T21:00:00.000Z', SITE);
  assert.ok(noon > 0.9, `midday elevation should be high, got ${noon}`);
  assert.equal(night, 0, 'below the horizon must clamp to zero, not go negative');
});

test('the bundled day: the sensor tracks the sun', () => {
  const c = buildSolarCrossCheck(sample(), DAY, SITE)!;
  assert.ok(c);
  // Computed independently in Python on the same CSV: r = 0.727 across 46
  // daylight samples. This is the number the panel prints.
  assert.equal(c.daylightAgreement, 0.727);
  assert.equal(c.daylightSamples, 46);
});

test('the bundled day: the station sees cloud the satellite cannot', () => {
  const c = buildSolarCrossCheck(sample(), DAY, SITE)!;
  // Ten sharp falls inside a single 15-minute step. A daily satellite mean
  // averages every one of them away — which is the panel's argument.
  assert.equal(c.cloudEvents, 10);
  assert.equal(c.peakCounts, 894);
});

test('night hours are excluded, and excluding them lowers the figure', () => {
  // Including night pairs both series near zero and inflates r to ~0.87
  // without describing anything: a sensor agreeing the sun is down is not
  // evidence it tracks the sun. The daylight-only figure is the honest one.
  const c = buildSolarCrossCheck(sample(), DAY, SITE)!;
  assert.ok(c.daylightSamples < sample().length, 'night samples must be dropped');
  assert.ok(
    c.daylightAgreement! < 0.87,
    'the daylight figure must not be the inflated all-hours one',
  );
});

test('a satellite fill is reported as unavailable, not as zero', () => {
  const c = buildSolarCrossCheck(sample(), [{ date: '2026-09-01', allSkyMJ: null }], SITE)!;
  assert.equal(c.satelliteMJ, null);
  assert.match(c.unavailable ?? '', /no usable value/i);
  // The station half still stands on its own — the satellite is a second
  // opinion, not a dependency.
  assert.equal(c.cloudEvents, 10);
});

test('a flat sensor yields no correlation rather than a false zero', () => {
  // A stuck sensor has no shape to correlate. Reporting 0 would read as
  // "disagrees with the sun"; null reads as "not answerable".
  const flat = Array.from({ length: 20 }, (_, i) =>
    reading({ ts: `2026-09-01T0${(6 + Math.floor(i / 4)) % 10}:${(i % 4) * 15}:00.000Z`, visCounts: 500 }),
  );
  const c = buildSolarCrossCheck(flat, DAY, SITE)!;
  assert.equal(c.daylightAgreement, null);
});

test('a fall after sunset is not counted as cloud', () => {
  // The sun going down is not a cloud passing. At longitude 37 the sun is
  // still up at 15:00 UTC (elevation 0.135) and below the horizon by 16:00,
  // so the fall below has to sit after that boundary to be a dusk fall.
  const dusk = [
    reading({ ts: '2026-09-01T16:00:00.000Z', visCounts: 500 }),
    reading({ ts: '2026-09-01T16:15:00.000Z', visCounts: 260 }),
    reading({ ts: '2026-09-01T16:30:00.000Z', visCounts: 260 }),
  ];
  const c = buildSolarCrossCheck(dusk, DAY, SITE)!;
  assert.equal(c.cloudEvents, 0);
});

test('a fall while the sun is still up is counted', () => {
  // The mirror of the test above: same drop, one hour earlier, when the sun
  // is genuinely up. If this stopped firing the cloud count would silently
  // fall to zero and the panel's argument would evaporate.
  const midday = [
    reading({ ts: '2026-09-01T09:00:00.000Z', visCounts: 800 }),
    reading({ ts: '2026-09-01T09:15:00.000Z', visCounts: 450 }),
  ];
  assert.equal(buildSolarCrossCheck(midday, DAY, SITE)!.cloudEvents, 1);
});

test('no readings means no comparison, not an empty one', () => {
  assert.equal(buildSolarCrossCheck([], DAY, SITE), null);
});
