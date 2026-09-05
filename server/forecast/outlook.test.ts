import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOutlook,
  outlookWindows,
  wetBulbStull,
  DRYING_RADIATION_MIN_WM2,
  FIELD_HOURS,
} from './outlook.js';
import type { HourlyForecast } from './openMeteo.js';

/**
 * Forward-looking decisions.
 *
 * Two of these tests exist because of bugs found by measuring the real
 * forecast rather than by reading the code, and both would have been visible
 * on stage:
 *
 *  - 20 of 29 hours that pass the spray physics over a live 72-hour window are
 *    nocturnal. Without a daylight gate the app recommends spraying at 02:00.
 *  - A forward value that inherited the `measured` tag would present a model
 *    output as an instrument reading, which is the one thing this project
 *    cannot do.
 */

interface HourSpec {
  time: string;
  temperature_2m?: number;
  relative_humidity_2m?: number;
  wind_speed_10m?: number;
  precipitation?: number;
  shortwave_radiation?: number;
  surface_pressure?: number;
}

/** One forecast hour. Defaults are sprayable, daylight, dry and sunny. */
function hour(over: HourSpec) {
  return {
    time: over.time,
    temperature_2m: over.temperature_2m ?? 24,
    relative_humidity_2m: over.relative_humidity_2m ?? 45,
    wind_speed_10m: over.wind_speed_10m ?? 2.0,
    precipitation: over.precipitation ?? 0,
    shortwave_radiation: over.shortwave_radiation ?? 600,
    surface_pressure: over.surface_pressure ?? 853,
  };
}

/** Assembles the column-wise shape Open-Meteo returns. */
function forecast(rows: ReturnType<typeof hour>[]): HourlyForecast {
  return {
    time: rows.map((r) => r.time),
    temperature_2m: rows.map((r) => r.temperature_2m),
    relative_humidity_2m: rows.map((r) => r.relative_humidity_2m),
    wind_speed_10m: rows.map((r) => r.wind_speed_10m),
    precipitation: rows.map((r) => r.precipitation),
    shortwave_radiation: rows.map((r) => r.shortwave_radiation),
    surface_pressure: rows.map((r) => r.surface_pressure),
  };
}

const day = (h: number) => `2026-09-05T${String(h).padStart(2, '0')}:00`;

test('a nocturnal hour that passes the physics is excluded from spray windows', () => {
  // 02:00 with in-band Delta-T and wind. Physically sprayable, practically
  // absurd — this is the real shape of 20 of 29 passing hours in a live
  // 72-hour forecast at this site.
  const f = forecast([hour({ time: day(2) }), hour({ time: day(3) })]);
  const outlook = buildOutlook(f, null);

  assert.equal(outlook.windows.filter((w) => w.band === 'spray').length, 0);
  assert.ok(
    outlook.nightHoursExcluded >= 2,
    `expected the exclusion to be counted, got ${outlook.nightHoursExcluded}`,
  );
  assert.equal(outlook.hours[0].spray.pass, false);
  assert.match(outlook.hours[0].spray.reason, /field hours/i);
});

test('the same conditions in daylight do produce a window', () => {
  // Identical inputs, moved to 10:00. If this fails the daylight gate is not a
  // gate, it is a blanket refusal.
  const f = forecast([hour({ time: day(10) }), hour({ time: day(11) })]);
  const outlook = buildOutlook(f, null);

  const spray = outlook.windows.filter((w) => w.band === 'spray');
  assert.equal(spray.length, 1);
  assert.equal(spray[0].hours, 2);
  assert.equal(outlook.nightHoursExcluded, 0);
});

test('no forward value is ever tagged measured', () => {
  // The project's core invariant. A forecast that claims to be an instrument
  // reading would invalidate every provenance tag in the app.
  const f = forecast([day(8), day(12), day(20)].map((t) => hour({ time: t })));
  const outlook = buildOutlook(f, null);

  assert.ok(outlook.hours.length > 0);
  for (const h of outlook.hours) {
    assert.notEqual(h.provenance, 'measured', `${h.time} claimed to be measured`);
    assert.ok(['bias_corrected', 'raw_forecast'].includes(h.provenance));
  }
});

test('without coefficients every hour is raw_forecast', () => {
  const f = forecast([hour({ time: day(9) })]);
  const outlook = buildOutlook(f, null);
  assert.equal(outlook.hours[0].provenance, 'raw_forecast');
  assert.equal(outlook.uncalibrated, true);
});

test('drying requires radiation above the physical threshold', () => {
  const dim = buildOutlook(
    forecast([hour({ time: day(10), shortwave_radiation: DRYING_RADIATION_MIN_WM2 - 50 })]),
    null,
  );
  const bright = buildOutlook(
    forecast([hour({ time: day(10), shortwave_radiation: DRYING_RADIATION_MIN_WM2 + 200 })]),
    null,
  );

  assert.equal(dim.hours[0].drying.pass, false);
  assert.match(dim.hours[0].drying.reason, /sun/i);
  assert.equal(bright.hours[0].drying.pass, true);
});

