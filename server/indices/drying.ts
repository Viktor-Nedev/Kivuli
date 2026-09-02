import type { Reading } from '../ingest/types.js';
import type { Window } from './spray.js';

/**
 * Grain drying suitability.
 *
 * Maize and other grain must reach a safe moisture content before storage.
 * Spreading grain when the air cannot absorb moisture wastes the day; leaving
 * it out after conditions turn re-wets it, which invites aflatoxin.
 *
 * Gate on relative humidity plus available sunlight. The SI1145 reports raw
 * visible-light counts, not W/m², so the threshold below is a sensor-specific
 * daylight cutoff calibrated against the sample day, not a physical irradiance.
 */

export const DRYING = {
  humidityMaxPct: 60,
  /** SI1145 visible counts. ~260 is the night floor in the sample. */
  visCountsMin: 300,
} as const;

export interface DryingAssessment {
  ts: string;
  humidityPct: number;
  visCounts: number;
  pass: boolean;
  reason: string;
}

export function assessDrying(r: Reading, rainWithinLookahead: boolean): DryingAssessment {
  const reasons: string[] = [];
  if (r.humidityPct >= DRYING.humidityMaxPct) {
    reasons.push(`Humidity ${r.humidityPct.toFixed(0)}% — air too damp to dry grain`);
  }
  if (!(r.visCounts >= DRYING.visCountsMin)) {
    reasons.push('Not enough sunlight');
  }
  if (rainWithinLookahead) reasons.push('Rain forecast — keep grain covered');

  return {
    ts: r.ts,
    humidityPct: r.humidityPct,
    visCounts: r.visCounts,
    pass: reasons.length === 0,
    reason: reasons.join('; '),
  };
}

/**
 * The single best drying window of the day.
 *
 * Returns the longest contiguous passing run, so the advice is one clear
 * "spread now, cover by" instruction rather than a scatter of short slots.
 */
export function bestDryingWindow(assessments: DryingAssessment[]): Window | null {
  let best: Window | null = null;
  let bestMs = 0;
  let open: Window | null = null;

  const close = () => {
    if (!open) return;
    const ms = new Date(open.end).getTime() - new Date(open.start).getTime();
    if (ms >= bestMs) {
      bestMs = ms;
      best = open;
    }
    open = null;
  };

  for (const a of assessments) {
    if (a.pass) {
      if (open) open.end = a.ts;
      else open = { start: a.ts, end: a.ts };
    } else close();
  }
  close();
  return best;
}
