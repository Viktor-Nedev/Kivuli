import type { Reading } from '../ingest/types.js';
import { assessSpray, sprayWindows, type SprayAssessment, type Window } from '../indices/spray.js';
import { assessDrying, bestDryingWindow, type DryingAssessment } from '../indices/drying.js';
import { assessHeat, assessThi } from '../indices/heat.js';

/**
 * Turns index output into the single instruction shown at the top of the app.
 *
 * Everything here is phrased in active voice with a time attached: the user is
 * deciding whether to send a crew out now, not reading a metric.
 */

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });

/** Bilingual instruction. Swahili is the field-facing language here. */
export interface Instruction {
  headline: string;
  headlineSw: string;
  detail: string;
  status: 'go' | 'wait' | 'stop';
}

/** The next window opening strictly after `from`. */
function nextWindow(windows: Window[], from: string): Window | null {
  return windows.find((w) => w.start > from) ?? null;
}

export function sprayInstruction(
  now: SprayAssessment,
  windows: Window[],
): Instruction {
  if (now.pass) {
    const current = windows.find((w) => w.start <= now.ts && now.ts <= w.end);
    // Only promise an end time that is still ahead: the last sample of a
    // window is itself the end, and "spray until 18:48" at 18:48 reads as
    // already expired.
    const endsAhead = current && current.end > now.ts ? current.end : null;
    const until = endsAhead ? ` until ${hhmm(endsAhead)}` : '';
    return {
      status: 'go',
      headline: `Spray now${until}`,
      headlineSw: `Nyunyiza sasa${endsAhead ? ` hadi saa ${hhmm(endsAhead)}` : ''}`,
      detail: `Delta-T ${now.deltaT} °C, wind ${now.windSpeedMs} m/s — both inside the safe band.`,
    };
  }

  const next = nextWindow(windows, now.ts);
  if (next) {
    return {
      status: 'wait',
      headline: `Do not spray now — wait until ${hhmm(next.start)}`,
      headlineSw: `Usinyunyize sasa — subiri hadi saa ${hhmm(next.start)}`,
      detail: now.reason,
    };
  }

  return {
    status: 'stop',
    headline: 'Do not spray today — no safe window left',
    headlineSw: 'Usinyunyize leo — hakuna muda salama uliobaki',
    detail: now.reason,
  };
}

export function dryingInstruction(
  now: DryingAssessment,
  window: Window | null,
): Instruction {
  if (window && now.pass) {
    return {
      status: 'go',
      headline: `Spread grain now — cover by ${hhmm(window.end)}`,
      headlineSw: `Anika nafaka sasa — funika kabla ya saa ${hhmm(window.end)}`,
      detail: `Humidity ${now.humidityPct.toFixed(0)}% with full sun. Drying window runs ${hhmm(window.start)}–${hhmm(window.end)}.`,
    };
  }

  if (window && window.start > now.ts) {
    return {
      status: 'wait',
      headline: `Keep grain covered — spread from ${hhmm(window.start)}`,
      headlineSw: `Weka nafaka imefunikwa — anika kuanzia saa ${hhmm(window.start)}`,
      detail: now.reason,
    };
  }

  return {
    status: 'stop',
    headline: 'Keep grain covered',
    headlineSw: 'Weka nafaka imefunikwa',
    detail: now.reason || 'Conditions will not dry grain now.',
  };
}

export interface DecisionSet {
  ts: string;
  spray: Instruction & { assessment: SprayAssessment; windows: Window[] };
  drying: Instruction & { assessment: DryingAssessment; window: Window | null };
  heat: ReturnType<typeof assessHeat>;
  thi: ReturnType<typeof assessThi>;
}

/**
 * @param dayReadings Every observation for the day. Windows are computed over
 *   the whole day so advice can point forward to a window that has not opened
 *   yet.
 * @param asOf Observations up to the evaluation moment. Its final element is
 *   "now". Defaults to the whole day.
 * @param rainByHour Hours (`YYYY-MM-DDTHH`, local) with rain in the lookahead,
 *   taken from the forecast — the station cannot see future rain.
 */
export function buildDecisions(
  dayReadings: Reading[],
  rainByHour: Set<string>,
  asOf?: Reading[],
): DecisionSet | null {
  const upTo = asOf?.length ? asOf : dayReadings;
  if (!dayReadings.length || !upTo.length) return null;

  const rainAt = (ts: string) => rainByHour.has(ts.slice(0, 13));

  // Windows span the full day; "now" is the last observation at or before the
  // evaluation moment.
  const sprays = dayReadings.map((r) => assessSpray(r, rainAt(r.ts)));
  const dryings = dayReadings.map((r) => assessDrying(r, rainAt(r.ts)));

  const latest = upTo[upTo.length - 1];
  const nowSpray = assessSpray(latest, rainAt(latest.ts));
  const nowDrying = assessDrying(latest, rainAt(latest.ts));

  const windows = sprayWindows(sprays);
  const dryWindow = bestDryingWindow(dryings);

  return {
    ts: latest.ts,
    spray: { ...sprayInstruction(nowSpray, windows), assessment: nowSpray, windows },
    drying: { ...dryingInstruction(nowDrying, dryWindow), assessment: nowDrying, window: dryWindow },
    heat: assessHeat(latest),
    thi: assessThi(latest),
  };
}
