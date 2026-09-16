import { BANDS, HEAT_FIRST_RESTRICTION_C, assessHeat } from '../indices/heat.js';
import { SPRAY, assessSpray } from '../indices/spray.js';
import type { Reading } from '../ingest/types.js';
import type { RainOutlook } from '../climate/rainOutlook.js';
import type { RiverOutlook } from '../climate/rivers.js';

/**
 * The watch layer: standing thresholds on quantities this project already
 * computes, evaluated against the same data the dashboard shows.
 *
 * ## Why this reuses the index functions rather than declaring its own limits
 *
 * A watch that disagreed with the page would be worse than no watch at all: a
 * farmer told "spray now" by one screen and warned off by another has been
 * given nothing. So every threshold here is imported. `SPRAY` carries the
 * spray gates, `BANDS` and `HEAT_FIRST_RESTRICTION_C` the ISO 7243 work/rest
 * allocation, and the rain judgement is delegated whole to the outlook the
 * rain panel already displays. There is exactly one definition of each limit
 * in this codebase, and it is not in this file.
 *
 * ## Why a clear watch reports its distance from firing
 *
 * The bundled sample day is quiet: measured WBGT peaks at 21.5 °C, well below
 * the first work/rest threshold. A detector that prints nothing on a quiet day
 * is indistinguishable from a detector that is broken, and that is the most
 * common way an alerting demo misleads the person watching it.
 *
 * So a clear watch carries `marginToFire` and the threshold it was compared
 * against. "Clear — WBGT 21.5 °C, 6.5 °C below the 28 °C threshold" is a
 * working detector reporting that there is nothing to report, and reads as
 * one. The alternative, inventing an event so the feature looks alive, would
 * contradict the provenance discipline the rest of this project is built on.
 */

export type WatchState = 'firing' | 'clear' | 'unavailable';

export type WatchId = 'heat' | 'spray' | 'rain' | 'river';

export interface Watch {
  id: WatchId;
  /** Short human name, as it appears in the interface. */
  label: string;
  state: WatchState;
  /** What the watch is protecting against, in one line. */
  hazard: string;
  /** The current value, already rounded for display. Null when unavailable. */
  value: number | null;
  /** Unit suffix, written to read correctly straight after `value`. */
  unit: string;
  /** The limit `value` is compared against. Null when there is no single one. */
  threshold: number | null;
  /**
   * How far the value sits from firing, in the same unit. Positive means clear
   * by this much. Null when firing, or when no numeric margin is meaningful.
   */
  marginToFire: number | null;
  /** Where the number came from, in the project's provenance vocabulary. */
  provenance: 'measured' | 'bias_corrected' | 'raw_forecast' | 'reanalysis';
  /** One sentence stating the current finding. */
  summary: string;
  /** Why this watch cannot answer, when `state` is 'unavailable'. */
  reason?: string;
}

const round1 = (n: number): number => Number(n.toFixed(1));

/**
 * Heat: does the working day need a rest allocation?
 *
 * Fires when measured WBGT reaches the first ISO 7243 restriction band. Uses
 * the day's peak rather than the latest reading, because a watch exists to
 * answer "will today need rest breaks", and that is set by the hottest hour
 * rather than by whenever the page happened to load.
 */
export function heatWatch(readings: Reading[]): Watch {
  const base = {
    id: 'heat' as const,
    label: 'Heat stress',
    hazard: 'Outdoor work without rest breaks in high wet-bulb globe temperature',
    unit: ' °C WBGT',
    provenance: 'measured' as const,
  };

  if (!readings.length) {
    return {
      ...base,
      state: 'unavailable',
      value: null,
      threshold: null,
      marginToFire: null,
      summary: 'No station readings, so heat stress cannot be assessed.',
      reason: 'The station returned no observations for this day.',
    };
  }

  const peak = readings.map((r) => assessHeat(r)).reduce((a, b) => (b.wbgtC > a.wbgtC ? b : a));
  const firing = peak.wbgtC >= HEAT_FIRST_RESTRICTION_C;
  const band = BANDS.find((b) => peak.wbgtC < b.max);
  const margin = round1(HEAT_FIRST_RESTRICTION_C - peak.wbgtC);

  return {
    ...base,
    state: firing ? 'firing' : 'clear',
    value: peak.wbgtC,
    threshold: HEAT_FIRST_RESTRICTION_C,
    marginToFire: firing ? null : margin,
    summary: firing
      ? `Peak WBGT ${peak.wbgtC} °C. ${band?.instruction ?? 'Stop outdoor work until conditions ease'}.`
      : `Peak WBGT ${peak.wbgtC} °C, ${margin} °C below the ${HEAT_FIRST_RESTRICTION_C} °C work/rest threshold.`,
  };
}

/**
 * Spray: is there any window today in which spraying is safe?
 *
 * Inverted relative to the others. This one fires when *no* window exists,
 * because what a farmer loses is a day with no safe hour in it rather than the
 * arrival of a hazard. The value reported is the count of suitable readings,
 * so the firing condition reads as "0 of 95".
 */
