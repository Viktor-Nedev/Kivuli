import type { Reading } from '../ingest/types.js';

/**
 * Delta-T spray suitability.
 *
 * Delta-T is dry-bulb minus wet-bulb temperature. The Conduit station
 * measures wet bulb directly, so this is exact rather than derived from a
 * humidity approximation — the strongest argument for using station data
 * here rather than a forecast alone.
 *
 * Reference bands (Australian GRDC / standard agronomic spray guidance):
 *   Delta-T 2-8 °C  : suitable
 *   Delta-T < 2 °C  : droplets stay airborne too long, drift risk
 *   Delta-T > 8 °C  : rapid evaporation, poor leaf uptake
 *
 * Wind below 0.8 m/s is a FAIL, not a pass: still air signals a temperature
 * inversion, which lets fine droplets hang and move off-target. Operators
 * routinely misread "no wind" as ideal, so the reason is always surfaced.
 */

export const SPRAY = {
  deltaTMin: 2,
  deltaTMax: 8,
  windMinMs: 0.8,
  windMaxMs: 4.2,
  rainLookaheadHours: 6,
} as const;

export type SprayFailure =
  | 'delta_t_low'
  | 'delta_t_high'
  | 'wind_inversion'
  | 'wind_high'
  | 'rain_forecast';

export interface SprayAssessment {
  ts: string;
  deltaT: number;
  windSpeedMs: number;
  pass: boolean;
  failures: SprayFailure[];
  /** Plain-language reason, active voice. Empty when `pass` is true. */
  reason: string;
}

export const deltaT = (r: Reading): number => r.tempC - r.wetBulbC;

const REASONS: Record<SprayFailure, string> = {
  delta_t_low: 'Delta-T below 2 °C — droplets stay airborne, drift risk',
  delta_t_high: 'Delta-T above 8 °C — spray evaporates before it lands',
  wind_inversion: 'Wind below 0.8 m/s — inversion risk, spray will drift off-target',
  wind_high: 'Wind above 4.2 m/s — spray will blow off-target',
  rain_forecast: 'Rain forecast within 6 hours — spray will wash off',
};

/**
 * @param rainWithinLookahead Rain expected within the next 6 h. This comes
 *   from the Open-Meteo forecast, never from the station: the station reports
 *   rain that has already fallen, which cannot gate a future spray decision.
 */
export function assessSpray(r: Reading, rainWithinLookahead: boolean): SprayAssessment {
  const dt = deltaT(r);
  const failures: SprayFailure[] = [];

  if (dt < SPRAY.deltaTMin) failures.push('delta_t_low');
  else if (dt > SPRAY.deltaTMax) failures.push('delta_t_high');

  if (r.windSpeedMs < SPRAY.windMinMs) failures.push('wind_inversion');
  else if (r.windSpeedMs > SPRAY.windMaxMs) failures.push('wind_high');

  if (rainWithinLookahead) failures.push('rain_forecast');

  return {
    ts: r.ts,
    deltaT: Number(dt.toFixed(2)),
    windSpeedMs: r.windSpeedMs,
    pass: failures.length === 0,
    failures,
    reason: failures.map((f) => REASONS[f]).join('; '),
  };
}

export interface Window {
  start: string;
  end: string;
}

/** Groups consecutive passing assessments into contiguous windows. */
export function sprayWindows(assessments: SprayAssessment[]): Window[] {
  const windows: Window[] = [];
  let open: Window | null = null;

  for (const a of assessments) {
    if (a.pass) {
      if (open) open.end = a.ts;
      else open = { start: a.ts, end: a.ts };
    } else if (open) {
      windows.push(open);
      open = null;
    }
  }
  if (open) windows.push(open);
  return windows;
}
