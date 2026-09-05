import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Open-Meteo client. No API key required.
 *
 * Two roles:
 *  1. Forecast — supplies the rain lookahead that gates spray and drying.
 *     The station can only report rain that has already fallen, so a future
 *     decision must come from the model.
 *  2. ERA5 hourly archive — supplies the reference series the calibration is
 *     fitted against.
 *  3. ERA5 daily archive — supplies the multi-year rainfall history behind the
 *     climate page. The station's own record is one day long, so anything that
 *     compares this season against previous ones has to come from here.
 */

/** JKUAT main campus, Juja. Open-Meteo resolves this to elevation 1527 m. */
export interface Site {
  latitude: number;
  longitude: number;
  timezone: string;
}

/** JKUAT main campus, Juja — the station's own location and the default. */
export const SITE: Site = { latitude: -1.0954, longitude: 37.0144, timezone: 'Africa/Nairobi' };

/**
 * Cache-key fragment for a site.
 *
 * Rounded to 3 decimals (~110 m). ERA5's grid is ~9 km, so anything finer
 * would produce distinct keys for coordinates that resolve to the same cell —
 * turning every slightly-different request into a cache miss and a fresh
 * download for identical data.
 */
export const siteKey = (s: Site) => `${s.latitude.toFixed(3)}_${s.longitude.toFixed(3)}`;

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

export interface DailyArchive {
  /** `YYYY-MM-DD`, in the requested timezone. */
  time: string[];
  precipitation_sum: number[];
  /** FAO-56 reference evapotranspiration, mm/day. Paired with rainfall it
   *  gives a water balance: this site runs a deficit in nine months of the
   *  year, which is the whole argument for storing the two wet peaks. */
  et0_fao_evapotranspiration: number[];
}

const DAILY_VARS = ['precipitation_sum', 'et0_fao_evapotranspiration'].join(',');

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

/**
 * Drops superseded daily-archive snapshots, keeping only the one being used.
 *
 * Best-effort: a failure here must never break a request, since a stale extra
 * file is harmless and the data itself is already in hand.
 */
async function pruneDailyCache(cacheDir: string, site: Site, keep: string): Promise<void> {
  const prefix = `daily_${siteKey(site)}_`;
  try {
    for (const name of await readdir(cacheDir)) {
      // Only this site's superseded snapshots. Other sites' files are someone
      // else's cache — and one of them is the committed offline fallback.
      if (name.startsWith(prefix) && name.endsWith('.json') && name !== keep) {
        await unlink(path.join(cacheDir, name)).catch(() => {});
      }
    }
  } catch {
    // No cache directory yet, or it is not readable. Nothing to prune.
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

  /**
   * ERA5 daily totals for a past date range.
   *
   * Requested in **Africa/Nairobi, not UTC** — unlike `archive()` above, which
   * matches the station's UTC timestamps on purpose. A daily total only means
   * something if it is bounded by the local calendar day the farmer actually
   * experienced; summing on UTC boundaries would smear each day's rain across
   * two dates and make season-onset detection quietly wrong.
   *
   * 24 h TTL: ERA5 publishes about once a day, and every figure derived from
   * this is a multi-year window, so a one-day-old copy changes nothing.
   */
  async dailyArchive(
    startDate: string,
    endDate: string,
    site: Site = SITE,
  ): Promise<DailyArchive> {
    // The key carries BOTH the site and the end date. Omitting the site would
    // let one location silently serve another's rainfall history — a wrong
    // percentile delivered with full confidence, which is the worst failure
    // this project could ship.
    const key = `daily_${siteKey(site)}_${startDate}_${endDate}`;

    // A new ~90 KB file lands each day, so superseded ones are dropped. Scoped
    // to this site only: a blanket prune would delete the committed snapshot
    // for JKUAT the first time anyone looked at another town, and with it the
    // offline demo.
    await pruneDailyCache(this.cacheDir, site, `${key}.json`);

    const url =
      `${ARCHIVE_URL}?latitude=${site.latitude}&longitude=${site.longitude}` +
      `&start_date=${startDate}&end_date=${endDate}&daily=${DAILY_VARS}` +
      `&timezone=${encodeURIComponent(site.timezone)}`;
    const body = await cached(this.cacheDir, key, 24 * 3600_000, () => getJson(url));
    return body.daily as DailyArchive;
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
