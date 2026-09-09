import { useState } from 'react';
import type { VariableValidation } from '../lib/types';
import { ProvenanceTag } from './Provenance';
import { Glossary } from './Term';
import { useChartReveal } from '../lib/useChartReveal';
import { Section } from './Section';

/**
 * The station scoring the model.
 *
 * This is the one panel in KIVULI where a `measured` tag is the reference
 * rather than a caveat. Everywhere else the app is careful to say a number is
 * modelled; here the station's own readings are the yardstick and the model is
 * the thing being marked.
 *
 * The diurnal curve is the point. A single "MAE 1.12 °C" hides the shape: the
 * model is nearly exact at midday and misses by 2.6 °C at the morning warming
 * transition, which a ~9 km grid cell cannot resolve. That hour is also when
 * spraying happens, so the error is not academic.
 */

function ErrorBars({ variable }: { variable: VariableValidation }) {
  const peak = Math.max(...variable.diurnal.map((d) => Math.abs(d.meanError)), 0.001);
  // Bars grow out from the zero line as the chart is read, left to right, so
  // the shape of the error across the day assembles itself rather than
  // arriving fully formed.
  const reveal = useChartReveal({ duration: 650 });
  const count = variable.diurnal.length;
  // A read-out line rather than a popover. These bars are a few pixels wide
  // and sit in a clipped flex row: a tooltip over them would occlude the
  // neighbours it is being compared against, and would be cut off by the
  // wrapper. The line below the axis never covers the data and is the only
  // form of this that works on a phone, where the old `title` showed nothing
  // at all.
  const [reading, setReading] = useState<(typeof variable.diurnal)[number] | null>(null);

  return (
    <div ref={reveal.ref}>
      {/* Signed bars above and below a zero line, so "the model runs low all
          day" is visible as a shape rather than inferred from a minus sign. */}
      <div className="flex h-32 items-center gap-[2px]">
        {variable.diurnal.map((d, i) => {
          const frac = (Math.abs(d.meanError) / peak) * reveal.progress;
          const negative = d.meanError < 0;
          const grow = reveal.transition(i, 'height', count);
          return (
            <div
              key={d.localHour}
              className="flex h-full flex-1 cursor-pointer flex-col justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-kenya-green-400"
              tabIndex={0}
              role="button"
              aria-label={`${String(d.localHour).padStart(2, '0')}:00 — model ${
                negative ? 'below' : 'above'
              } station by ${Math.abs(d.meanError).toFixed(2)} ${variable.unit}`}
              onMouseEnter={() => setReading(d)}
              onMouseLeave={() => setReading(null)}
              onFocus={() => setReading(d)}
              onBlur={() => setReading(null)}
              // Touch: a tap sets the read-out without needing a hover that
              // the device cannot produce.
              onTouchStart={() => setReading(d)}
            >
              <div className="flex h-1/2 flex-col justify-end">
                {!negative && (
                  <span
                    className="w-full rounded-t-sm bg-amber-500"
                    style={{ height: `${frac * 100}%`, transition: grow }}
                  />
                )}
              </div>
              <span className="h-px w-full bg-shade-400" aria-hidden />
              <div className="flex h-1/2 flex-col justify-start">
                {negative && (
                  <span
                    className="w-full rounded-b-sm bg-kenya-red-500"
                    style={{ height: `${frac * 100}%`, transition: grow }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-shade-400">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
      <p className="mt-2 min-h-[2.5rem] text-xs leading-relaxed text-shade-200">
        {reading ? (
          <>
            <span className="font-medium tabular-nums text-bleach">
              {String(reading.localHour).padStart(2, '0')}:00
            </span>{' '}
            — model read{' '}
            <span
              className={
                reading.meanError < 0 ? 'text-kenya-red-400' : 'text-amber-300'
              }
            >
              {Math.abs(reading.meanError).toFixed(2)} {variable.unit}{' '}
              {reading.meanError < 0 ? 'below' : 'above'}
            </span>{' '}
            the station, averaged over {reading.n} {reading.n === 1 ? 'reading' : 'readings'}.
          </>
        ) : (
          <span className="text-shade-400">
            Local hour. Bars below the line mean the model read lower than the station — hover,
            tap or tab through an hour for its figure.
          </span>
        )}
      </p>
    </div>
  );
}

export function VariableCard({ variable }: { variable: VariableValidation }) {
  if (!variable.n) {
    return (
      <div className="rounded-xl border border-shade-700 bg-shade-800/30 p-5">
        <h3 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          {variable.label}
        </h3>
        <p className="mt-2 text-sm text-shade-200">
          No paired hours for this variable on the sample day.
        </p>
      </div>
    );
  }

  const worst = variable.worst!;
  const runsLow = variable.bias < 0;

  return (
    <div className="rounded-xl border border-shade-700 bg-shade-800/30 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm uppercase tracking-[0.2em] text-bleach">
          {variable.label}
        </h3>
        <span className="text-xs tabular-nums text-shade-400">
          {variable.n} paired hours
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.15em] text-shade-400">Bias</dt>
          <dd className="font-display text-xl tabular-nums text-bleach">
            {variable.bias > 0 ? '+' : ''}
            {variable.bias.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.15em] text-shade-400">Typical miss</dt>
          <dd className="font-display text-xl tabular-nums text-bleach">
            {variable.mae.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-[0.15em] text-shade-400">Worst hour</dt>
          <dd className="font-display text-xl tabular-nums text-kenya-red-400">
            {worst.error > 0 ? '+' : ''}
            {worst.error.toFixed(2)}
          </dd>
        </div>
      </dl>
      <p className="mt-1 text-center text-[10px] text-shade-200">
        all in {variable.unit}, worst at {String(worst.localHour).padStart(2, '0')}:00
      </p>

      <div className="mt-5">
        <ErrorBars variable={variable} />
      </div>

      <p className="mt-3 text-xs leading-relaxed text-shade-200">
        The model runs {runsLow ? 'low' : 'high'} here by{' '}
        {Math.abs(variable.bias).toFixed(2)} {variable.unit} on average — the offset the
        calibration removes before any forecast reaches a decision.
      </p>
    </div>
  );
}

export function ValidationPanel({
  variables,
  station,
}: {
  variables: VariableValidation[];
  station: { name: string; day: string; hours: number };
}) {
  const temp = variables.find((v) => v.variable === 'tempC');

  return (
    <>
      <section className="pt-10 sm:pt-12">
        <h1 className="font-display text-3xl text-bleach sm:text-4xl">How wrong is the model?</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
          Everywhere else in KIVULI the station is one reading among modelled ones. Here it is the
          reference: its own measurements, hour by hour, scoring the gridded reanalysis that every
          forecast on this site is built from. This is what a ground station is for.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-xs text-shade-200">
            <ProvenanceTag kind="measured" title={`${station.name} — the reference`} />
            the station
          </span>
          <span className="flex items-center gap-2 text-xs text-shade-200">
            <ProvenanceTag kind="reanalysis" title="ERA5 via Open-Meteo — the thing being scored" />
            the model
          </span>
        </div>

        {temp?.worst && (
          <div className="mt-6 rounded-r-lg border-l-4 border-kenya-red-500 bg-shade-800/40 p-5">
            <p className="font-display text-2xl text-bleach">
              The model is coldest exactly when it matters
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-shade-200">
              Across {station.hours} readings on {station.day} it ran{' '}
              {Math.abs(temp.bias).toFixed(2)} °C low on average, and{' '}
              {Math.abs(temp.worst.error).toFixed(2)} °C low at{' '}
              {String(temp.worst.localHour).padStart(2, '0')}:00 — the morning warming transition a
              ~9 km grid cell cannot resolve. That is the hour spraying decisions get made, which
              is why the station is not decoration.
            </p>
          </div>
        )}
      </section>

      <Section title="Hour by hour, by variable">
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {variables.map((v) => (
            <VariableCard key={v.variable} variable={v} />
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-shade-200">
          One station, one day, {temp?.n ?? 0} paired hours. That is a demonstration of method, not
          a climatology — a longer record would sharpen every figure here and might change their
          shape. The same comparison, run offline over the same day, is what produced the
          coefficients on the Calibration page; these two arrive at the same numbers by independent
          routes.
        </p>
      </Section>

      {/* The page is already about what the numbers mean, so the definitions
          belong here rather than in a seventh nav item. */}
      <Section tone="raised" title="What the words mean">
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
          Every term this site uses, in one place. They also appear as dotted underlines throughout
          the app — hover or tab to one for the same definition.
        </p>
        <div className="mt-6">
          <Glossary />
        </div>
      </Section>
    </>
  );
}
