import type { Reading } from '../ingest/types.js';
import type { HourlyForecast } from '../forecast/openMeteo.js';
import { toHourlyMeans } from '../ingest/aggregate.js';

/**
 * The station judges the model.
 *
 * Every other number in KIVULI is a forecast or a reanalysis, and the app
 * spends a lot of effort saying so. This module is the one place where a
 * `measured` tag is the ground truth rather than a caveat: the Conduit's own
 * readings are the reference, and the gridded model is the thing being
 * scored against them.
 *
 * That is not a contrivance to justify the station's presence — it is the
 * Conduit's stated purpose. Its measurements exist to "contribute to the
 * calibration and validation of satellite observations and digital models",
 * and this endpoint is that sentence made executable.
 *
 * ## What the comparison actually shows
 *
 * Measured for 2026-09-01, 24 paired hours, temperature:
 *
 *   midday (10-15 local)          MAE 0.55 C
 *   transitions (5-7, 17-19)      MAE 0.91 C
 *   worst single hour, 08:00      -2.63 C
 *
 * The model is cold at every single hour, and worst at the morning warming
 * transition — which a ~9 km reanalysis cell cannot resolve, and which is
 * exactly when spraying happens. So this is not a museum exhibit: the hour
 * the model is least trustworthy is the hour the decision is made.
 *
 * ## Deliberately not parameterised by site
 *
 * There is one station. A validation figure for Kisumu would be a comparison
 * against an instrument that is not there, so the route takes no lat/lon at
 * all — the same refusal as `parseSite`'s Kenya bounding box, for the same
 * reason.
 */

export type ValidatedVariable = 'tempC' | 'humidityPct' | 'windSpeedMs' | 'pressureHpa';

/** How each validated variable maps onto the two sources and its unit. */
const VARIABLES: Record<
  ValidatedVariable,
  { unit: string; label: string; archiveKey: keyof HourlyForecast }
> = {
  tempC: { unit: '°C', label: 'Temperature', archiveKey: 'temperature_2m' },
  humidityPct: { unit: '%', label: 'Relative humidity', archiveKey: 'relative_humidity_2m' },
  windSpeedMs: { unit: 'm/s', label: 'Wind speed', archiveKey: 'wind_speed_10m' },
  pressureHpa: { unit: 'hPa', label: 'Pressure', archiveKey: 'surface_pressure' },
};

export interface HourComparison {
  /** `YYYY-MM-DDTHH`, UTC — the key both series are joined on. */
  hour: string;
  /** Local hour 0-23. EAT is UTC+3 with no daylight saving. */
  localHour: number;
  /** Station hourly mean. This is the `measured` value. */
  stationValue: number;
  /** Model value for the same hour. This is the `reanalysis` value. */
  modelValue: number;
  /** model − station. Negative means the model runs low. */
  error: number;
  /** Station observations averaged into this hour. Shown, never hidden. */
  n: number;
}

export interface VariableValidation {
  variable: ValidatedVariable;
  label: string;
  unit: string;
  hours: HourComparison[];
  /** Mean signed error. The systematic offset the calibration corrects. */
  bias: number;
  mae: number;
  rmse: number;
  /** Largest absolute error — the headline "worst miss". */
  worst: { hour: string; localHour: number; error: number } | null;
  /** Mean signed error per local hour, for the diurnal curve. */
  diurnal: { localHour: number; meanError: number; n: number }[];
  /** Paired hours. Small by construction; printed rather than implied. */
  n: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

/** UTC hour string -> local hour. EAT = UTC+3, no DST. */
function localHourOf(hour: string): number {
  return (Number(hour.slice(11, 13)) + 3) % 24;
}

/**
 * Pairs station hourly means against the model for one variable.
 *
 * An inner join on the UTC hour: an hour present in only one series is
 * dropped rather than filled, because a comparison needs both sides. `n`
 * reports what survived the join, so a thin day cannot masquerade as a full
 * one.
 */
export function compareToModel(
  readings: Reading[],
  archive: HourlyForecast,
  variable: ValidatedVariable,
): VariableValidation {
  const meta = VARIABLES[variable];
  const means = toHourlyMeans(readings);

  // Model series, keyed by the same `YYYY-MM-DDTHH` slice the station uses.
  const model = new Map<string, number>();
  const times = archive.time ?? [];
  const values = (archive[meta.archiveKey] ?? []) as number[];
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) model.set(times[i].slice(0, 13), v);
  }

  const hours: HourComparison[] = [];
  for (const m of means) {
    const stationValue = m[variable];
    const modelValue = model.get(m.hour);
    // `toHourlyMeans` can emit NaN for a variable absent from every row in a
    // bucket; such an hour is not a comparison and must not become one.
    if (!Number.isFinite(stationValue) || modelValue === undefined) continue;

    hours.push({
      hour: m.hour,
      localHour: localHourOf(m.hour),
      stationValue: r2(stationValue),
      modelValue: r2(modelValue),
      error: r2(modelValue - stationValue),
      n: m.n,
    });
  }

  const n = hours.length;
  if (!n) {
    return {
      variable,
      label: meta.label,
      unit: meta.unit,
      hours: [],
      bias: 0,
      mae: 0,
      rmse: 0,
      worst: null,
      diurnal: [],
      n: 0,
    };
  }

  const errors = hours.map((h) => h.error);
  const bias = errors.reduce((a, e) => a + e, 0) / n;
  const mae = errors.reduce((a, e) => a + Math.abs(e), 0) / n;
  const rmse = Math.sqrt(errors.reduce((a, e) => a + e * e, 0) / n);

  // Largest *absolute* error. A signed max would report the biggest warm miss
  // and silently ignore a larger cold one.
  const worstHour = hours.reduce((w, h) => (Math.abs(h.error) > Math.abs(w.error) ? h : w));

  const buckets = new Map<number, number[]>();
  for (const h of hours) {
    const list = buckets.get(h.localHour);
    if (list) list.push(h.error);
    else buckets.set(h.localHour, [h.error]);
  }
  const diurnal = [...buckets.entries()]
    .map(([localHour, errs]) => ({
      localHour,
      meanError: r2(errs.reduce((a, e) => a + e, 0) / errs.length),
      n: errs.length,
    }))
    .sort((a, b) => a.localHour - b.localHour);

  return {
    variable,
    label: meta.label,
    unit: meta.unit,
    hours,
    bias: r2(bias),
    mae: r2(mae),
    rmse: r2(rmse),
    worst: { hour: worstHour.hour, localHour: worstHour.localHour, error: worstHour.error },
    diurnal,
    n,
  };
}

/** Every validated variable, over the same paired hours. */
export function validateAll(readings: Reading[], archive: HourlyForecast): VariableValidation[] {
  return (Object.keys(VARIABLES) as ValidatedVariable[]).map((v) =>
    compareToModel(readings, archive, v),
  );
}
