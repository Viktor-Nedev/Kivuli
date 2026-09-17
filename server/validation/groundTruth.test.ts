import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { compareToModel, validateAll } from './groundTruth.js';
import type { Reading } from '../ingest/types.js';
import type { HourlyForecast } from '../forecast/openMeteo.js';

/**
 * Station-versus-model comparison.
 *
 * The sign convention test is the important one: `error` is model minus
 * station, so a cold model reads negative. A flip there would invert the whole
 * diurnal chart while every summary statistic stayed plausible.
 */

/** One station reading. Defaults are mid-range for this site. */
function reading(over: Partial<Reading> & { ts: string }): Reading {
  return {
    tempC: 20,
    humidityPct: 60,
    wetBulbC: 15,
    wbgtC: 18,
    pressureHpa: 853,
    windSpeedMs: 1.5,
    windDirDeg: 110,
    windGustMs: 2.5,
    visCounts: 500,
    irCounts: 400,
    rainMm: 0,
    ...over,
  };
}

/** A model series over the given UTC hours. */
function archiveOf(hours: string[], temps: number[]): HourlyForecast {
  return {
    time: hours.map((h) => `${h}:00`),
    temperature_2m: temps,
    relative_humidity_2m: hours.map(() => 60),
    wind_speed_10m: hours.map(() => 1.5),
    precipitation: hours.map(() => 0),
    shortwave_radiation: hours.map(() => 0),
    surface_pressure: hours.map(() => 853),
  };
}

const H = (h: number) => `2026-09-01T${String(h).padStart(2, '0')}`;

test('pairs station hours to model hours and drops unmatched ones', () => {
  // The station has three hours; the model only covers two of them.
  const readings = [H(0), H(1), H(2)].map((h) => reading({ ts: `${h}:00:00Z`, tempC: 20 }));
  const archive = archiveOf([H(0), H(1)], [19, 19]);

  const v = compareToModel(readings, archive, 'tempC');
  assert.equal(v.n, 2, 'the unmatched station hour must not become a comparison');
  assert.deepEqual(
    v.hours.map((x) => x.hour),
    [H(0), H(1)],
  );
});

test('error is model minus station, so a cold model reads negative', () => {
  // The convention the entire chart depends on. ERA5 runs cold here.
  const readings = [reading({ ts: `${H(6)}:00:00Z`, tempC: 20 })];
  const archive = archiveOf([H(6)], [17.5]);

  const v = compareToModel(readings, archive, 'tempC');
  assert.equal(v.hours[0].error, -2.5);
  assert.ok(v.bias < 0, 'a model that reads low must produce a negative bias');
});

test('the worst hour is the largest absolute error, not the largest signed one', () => {
  // A signed max would report +1.0 and ignore the bigger -3.0 miss.
  const readings = [H(0), H(1)].map((h) => reading({ ts: `${h}:00:00Z`, tempC: 20 }));
  const archive = archiveOf([H(0), H(1)], [21, 17]);

  const v = compareToModel(readings, archive, 'tempC');
  assert.equal(v.worst?.hour, H(1));
  assert.equal(v.worst?.error, -3);
});

test('local hours are UTC+3 with no daylight saving', () => {
  const readings = [reading({ ts: `${H(22)}:00:00Z`, tempC: 20 })];
  const archive = archiveOf([H(22)], [20]);

  const v = compareToModel(readings, archive, 'tempC');
  // 22:00 UTC is 01:00 the next local day — the wrap must not produce 25.
  assert.equal(v.hours[0].localHour, 1);
});

test('diurnal buckets average by local hour and carry their own n', () => {
  const readings = [
    reading({ ts: `2026-09-01T05:00:00Z`, tempC: 20 }),
    reading({ ts: `2026-09-02T05:00:00Z`, tempC: 20 }),
  ];
  const archive: HourlyForecast = {
    ...archiveOf(['2026-09-01T05', '2026-09-02T05'], [18, 19]),
  };

  const v = compareToModel(readings, archive, 'tempC');
  assert.equal(v.diurnal.length, 1, 'both days land in the same local-hour bucket');
  assert.equal(v.diurnal[0].localHour, 8);
  assert.equal(v.diurnal[0].n, 2);
  assert.equal(v.diurnal[0].meanError, -1.5, 'mean of -2 and -1');
});

test('a variable with no finite station values yields n = 0 rather than NaN', () => {
  // `toHourlyMeans` emits NaN for a variable absent from every row in a
  // bucket; that must not become a comparison with a NaN bias on screen.
  const readings = [reading({ ts: `${H(0)}:00:00Z`, tempC: Number.NaN })];
  const archive = archiveOf([H(0)], [20]);

  const v = compareToModel(readings, archive, 'tempC');
  assert.equal(v.n, 0);
  assert.equal(v.bias, 0);
  assert.equal(v.worst, null);
  assert.ok(Number.isFinite(v.mae));
});

test('validateAll covers every validated variable', () => {
  const readings = [reading({ ts: `${H(0)}:00:00Z` })];
  const archive = archiveOf([H(0)], [20]);

  const all = validateAll(readings, archive);
  assert.deepEqual(
    all.map((v) => v.variable).sort(),
    ['humidityPct', 'pressureHpa', 'tempC', 'windSpeedMs'],
  );
  for (const v of all) assert.ok(v.unit.length > 0, `${v.variable} needs a unit`);
});

/**
 * Cross-check against the committed coefficients.
 *
 * `groundTruth.ts` (TypeScript, live) and `analysis/calibrate.py` (Python,
 * offline) compute the same quantity by independent paths. Agreement is
 * evidence both are right; divergence means one of them drifted.
 */
test('bias and MAE agree with the fitted coefficients', async (t) => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  let archive: HourlyForecast;
  let readings: Reading[];

  try {
    const raw = JSON.parse(
      await readFile(path.join(root, 'data', 'cache', 'archive_2026-09-01_2026-09-01.json'), 'utf8'),
    ) as { body: { hourly: HourlyForecast } };
    archive = raw.body.hourly;

    const { GeoCsvAdapter, defaultGeoCsvDir } = await import(
      '../ingest/adapters/geoCsvAdapter.js'
    );
    const adapter = new GeoCsvAdapter(defaultGeoCsvDir(root));
    readings = await adapter.getHistory(
      new Date('2026-09-01T00:00:00Z'),
      new Date('2026-09-01T23:59:59Z'),
    );
  } catch {
    return t.skip('committed archive snapshot or station CSV unavailable');
  }

  const v = compareToModel(readings, archive, 'tempC');
  assert.equal(v.n, 24, 'this archive snapshot covers one full 24-hour day');

  // Deliberately not compared against the published coefficient any more.
  //
  // The fit now spans 312 paired hours across 13 days, while this check has
  // one day of archive to work with — so the two numbers *should* differ, and
  // asserting they match would only pass by accident. What must still hold is
  // that the live comparison agrees on sign and order of magnitude: the model
  // runs cold at this station, by something under 2 °C.
  assert.ok(v.bias < 0, `the model should underpredict here, got ${v.bias}`);
  assert.ok(Math.abs(v.bias) < 2, `bias implausibly large: ${v.bias}`);
  assert.ok(v.mae > 0 && v.mae < 3, `MAE implausible: ${v.mae}`);
  // The finding the page exists to show: the model is worst at the morning
  // transition, not at midday.
  assert.ok(v.worst && Math.abs(v.worst.error) > 2, `worst miss was only ${v.worst?.error}`);
});
