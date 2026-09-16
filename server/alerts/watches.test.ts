import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWatches, heatWatch, rainWatch, riverWatch, sprayWatch } from './watches.js';
import { HEAT_FIRST_RESTRICTION_C } from '../indices/heat.js';
import type { Reading } from '../ingest/types.js';
import type { RainOutlook } from '../climate/rainOutlook.js';
import type { RiverOutlook } from '../climate/rivers.js';

const reading = (over: Partial<Reading> = {}): Reading => ({
  ts: '2026-09-01T10:00:00.000Z',
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

const outlook = (over: Partial<RainOutlook> = {}): RainOutlook => ({
  level: 'none',
  peakDayMm: 2,
  peakDate: '2026-09-02',
  totalMm: 4,
  peakPercentile: 40,
  thresholds: [
    { mm: 12, exceedances: 48, everyMonths: 2.8 },
    { mm: 25, exceedances: 9, everyMonths: 14.7 },
  ],
  referenceYears: 11,
  horizonDays: 7,
  headline: 'No heavy rain in the next 7 days',
  headlineSw: 'Hakuna mvua kubwa',
  detail: 'detail',
  detailSw: 'maelezo',
  ...over,
});

// --- the firing path -------------------------------------------------------

test('heat fires once WBGT reaches the first work/rest band', () => {
  const w = heatWatch([reading({ wbgtC: HEAT_FIRST_RESTRICTION_C + 1 })]);
  assert.equal(w.state, 'firing');
  // A firing watch has no margin to report: it is already over.
  assert.equal(w.marginToFire, null);
  assert.match(w.summary, /rest/i);
});

test('spray fires when no reading in the whole day is suitable', () => {
  // Still air is an inversion risk, so every reading fails.
  const day = [reading({ windSpeedMs: 0.1 }), reading({ windSpeedMs: 0.2 })];
  const w = sprayWatch(day, false);
  assert.equal(w.state, 'firing');
  assert.equal(w.value, 0);
  // The commonest blocker is named, so the reader knows what to watch for.
  assert.match(w.summary, /inversion/i);
});

test('rain fires on heavy but stays clear on a merely wet day', () => {
  assert.equal(rainWatch(outlook({ level: 'heavy' })).state, 'firing');
  // `notable` is worth reading and not worth a warning; a watch that fired on
  // every wet day in Juja would be ignored within a fortnight.
  assert.equal(rainWatch(outlook({ level: 'notable' })).state, 'clear');
});

// --- the clear path, which must prove the detector ran ---------------------

test('a clear heat watch reports how far it is from firing', () => {
  const w = heatWatch([reading({ wbgtC: 21.5 })]);
  assert.equal(w.state, 'clear');
  assert.equal(w.threshold, HEAT_FIRST_RESTRICTION_C);
  assert.equal(w.marginToFire, Number((HEAT_FIRST_RESTRICTION_C - 21.5).toFixed(1)));
  // The distance belongs in the sentence too. On the bundled sample day every
  // watch is clear, and a detector that prints nothing then is
  // indistinguishable from one that is broken.
  assert.match(w.summary, /below the/i);
});

test('heat reports the peak of the day, not the last reading', () => {
  const w = heatWatch([reading({ wbgtC: 26 }), reading({ wbgtC: 19 })]);
  assert.equal(w.value, 26);
});

// --- the degraded path ----------------------------------------------------

test('watches report unavailable rather than guessing when data is missing', () => {
  const noReadings = heatWatch([]);
  assert.equal(noReadings.state, 'unavailable');
  assert.equal(noReadings.value, null);
  assert.ok(noReadings.reason);

  const noForecast = rainWatch(null);
  assert.equal(noForecast.state, 'unavailable');
  assert.equal(noForecast.value, null);
});

test('no modelled river reach is unavailable, never a green all-clear', () => {
  const river: RiverOutlook = {
    hasReach: false,
    days: [],
    peakCumecs: 0,
    peakDate: null,
    riseFactor: null,
    headline: 'No modelled reach',
    headlineSw: 'Hakuna mto',
    detail: 'There is no major river reach at this point.',
  };
  const w = riverWatch(river);
  // This is the JKUAT case. Saying "clear" would claim the river was checked
  // and found fine, which is a different statement from "not checked".
  assert.equal(w.state, 'unavailable');
  assert.ok(w.reason);
});

// --- the thresholds must come from one place ------------------------------

test('the heat watch cites the same threshold the index defines', () => {
  const w = heatWatch([reading({ wbgtC: 20 })]);
  assert.equal(w.threshold, HEAT_FIRST_RESTRICTION_C);
  assert.match(w.summary, new RegExp(String(HEAT_FIRST_RESTRICTION_C)));
});

test('buildWatches returns every watch, each with a state', () => {
  const all = buildWatches({
    readings: [reading()],
    rainWithinLookahead: false,
    rain: outlook(),
    river: null,
  });
  assert.equal(all.length, 4);
  assert.deepEqual(
    all.map((w) => w.id),
    ['heat', 'spray', 'rain', 'river'],
  );
  for (const w of all) {
    assert.ok(['firing', 'clear', 'unavailable'].includes(w.state));
    assert.ok(w.summary.length > 0, `${w.id} must say something`);
  }
});