export function sprayWatch(readings: Reading[], rainWithinLookahead: boolean): Watch {
  const base = {
    id: 'spray' as const,
    label: 'Spray window',
    hazard: 'A whole day with no safe spraying window: drift, evaporation or wash-off',
    unit: ' suitable readings',
    provenance: 'measured' as const,
  };

  if (!readings.length) {
    return {
      ...base,
      state: 'unavailable',
      value: null,
      threshold: null,
      marginToFire: null,
      summary: 'No station readings, so spray conditions cannot be assessed.',
      reason: 'The station returned no observations for this day.',
    };
  }

  const assessments = readings.map((r) => assessSpray(r, rainWithinLookahead));
  const ok = assessments.filter((a) => a.pass).length;

  // Name the commonest blocker, so a closed day tells the reader what to watch
  // rather than only that it is closed.
  const tally = new Map<string, number>();
  for (const a of assessments) for (const f of a.failures) tally.set(f, (tally.get(f) ?? 0) + 1);
  const worst = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const blocker = assessments.find(
    (a) => worst !== undefined && a.failures.includes(worst as never),
  );

  return {
    ...base,
    state: ok === 0 ? 'firing' : 'clear',
    value: ok,
    threshold: 1,
    marginToFire: ok === 0 ? null : ok,
    summary:
      ok === 0
        ? `No safe spray window today${blocker?.reason ? `. ${blocker.reason}` : ''}.`
        : `${ok} of ${assessments.length} readings meet every spray gate (Delta-T ${SPRAY.deltaTMin}–${SPRAY.deltaTMax} °C, wind ${SPRAY.windMinMs}–${SPRAY.windMaxMs} m/s).`,
  };
}

/**
 * Rain: is heavy rain coming, measured against what this site actually gets?
 *
 * The judgement is delegated entirely to `buildRainOutlook`, which grades the
 * forecast peak against this site's own multi-year percentiles. 20 mm means
 * something different here than in a drier catchment, and that comparison is
 * the part worth having.
 */
export function rainWatch(outlook: RainOutlook | null): Watch {
  const base = {
    id: 'rain' as const,
    label: 'Heavy rain',
    hazard: 'Field work, drying and spraying disrupted by heavy rain',
    unit: ' mm',
    provenance: 'raw_forecast' as const,
  };

  if (!outlook) {
    return {
      ...base,
      state: 'unavailable',
      value: null,
      threshold: null,
      marginToFire: null,
      summary: 'The forecast is unreachable, so rain cannot be assessed.',
      reason: 'The forecast service did not answer.',
    };
  }

  // `heavy` is the outlook's own word for rain that is heavy against this
  // site's record. `notable` is a wet day worth knowing about but not a
  // warning, so only the former fires: a watch that cried out for every wet
  // day in Juja would be ignored by the second week.
  const firing = outlook.level === 'heavy';
  // Cite the same ladder the rain panel shows rather than a second one.
  const trigger = outlook.thresholds.length
    ? Math.min(...outlook.thresholds.map((t) => t.mm))
    : null;

  return {
    ...base,
    state: firing ? 'firing' : 'clear',
    value: round1(outlook.peakDayMm),
    threshold: trigger === null ? null : round1(trigger),
    marginToFire:
      firing || trigger === null ? null : round1(Math.max(trigger - outlook.peakDayMm, 0)),
    summary: outlook.headline,
  };
}

/**
 * River: is discharge on the nearest modelled reach rising?
 *
 * Reported rather than graded. `server/climate/rivers.ts` is explicit that the
 * global flood model resolves major river reaches and does not answer for a
 * specific field, so this watch surfaces the model's own verdict and declines
 * to invent a threshold the data cannot support. At JKUAT there is no reach at
 * all, which is why `unavailable` here is the ordinary case rather than a
 * failure — and saying so is more useful than a green tick implying the river
 * has been checked.
 */
export function riverWatch(river: RiverOutlook | null): Watch {
  const base = {
    id: 'river' as const,
    label: 'River discharge',
    hazard: 'Rising discharge on the nearest modelled river reach',
    unit: ' m³/s',
    provenance: 'reanalysis' as const,
  };

  if (!river || !river.hasReach) {
    return {
      ...base,
      state: 'unavailable',
      value: null,
      threshold: null,
      marginToFire: null,
      summary: 'No modelled river reach at this location.',
      reason:
        river?.detail ??
        'The global flood model resolves major river reaches, and there is none at this point.',
    };
  }

  // The outlook already computes the peak against the horizon mean. A clear
  // doubling is the thing worth raising; below that the reach is simply
  // flowing, which the headline already says.
  const RISE_FACTOR_TRIGGER = 2;
  const rise = river.riseFactor;
  const firing = rise !== null && rise >= RISE_FACTOR_TRIGGER;

  return {
    ...base,
    state: firing ? 'firing' : 'clear',
    value: round1(river.peakCumecs),
    // The rise multiple, not the discharge: 0.65 m³/s means nothing without
    // knowing the reach, while "3.45x the week's average" is the finding.
    threshold: RISE_FACTOR_TRIGGER,
    marginToFire: firing || rise === null ? null : round1(RISE_FACTOR_TRIGGER - rise),
    // The caveat travels with the alert. This is catchment-scale discharge on
    // a coarse grid: it says the river is rising, not that anyone's land will
    // flood, and an alert that dropped that distinction would be read as a
    // flood warning the data cannot support.
    summary: firing
      ? `${river.headline} — ${rise}× the week's average. Catchment-scale discharge, not a field-level flood forecast.`
      : river.headline,
  };
}

/** Every watch, in the order the interface lists them. */
export function buildWatches(input: {
  readings: Reading[];
  rainWithinLookahead: boolean;
  rain: RainOutlook | null;
  river: RiverOutlook | null;
}): Watch[] {
  return [
    heatWatch(input.readings),
    sprayWatch(input.readings, input.rainWithinLookahead),
    rainWatch(input.rain),
    riverWatch(input.river),
  ];
}
