import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOffsets, runScenario, NO_OFFSETS, SCENARIO_LIMITS } from './scenario.js';
import { HEAT_FIRST_RESTRICTION_C } from '../indices/heat.js';
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
  temps: { bmxC: 24, mcpC: 24.2, shtC: 24.1 },
  ...over,
});

const day = (over: Partial<Reading> = {}) =>
  Array.from({ length: 12 }, (_, i) =>
    reading({ ts: `2026-09-01T${String(8 + i).padStart(2, '0')}:00:00.000Z`, ...over }),
  );

test('no offsets leaves the day exactly as measured', () => {
  const r = runScenario(day(), false, NO_OFFSETS);
  assert.ok(r);
  assert.equal(r.isMeasured, true);
  assert.deepEqual(r.scenario, r.measured);
});

test('a scenario always reports the measured day beside it', () => {
  // A scenario figure alone invites being read as a measurement. Next to the
  // real one it can only be read as a comparison.
  const r = runScenario(day(), false, { tempC: 6, windMs: 0, humidityPct: 0 });
  assert.ok(r);
  assert.equal(r.isMeasured, false);
  assert.ok(r.measured);
  assert.notDeepEqual(r.scenario, r.measured);
});

test('warming the day can push heat past the work/rest threshold', () => {
  // The point of the feature: measured WBGT never reaches 28 C at this site,
  // so this is the only honest way to show the detector working.
  const cool = runScenario(day(), false, NO_OFFSETS);
  assert.ok(cool && cool.measured.heatFires === false);

  const hot = runScenario(day(), false, { tempC: 12, windMs: 0, humidityPct: 20 });
  assert.ok(hot);
  assert.ok(hot.scenario.peakWbgtC > cool.measured.peakWbgtC);
  assert.ok(hot.scenario.peakWbgtC >= HEAT_FIRST_RESTRICTION_C, 'should cross the ISO band');
  assert.equal(hot.scenario.heatFires, true);
  // The measured half must stay honest while the scenario half changes.
  assert.equal(hot.measured.heatFires, false);
});

test('raising wind out of the safe band closes the spray window', () => {
  const calm = runScenario(day({ windSpeedMs: 2 }), false, NO_OFFSETS);
  assert.ok(calm && calm.measured.sprayOk > 0);

  const gale = runScenario(day({ windSpeedMs: 2 }), false, { tempC: 0, windMs: 8, humidityPct: 0 });
  assert.ok(gale);
  assert.equal(gale.scenario.sprayOk, 0);
  assert.match(gale.scenario.commonestBlocker ?? '', /wind/i);
});

test('offsets are clamped to conditions this site could plausibly see', () => {
  const r = runScenario(day(), false, { tempC: 999, windMs: 999, humidityPct: 999 });
  assert.ok(r);
  assert.equal(r.offsets.tempC, SCENARIO_LIMITS.tempC.max);
  assert.equal(r.offsets.windMs, SCENARIO_LIMITS.windMs.max);
  assert.equal(r.offsets.humidityPct, SCENARIO_LIMITS.humidityPct.max);
});

test('shifted readings stay physically coherent', () => {
  const shifted = applyOffsets(reading(), { tempC: 8, windMs: 2, humidityPct: 10 });
  // Wet bulb can never exceed dry bulb, whatever the sliders say.
  assert.ok(shifted.wetBulbC <= shifted.tempC);
  assert.ok(shifted.humidityPct <= 100 && shifted.humidityPct > 0);
  // WBGT has to move with the heat rather than keeping its measured value.
  assert.ok(shifted.wbgtC > reading().wbgtC);
  // Wind cannot go negative however far the slider is pulled down.
  assert.equal(applyOffsets(reading(), { tempC: 0, windMs: -99, humidityPct: 0 }).windSpeedMs, 0);
});

test('the instrument spread is dropped from a scenario reading', () => {
  // Three thermometers agreeing to 0.2 C describes the hardware under
  // conditions that actually occurred. Carrying it into an invented day would
  // imply the sensors were read then.
  const shifted = applyOffsets(reading(), { tempC: 5, windMs: 0, humidityPct: 0 });
  assert.equal(shifted.temps, undefined);
});

test('an empty day yields no scenario rather than an empty one', () => {
  assert.equal(runScenario([], false, NO_OFFSETS), null);
});
