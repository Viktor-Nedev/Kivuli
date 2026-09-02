import type { Reading } from './types.js';

export interface HourlyMean {
  /** Hour key, `YYYY-MM-DDTHH` in UTC. */
  hour: string;
  tempC: number;
  humidityPct: number;
  windSpeedMs: number;
  pressureHpa: number;
  /** Observations averaged into this hour. */
  n: number;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Collapses 15-minute observations to hourly means.
 *
 * Calibration aligns against ERA5, which is hourly; averaging the station to
 * the same resolution avoids comparing an instantaneous reading to an hourly
 * model value.
 */
export function toHourlyMeans(readings: Reading[]): HourlyMean[] {
  const buckets = new Map<string, Reading[]>();

  for (const r of readings) {
    const hour = r.ts.slice(0, 13);
    const list = buckets.get(hour);
    if (list) list.push(r);
    else buckets.set(hour, [r]);
  }

  const finite = (xs: Reading[], pick: (r: Reading) => number) => {
    const vals = xs.map(pick).filter(Number.isFinite);
    return vals.length ? mean(vals) : NaN;
  };

  return [...buckets.entries()]
    .map(([hour, rs]) => ({
      hour,
      tempC: finite(rs, (r) => r.tempC),
      humidityPct: finite(rs, (r) => r.humidityPct),
      windSpeedMs: finite(rs, (r) => r.windSpeedMs),
      pressureHpa: finite(rs, (r) => r.pressureHpa),
      n: rs.length,
    }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}
