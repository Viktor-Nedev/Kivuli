import type { Reading } from '../ingest/types.js';
import { assessSpray } from '../indices/spray.js';
import { assessHeat, HEAT_FIRST_RESTRICTION_C } from '../indices/heat.js';
import { sprayWindows } from '../indices/spray.js';

/**
 * "What if the day were warmer, windier, drier?"
 *
 * Offsets applied to a real day's readings, with the project's own decision
 * functions re-run over the result. Nothing here re-implements a threshold:
 * `assessSpray`, `assessHeat` and `sprayWindows` are imported and called
 * exactly as the live page calls them, so a scenario cannot drift from the
 * rules it is supposed to be exploring.
 *
 * ## Why this earns its place
 *
 * The station's record is honest and, for alerting purposes, uneventful:
 * across all 13 days measured WBGT peaks at 22.6 °C, more than 5 °C below the
 * first ISO 7243 work/rest threshold. The heat watch therefore never fires on
 * real data, which leaves a detector that cannot be demonstrated and a judge
 * with no way to tell a working alarm from a decorative one.
 *
 * The dishonest fix is to invent a hot day and show the alarm going off. This
 * is the honest one: keep every measurement as recorded, state plainly that an
 * offset is being applied, and let the reader watch the real thresholds change
 * hands. The measured day stays the default, and the scenario is labelled as a
 * scenario everywhere it appears.
 *
 * ## Why the offsets are bounded
 *
 * A slider that could add 30 °C would produce a WBGT this site has never seen
 * and a conclusion worth nothing. The ranges below are wide enough to cross
 * the decision thresholds that matter and narrow enough to stay inside
 * conditions Juja plausibly experiences.
 */

export interface ScenarioOffsets {
  /** Dry-bulb offset, °C. */
  tempC: number;
  /** Wind speed offset, m/s. Applied before clamping at zero. */
  windMs: number;
  /** Relative humidity offset, percentage points. */
  humidityPct: number;
}

export const SCENARIO_LIMITS = {
  tempC: { min: -5, max: 12, step: 0.5 },
  windMs: { min: -3, max: 8, step: 0.1 },
  humidityPct: { min: -30, max: 30, step: 1 },
} as const;

