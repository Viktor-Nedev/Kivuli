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
const FLOOD_URL = 'https://flood-api.open-meteo.com/v1/flood';

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

export interface DailyForecast {
  /** `YYYY-MM-DD`, in the requested timezone. */
  time: string[];
  /** FAO-56 reference evapotranspiration, mm/day. The demand side of the
   *  forward water balance. */
  et0_fao_evapotranspiration: number[];
  precipitation_sum: number[];
  /** Peak UV index for the day. The station's own SI1145 UV channel reads 0
   *  for every row in the sample, so this is the only UV figure available —
   *  and it is a model output, tagged accordingly, never mixed with the
   *  dead sensor. */
  uv_index_max: number[];
  precipitation_probability_max: number[];
}

const DAILY_VARS = ['precipitation_sum', 'et0_fao_evapotranspiration'].join(',');

/**
 * Daily *forecast* variables. Deliberately a separate list from DAILY_VARS,
 * which is the ERA5 **archive** schema: sharing one list would couple the
 * multi-year archive cache key to any forecast-side schema change, and the
 * archive snapshots are committed to the repo for the offline demo.
 */
export interface DailyDischarge {
  time: string[];
  /** Modelled river discharge, m³/s. All-zero means no modelled reach here. */
  river_discharge: (number | null)[];
}

const DAILY_FORECAST_VARS = [
  'et0_fao_evapotranspiration',
  'precipitation_sum',
  'uv_index_max',
  'precipitation_probability_max',
].join(',');

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
    // Writing the cache must not be able to lose a good response. On a
    // read-only filesystem -- a serverless host, a container with no writable
    // volume -- mkdir/writeFile throw, and inside this try that threw away a
    // fetch that had already succeeded and fell back to a stale entry instead.
    // The cache is an optimisation; the data is the point.
    try {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(file, JSON.stringify({ at: Date.now(), body }));
    } catch {
      // Read-only or out of space. Serve what was just fetched.
    }
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

/**
 * `cached()` for the daily archive, with two differences that matter offline.
 *
 * First it reports whether today's snapshot is actually on disk (`fresh`), so
 * the caller prunes only when a current file exists to keep — never on the
 * stale-fallback path, where the file it would delete is the one just served.
 *
 * Second, and more importantly, its stale fallback is not limited to its own
 * key. The archive key carries today's date, so at local midnight it becomes a
 * filename that has never been written — and the committed offline snapshot,
 * which is what the demo depends on, sits under an older date. Falling back to
 * the newest snapshot for this site turns "the network is down and the date
 * rolled over" from a total failure into eleven-year-old history that is a day
 * or two stale, which is exactly what a rainfall climatology can absorb.
 */
async function cachedArchive(
  cacheDir: string,
  key: string,
  ttlMs: number,
  load: () => Promise<any>,
): Promise<{ body: any; fresh: boolean }> {
  const file = path.join(cacheDir, `${key}.json`);

  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as { at: number; body: any };
    // An in-TTL hit under today's own key is as safe to prune around as a
    // fresh fetch: the current snapshot is on disk either way. `fresh` is
    // false only on the stale-fallback path below, where the file that would
    // be pruned is the one we just served from.
    if (Date.now() - raw.at < ttlMs) return { body: raw.body, fresh: true };
  } catch {
    // No usable entry under today's key; fall through and fetch.
  }

  try {
    const body = await load();
    // Same reasoning as `cached` above: a failed cache write must not discard
    // a fetch that succeeded.
    try {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(file, JSON.stringify({ at: Date.now(), body }));
    } catch {
      // Read-only filesystem. Serve the fresh response anyway.
    }
    return { body, fresh: true };
  } catch (err) {
    // Today's key first, then any older snapshot for the same coordinates.
    const prefix = key.slice(0, key.lastIndexOf('_') + 1);
    for (const name of await newestFirst(cacheDir, prefix)) {
      try {
        const raw = JSON.parse(await readFile(path.join(cacheDir, name), 'utf8')) as {
          at: number;
          body: any;
        };
        return { body: raw.body, fresh: false };
      } catch {
        // Corrupt or unreadable; try the next one.
      }
    }
    throw err;
  }
}

/** Snapshot filenames for a prefix, newest date first. */
async function newestFirst(cacheDir: string, prefix: string): Promise<string[]> {
  try {
    const names = (await readdir(cacheDir)).filter(
      (n) => n.startsWith(prefix) && n.endsWith('.json'),
    );
    // The trailing date sorts lexicographically, which for ISO dates is
    // chronological.
    return names.sort().reverse();
  } catch {
    return [];
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
   * River discharge for a point, from the GloFAS-backed flood model.
   *
   * Most of this app's sites are not on a modelled river reach, and the model
   * answers those with a flat 0.00 m³/s rather than an error. That is not a
   * low-flow reading — it means "no reach here" — so callers must distinguish
   * the two rather than rendering a permanent zero that looks like a
   * measurement. `dischargeForecast` returns the series; `hasReach` is the
   * caller's test.
   */
  async dischargeForecast(days = 7, site: Site = SITE): Promise<DailyDischarge> {
    const url =
      `${FLOOD_URL}?latitude=${site.latitude}&longitude=${site.longitude}` +
      `&daily=river_discharge&forecast_days=${days}`;
    const body = await cached(
      this.cacheDir,
      `flood_${siteKey(site)}_${days}d`,
      30 * 60_000,
      () => getJson(url),
    );
    return body.daily as DailyDischarge;
  }

  /**
   * Daily forecast for the coming week.
   *
   * Takes a `site`, unlike `forecast()` which is pinned to the station. The
   * water balance is pure model arithmetic — reference evapotranspiration
   * against forecast rain — with no station calibration anywhere in it, so
   * unlike the spray and drying gates it can honestly travel to another
   * point. Same split the Season page already draws.
   *
   * Its own cache key, distinct from `forecast_Nd`, so it can never
   * invalidate the warm entry `/api/today` and `/api/outlook` depend on.
   */
  async dailyForecast(days = 7, site: Site = SITE): Promise<DailyForecast> {
    const url =
      `${FORECAST_URL}?latitude=${site.latitude}&longitude=${site.longitude}` +
      `&daily=${DAILY_FORECAST_VARS}&forecast_days=${days}` +
      `&timezone=${encodeURIComponent(site.timezone)}`;
    const body = await cached(
      this.cacheDir,
      `dailyfc_${siteKey(site)}_${days}d`,
      30 * 60_000,
      () => getJson(url),
    );
    return body.daily as DailyForecast;
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

    const url =
      `${ARCHIVE_URL}?latitude=${site.latitude}&longitude=${site.longitude}` +
      `&start_date=${startDate}&end_date=${endDate}&daily=${DAILY_VARS}` +
      `&timezone=${encodeURIComponent(site.timezone)}`;

    // `endDate` is today's date in Nairobi, so the key changes at local
    // midnight and yesterday's snapshot is a different filename. That is what
    // makes the ordering here load-bearing: pruning *before* the fetch deleted
    // every older snapshot — including the committed offline fallback — and
    // only then discovered the network was down. `cached()` then looked for a
    // stale entry under today's key, which had never been written, so a single
    // page load on a bad venue network destroyed the asset `.gitignore`
    // whitelists precisely to survive one, and left the Season page broken
    // even after connectivity returned.
    //
    // So: fetch first, prune only once a fresh snapshot is safely on disk.
    const { body, fresh } = await cachedArchive(this.cacheDir, key, 24 * 3600_000, () =>
      getJson(url),
    );

    if (fresh) {
      await pruneDailyCache(this.cacheDir, site, `${key}.json`);
    }

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
