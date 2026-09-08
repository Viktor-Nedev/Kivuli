import type { DailyDischarge } from '../forecast/openMeteo.js';

/**
 * River discharge, where a river actually exists.
 *
 * The brief asks for flood risk, and the free GloFAS-backed model does answer
 * for Kenya — Nyando near Kisumu returns a 39.9 m³/s peak. But it returns
 * **0.00 m³/s at JKUAT**, because the campus is not on a modelled river reach.
 * That zero is not a low-flow reading; it means the model has nothing to say
 * about this point.
 *
 * Rendering it as a number would be the worst kind of dishonesty available
 * here: a permanent, confident-looking zero that a reader would take for a
 * measurement. So this module reports the absence explicitly, and the panel
 * says "no modelled reach" rather than showing a gauge pinned at nothing.
 *
 * What this is not: a flood forecast for a specific field. Discharge is a
 * catchment-scale quantity on a coarse grid, with no local terrain, no
 * drainage network and no defence data behind it. It says whether the river is
 * rising, not whether anyone's land will flood.
 */

export interface DischargeDay {
  date: string;
  cumecs: number;
}

export interface RiverOutlook {
  /** False when the model has no reach at this point — the JKUAT case. */
  hasReach: boolean;
  days: DischargeDay[];
  peakCumecs: number;
  peakDate: string | null;
  /** Peak against the horizon mean, as a rise multiple. Null without a reach. */
  riseFactor: number | null;
  headline: string;
  headlineSw: string;
  detail: string;
}

/** Below this the model is reporting "no reach", not a trickle. */
const REACH_THRESHOLD_CUMECS = 0.01;

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

export function buildRiverOutlook(daily: DailyDischarge, place: string): RiverOutlook {
  const days: DischargeDay[] = (daily.time ?? []).map((date, i) => ({
    date,
    cumecs: daily.river_discharge?.[i] ?? 0,
  }));

  const peak = days.reduce(
    (best, d) => (d.cumecs > best.cumecs ? d : best),
    { date: '', cumecs: 0 } as DischargeDay,
  );
  const hasReach = peak.cumecs >= REACH_THRESHOLD_CUMECS;

  if (!hasReach) {
    return {
      hasReach: false,
      days,
      peakCumecs: 0,
      peakDate: null,
      riseFactor: null,
      headline: `${place} is not on a modelled river`,
      headlineSw: `${place} haiko kwenye mto uliopimwa`,
      detail:
        'The global flood model resolves major river reaches, and there is none at this point. ' +
        'That is an absence of data, not a reading of zero flow — a stream too small for the ' +
        'model to carry can still flood a field.',
    };
  }

  const mean = days.reduce((a, d) => a + d.cumecs, 0) / (days.length || 1);
  const riseFactor = mean > 0 ? r2(peak.cumecs / mean) : null;
  const rising = riseFactor !== null && riseFactor > 1.5;

  return {
    hasReach: true,
    days: days.map((d) => ({ date: d.date, cumecs: r2(d.cumecs) })),
    peakCumecs: r2(peak.cumecs),
    peakDate: peak.date,
    riseFactor,
    headline: rising
      ? `River rising near ${place}: ${r2(peak.cumecs)} m³/s expected`
      : `River steady near ${place}: ${r2(peak.cumecs)} m³/s at peak`,
    headlineSw: rising
      ? `Mto unapanda karibu na ${place}: m³/s ${r2(peak.cumecs)} inatarajiwa`
      : `Mto uko sawa karibu na ${place}: m³/s ${r2(peak.cumecs)} kilele`,
    detail: rising
      ? `Peak flow is ${riseFactor}x the week's average, on ${peak.date}. This is catchment-scale ` +
        'discharge on a coarse grid — it says the river is rising, not whose land will flood.'
      : `Peak flow is ${riseFactor ?? 1}x the week's average. This is catchment-scale discharge ` +
        'on a coarse grid, not a flood forecast for any particular field.',
  };
}
