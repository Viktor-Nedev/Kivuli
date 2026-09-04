/**
 * Rainfall climatology: how this season compares against the same window in
 * previous years.
 *
 * Pure functions over a daily series - no I/O, no network, no dates read from
 * the clock. Everything is derived from the array passed in, which is what
 * makes the honesty tests in `climate.test.ts` possible.
 *
 * ## The design decision this file exists to encode
 *
 * A naive drought indicator totals the last 90 days, sees a low number and
 * raises an alarm. At JKUAT on 2026-09-03 that would be badly wrong. Measured
 * against the eleven previous years:
 *
 *   30-day    11.9 mm vs median  23.6  ->  9th percentile
 *   90-day    36.0 mm vs median  76.5  ->  9th percentile
 *   180-day  496.6 mm vs median 478.5  -> 55th percentile
 *
 * The 90-day figure is low because **September is the dry season here** - it
 * averages 29 mm - not because the rains failed. The 180-day window covers the
 * long rains, and those arrived normally. Calling that a drought would be a lie
 * that this project's own data disproves.
 *
 * Two things follow, and both are structural rather than cosmetic:
 *
 *  1. `seasonalPercentile` compares each window against the window ending on
 *     the *same calendar day* in other years, never against the whole record.
 *     Seasonality is therefore divided out instead of being mistaken for
 *     anomaly.
 *  2. The caller is expected to render all three windows together. A single
 *     window cannot distinguish "dry season" from "failed season"; three can,
 *     and the disagreement between them is the actual information.
 */

/** One local calendar day of rainfall. `date` is `YYYY-MM-DD` in Africa/Nairobi. */
export interface DailyRain {
  date: string;
  mm: number;
  /** FAO-56 reference evapotranspiration for the same day, mm. */
  et0Mm?: number;
}

export type Category = 'very-dry' | 'dry' | 'normal' | 'wet' | 'very-wet';

export type WindowDays = 30 | 90 | 180;

export interface WindowStat {
  days: WindowDays;
  totalMm: number;
  medianMm: number;
  /** Percentile of this window against the same window in reference years. */
  percentile: number;
  /**
   * How many previous years the comparison had. Surfaced in the UI: with a
   * small n the extreme percentiles are not well resolved, and hiding that
   * would overstate the result's precision.
   */
  referenceYears: number;
  category: Category;
}

const DAY_MS = 86_400_000;

