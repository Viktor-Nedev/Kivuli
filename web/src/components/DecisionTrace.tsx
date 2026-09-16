import { useState } from 'react';
import type { Instruction, Reading, Calibration } from '../lib/types';

/**
 * How one instruction was reached, from sensor to sentence.
 *
 * ## Why this exists
 *
 * Every number in this chain is already computed and already on the page —
 * the reading, the derived Delta-T, the validated bias, the gate that closed
 * the window. What was missing is the chain itself. A card that says "Do not
 * spray today" is asking to be trusted; the same card with its working shown
 * is asking to be checked, which is the stronger claim and the one this
 * project can actually support.
 *
 * ## Why it recomputes nothing
 *
 * Every figure here is read from the API payload, including the Delta-T and
 * wind the gates were actually evaluated against — those arrive in
 * `decisions.spray.assessment` rather than being re-derived from the raw
 * reading. If this panel did its own arithmetic it could drift from the
 * decision above it, and a trace that disagrees with its own conclusion is
 * worse than no trace: it would look like evidence while being noise.
 */

/** The spray gates, as published by `server/indices/spray.ts`. */
const GATES = {
  deltaTMin: 2,
  deltaTMax: 8,
  windMinMs: 0.8,
  windMaxMs: 4.2,
  rainLookaheadHours: 6,
} as const;

function Row({
  label,
  value,
  note,
  verdict,
}: {
  label: string;
  value: string;
  note?: string;
  verdict?: 'pass' | 'fail';
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-white/5 py-2 last:border-b-0">
      <div className="min-w-0">
        <span className="text-sm text-shade-200">{label}</span>
        {note && <span className="block text-micro text-shade-400">{note}</span>}
      </div>
      <div className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="font-display text-sm tabular-nums text-bleach">{value}</span>
        {verdict && (
          <span
            className={`text-micro uppercase tracking-[0.15em] ${
              verdict === 'pass' ? 'text-kenya-green-400' : 'text-kenya-red-400'
            }`}
          >
            {verdict}
          </span>
        )}
      </div>
    </div>
  );
}

export function DecisionTrace({
  instruction,
  latest,
  calibration,
  assessment,
}: {
  instruction: Instruction;
  latest: Reading;
  calibration: Calibration | null;
  /**
   * The exact figures the decision was taken on, straight from the payload.
   *
   * Passed in rather than derived here. The API already reports the Delta-T
   * and wind the gates were evaluated against, and re-deriving them in the
   * panel is how a trace starts disagreeing with the instruction above it.
   */
  assessment: { deltaT: number; windSpeedMs: number };
}) {
  const [open, setOpen] = useState(false);

  const deltaT = assessment.deltaT;
  const wind = assessment.windSpeedMs;

  const deltaTOk = deltaT >= GATES.deltaTMin && deltaT <= GATES.deltaTMax;
  const windOk = wind >= GATES.windMinMs && wind <= GATES.windMaxMs;

  const tempBias = calibration?.variables?.tempC?.bias ?? null;
  const tempMetrics = calibration?.variables?.tempC?.metrics ?? null;

  // The three dry-bulb thermometers on the same mast. Their spread is the
  // cheapest available evidence that the instrument is healthy, and it costs
  // nothing to show because the reading already carries all three.
  const temps = latest.temps ? Object.values(latest.temps).filter((t) => Number.isFinite(t)) : [];
  const spread =
    temps.length > 1 ? Number((Math.max(...temps) - Math.min(...temps)).toFixed(1)) : null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] items-center gap-2 text-sm text-accent-400 transition-colors duration-200 hover:text-bleach"
      >
        <span>{open ? 'Hide the working' : 'Why this instruction?'}</span>
        <span aria-hidden className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-white/10 bg-shade-900/60 p-4">
          <p className="mb-3 text-micro uppercase tracking-[0.2em] text-shade-400">Measured</p>
          <Row
            label="Dry-bulb temperature"
            note={
              spread !== null
                ? `Three thermometers on one mast agree within ${spread} °C`
                : undefined
            }
            value={`${latest.tempC} °C`}
          />
          <Row label="Wet-bulb temperature" value={`${latest.wetBulbC} °C`} />
          <Row
            label="Delta-T"
            note="Dry bulb minus wet bulb, as evaluated by the decision"
            value={`${deltaT.toFixed(1)} °C`}
          />
          <Row label="Wind speed" value={`${wind} m/s`} />

          {tempBias !== null && (
            <>
              <p className="mb-3 mt-5 text-micro uppercase tracking-[0.2em] text-shade-400">
                Corrected
              </p>
              <Row
                label="Model temperature bias at this station"
                note={
                  tempMetrics
                    ? `Leave-one-out validated: MAE ${tempMetrics.mae_before} → ${tempMetrics.mae_after} °C over ${tempMetrics.n} paired hours`
                    : 'Fitted against the station record'
                }
                value={`${tempBias > 0 ? '+' : ''}${tempBias.toFixed(2)} °C`}
              />
            </>
          )}

          <p className="mb-3 mt-5 text-micro uppercase tracking-[0.2em] text-shade-400">Gates</p>
          <Row
            label="Delta-T within range"
            note={`${GATES.deltaTMin}–${GATES.deltaTMax} °C — below this droplets stay airborne, above it they evaporate`}
            value={`${deltaT.toFixed(1)} °C`}
            verdict={deltaTOk ? 'pass' : 'fail'}
          />
          <Row
            label="Wind within range"
            note={`${GATES.windMinMs}–${GATES.windMaxMs} m/s — still air means an inversion, strong wind means drift`}
            value={`${wind} m/s`}
            verdict={windOk ? 'pass' : 'fail'}
          />

          <p className="mb-3 mt-5 text-micro uppercase tracking-[0.2em] text-shade-400">
            Instruction
          </p>
          <p className="font-display text-base text-bleach">{instruction.headline}</p>
          {instruction.detail && (
            <p className="mt-1 text-sm leading-relaxed text-shade-200">{instruction.detail}</p>
          )}

          <p className="mt-4 text-micro leading-relaxed text-shade-400">
            Every figure above is read from the same payload the card uses — this panel recomputes
            nothing, so it cannot disagree with the instruction it explains.
          </p>
        </div>
      )}
    </div>
  );
}
