import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Open-Meteo client. No API key required.
 *
 * Two roles:
 *  1. Forecast — supplies the rain lookahead that gates spray and drying.
 *     The station can only report rain that has already fallen, so a future
 *     decision must come from the model.
 *  2. ERA5 archive — supplies the reference series the calibration is fitted
 *     against.
 */

/** JKUAT main campus, Juja. Open-Meteo resolves this to elevation 1527 m. */
export const SITE = { latitude: -1.0954, longitude: 37.0144, timezone: 'Africa/Nairobi' } as const;

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

export interface HourlyForecast {
  /** `YYYY-MM-DDTHH:MM`, in the requested timezone. */
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  wind_speed_10m: number[];
  precipitation: number[];
  shortwave_radiation: number[];
  surface_pressure: number[];
}

const HOURLY_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'wind_speed_10m',
  'precipitation',
  'shortwave_radiation',
  'surface_pressure',
].join(',');

/**
 * Disk cache. Keeps the demo working through a flaky venue network and
 * avoids hammering a free service during development.
 */
async function cached<T>(cacheDir: string, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const file = path.join(cacheDir, `${key}.json`);
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as { at: number; body: T };
    if (Date.now() - raw.at < ttlMs) return raw.body;
  } catch {
    // No usable cache entry; fall through and fetch.
  }

  try {
    const body = await load();
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify({ at: Date.now(), body }));
    return body;
  } catch (err) {
    // Network failed. A stale entry beats no forecast at all.
    try {
      const raw = JSON.parse(await readFile(file, 'utf8')) as { at: number; body: T };
      return raw.body;
    } catch {
      throw err;
    }
  }
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status} for ${url}`);
  return res.json();
}

export class OpenMeteoClient {
  constructor(private readonly cacheDir: string) {}

  /** Hourly forecast for the coming days, in Africa/Nairobi local time. */
  async forecast(days = 3): Promise<HourlyForecast> {
    const url =
      `${FORECAST_URL}?latitude=${SITE.latitude}&longitude=${SITE.longitude}` +
      `&hourly=${HOURLY_VARS}&forecast_days=${days}&wind_speed_unit=ms` +
      `&timezone=${encodeURIComponent(SITE.timezone)}`;
    const body = await cached(this.cacheDir, `forecast_${days}d`, 30 * 60_000, () => getJson(url));
    return body.hourly as HourlyForecast;
  }

  /** ERA5 reanalysis for a past date range, in UTC to match station timestamps. */
  async archive(startDate: string, endDate: string): Promise<HourlyForecast> {
    const url =
      `${ARCHIVE_URL}?latitude=${SITE.latitude}&longitude=${SITE.longitude}` +
      `&start_date=${startDate}&end_date=${endDate}&hourly=${HOURLY_VARS}` +
      `&wind_speed_unit=ms&timezone=UTC`;
    const body = await cached(this.cacheDir, `archive_${startDate}_${endDate}`, 24 * 3600_000, () =>
      getJson(url),
    );
    return body.hourly as HourlyForecast;
  }
}

/**
 * Hours (as `YYYY-MM-DDTHH`) where rain is expected within the lookahead.
 *
 * An hour is flagged when any of the following `lookaheadHours` carries
 * measurable precipitation, so a decision made now accounts for rain later.
 */
export function rainLookaheadSet(f: HourlyForecast, lookaheadHours: number): Set<string> {
  const flagged = new Set<string>();
  const precip = f.precipitation ?? [];

  for (let i = 0; i < f.time.length; i++) {
    for (let j = i; j < Math.min(i + lookaheadHours + 1, f.time.length); j++) {
      if ((precip[j] ?? 0) > 0.1) {
        flagged.add(f.time[i].slice(0, 13));
        break;
      }
    }
  }
  return flagged;
}