/** Percentile bands. Mirrors the standard SPI drought/wet classification. */
function categorise(percentile: number): Category {
  if (percentile < 10) return 'very-dry';
  if (percentile < 25) return 'dry';
  if (percentile <= 75) return 'normal';
  if (percentile <= 90) return 'wet';
  return 'very-wet';
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** `YYYY-MM-DD` -> UTC epoch ms. Date-only, so no timezone can shift it. */
function dayMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Index the series once; every window lookup below is then O(days). */
function indexBy(series: DailyRain[]): Map<string, DailyRain> {
  const m = new Map<string, DailyRain>();
  for (const row of series) m.set(row.date, row);
  return m;
}

function rollingTotalIndexed(
  index: Map<string, DailyRain>,
  endDate: string,
  days: number,
): { totalMm: number; coverage: number } {
  const end = dayMs(endDate);
  let total = 0;
  let present = 0;
  for (let i = 0; i < days; i++) {
    const row = index.get(toIso(end - i * DAY_MS));
    if (row) {
      total += row.mm;
      present++;
    }
  }
  return { totalMm: Math.round(total * 10) / 10, coverage: present / days };
}

/**
 * Total rainfall over the `days` ending on `endDate` inclusive.
 *
 * Missing days count as zero rather than aborting: ERA5 is gap-free in
 * practice, and a window that silently shrinks would compare unlike spans.
 * `coverage` reports how much of the window was actually present, so callers
 * can refuse to draw conclusions from a half-empty window.
 */
export function rollingTotal(
  series: DailyRain[],
  endDate: string,
  days: number,
): { totalMm: number; coverage: number } {
  return rollingTotalIndexed(indexBy(series), endDate, days);
}

/**
 * Where this window sits against the same window in every earlier year.
 *
 * The comparison is like-for-like by construction: a 90-day window ending
 * 3 September is scored only against 90-day windows ending 3 September. That
 * is what stops the dry season reading as a drought.
 *
 * Reference years with under 90% coverage are dropped rather than compared, so
 * a partial year cannot drag the median down and manufacture a wet anomaly.
 */
export function seasonalPercentile(
  series: DailyRain[],
  endDate: string,
  days: WindowDays,
): WindowStat {
  const index = indexBy(series);
  const current = rollingTotalIndexed(index, endDate, days);

  const endYear = Number(endDate.slice(0, 4));
  const suffix = endDate.slice(4); // '-MM-DD'
  const firstYear = series.length ? Number(series[0].date.slice(0, 4)) : endYear;

  const references: number[] = [];
  for (let y = firstYear; y < endYear; y++) {
    const ref = rollingTotalIndexed(index, `${y}${suffix}`, days);
    if (ref.coverage >= 0.9) references.push(ref.totalMm);
  }

  // With no reference years there is no anomaly to report - say "normal"
  // rather than inventing a percentile out of a single observation.
  if (!references.length) {
    return {
      days,
      totalMm: current.totalMm,
      medianMm: current.totalMm,
      percentile: 50,
      referenceYears: 0,
      category: 'normal',
    };
  }

  // Midrank, not a strict less-than count. Ties matter enormously here: in the
  // dry season every reference year collects 0 mm, and a strict `<` would score
  // that 0th percentile and label a completely ordinary September "very dry" -
  // exactly the false alarm this module exists to prevent. Splitting the tied
  // mass puts an unremarkable value at the median, where it belongs.
  const below = references.filter((r) => r < current.totalMm).length;
  const equal = references.filter((r) => r === current.totalMm).length;
  const percentile = Math.round(((below + equal / 2) / references.length) * 100);

  return {
    days,
    totalMm: current.totalMm,
    medianMm: Math.round(median(references) * 10) / 10,
    percentile,
    referenceYears: references.length,
    category: categorise(percentile),
  };
}

export interface MonthClimate {
  /** 1-12. */
  month: number;
  rainMm: number;
  et0Mm: number;
  /** rain - et0. Negative means the month loses more water than it gains. */
  balanceMm: number;
  years: number;
}

/**
 * Mean rainfall and reference evapotranspiration per calendar month.
 *
 * The balance column is the point. At this site only April, May and November
 * gain more water than they lose; the other nine months run a deficit. That is
 * the measured reason a storage tank matters here, and it comes from the data
 * rather than from a general claim about drought in the abstract.
 */
export function monthlyClimatology(series: DailyRain[]): MonthClimate[] {
  const rain = new Map<string, number>();
  const et0 = new Map<string, number>();
  for (const row of series) {
    const key = row.date.slice(0, 7); // YYYY-MM
    rain.set(key, (rain.get(key) ?? 0) + row.mm);
    et0.set(key, (et0.get(key) ?? 0) + (row.et0Mm ?? 0));
  }

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const out: MonthClimate[] = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const rains: number[] = [];
    const et0s: number[] = [];
    for (const [key, value] of rain) {
      if (key.slice(5) === mm) {
        rains.push(value);
        et0s.push(et0.get(key) ?? 0);
      }
    }
    const r = Math.round(mean(rains) * 10) / 10;
    const e = Math.round(mean(et0s) * 10) / 10;
    out.push({
      month: m,
      rainMm: r,
      et0Mm: e,
      balanceMm: Math.round((r - e) * 10) / 10,
      years: rains.length,
    });
  }
  return out;
}

export interface YearTotal {
  year: number;
  mm: number;
  /**
   * False when the year holds fewer than 360 days. A partial year is reported
   * as partial rather than charted beside complete ones as if the totals were
   * comparable.
   */
  complete: boolean;
  days: number;
}

export function annualTotals(series: DailyRain[]): YearTotal[] {
  const totals = new Map<number, { mm: number; days: number }>();
  for (const row of series) {
    const y = Number(row.date.slice(0, 4));
    const acc = totals.get(y) ?? { mm: 0, days: 0 };
    acc.mm += row.mm;
    acc.days++;
    totals.set(y, acc);
  }
  return [...totals.entries()]
    .map(([year, { mm, days }]) => ({
      year,
      mm: Math.round(mm * 10) / 10,
      days,
      complete: days >= 360,
    }))
    .sort((a, b) => a.year - b.year);
}

export type Season = 'MAM' | 'OND';

/** Search windows per rainy season, wide enough to catch early and late starts. */
const SEASON_WINDOW: Record<Season, { from: string; to: string }> = {
  MAM: { from: '02-01', to: '05-31' },
  OND: { from: '09-15', to: '12-31' },
};

const ONSET_TRIGGER_MM = 20;
const ONSET_TRIGGER_DAYS = 3;
const ONSET_CONFIRM_DAYS = 21;
const DRY_SPELL_DAYS = 10;
const DRY_DAY_MM = 1.0;

/**
 * First day of the rains, by the standard agronomic definition: at least
 * 20 mm across 3 days, with no dry spell of 10 days or more in the 3 weeks
 * that follow.
 *
 * The confirmation half is the part that matters. A single 25 mm storm in
 * February looks exactly like an onset and is the classic false start - a
 * farmer who plants on it loses the seed when three dry weeks follow. Checking
 * the following 21 days is what separates the two, and `climate.test.ts` pins
 * that behaviour.
 *
 * Returns `YYYY-MM-DD`, or null when no qualifying start occurs in the window.
 */
