import { useState } from 'react';
import type { Agreement, AgreementPoint } from '../lib/types';
import { ProvenanceTag } from './Provenance';
import { Term } from './Term';
import { Section } from './Section';
import { useChartReveal, useCountUp } from '../lib/useChartReveal';

/**
 * The station judged against itself.
 *
 * The rest of the model-check page treats the station as ground truth. This
 * section asks the question that follows from it: how good is the ground
 * truth? Three thermometers on one mast, measuring the same air, disagreeing
 * by about as much as the calibration claims to have gained.
 *
 * Every figure comes from the API. Nothing here is hardcoded, because a live
 * feed with a different day would make a written-in number quietly false while
 * the sentence around it still read as confident.
 */

const CHANNEL_COLOR: Record<'bmxC' | 'mcpC' | 'shtC', string> = {
  bmxC: 'bg-kenya-green-400',
  mcpC: 'bg-amber-400',
  shtC: 'bg-shade-200',
};

const CHANNEL_TEXT: Record<'bmxC' | 'mcpC' | 'shtC', string> = {
  bmxC: 'text-kenya-green-400',
  mcpC: 'text-amber-400',
  shtC: 'text-shade-200',
};

/** '2026-09-01T12:29:57.000Z' -> '15:29' local (EAT, UTC+3). */
function localClock(iso: string): string {
  const d = new Date(iso);
  const h = (d.getUTCHours() + 3) % 24;
  return `${String(h).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * Three traces on one axis, with the spread drawn as the band between them.
 *
 * The visual argument is that three lines look like one line — until you see
 * how thick it is. The band is the finding; the traces are the evidence for it.
 */
function SpreadChart({ points }: { points: AgreementPoint[] }) {
  const reveal = useChartReveal({ duration: 700 });
  // A read-out line rather than a popover, for the same reason ErrorBars uses
  // one: these columns are a few pixels wide, and a tooltip would cover the
  // neighbours being compared against.
  const [reading, setReading] = useState<AgreementPoint | null>(null);

  const all = points.flatMap((p) => [p.bmxC, p.mcpC, p.shtC]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(hi - lo, 0.1);
  // Fraction of the plot height, measured from the bottom.
  const y = (v: number) => ((v - lo) / span) * 100;

  return (
    <div>
      <div
        ref={reveal.ref}
        className="relative h-40 w-full overflow-hidden rounded-2xl bg-shade-950/60 ring-1 ring-white/10"
      >
        {points.map((p, i) => {
          const top = y(Math.max(p.bmxC, p.mcpC, p.shtC));
          const bottom = y(Math.min(p.bmxC, p.mcpC, p.shtC));
          const active = reading?.ts === p.ts;
          return (
            <div
              key={p.ts}
              className="absolute bottom-0 top-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-kenya-green-400"
              style={{ left: `${(i / points.length) * 100}%`, width: `${100 / points.length}%` }}
              tabIndex={0}
              role="button"
              aria-label={`${localClock(p.ts)} — three thermometers spread ${p.spreadC.toFixed(2)} °C`}
              onMouseEnter={() => setReading(p)}
              onMouseLeave={() => setReading(null)}
              onFocus={() => setReading(p)}
              onBlur={() => setReading(null)}
              onTouchStart={() => setReading(p)}
            >
              {/* The band between the warmest and coolest channel. This is the
                  quantity the section is about, so it is drawn, not implied. */}
              <span
                className={`absolute inset-x-0 ${active ? 'bg-bleach/30' : 'bg-shade-400/40'}`}
                style={{
                  bottom: `${bottom * reveal.progress}%`,
                  height: `${Math.max((top - bottom) * reveal.progress, 0.8)}%`,
                  transition: `${reveal.transition(0, 'height')}, ${reveal.transition(0, 'bottom')}`,
                }}
              />
              {(['bmxC', 'mcpC', 'shtC'] as const).map((id) => (
                <span
                  key={id}
                  className={`absolute inset-x-0 h-[2px] ${CHANNEL_COLOR[id]}`}
                  style={{
                    bottom: `${y(p[id]) * reveal.progress}%`,
                    opacity: reveal.progress,
                    transition: `${reveal.transition(0, 'bottom')}, ${reveal.transition(0, 'opacity')}`,
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex justify-between text-xs tabular-nums text-shade-400">
        <span>{localClock(points[0].ts)}</span>
        <span>{localClock(points[points.length - 1].ts)}</span>
      </div>

      <p className="mt-2 min-h-[2.5rem] text-xs leading-relaxed text-shade-200">
        {reading ? (
          <>
            <span className="font-medium tabular-nums text-bleach">{localClock(reading.ts)}</span>{' '}
            —{' '}
            <span className="tabular-nums text-kenya-green-400">{reading.bmxC.toFixed(1)}</span>,{' '}
            <span className="tabular-nums text-amber-400">{reading.mcpC.toFixed(1)}</span>,{' '}
            <span className="tabular-nums text-shade-200">{reading.shtC.toFixed(1)} °C</span>{' '}
            — a spread of{' '}
            <span className="font-medium tabular-nums text-bleach">
              {reading.spreadC.toFixed(2)} °C
            </span>
            .
          </>
        ) : (
          <span className="text-shade-400">
            Local time. The band is the gap between the warmest and coolest thermometer — hover,
            tap or tab through a moment for its three readings.
          </span>
        )}
      </p>
    </div>
  );
}

export function AgreementSection({
  agreement,
  modelMaeC,
}: {
  agreement: Agreement;
  /** The model's uncorrected temperature error, for the noise-floor comparison. */
  modelMaeC: number | null;
}) {
  const spreadShown = useCountUp(agreement.meanSpreadC);
  const rb = agreement.robustness;

  return (
    <>
      <Section
        tone="raised"
        title="How good is the ground truth?"
        aside={<ProvenanceTag kind="measured" title="Three thermometers on the Conduit mast" />}
      >
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-shade-200">
          Everything above treats the station as the reference. So it is fair to ask what the
          reference is worth. The mast carries{' '}
          <strong className="text-bleach">three independent thermometers</strong> — a BMX280, an
          MCP9808 and an SHT31 — measuring the same air at the same moment.
        </p>

        <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-shade-400">
              They disagree by
            </p>
            <p className="font-display text-5xl tabular-nums text-bleach sm:text-6xl">
              {spreadShown.toFixed(3)}
              <span className="ml-1 text-2xl text-shade-200">°C</span>
            </p>
            <p className="mt-1 text-xs text-shade-400">
              on average, across {agreement.n} readings
            </p>
          </div>
          {modelMaeC !== null && (
            <p className="max-w-md pb-1 text-sm leading-relaxed text-shade-200">
              For comparison, the model this page is scoring misses the station by{' '}
              <span className="tabular-nums text-bleach">{modelMaeC.toFixed(2)} °C</span>. The
              correction on the Calibration page closes most of that gap — and this is the floor it
              is closing toward. Below the{' '}
              <Term term="instrumentSpread">instrument spread</Term> there is nothing left to
              correct, only the station&apos;s own scatter to fit.
            </p>
          )}
        </div>

        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-shade-200">
          Three different sensor packages agreeing to within half a degree is ordinary, not a
          fault. The point is that it was measured rather than assumed — a station cannot certify a
          model to a precision finer than it can certify itself.
        </p>
      </Section>

      <Section
        title="The three traces"
        aside={
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {agreement.channels.map((c) => (
              <li key={c.id} className="flex items-center gap-1.5">
                <span
                  className={`h-2.5 w-2.5 rounded-sm ${CHANNEL_COLOR[c.id]}`}
                  aria-hidden
                />
                <span className={CHANNEL_TEXT[c.id]}>{c.sensor}</span>
                {c.isReference && <span className="text-shade-400">(used)</span>}
              </li>
            ))}
          </ul>
        }
      >
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-shade-200">
          Three lines that look like one line, until you see how thick it is.
        </p>

        <div className="mt-6">
          <SpreadChart points={agreement.points} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {agreement.channels.map((c) => (
            <div key={c.id} className="glass glass-edge lift rounded-2xl p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className={`font-display text-sm ${CHANNEL_TEXT[c.id]}`}>{c.sensor}</h3>
                {c.isReference && (
                  <span className="text-xs uppercase tracking-[0.15em] text-shade-400">
                    the one used
                  </span>
                )}
              </div>
              <p className="mt-2 font-display text-2xl tabular-nums text-bleach">
                {c.meanC.toFixed(2)}
                <span className="ml-1 text-sm text-shade-200">°C mean</span>
              </p>
              <p className="mt-1 text-xs tabular-nums text-shade-200">
                {c.meanOffsetFromMedianC > 0 ? '+' : ''}
                {c.meanOffsetFromMedianC.toFixed(3)} °C against the middle reading
              </p>
            </div>
          ))}
        </div>

        {/* The cost of the choice, stated rather than buried. This is the one
            number that moves a headline figure elsewhere in the app. */}
        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-shade-200">
          The app reads the BMX280, and it runs{' '}
          <span className="tabular-nums text-bleach">
            {Math.abs(
              agreement.channels.find((c) => c.isReference)?.meanOffsetFromMedianC ?? 0,
            ).toFixed(2)}{' '}
            °C
          </span>{' '}
          cooler than the middle of the three. So the &ldquo;model runs cold&rdquo; figure on this
          page carries that choice inside it. It was not switched to a median mid-project: the
          calibration coefficients were fitted against this channel, and Delta-T pairs it against a
          separate wet-bulb instrument. Publishing the offset is honest; quietly changing the
          reference to improve the headline would not be.
        </p>

        {agreement.maxSpread && (
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-shade-200">
            Widest disagreement: {agreement.maxSpread.spreadC.toFixed(2)} °C at{' '}
            {localClock(agreement.maxSpread.ts)}. Spread runs slightly wider in daylight
            ({agreement.daylightMeanSpreadC.toFixed(2)} °C) than at night (
            {agreement.nightMeanSpreadC.toFixed(2)} °C). The obvious explanation is solar heating
            of the sensor housings, but that was tested against this day and the data did not
            support it — so it is reported here and left unexplained rather than given a story it
            has not earned.
          </p>
        )}
      </Section>

      <Section title="Does it change the advice?">
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-shade-200">
          The question that matters is not whether the instruments differ, but whether the
          difference reaches the farmer. Both numbers are given, because one alone would flatter
          the result.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="glass glass-edge lift rounded-2xl p-5">
            <p className="font-display text-4xl tabular-nums text-kenya-green-400">
              {rb.evaluated - rb.verdictFlips}
              <span className="text-xl text-shade-200"> / {rb.evaluated}</span>
            </p>
            <p className="mt-2 text-sm text-shade-200">
              readings where the <strong className="text-bleach">final spray verdict</strong> is
              the same whichever thermometer you believe.
            </p>
          </div>
          <div className="glass glass-edge lift rounded-2xl p-5">
            <p className="font-display text-4xl tabular-nums text-amber-400">
              {rb.evaluated - rb.deltaTFlips}
              <span className="text-xl text-shade-200"> / {rb.evaluated}</span>
            </p>
            <p className="mt-2 text-sm text-shade-200">
              readings where the <strong className="text-bleach">temperature gate alone</strong>{' '}
              agrees. The rest are decided by wind before temperature gets a vote.
            </p>
          </div>
        </div>

        <p className="mt-5 max-w-3xl text-sm leading-relaxed text-shade-200">
          The advice survives the disagreement almost everywhere — but mostly because the wind gate
          had already closed the question. On {rb.deltaTFlips} readings the thermometers genuinely
          disagree about whether Delta-T is in range, and on {rb.withinSpreadOfThreshold} more the
          reading sits close enough to a threshold that the instruments&apos; own spread could move
          it across. Quoting only the first figure would be the more flattering claim and the less
          true one.
        </p>
      </Section>
    </>
  );
}
