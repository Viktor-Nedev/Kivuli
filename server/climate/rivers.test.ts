import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRiverOutlook } from './rivers.js';

/**
 * The load-bearing case here is the absence one. Open-Meteo answers points
 * with no modelled reach with a flat 0.00 m³/s, and rendering that as a gauge
 * would present missing data as a measurement.
 */

const daily = (values: number[]) => ({
  time: values.map((_, i) => `2026-09-${String(7 + i).padStart(2, '0')}`),
  river_discharge: values as (number | null)[],
});

test('an all-zero series is reported as no reach, never as zero flow', () => {
  // The measured JKUAT case: the campus is not on a modelled river.
  const o = buildRiverOutlook(daily([0, 0, 0, 0, 0, 0, 0]), 'JKUAT');
  assert.equal(o.hasReach, false);
  assert.equal(o.peakDate, null);
  assert.match(o.headline, /not on a modelled river/i);
  assert.match(o.detail, /absence of data/i);
  assert.doesNotMatch(o.headline, /0(\.0+)? m³\/s/, 'must not present the zero as a reading');
});

test('a real reach reports its peak and when it falls', () => {
  // The measured Nyando/Kisumu shape.
  const o = buildRiverOutlook(daily([12, 18, 39.93, 25, 20, 16, 14]), 'Kisumu');
  assert.equal(o.hasReach, true);
  assert.equal(o.peakCumecs, 39.93);
  assert.equal(o.peakDate, '2026-09-09');
  assert.ok(o.riseFactor && o.riseFactor > 1);
});

test('a sharp rise is named as rising, a flat week is not', () => {
  const spike = buildRiverOutlook(daily([5, 5, 60, 5, 5, 5, 5]), 'Kisumu');
  const flat = buildRiverOutlook(daily([20, 20, 21, 20, 20, 20, 20]), 'Kisumu');
  assert.match(spike.headline, /rising/i);
  assert.match(flat.headline, /steady/i);
});

test('the claim is always scoped to the catchment, never to a field', () => {
  for (const values of [[0, 0, 0], [5, 50, 5]]) {
    const o = buildRiverOutlook(daily(values), 'Kisumu');
    assert.match(o.detail, /field|catchment/i, 'the scope limit must be stated');
    assert.doesNotMatch(o.headline, /your (land|farm|field)/i);
  }
});

test('Swahili is present in both the reach and no-reach cases', () => {
  assert.ok(buildRiverOutlook(daily([0, 0]), 'JKUAT').headlineSw.length > 0);
  assert.ok(buildRiverOutlook(daily([9, 9]), 'Kisumu').headlineSw.length > 0);
});
