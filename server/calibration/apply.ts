import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Tagged } from '../ingest/types.js';

/**
 * Applies the offsets fitted by analysis/calibrate.py.
 *
 * Arithmetic only, by design: the model is fitted offline and exported as
 * JSON, so the server stays a single Node runtime.
 */

export interface VariableCoefficients {
  model: 'constant' | 'hour_of_day';
  bias: number;
  metrics: {
    n: number;
    mae_before: number;
    mae_after: number;
    rmse_before: number;
    rmse_after: number;
  };
  n_train: number;
  hourly_bias?: Record<string, number>;
}

export interface Coefficients {
  generated_at: string;
  source: string;
  site: { latitude: number; longitude: number; elevation_m: number };
  validation: string;
  variables: Record<string, VariableCoefficients>;
  training_window: { from: string; to: string; station_hours: number; note: string };
}

export type CalibratedVariable = 'tempC' | 'humidityPct' | 'windSpeedMs' | 'pressureHpa';

export async function loadCoefficients(root: string): Promise<Coefficients | null> {
  try {
    const raw = await readFile(path.join(root, 'data', 'coefficients.json'), 'utf8');
    return JSON.parse(raw) as Coefficients;
  } catch {
    // Not yet fitted. Callers fall back to raw forecast values.
    return null;
  }
}

/**
 * Corrects a forecast value toward the station.
 *
 * `bias` is defined as (forecast - observed), so it is subtracted. Returns a
 * `raw_forecast` tag untouched when no coefficients exist, so the UI can
 * never imply a correction that was not applied.
 */
export function calibrate(
  coeffs: Coefficients | null,
  variable: CalibratedVariable,
  value: number,
  hourUtc: number,
): Tagged<number> {
  const entry = coeffs?.variables?.[variable];
  if (!entry || !Number.isFinite(value)) {
    return { value, provenance: 'raw_forecast' };
  }

  const bias =
    entry.model === 'hour_of_day'
      ? entry.hourly_bias?.[String(hourUtc)] ?? entry.bias
      : entry.bias;

  return {
    value: Number((value - bias).toFixed(2)),
    provenance: 'bias_corrected',
    rawValue: Number(value.toFixed(2)),
  };
}
