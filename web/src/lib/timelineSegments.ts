import type { TimelinePoint } from './types';
import { DAY_MINUTES, makeDayAxis } from './format';

/**
 * Shared day-band geometry for the working-day timeline.
 *
 * Extracted from `Timeline.tsx` so the full-width timeline and the mini bars
 * on the Overview decision cards draw from one implementation. Importing
 * these helpers from the component module instead would drag the whole
 * `Timeline` component (and its state) into the Overview bundle.
 */

export type BandKey = 'spray' | 'drying' | 'heat';

export interface Segment {
  startPct: number;
  widthPct: number;
  pass: boolean;
  reason: string;
  startTs: string;
  endTs: string;
}

export interface DayAxis {
  /** Maps an ISO timestamp to minutes from the axis origin. */
  axis: (iso: string) => number;
  /** Total width of the axis in minutes. */
  span: number;
  /** Three-hourly ticks: `minutes` is the offset, `label` the absolute minute. */
  hours: { minutes: number; label: number }[];
}

/**
 * Builds the day axis for a series, anchored to whole hours either side so
 * tick labels land on round times.
 */
export function dayAxisFor(points: TimelinePoint[]): DayAxis {
  const raw = makeDayAxis(points[0]?.ts ?? new Date().toISOString());
  const first = points.length ? raw(points[0].ts) : 0;
  const last = points.length ? raw(points[points.length - 1].ts) : DAY_MINUTES;

  const from = Math.floor(first / 60) * 60;
  const to = Math.ceil(last / 60) * 60;
  const width = Math.max(to - from, 60);

  const ticks: number[] = [];
  for (let m = from; m <= to; m += 180) ticks.push(m);

  return {
    axis: (iso: string) => raw(iso) - from,
    span: width,
    hours: ticks.map((m) => ({ minutes: m - from, label: m })),
  };
}

/** Collapses consecutive equal-state points into drawable segments. */
export function segmentsFor(
  points: TimelinePoint[],
  key: BandKey,
  axis: (iso: string) => number,
  span: number,
): Segment[] {
  const stateOf = (p: TimelinePoint) =>
    key === 'spray' ? p.spray.pass : key === 'drying' ? p.drying.pass : p.heatBand === 'continuous';
  const reasonOf = (p: TimelinePoint) =>
    key === 'spray' ? p.spray.reason : key === 'drying' ? p.drying.reason : '';

  const out: Segment[] = [];
  let run: { pass: boolean; from: string; to: string; reason: string } | null = null;

  const push = () => {
    if (!run) return;
    const start = axis(run.from);
    // Give a single-sample run a visible width rather than a zero-width sliver.
    const end = Math.max(axis(run.to), start + 8);
    out.push({
      startPct: (start / span) * 100,
      widthPct: ((end - start) / span) * 100,
      pass: run.pass,
      reason: run.reason,
      startTs: run.from,
      endTs: run.to,
    });
    run = null;
  };

  for (const p of points) {
    const pass = stateOf(p);
    if (run && run.pass === pass) run.to = p.ts;
    else {
      push();
      run = { pass, from: p.ts, to: p.ts, reason: reasonOf(p) };
    }
  }
  push();
  return out;
}
