import type { Reading } from '../ingest/types.js';
import type { Site } from '../forecast/openMeteo.js';
import type { SolarDay } from './power.js';

/**
 * The station and the satellite, each checking the other.
 *
 * Two instruments look at the same sky from very different places, and each
 * sees something the other cannot:
 *
 *   - The **satellite** integrates a whole day into one number. The station's
 *     SI1145 cannot do that — its UV channel is dead and its visible channel
 *     reports raw counts, not energy.
 *   - The **station** samples every fifteen minutes. On the bundled day it
 *     catches ten sharp drops in visible light — cloud crossing the mast — and
 *     a daily satellite mean averages every one of them away.
 *
 * Neither is the reference. That is the point: the comparison says the two
 * describe the same day, which is a stronger claim than either making it alone.
 *
 * ## What is deliberately not computed
 *
 * **No counts-to-W/m² conversion.** `indices/drying.ts` already states that the
 * SI1145 reports "raw visible-light counts, not W/m²", and that the station and
 * forecast drying gates "answer the same question with different instruments
 * and are not interchangeable". Fitting a conversion on 43 daylight samples
 * from one day would contradict that, and `analysis/calibrate.py` refuses a
 * four-feature regression at a comparable sample size for the same reason.
 *
 * So the agreement figure correlates the station's counts against **modelled
 * solar elevation** — a dimensionless shape. That asks "does this sensor track
 * the sun?", which the data can answer, rather than "how many W/m² is 600
 * counts?", which it cannot.
 */

/**
 * Counts below which the sensor is reading its own dark floor.
 *
 * ~260 on every night row of the bundled sample. Named here rather than reused
 * from `DRYING.visCountsMin` (300): that constant is a *decision* threshold for
 * whether grain will dry, and this is a *description* of the instrument's
 * baseline. Tying them together would mean a change to one silently moving the
 * other.
 */
const DARK_FLOOR_COUNTS = 265;

/**
 * A fall this large inside one 15-minute step is cloud, not dusk.
 *
 * The sun's own change over a quarter of an hour near the equator is far
 * smaller than this; the drops in the sample run 130–380 counts.
 */
const CLOUD_DROP_COUNTS = 80;

/** Sun elevation below this is not usable daylight for the correlation. */
const DAYLIGHT_SIN_ELEVATION = 0.05;

export interface SolarCrossCheck {
  /** The satellite's daily total, MJ/m². Null when POWER returned a fill. */
  satelliteMJ: number | null;
  /**
   * Pearson r between station visible counts and modelled sun elevation,
   * across daylight samples only.
   *
   * Daylight only on purpose. Including night pairs the two series at
   * near-zero on both axes, which inflates r to 0.869 without describing
   * anything — the sensor agreeing that the sun is down is not evidence it
   * tracks the sun.
   */
  daylightAgreement: number | null;
  daylightSamples: number;
  /** 15-minute steps where light fell sharply. Cloud the satellite cannot see. */
  cloudEvents: number;
  /** Highest visible count of the day. */
  peakCounts: number;
  /** The sensor's night baseline, for scale. */
  darkFloorCounts: number;
  /** Set when there is nothing to compare; then a consumer draws no chart. */
  unavailable?: string;
}

/**
 * Sine of solar elevation for an instant at a site.
 *
 * The standard NOAA-style approximation: declination from day of year, hour
 * angle from local solar time. Good to a fraction of a degree, which is far
 * finer than this comparison needs — and unlike a library, it adds nothing to
 * install on a bandwidth-conscious project.
 *
 * Returns 0 below the horizon rather than a negative, since a sensor cannot
 * report less than darkness.
 */
export function sinSolarElevation(iso: string, site: Site): number {
  const d = new Date(iso);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((d.getTime() - start) / 86_400_000) + 1;

  const lat = (site.latitude * Math.PI) / 180;
  const dec = (23.44 * Math.PI) / 180 * Math.sin((2 * Math.PI * (284 + doy)) / 365);

  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  // Local solar time from longitude, not from the civil timezone: the sun does
  // not observe UTC+3.
  const solarHours = utcHours + site.longitude / 15;
  const hourAngle = ((15 * (solarHours - 12)) * Math.PI) / 180;

  const s =
    Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
  return Math.max(0, s);
}

const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

/** Pearson correlation. Null when the sample is too small or has no variance. */
function pearson(pairs: [number, number][]): number | null {
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    num += (x - mx) * (y - my);
    dx += (x - mx) ** 2;
    dy += (y - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  // A flat series has no shape to correlate. Reporting 0 would read as
  // disagreement; null reads as "not answerable", which is the truth.
  return den === 0 ? null : r3(num / den);
}

export function buildSolarCrossCheck(
  readings: Reading[],
  solar: SolarDay[],
  site: Site,
): SolarCrossCheck | null {
  const lit = readings.filter((r) => Number.isFinite(r.visCounts));
  if (!lit.length) return null;

  const counts = lit.map((r) => r.visCounts);
  const peakCounts = Math.max(...counts);

  const daylight: [number, number][] = [];
  for (const r of lit) {
    const elev = sinSolarElevation(r.ts, site);
    if (elev > DAYLIGHT_SIN_ELEVATION) daylight.push([elev, r.visCounts]);
  }

  // Consecutive-sample drops, in time order, daylight only — a fall at dusk is
  // the sun setting, not a cloud.
  const ordered = [...lit].sort((a, b) => a.ts.localeCompare(b.ts));
  let cloudEvents = 0;
  let prev: number | null = null;
  for (const r of ordered) {
    const isDay = sinSolarElevation(r.ts, site) > DAYLIGHT_SIN_ELEVATION;
    if (isDay && prev !== null && r.visCounts - prev < -CLOUD_DROP_COUNTS) cloudEvents += 1;
    prev = isDay ? r.visCounts : null;
  }

  const day = solar.find((d) => d.allSkyMJ !== null) ?? null;

  return {
    satelliteMJ: day?.allSkyMJ ?? null,
    daylightAgreement: pearson(daylight),
    daylightSamples: daylight.length,
    cloudEvents,
    peakCounts,
    darkFloorCounts: DARK_FLOOR_COUNTS,
    ...(day === null
      ? { unavailable: 'The satellite returned no usable value for this day.' }
      : {}),
  };
}
