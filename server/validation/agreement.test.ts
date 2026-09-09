import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCsv } from '../ingest/parse.js';
import { buildAgreement } from './agreement.js';
import type { Reading } from '../ingest/types.js';

/**
 * The station's three thermometers, measured against each other.
 *
 * These figures are the evidence behind the claim that the calibration has
 * reached the instrument's noise floor. If a parse regression silently drops a
 * channel, or the spray thresholds move, the numbers on the model-check page
 * would quietly become wrong while the page still rendered. That is what this
 * file exists to prevent.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CSV = join(here, '..', '..', 'data', 'weatherdata_september.csv');

const sampleReadings = (): Reading[] => parseCsv(readFileSync(CSV, 'utf8'));

/** No rain forecast, so the rain gate never fires and the comparison is clean. */
const noRain = () => false;

function reading(over: Partial<Reading> = {}): Reading {
  return {
    ts: '2026-09-01T09:00:00.000Z',
    tempC: 20,
    humidityPct: 60,
    wetBulbC: 15,
    wbgtC: 18,
    pressureHpa: 850,
    windSpeedMs: 2,
    windDirDeg: 180,
    windGustMs: 3,
    visCounts: 400,
    irCounts: 300,
    rainMm: 0,
    ...over,
  };
}

test('spread is max minus min, and the median is the middle channel', () => {
  const a = buildAgreement(
    [reading({ temps: { bmxC: 19.4, mcpC: 19.8, shtC: 20.1 } })],
    noRain,
  );
  assert.ok(a);
  assert.equal(a.points[0].spreadC, 0.7);
  assert.equal(a.points[0].medianC, 19.8);
  assert.equal(a.meanSpreadC, 0.7);
});

test('a reading missing one channel is excluded, but still parses and counts elsewhere', () => {
  // A spread computed from two of three channels is a different quantity, so
  // the row is dropped from the comparison rather than partially used.
  const a = buildAgreement(
    [
      reading({ temps: { bmxC: 19.4, mcpC: 19.8, shtC: 20.1 } }),
      reading({ ts: '2026-09-01T09:15:00.000Z' }), // no temps at all
    ],
    noRain,
  );
  assert.ok(a);
  assert.equal(a.n, 1, 'only the complete reading is compared');
});

test('no reading carries three channels means null, not a spread of one instrument', () => {
  assert.equal(buildAgreement([reading()], noRain), null);
  assert.equal(buildAgreement([], noRain), null);
});

test('pair offsets are signed, and antisymmetric with their reverse', () => {
  const a = buildAgreement(
    [reading({ temps: { bmxC: 19.0, mcpC: 20.0, shtC: 21.0 } })],
    noRain,
  );
  assert.ok(a);
  const bmxMcp = a.pairs.find((p) => p.a === 'bmxC' && p.b === 'mcpC');
  assert.equal(bmxMcp?.meanOffsetC, -1, 'bmx reads 1 C below mcp');
  // The absolute error is the magnitude regardless of direction.
  assert.equal(bmxMcp?.maeC, 1);
});

test('the reference channel is flagged, and it is the one tempC reports', () => {
  const a = buildAgreement(
    [reading({ temps: { bmxC: 19.4, mcpC: 19.8, shtC: 20.1 } })],
    noRain,
  );
  assert.ok(a);
  const ref = a.channels.filter((c) => c.isReference);
  assert.equal(ref.length, 1);
  assert.equal(ref[0].id, 'bmxC');
  assert.equal(ref[0].sensor, 'BMX280');
});

test('robustness runs the real spray rule, so a Delta-T straddle is counted', () => {
  // Wet bulb 18, wind in range: channel Delta-Ts are 1.9 / 2.0 / 2.2 against a
  // 2.0 floor, so the temperature gate genuinely disagrees across channels.
  const a = buildAgreement(
    [
      reading({
        wetBulbC: 18,
        windSpeedMs: 2,
        temps: { bmxC: 19.9, mcpC: 20.0, shtC: 20.2 },
      }),
    ],
    noRain,
  );
  assert.ok(a);
  assert.equal(a.robustness.deltaTFlips, 1);
  assert.equal(a.robustness.verdictFlips, 1, 'wind passes, so the verdict flips too');
  assert.equal(a.robustness.evaluated, 1);
});

