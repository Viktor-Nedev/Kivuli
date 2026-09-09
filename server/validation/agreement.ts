import type { Reading, TempChannels } from '../ingest/types.js';
import { assessSpray, SPRAY } from '../indices/spray.js';

/**
 * The station measured against itself.
 *
 * `groundTruth.ts` treats the station as the reference and scores the model
 * against it. That is the right comparison, and it invites the obvious next
 * question: **how good is the reference?**
 *
 * The Conduit mast carries three independent dry-bulb thermometers — a
 * BMX280, an MCP9808 and an SHT31 — measuring the same air at the same moment.
 * They disagree by 0.44 °C on average across the bundled day. The calibration
 * in `data/coefficients.json` reduces the model's temperature error to
 * 0.57 °C. Those two numbers are close enough that the correction has
 * essentially reached the noise floor of the instrument it is corrected
 * against: pushing it further would be fitting the station's own scatter
 * rather than the model's bias.
 *
 * Three sensor packages agreeing to within half a degree is ordinary and
 * expected. The point is not that the station is faulty — it is that the
 * disagreement was measured rather than assumed away, and that it turns out to
 * bound how much a ground station can buy you here.
 *
 * ## On the daylight/night difference
 *
 * Spread is mildly larger in daylight (0.47) than at night (0.41). The obvious
 * explanation is radiative self-heating under poor ventilation, and **that
 * hypothesis was tested against this sample and failed**: in daylight, calm
 * hours (under 1 m/s) show 0.469 and windier hours 0.450 — the wrong
 * direction, and the gap is far below the scatter. So the difference is
 * reported and the cause is left open. Do not add a mechanism here without
 * data that supports one.
 *
 * ## Sample size
 *
 * One station, one day, 95 readings. Every figure below describes *this*
 * station on *this* day across *these* three channels. None of it generalises
 * to ground stations at large, and that specificity is the point.
 */

export type ChannelId = 'bmxC' | 'mcpC' | 'shtC';

/** Part numbers, so a reader can see these are three real instruments. */
const SENSOR_NAMES: Record<ChannelId, string> = {
  bmxC: 'BMX280',
  mcpC: 'MCP9808',
  shtC: 'SHT31',
};

/** The channel `Reading.tempC` reports and the calibration was fitted against. */
const REFERENCE_CHANNEL: ChannelId = 'bmxC';

const CHANNELS: ChannelId[] = ['bmxC', 'mcpC', 'shtC'];

/** Local daylight hours, EAT (UTC+3). Used only to report, never to explain. */
const DAYLIGHT_FROM = 7;
const DAYLIGHT_TO = 17;

export interface ChannelSummary {
  id: ChannelId;
  sensor: string;
  meanC: number;
  minC: number;
  maxC: number;
  /** Mean signed offset from the median of the three. Negative reads cool. */
  meanOffsetFromMedianC: number;
  /** True for the channel the rest of the app treats as the station reading. */
  isReference: boolean;
  n: number;
}

export interface AgreementPoint {
  ts: string;
  bmxC: number;
  mcpC: number;
  shtC: number;
  medianC: number;
  /** max minus min across the three: the instantaneous disagreement. */
  spreadC: number;
}

export interface PairOffset {
  a: ChannelId;
  b: ChannelId;
  /** mean(a - b), signed. */
  meanOffsetC: number;
  /** mean(|a - b|). */
  maeC: number;
}

/**
 * Whether the choice of thermometer changes the advice.
 *
 * Two counts, because they tell different stories and reporting only the
 * flattering one would be exactly the framing this project refuses:
 *
 * - `verdictFlips` — the full spray rule, all gates. Small, because on most
 *   readings the wind gate already fails and the answer is "no" whichever
 *   thermometer you believe.
 * - `deltaTFlips` — the temperature gate alone. Larger, and the honest measure
 *   of how much the disagreement matters to the temperature half of the
 *   decision.
 */
export interface DecisionRobustness {
  /** Readings where all three channels were present and could be assessed. */
  evaluated: number;
  /** Readings where the full spray verdict differs by channel. */
  verdictFlips: number;
  /** Readings where the Delta-T gate alone differs by channel. */
  deltaTFlips: number;
  /** Timestamps of the full-verdict flips. Few enough to name, not just count. */
  verdictFlippedAt: string[];
  /** Readings whose median Delta-T sits within one mean spread of a threshold. */
  withinSpreadOfThreshold: number;
}