export function detectOnset(series: DailyRain[], year: number, season: Season): string | null {
  const index = indexBy(series);
  const { from, to } = SEASON_WINDOW[season];
  const start = dayMs(`${year}-${from}`);
  const end = dayMs(`${year}-${to}`);

  for (let day = start; day <= end; day += DAY_MS) {
    // The trigger window *ends* on the candidate day. Summing forwards instead
    // would report the onset up to two days before the rain actually fell,
    // because a dry day followed by a downpour would already satisfy the
    // threshold. The onset is the day the rain arrives, not the day a window
    // containing it opens.
    let trigger = 0;
    for (let i = 0; i < ONSET_TRIGGER_DAYS; i++) {
      trigger += index.get(toIso(day - i * DAY_MS))?.mm ?? 0;
    }
    if (trigger < ONSET_TRIGGER_MM) continue;

    let run = 0;
    let falseStart = false;
    for (let i = 1; i <= ONSET_CONFIRM_DAYS; i++) {
      const mm = index.get(toIso(day + i * DAY_MS))?.mm ?? 0;
      run = mm < DRY_DAY_MM ? run + 1 : 0;
      if (run >= DRY_SPELL_DAYS) {
        falseStart = true;
        break;
      }
    }
    if (!falseStart) return toIso(day);
  }
  return null;
}

export interface OnsetDistribution {
  season: Season;
  years: { year: number; onset: string | null }[];
  /**
   * Median as a month-day string, e.g. '03-20'. Rendered without a year
   * precisely because it is not a prediction for any particular year.
   */
  medianMonthDay: string | null;
  earliestMonthDay: string | null;
  latestMonthDay: string | null;
  /**
   * Days between the earliest and latest onset on record. At JKUAT this is
   * 82 days for the long rains - the spread, not the median, is the message.
   */
  spreadDays: number;
  observedYears: number;
}

function dayOfYear(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / DAY_MS) + 1;
}

/** Day-of-year -> 'MM-DD', via a non-leap reference year. */
function monthDayFromDoy(doy: number): string {
  const ms = Date.UTC(2001, 0, 1) + (doy - 1) * DAY_MS;
  return new Date(ms).toISOString().slice(5, 10);
}

function emptyOnset(
  season: Season,
  years: { year: number; onset: string | null }[],
): OnsetDistribution {
  return {
    season,
    years,
    medianMonthDay: null,
    earliestMonthDay: null,
    latestMonthDay: null,
    spreadDays: 0,
    observedYears: 0,
  };
}

/**
 * Onset across every year on record.
 *
 * Deliberately returns a distribution rather than a single date. At JKUAT the
 * long rains have started anywhere between 1 February and 24 April - an 82-day
 * spread over eleven years. A median presented on its own would read as a
 * planting recommendation and would be wrong in most individual years; the
 * spread tells a farmer when to *start watching*, which is a claim the data
 * actually supports.
 */
export function onsetDistribution(series: DailyRain[], season: Season): OnsetDistribution {
  if (!series.length) return emptyOnset(season, []);

  const firstYear = Number(series[0].date.slice(0, 4));
  const lastYear = Number(series[series.length - 1].date.slice(0, 4));

  const years: { year: number; onset: string | null }[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    years.push({ year: y, onset: detectOnset(series, y, season) });
  }

  const doys = years.filter((y) => y.onset).map((y) => dayOfYear(y.onset as string));
  if (!doys.length) return emptyOnset(season, years);

  return {
    season,
    years,
    medianMonthDay: monthDayFromDoy(Math.round(median(doys))),
    earliestMonthDay: monthDayFromDoy(Math.min(...doys)),
    latestMonthDay: monthDayFromDoy(Math.max(...doys)),
    spreadDays: Math.max(...doys) - Math.min(...doys),
    observedYears: doys.length,
  };
}

/**
 * Runoff coefficient: the fraction of rain landing on a roof that reaches the
 * tank. 0.8 is the usual figure for corrugated iron, the dominant roofing
 * material in the region.
 *
 * A published engineering convention, not something measured here, so the UI
 * states it beside the result rather than burying it.
 */
export const RUNOFF_COEFFICIENT = 0.8;

/**
 * Litres a roof can harvest from a given annual depth.
 *
 * 1 mm over 1 m2 is exactly 1 litre, so this is depth x area x coefficient
 * with no unit fudge. It is an upper bound on what the roof *catches*: it
 * ignores first-flush diversion, gutter losses and overflow once the tank is
 * full, all of which reduce delivered water.
 */
export function harvestPotential(
  annualMm: number,
  roofM2: number,
  runoffCoeff: number = RUNOFF_COEFFICIENT,
): number {
  return Math.round(annualMm * roofM2 * runoffCoeff);
}
