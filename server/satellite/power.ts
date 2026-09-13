import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { siteKey, type Site } from '../forecast/openMeteo.js';

/**
 * Solar irradiance from NASA POWER.
 *
 * The Conduit's stated purpose is that its measurements "contribute to the
 * calibration and validation of satellite observations and digital models".
 * Until now this app validated the station against a *model* — ERA5 — and
 * never against an actual satellite. This is the other half of that sentence.
 *
 * POWER needs no API key and no registration, which matters for a project that
 * has to run on a judge's laptop and a rural connection. It reports downward
 * shortwave at the surface, derived from geostationary observations.
 *
 * ## Daily only, and that is not a shortcut
 *
 * POWER's hourly endpoint returns -999 — its fill value — for this station's
 * sample date. Charting an hourly satellite curve would mean inventing the
 * numbers. The daily series is complete (twelve consecutive days with zero
 * fills when tested), so the feature is daily and says so.
 *
 * `CLRSKY_SFC_SW_DWN` was also tested and is missing on thirteen of seventeen
 * days sampled, so the obvious "fraction of a clear day" ratio cannot be
 * computed reliably and is not offered.
 */

const POWER_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';

/**
 * Its own variable list, never shared with the Open-Meteo constants.
 *
 * The same reasoning as the archive/forecast split next door: a change here
 * must not be able to invalidate a warm cache another route depends on.
 */
const POWER_VARS = 'ALLSKY_SFC_SW_DWN';

/** NASA's fill value. Never a reading, and never allowed to become one. */
const FILL = -999;

export interface SolarDay {
  /** `YYYY-MM-DD`. */
  date: string;
  /**
   * All-sky downward shortwave at the surface, MJ/m² per day.
   *
   * Null when POWER returned its fill value. Kept as null rather than dropped
   * so a consumer can tell "the satellite had nothing for this day" apart from
   * "this day was not requested" — the two mean different things and only one
   * is worth reporting to a reader.
   */
  allSkyMJ: number | null;
}

/** `2026-09-01` -> `20260901`, the format POWER's start/end parameters take. */
const compact = (isoDate: string) => isoDate.replaceAll('-', '');

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER ${res.status} for ${url}`);
  return res.json();
}

/**
 * Disk cache, deliberately a local copy of the one in `openMeteo.ts`.
 *
 * That helper is module-private there, and widening the export surface of the
 * file every other upstream depends on — days before a deadline — is a worse
 * trade than twenty duplicated lines. The behaviour is the same and for the
 * same reason: a stale reading beats no reading when the venue network dies.
 */
async function cached<T>(
  cacheDir: string,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const file = path.join(cacheDir, `${key}.json`);
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as { at: number; body: T };
    if (Date.now() - raw.at < ttlMs) return raw.body;
  } catch {
    // No usable entry; fall through and fetch.
  }

  try {
    const body = await load();
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify({ at: Date.now(), body }));
    return body;
  } catch (err) {
    try {
      const raw = JSON.parse(await readFile(file, 'utf8')) as { at: number; body: T };
      return raw.body;
    } catch {
      throw err;
    }
  }
}

/**
 * Maps POWER's response envelope to `SolarDay[]`.
 *
 * Exported for the tests: the fill-value handling is the one piece of this
 * module whose failure would be silent and expensive, so it is unit-tested
 * directly rather than only through the client.
 */
export function parseSolarDays(body: any): SolarDay[] {
  const param = body?.properties?.parameter?.[POWER_VARS];
  if (!param || typeof param !== 'object') return [];

  return Object.keys(param)
    .sort()
    .map((k) => {
      const raw = Number(param[k]);
      // A fill is not a small number, it is the absence of one. Averaging it
      // in would drag a daily total to nonsense while still looking numeric.
      const usable = Number.isFinite(raw) && raw !== FILL && raw >= 0;
      return {
        date: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`,
        allSkyMJ: usable ? raw : null,
      };
    });
}

export class NasaPowerClient {
  constructor(private readonly cacheDir: string) {}

  /**
   * Daily all-sky shortwave for a site, inclusive of both dates.
   *
   * Its own `solar_` key prefix, carrying the site — the same rule the archive
   * cache follows, and for the same reason: one location must never be able to
   * serve another's figures.
   */
  async dailySolar(site: Site, from: string, to: string): Promise<SolarDay[]> {
    const key = `solar_${siteKey(site)}_${from}_${to}`;
    const url =
      `${POWER_URL}?parameters=${POWER_VARS}&community=AG` +
      `&latitude=${site.latitude}&longitude=${site.longitude}` +
      `&start=${compact(from)}&end=${compact(to)}&format=JSON`;

    const body = await cached(this.cacheDir, key, 24 * 3600_000, () => getJson(url));
    return parseSolarDays(body);
  }
}