test('a failing wind gate masks a Delta-T disagreement in the final verdict', () => {
  // Same straddle, but wind is 0.2 m/s — below the 0.8 inversion floor. Every
  // channel says "do not spray", so the advice is unaffected even though the
  // thermometers disagree. This is why both counts are reported: the verdict
  // number alone would flatter the result.
  const a = buildAgreement(
    [
      reading({
        wetBulbC: 18,
        windSpeedMs: 0.2,
        temps: { bmxC: 19.9, mcpC: 20.0, shtC: 20.2 },
      }),
    ],
    noRain,
  );
  assert.ok(a);
  assert.equal(a.robustness.deltaTFlips, 1, 'the temperature gate still disagrees');
  assert.equal(a.robustness.verdictFlips, 0, 'but the wind gate decides it anyway');
});

test('the bundled day: every reading carries all three thermometers', () => {
  const a = buildAgreement(sampleReadings(), noRain);
  assert.ok(a);
  assert.equal(a.n, 95);
  assert.equal(a.points.length, 95);
});

test('the bundled day: spread figures match what the page claims', () => {
  const a = buildAgreement(sampleReadings(), noRain);
  assert.ok(a);
  // The headline number. If this moves, the noise-floor argument moves with it.
  assert.equal(a.meanSpreadC, 0.435);
  assert.equal(a.maxSpread?.spreadC, 1.6);
  assert.equal(a.maxSpread?.ts, '2026-09-01T12:29:57.000Z');
  assert.equal(a.minSpreadC, 0.1);
});

test('the bundled day: BMX runs cool, which is the cost of choosing it', () => {
  const a = buildAgreement(sampleReadings(), noRain);
  assert.ok(a);
  const bmx = a.channels.find((c) => c.id === 'bmxC');
  const sht = a.channels.find((c) => c.id === 'shtC');
  // tempC reports BMX, so the station reads 0.24 C cooler than a median of the
  // three would. The published model bias inherits that offset.
  assert.equal(bmx?.meanOffsetFromMedianC, -0.237);
  assert.ok(sht !== undefined && sht.meanOffsetFromMedianC > 0, 'SHT runs warm');

  const bmxMcp = a.pairs.find((p) => p.a === 'bmxC' && p.b === 'mcpC');
  assert.equal(bmxMcp?.meanOffsetC, -0.255);
});

test('the bundled day: both robustness counts, and they differ for a reason', () => {
  const a = buildAgreement(sampleReadings(), noRain);
  assert.ok(a);
  const rb = a.robustness;
  assert.equal(rb.evaluated, 95);

  // The advice survives the disagreement on all but one reading...
  assert.equal(rb.verdictFlips, 1);
  assert.deepEqual(rb.verdictFlippedAt, ['2026-09-01T23:40:21.000Z']);

  // ...but on the temperature gate alone it does not, eleven times. Reporting
  // only the first number would hide that most of the agreement comes from the
  // wind gate failing anyway.
  assert.equal(rb.deltaTFlips, 11);
  assert.ok(rb.deltaTFlips > rb.verdictFlips);

  // If SPRAY.deltaTMin or windMinMs ever change, these failing is correct:
  // the robustness claim on the page would genuinely have changed.
});

test('the bundled day: daylight spread is reported, with no mechanism attached', () => {
  const a = buildAgreement(sampleReadings(), noRain);
  assert.ok(a);
  // Reported as an observation only. A ventilation explanation was tested
  // against this sample and failed — see the module docstring.
  assert.ok(a.daylightMeanSpreadC > a.nightMeanSpreadC);
  assert.ok(a.daylightMeanSpreadC < 0.6, 'and the difference stays small');
});