test('rain in the hour blocks both bands', () => {
  const f = forecast([hour({ time: day(11), precipitation: 2.4 })]);
  const outlook = buildOutlook(f, null);
  assert.equal(outlook.hours[0].spray.pass, false);
  assert.equal(outlook.hours[0].drying.pass, false);
});

test('windows never span the night gap', () => {
  // 17:00 passing and 06:00 the next morning passing are two opportunities,
  // not one thirteen-hour window.
  const f = forecast([
    hour({ time: '2026-09-05T17:00' }),
    hour({ time: '2026-09-05T18:00' }),
    hour({ time: '2026-09-05T23:00' }),
    hour({ time: '2026-09-06T06:00' }),
    hour({ time: '2026-09-06T07:00' }),
  ]);
  const outlook = buildOutlook(f, null);
  const spray = outlook.windows.filter((w) => w.band === 'spray');

  assert.equal(spray.length, 2, 'the night must break the run');
  assert.ok(spray.every((w) => w.hours <= 2));
});

test('every window sits inside field hours', () => {
  // The blanket guard: whatever the inputs, no advice may fall outside the
  // working day.
  const rows = [];
  for (let h = 0; h < 24; h++) rows.push(hour({ time: day(h) }));
  const outlook = buildOutlook(forecast(rows), null);

  for (const w of outlook.windows) {
    const startHour = Number(w.start.slice(11, 13));
    const endHour = Number(w.end.slice(11, 13));
    assert.ok(startHour >= FIELD_HOURS.first, `${w.band} window starts at ${startHour}`);
    assert.ok(endHour < FIELD_HOURS.last, `${w.band} window ends at ${endHour}`);
  }
});

test('Stull wet bulb sits below dry bulb and converges at saturation', () => {
  // Sanity-checks the approximation that replaces the station's measured wet
  // bulb. At saturation the two temperatures meet; in dry air they diverge.
  const saturated = wetBulbStull(25, 99);
  const dry = wetBulbStull(25, 30);

  assert.ok(Math.abs(saturated - 25) < 1.0, `saturated wet bulb ${saturated} should approach 25`);
  assert.ok(dry < saturated, 'drier air must give a lower wet bulb');
  assert.ok(dry < 25, 'wet bulb cannot exceed dry bulb');
});

test('a heat threshold that is never crossed is reported as not crossed', () => {
  // This site peaks well below the ISO 7243 first-action threshold, so the
  // honest output is "no restriction" rather than a manufactured alert.
  const f = forecast([hour({ time: day(13), temperature_2m: 26, relative_humidity_2m: 40 })]);
  const outlook = buildOutlook(f, null);

  assert.equal(outlook.heat.thresholdC, 28);
  assert.equal(outlook.heat.anyRestriction, false);
  assert.ok(outlook.heat.peakWbgtC > 0, 'the projected peak is still reported');
});

test('outlookWindows groups only contiguous passing hours', () => {
  const hours = [
    { time: day(8), spray: { pass: true, reason: '' } },
    { time: day(9), spray: { pass: true, reason: '' } },
    { time: day(10), spray: { pass: false, reason: 'wind' } },
    { time: day(11), spray: { pass: true, reason: '' } },
  ] as Parameters<typeof outlookWindows>[0];

  const windows = outlookWindows(hours, 'spray');
  assert.equal(windows.length, 2);
  assert.equal(windows[0].hours, 2);
  assert.equal(windows[1].hours, 1);
});

test('bias correction can never produce a negative wind speed', () => {
  // The fitted wind offset is +1.73 m/s and this site forecasts sub-1 m/s
  // mornings, so the uncorrected arithmetic goes negative: a 0.5 m/s forecast
  // "corrects" to -1.23 m/s. That is not a small error, it is not a wind
  // speed, and it silently trips the inversion gate for the wrong reason.
  const coeffs = {
    generated_at: '',
    source: 'test',
    validation: 'test',
    variables: {
      windSpeedMs: {
        model: 'constant',
        bias: 1.73,
        n_train: 24,
        metrics: { n: 24, mae_before: 1.7, mae_after: 0.9, rmse_before: 2, rmse_after: 1.2 },
      },
    },
    training_window: { from: '', to: '', station_hours: 24, note: '' },
  } as unknown as Parameters<typeof buildOutlook>[1];

  const f = forecast([hour({ time: day(7), wind_speed_10m: 0.5 })]);
  const outlook = buildOutlook(f, coeffs);

  assert.ok(outlook.hours[0].windSpeedMs >= 0, 'wind speed must never be negative');
  assert.ok(outlook.hours[0].humidityPct >= 0 && outlook.hours[0].humidityPct <= 100);
});
