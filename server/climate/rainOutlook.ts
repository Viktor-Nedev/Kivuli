import type { DailyRain } from './rainfall.js';

/**
 * How much rain is coming, measured against how much this site actually gets.
 *
 * ## The phrasing rule this module enforces
 *
 * An earlier draft of this feature was going to describe a 30 mm forecast day
 * as "a 1-in-11-year day". Measured against the committed 11.7-year record at
 * JKUAT, 30 mm is exceeded on 30 separate days — about **2.6 times a year**. A
 * true 1-in-11-year day here is roughly 85 mm, the record maximum. The error
 * came from reading a percentile of *rain days* as a percentile of *all days*,
 * and rain days are 67% of the record.
 *
 * Shipping that would have been precisely the manufactured alarm this project
 * exists to refuse — a serious-sounding rarity claim that its own data
 * disproves. So this module reports **measured frequency** ("a day this wet
 * happens about twice a year here") and never a rarity adjective. There is a
 * test that greps the generated headline for "1-in-N-year", "unprecedented"
 * and "record" and fails if any appear.
 *
 * ## Why the null state is the point
 *
 * At this site the next three days routinely forecast 0.0 mm. A warning that
 * only renders when something is wrong would be invisible at a demo and
 * indistinguishable from a broken feature. So the component always renders a
 * complete answer: the peak day ahead, the thresholds, and how often those
 * thresholds are really crossed. "0.0 mm, and this site sees 20 mm about every
 * seven weeks" is informative. The same code path turns amber when real rain
 * arrives — there is no separate alert branch to go stale.
 */

export interface RainThreshold {
  mm: number;
  /** Days meeting or exceeding `mm` in the reference record. */
  exceedances: number;
  /** Mean interval between exceedances, in months. Never a return period. */
  everyMonths: number;
}

export type RainOutlookLevel = 'none' | 'notable' | 'heavy';

export interface RainOutlook {
  level: RainOutlookLevel;
  /** Wettest single day in the horizon, mm. Zero is a valid, reportable answer. */
  peakDayMm: number;
  peakDate: string | null;
  totalMm: number;
  /** Midrank percentile of `peakDayMm` among all days in the record. */
  peakPercentile: number;
  thresholds: RainThreshold[];
  referenceYears: number;
  /** Days in the forecast horizon. */
  horizonDays: number;
  headline: string;
  headlineSw: string;
  detail: string;
  detailSw: string;
}

/** Thresholds in mm/day, from routine to genuinely rare at this kind of site. */
export const DEFAULT_LEVELS = [20, 40] as const;

const DAYS_PER_MONTH = 30.44;

/**
 * Exceedance statistics for a site, computed from that site's own record.
 *
 * Deliberately not hardcoded: 20 mm is unremarkable in Kisumu and notable in
 * Garissa. Deriving the scale per site is the same compare-like-with-like
 * principle `seasonalPercentile` already encodes, so the location picker's
 * other towns get their own baseline rather than JKUAT's imposed on them.
 */
export function rainThresholds(series: DailyRain[], levels: readonly number[]): RainThreshold[] {
  const days = series.length;
  if (!days) return levels.map((mm) => ({ mm, exceedances: 0, everyMonths: 0 }));

  const months = days / DAYS_PER_MONTH;
  return levels.map((mm) => {
    const exceedances = series.filter((d) => d.mm >= mm).length;
    return {
      mm,
      exceedances,
      // Zero exceedances means "never seen in this record", reported as 0
      // rather than Infinity so the UI can say so plainly.
      everyMonths: exceedances ? Math.round((months / exceedances) * 10) / 10 : 0,
    };
  });
}

/**
 * Midrank percentile of a value among the record.
 *
 * Midrank rather than a strict less-than count, for the same reason
 * `seasonalPercentile` uses it: most days here record no rain at all, so a
 * strict `<` would score a dry forecast day at the 0th percentile and imply
 * drought when the honest answer is "completely ordinary".
 */