export interface Agreement {
  channels: ChannelSummary[];
  points: AgreementPoint[];
  pairs: PairOffset[];
  meanSpreadC: number;
  medianSpreadC: number;
  minSpreadC: number;
  maxSpread: { ts: string; spreadC: number } | null;
  /** Reported without a causal claim. See the module docstring. */
  daylightMeanSpreadC: number;
  nightMeanSpreadC: number;
  robustness: DecisionRobustness;
  /** Readings carrying all three channels. */
  n: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Local hour in EAT (UTC+3). Kenya does not observe daylight saving. */
const localHour = (iso: string): number => (new Date(iso).getUTCHours() + 3) % 24;

/**
 * @param rainAt Whether rain is forecast within the lookahead for a reading's
 *   hour. Passed in rather than fetched, so this module stays pure and a dead
 *   network degrades the figure rather than failing it. An empty rain set lets
 *   more hours pass the gate, but identically for all three channels — which
 *   is all this comparison claims.
 */
export function buildAgreement(
  readings: Reading[],
  rainAt: (ts: string) => boolean,
): Agreement | null {
  const withTemps = readings.filter(
    (r): r is Reading & { temps: TempChannels } => r.temps !== undefined,
  );
  // A live feed missing a channel gets null rather than a spread of one
  // instrument against itself.
  if (!withTemps.length) return null;

  const points: AgreementPoint[] = withTemps.map((r) => {
    const trio = [r.temps.bmxC, r.temps.mcpC, r.temps.shtC];
    return {
      ts: r.ts,
      bmxC: r.temps.bmxC,
      mcpC: r.temps.mcpC,
      shtC: r.temps.shtC,
      medianC: r2(median(trio)),
      spreadC: r2(Math.max(...trio) - Math.min(...trio)),
    };
  });

  const spreads = points.map((p) => p.spreadC);
  const meanSpreadC = r3(mean(spreads));

  const channels: ChannelSummary[] = CHANNELS.map((id) => {
    const vals = withTemps.map((r) => r.temps[id]);
    const offsets = withTemps.map((r) => {
      const trio = [r.temps.bmxC, r.temps.mcpC, r.temps.shtC];
      return r.temps[id] - median(trio);
    });
    return {
      id,
      sensor: SENSOR_NAMES[id],
      meanC: r3(mean(vals)),
      minC: r2(Math.min(...vals)),
      maxC: r2(Math.max(...vals)),
      meanOffsetFromMedianC: r3(mean(offsets)),
      isReference: id === REFERENCE_CHANNEL,
      n: vals.length,
    };
  });

  const pairs: PairOffset[] = [];
  for (let i = 0; i < CHANNELS.length; i += 1) {
    for (let j = i + 1; j < CHANNELS.length; j += 1) {
      const a = CHANNELS[i];
      const b = CHANNELS[j];
      const diffs = withTemps.map((r) => r.temps[a] - r.temps[b]);
      pairs.push({
        a,
        b,
        meanOffsetC: r3(mean(diffs)),
        maeC: r3(mean(diffs.map(Math.abs))),
      });
    }
  }

  const inDaylight = (p: AgreementPoint) => {
    const h = localHour(p.ts);
    return h >= DAYLIGHT_FROM && h <= DAYLIGHT_TO;
  };

  const worst = points.reduce<AgreementPoint | null>(
    (best, p) => (best === null || p.spreadC > best.spreadC ? p : best),
    null,
  );

  return {
    channels,
    points,
    pairs,
    meanSpreadC,
    medianSpreadC: r3(median(spreads)),
    minSpreadC: r2(Math.min(...spreads)),
    maxSpread: worst ? { ts: worst.ts, spreadC: worst.spreadC } : null,
    daylightMeanSpreadC: r3(mean(points.filter(inDaylight).map((p) => p.spreadC))),
    nightMeanSpreadC: r3(mean(points.filter((p) => !inDaylight(p)).map((p) => p.spreadC))),
    robustness: buildRobustness(withTemps, rainAt, meanSpreadC),
    n: withTemps.length,
  };
}

/**
 * Runs the real spray rule once per thermometer and counts the disagreements.
 *
 * Deliberately calls `assessSpray` rather than re-checking thresholds here. A
 * local copy of `deltaTMin`/`deltaTMax` would drift from the rule that actually
 * makes the decision, and this figure would then be measuring something the app
 * does not do.
 */
function buildRobustness(
  withTemps: (Reading & { temps: TempChannels })[],
  rainAt: (ts: string) => boolean,
  meanSpreadC: number,
): DecisionRobustness {
  let verdictFlips = 0;
  let deltaTFlips = 0;
  let withinSpreadOfThreshold = 0;
  const verdictFlippedAt: string[] = [];

  for (const r of withTemps) {
    const rain = rainAt(r.ts);
    const verdicts = new Set<boolean>();
    const dtGates = new Set<boolean>();

    for (const id of CHANNELS) {
      // The same reading with one channel substituted for the dry bulb.
      const a = assessSpray({ ...r, tempC: r.temps[id] }, rain);
      verdicts.add(a.pass);
      dtGates.add(
        !a.failures.includes('delta_t_low') && !a.failures.includes('delta_t_high'),
      );
    }

    if (verdicts.size > 1) {
      verdictFlips += 1;
      verdictFlippedAt.push(r.ts);
    }
    if (dtGates.size > 1) deltaTFlips += 1;

    // How close the median reading sits to flipping on temperature alone.
    const trio = [r.temps.bmxC, r.temps.mcpC, r.temps.shtC];
    const dt = median(trio) - r.wetBulbC;
    const margin = Math.min(
      Math.abs(dt - SPRAY.deltaTMin),
      Math.abs(dt - SPRAY.deltaTMax),
    );
    if (margin < meanSpreadC) withinSpreadOfThreshold += 1;
  }

  return {
    evaluated: withTemps.length,
    verdictFlips,
    deltaTFlips,
    verdictFlippedAt,
    withinSpreadOfThreshold,
  };
}