export const NO_OFFSETS: ScenarioOffsets = { tempC: 0, windMs: 0, humidityPct: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const round1 = (n: number) => Number(n.toFixed(1));

/**
 * Applies offsets to one reading, keeping the derived channels consistent.
 *
 * Wet bulb and WBGT are *measured* channels, not computed ones, so shifting
 * dry-bulb temperature without them would produce a physically impossible
 * reading — a Delta-T that grows without limit, and a WBGT that ignores the
 * heat being added. Both are therefore shifted too, using the psychrometric
 * relationship rather than a guess:
 *
 *   - Wet bulb rises with dry bulb but far more slowly in humid air. The
 *     factor below is the local slope of the psychrometric chart near this
 *     site's conditions; it is an approximation, and the scenario says so.
 *   - WBGT in shade is 0.7 * wet bulb + 0.3 * dry bulb, the standard indoor
 *     form, so it moves with both.
 *
 * This is why the panel is labelled a scenario and not a forecast.
 */
export function applyOffsets(r: Reading, o: ScenarioOffsets): Reading {
  // A no-op must be a genuine no-op. Recomputing WBGT from the psychrometric
  // form even when nothing is being shifted would replace the station's
  // *measured* globe temperature with an estimate of it — the measured 20.0 °C
  // came back as 19.8 °C — so the "real day" column would quietly stop being
  // the real day. Measured values win whenever there is nothing to apply.
  if (o.tempC === 0 && o.windMs === 0 && o.humidityPct === 0) return r;

  const tempC = round1(r.tempC + o.tempC);
  const humidityPct = round1(clamp(r.humidityPct + o.humidityPct, 1, 100));
  const windSpeedMs = round1(Math.max(r.windSpeedMs + o.windMs, 0));

  // Humidity moves the wet bulb toward or away from the dry bulb: drier air
  // widens the depression, wetter air closes it.
  const humidityShift = (o.humidityPct / 100) * (r.tempC - r.wetBulbC);
  const wetBulbC = round1(Math.min(r.wetBulbC + o.tempC * 0.55 + humidityShift, tempC));
  const wbgtC = round1(0.7 * wetBulbC + 0.3 * tempC);

  return {
    ...r,
    tempC,
    humidityPct,
    windSpeedMs,
    windGustMs: round1(Math.max(r.windGustMs + o.windMs, windSpeedMs)),
    wetBulbC,
    wbgtC,
    // The three-thermometer spread describes the instrument, not the weather.
    // Carrying it into a scenario would imply the sensors were read under
    // conditions that never occurred.
    temps: undefined,
  };
}

export interface ScenarioOutcome {
  /** Suitable spray readings, and how many there are in total. */
  sprayOk: number;
  sprayTotal: number;
  /** Continuous spray windows the day contains. */
  sprayWindows: { start: string; end: string }[];
  /** Peak WBGT across the day, and whether it reaches a work/rest band. */
  peakWbgtC: number;
  heatBand: string;
  heatFires: boolean;
  /** The first gate that closes the most readings, for a day with no window. */
  commonestBlocker: string | null;
}

function summarise(readings: Reading[], rainWithinLookahead: boolean): ScenarioOutcome {
  const sprays = readings.map((r) => assessSpray(r, rainWithinLookahead));
  const ok = sprays.filter((s) => s.pass).length;

  const tally = new Map<string, number>();
  for (const s of sprays) for (const f of s.failures) tally.set(f, (tally.get(f) ?? 0) + 1);
  const worst = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const blocker = sprays.find((s) => worst !== undefined && s.failures.includes(worst as never));

  const heats = readings.map((r) => assessHeat(r));
  const peak = heats.reduce((a, b) => (b.wbgtC > a.wbgtC ? b : a));

  return {
    sprayOk: ok,
    sprayTotal: sprays.length,
    sprayWindows: sprayWindows(sprays).map((w) => ({ start: w.start, end: w.end })),
    peakWbgtC: peak.wbgtC,
    heatBand: peak.instruction,
    heatFires: peak.wbgtC >= HEAT_FIRST_RESTRICTION_C,
    commonestBlocker: ok === 0 ? (blocker?.reason ?? null) : null,
  };
}

export interface ScenarioResult {
  offsets: ScenarioOffsets;
  /** The day exactly as the station recorded it. */
  measured: ScenarioOutcome;
  /** The same day with the offsets applied. */
  scenario: ScenarioOutcome;
  /** True when no offset is set, so the caller can say "this is the real day". */
  isMeasured: boolean;
}

/**
 * Runs one day both ways: as measured, and with the offsets applied.
 *
 * Returning both is the point. A scenario figure on its own invites being read
 * as a measurement; beside the real one it can only be read as a comparison,
 * which is what it is.
 */
export function runScenario(
  readings: Reading[],
  rainWithinLookahead: boolean,
  offsets: ScenarioOffsets,
): ScenarioResult | null {
  if (!readings.length) return null;

  const clamped: ScenarioOffsets = {
    tempC: clamp(offsets.tempC, SCENARIO_LIMITS.tempC.min, SCENARIO_LIMITS.tempC.max),
    windMs: clamp(offsets.windMs, SCENARIO_LIMITS.windMs.min, SCENARIO_LIMITS.windMs.max),
    humidityPct: clamp(
      offsets.humidityPct,
      SCENARIO_LIMITS.humidityPct.min,
      SCENARIO_LIMITS.humidityPct.max,
    ),
  };

  const isMeasured =
    clamped.tempC === 0 && clamped.windMs === 0 && clamped.humidityPct === 0;

  return {
    offsets: clamped,
    measured: summarise(readings, rainWithinLookahead),
    scenario: summarise(
      readings.map((r) => applyOffsets(r, clamped)),
      rainWithinLookahead,
    ),
    isMeasured,
  };
}