function midrankPercentile(value: number, series: DailyRain[]): number {
  if (!series.length) return 50;
  const below = series.filter((d) => d.mm < value).length;
  const equal = series.filter((d) => d.mm === value).length;
  return Math.round(((below + equal / 2) / series.length) * 100);
}

/** Rounds to one decimal, avoiding -0. */
const r1 = (n: number) => Math.round(n * 10) / 10 + 0;

function describeFrequency(t: RainThreshold): string {
  if (!t.exceedances) return `${t.mm} mm has not occurred in this record`;
  if (t.everyMonths < 1.5) return `${t.mm} mm about every ${Math.round(t.everyMonths * 30)} days`;
  if (t.everyMonths < 18) return `${t.mm} mm about every ${Math.round(t.everyMonths)} months`;
  return `${t.mm} mm about once every ${Math.round(t.everyMonths / 12)} years`;
}

function describeFrequencySw(t: RainThreshold): string {
  if (!t.exceedances) return `mm ${t.mm} haijawahi kutokea katika rekodi hii`;
  if (t.everyMonths < 1.5) return `mm ${t.mm} kila takriban siku ${Math.round(t.everyMonths * 30)}`;
  if (t.everyMonths < 18) return `mm ${t.mm} kila takriban miezi ${Math.round(t.everyMonths)}`;
  return `mm ${t.mm} takriban mara moja kila miaka ${Math.round(t.everyMonths / 12)}`;
}

/**
 * Builds the forward rainfall statement.
 *
 * `forecastDaily` is the horizon summed to local calendar days; `series` is the
 * site's own multi-year daily record.
 */
export function buildRainOutlook(
  forecastDaily: { date: string; mm: number }[],
  series: DailyRain[],
): RainOutlook {
  const thresholds = rainThresholds(series, DEFAULT_LEVELS);
  const notable = thresholds[0];
  const heavy = thresholds[1];

  let peakDayMm = 0;
  let peakDate: string | null = null;
  let totalMm = 0;
  for (const d of forecastDaily) {
    totalMm += d.mm;
    if (d.mm > peakDayMm) {
      peakDayMm = d.mm;
      peakDate = d.date;
    }
  }

  const level: RainOutlookLevel =
    heavy && peakDayMm >= heavy.mm ? 'heavy' : notable && peakDayMm >= notable.mm ? 'notable' : 'none';

  const referenceYears = Math.round((series.length / 365.25) * 10) / 10;
  const peak = r1(peakDayMm);
  const horizonDays = forecastDaily.length;

  const freq = thresholds.map(describeFrequency).join(' and ');
  const freqSw = thresholds.map(describeFrequencySw).join(' na ');

  let headline: string;
  let headlineSw: string;

  if (level === 'heavy') {
    headline = `Heavy rain expected: ${peak} mm on ${peakDate}`;
    headlineSw = `Mvua kubwa inatarajiwa: mm ${peak} tarehe ${peakDate}`;
  } else if (level === 'notable') {
    headline = `A wet day ahead: ${peak} mm on ${peakDate}`;
    headlineSw = `Siku ya mvua inakuja: mm ${peak} tarehe ${peakDate}`;
  } else {
    headline = `No heavy rain in the next ${horizonDays} days`;
    headlineSw = `Hakuna mvua kubwa katika siku ${horizonDays} zijazo`;
  }

  const detail =
    `Wettest day ahead: ${peak} mm. This site records ${freq}, ` +
    `across ${referenceYears} years of reanalysis.` +
    (level === 'none' ? ' Nothing in this window approaches either.' : '');

  const detailSw =
    `Siku yenye mvua nyingi zaidi mbele: mm ${peak}. Eneo hili hupata ${freqSw}, ` +
    `kwa miaka ${referenceYears} ya rekodi.` +
    (level === 'none' ? ' Hakuna kinachokaribia katika kipindi hiki.' : '');

  return {
    level,
    peakDayMm: peak,
    peakDate,
    totalMm: r1(totalMm),
    peakPercentile: midrankPercentile(peakDayMm, series),
    thresholds,
    referenceYears,
    horizonDays,
    headline,
    headlineSw,
    detail,
    detailSw,
  };
}
