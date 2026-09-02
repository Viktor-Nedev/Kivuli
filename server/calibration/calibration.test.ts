import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrate, loadCoefficients, type Coefficients } from './apply.js';

const coeffs = (over: Partial<Coefficients['variables']> = {}): Coefficients => ({
  generated_at: '2026-09-02T00:00:00',
  source: 'test',
  site: { latitude: -1.0954, longitude: 37.0144, elevation_m: 1527 },
  validation: 'leave-one-out',
  variables: {
    tempC: {
      model: 'constant',
      bias: -1.12,
      n_train: 24,
      metrics: { n: 24, mae_before: 1.12, mae_after: 0.56, rmse_before: 1.31, rmse_after: 0.7 },
    },
    ...over,
  },
  training_window: { from: '2026-09-01', to: '2026-09-01', station_hours: 24, note: 'test' },
});

test('bias is subtracted, so an underprediction is corrected upward', () => {
  // The model reads 1.12 C colder than the station, i.e. bias = -1.12.
  const out = calibrate(coeffs(), 'tempC', 20, 12);
  assert.equal(out.value, 21.12);
  assert.equal(out.provenance, 'bias_corrected');
  assert.equal(out.rawValue, 20);
});

test('an uncorrected value is labelled raw forecast, never silently passed off', () => {
  const out = calibrate(null, 'tempC', 20, 12);
  assert.equal(out.provenance, 'raw_forecast');
  assert.equal(out.value, 20);
  assert.equal(out.rawValue, undefined);
});

test('a variable with no fitted coefficients stays raw', () => {
  const out = calibrate(coeffs(), 'pressureHpa', 850, 12);
  assert.equal(out.provenance, 'raw_forecast');
});

test('hour-of-day models use the matching hour and fall back otherwise', () => {
  const c = coeffs({
    humidityPct: {
      model: 'hour_of_day',
      bias: 3.55,
      n_train: 24,
      metrics: { n: 24, mae_before: 5.69, mae_after: 5.14, rmse_before: 6.62, rmse_after: 5.83 },
      hourly_bias: { '9': 2 },
    },
  });
  assert.equal(calibrate(c, 'humidityPct', 60, 9).value, 58);
  // Hour 10 was never fitted; fall back to the global offset.
  assert.equal(calibrate(c, 'humidityPct', 60, 10).value, 56.45);
});

test('a non-finite input is passed through untouched', () => {
  const out = calibrate(coeffs(), 'tempC', NaN, 12);
  assert.equal(out.provenance, 'raw_forecast');
});

test('the committed coefficients keep the calibration honest', async () => {
  const c = await loadCoefficients(process.cwd());
  assert.ok(c, 'data/coefficients.json should exist — run analysis/calibrate.py');
  assert.equal(c!.validation, 'leave-one-out');

  const t = c!.variables.tempC;
  assert.ok(t, 'temperature coefficients missing');
  // Guard against in-sample leakage: the prototype established ~1.12 -> ~0.57.
  // A dramatically better figure means the model is scoring itself.
  assert.ok(t.metrics.mae_after < t.metrics.mae_before, 'correction should reduce error');
  assert.ok(t.metrics.mae_after > 0.3, `suspiciously low MAE ${t.metrics.mae_after} — check for leakage`);
  assert.ok(t.metrics.mae_after < 0.8, `correction weaker than expected: ${t.metrics.mae_after}`);
});
