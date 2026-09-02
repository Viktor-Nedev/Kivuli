import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessSpray, sprayWindows, deltaT } from './spray.js';
import { assessDrying, bestDryingWindow } from './drying.js';
import { assessHeat, assessThi, thi, wbgtShade } from './heat.js';
import type { Reading } from '../ingest/types.js';

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

test('delta-T is dry bulb minus measured wet bulb', () => {
  assert.equal(deltaT(reading({ tempC: 24, wetBulbC: 18 })), 6);
});

test('still air fails as inversion risk, not as ideal conditions', () => {
  const a = assessSpray(reading({ windSpeedMs: 0.3 }), false);
  assert.equal(a.pass, false);
  assert.ok(a.failures.includes('wind_inversion'));
  assert.match(a.reason, /inversion/i);
});

test('spray passes only inside both the delta-T and wind bands', () => {
  assert.equal(assessSpray(reading(), false).pass, true);
  // Delta-T too low.
  assert.equal(assessSpray(reading({ wetBulbC: 23 }), false).pass, false);
  // Delta-T too high.
  assert.equal(assessSpray(reading({ wetBulbC: 12 }), false).pass, false);
  // Wind too strong.
  assert.equal(assessSpray(reading({ windSpeedMs: 6 }), false).pass, false);
});

test('forecast rain blocks spraying even when the air is right', () => {
  const a = assessSpray(reading(), true);
  assert.equal(a.pass, false);
  assert.ok(a.failures.includes('rain_forecast'));
});

test('spray windows group consecutive passing samples', () => {
  const pass = (ts: string) => assessSpray(reading({ ts }), false);
  const fail = (ts: string) => assessSpray(reading({ ts, windSpeedMs: 0 }), false);
  const windows = sprayWindows([
    pass('2026-09-01T08:00:00.000Z'),
    pass('2026-09-01T08:15:00.000Z'),
    fail('2026-09-01T08:30:00.000Z'),
    pass('2026-09-01T09:00:00.000Z'),
  ]);
  assert.equal(windows.length, 2);
  assert.equal(windows[0].start, '2026-09-01T08:00:00.000Z');
  assert.equal(windows[0].end, '2026-09-01T08:15:00.000Z');
});

test('drying needs both dry air and real sunlight', () => {
  assert.equal(assessDrying(reading(), false).pass, true);
  // Dry air but the sun has gone: this is the case that shortens the real
  // sample day's window from 18:36 to 14:47 UTC.
  const dusk = assessDrying(reading({ humidityPct: 55, visCounts: 260 }), false);
  assert.equal(dusk.pass, false);
  assert.match(dusk.reason, /sunlight/i);
  // Sun but damp air.
  assert.equal(assessDrying(reading({ humidityPct: 75 }), false).pass, false);
});

test('best drying window picks the longest continuous run', () => {
  const wet = (ts: string) => assessDrying(reading({ ts, humidityPct: 90 }), false);
  const dry = (ts: string) => assessDrying(reading({ ts }), false);
  const w = bestDryingWindow([
    dry('2026-09-01T06:00:00.000Z'),
    wet('2026-09-01T07:00:00.000Z'),
    dry('2026-09-01T08:00:00.000Z'),
    dry('2026-09-01T09:00:00.000Z'),
    dry('2026-09-01T10:00:00.000Z'),
  ]);
  assert.equal(w?.start, '2026-09-01T08:00:00.000Z');
  assert.equal(w?.end, '2026-09-01T10:00:00.000Z');
});

test('heat bands follow ISO 7243 thresholds', () => {
  assert.equal(assessHeat(reading({ wbgtC: 21.5 })).band, 'continuous');
  assert.equal(assessHeat(reading({ wbgtC: 29 })).band, 'work45_rest15');
  assert.equal(assessHeat(reading({ wbgtC: 31 })).band, 'work30_rest30');
  assert.equal(assessHeat(reading({ wbgtC: 32 })).band, 'work15_rest45');
  assert.equal(assessHeat(reading({ wbgtC: 34 })).band, 'stop');
});

test('shade WBGT estimate stands in only when the sensor value is missing', () => {
  const measured = assessHeat(reading({ wbgtC: 20 }));
  assert.equal(measured.wbgtC, 20);
  const estimated = assessHeat(reading({ wbgtC: NaN, tempC: 24, humidityPct: 50 }));
  assert.ok(Math.abs(estimated.wbgtC - wbgtShade(24, 50)) < 0.1);
});

test('THI bands match the dairy reference scale', () => {
  assert.equal(assessThi(reading({ tempC: 20, humidityPct: 50 })).band, 'none');
  assert.ok(thi(30, 60) > 72);
  assert.equal(assessThi(reading({ tempC: 30, humidityPct: 60 })).band, 'moderate');
});
