import { useState } from 'react';
import type { LightPoint, SolarCrossCheck } from '../lib/types';
import { ProvenanceTag } from './Provenance';
import { Section } from './Section';
import { useChartReveal, useCountUp } from '../lib/useChartReveal';

/**
 * The satellite and the station, each seeing what the other cannot.
 *
 * This page already asks how wrong the model is, and how good the station's own
 * reference is. This is the third question in that sequence: does an instrument
 * 36,000 km away agree that this was the same day?
 *
 * Neither side is the reference here, which is what separates this from the two
 * panels above it. The satellite integrates a whole day into one number the
 * station cannot produce. The station samples every fifteen minutes and catches
 * cloud the satellite's daily mean erases. The agreement is worth more than
 * either figure alone.
 *
 * Every number is rendered from the API. Nothing is written into the copy,
 * because a live feed on a different day would leave a hardcoded figure
 * confident and wrong.
 */

/** '2026-09-01T09:00:00.000Z' -> '12:00' local (EAT, UTC+3). */
function localClock(iso: string): string {
  const d = new Date(iso);
  const h = (d.getUTCHours() + 3) % 24;
  return `${String(h).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * The day's light curve, with cloud crossings marked.
 *
 * A read-out line rather than tooltips, matching the diurnal charts above: the
 * columns are a few pixels wide and a popover would cover the neighbours being
 * compared against.
 */
function LightCurve({ points, darkFloor }: { points: LightPoint[]; darkFloor: number }) {
  const reveal = useChartReveal({ duration: 700 });
  const [reading, setReading] = useState<LightPoint | null>(null);

  const peak = Math.max(...points.map((p) => p.counts), darkFloor + 1);
  const span = Math.max(peak - darkFloor, 1);
  // Measured from the dark floor, not from zero: the sensor never reads below
  // its own baseline, so a zero axis would waste most of the height on a band
  // the instrument physically cannot enter.
  const height = (c: number) => Math.max(((c - darkFloor) / span) * 100, 1.5);

  return (
    <div>
      <div
        ref={reveal.ref}
        className="relative flex h-40 w-full items-end gap-px overflow-hidden rounded-lg bg-shade-900/60 px-1 ring-1 ring-shade-700"
      >
        {points.map((p, i) => {
          const active = reading?.ts === p.ts;
          return (
            <div
              key={p.ts}
              className="flex h-full flex-1 cursor-pointer items-end focus-visible:outline focus-visible:outline-2 focus-visible:outline-kenya-green-400"
              tabIndex={0}
              role="button"
              aria-label={`${localClock(p.ts)} — ${p.counts} counts${p.cloud ? ', light fell sharply' : ''}`}
              onMouseEnter={() => setReading(p)}
              onMouseLeave={() => setReading(null)}
              onFocus={() => setReading(p)}
              onBlur={() => setReading(null)}
              onTouchStart={() => setReading(p)}
            >
              <span
                className={`w-full rounded-t-sm ${
                  active
                    ? 'bg-bleach'
                    : p.cloud
                      ? 'bg-kenya-red-400'
                      : 'bg-amber-400/70'
                }`}
                style={{
                  height: `${height(p.counts) * reveal.progress}%`,
                  transition: reveal.transition(i, 'height', points.length),
                }}
              />
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
            <span className="font-medium tabular-nums text-bleach">
              {localClock(reading.ts)}
            </span>{' '}
            — <span className="tabular-nums text-amber-300">{reading.counts}</span> visible
            counts
            {reading.cloud && (
              <span className="text-kenya-red-400">
                {' '}
                — light fell sharply from the previous reading. Cloud.
              </span>
            )}
            .
          </>
        ) : (
          <span className="text-shade-400">
            Local time. Height is counts above the sensor&apos;s night floor of {darkFloor} —
            red marks a sharp fall. Hover, tap or tab through a moment for its reading.
          </span>
        )}
      </p>
    </div>
  );
}

export function SolarPanel({ solar }: { solar: SolarCrossCheck }) {
  const mjShown = useCountUp(solar.satelliteMJ ?? 0);
  const rShown = useCountUp(solar.daylightAgreement ?? 0);

  return (
    <>
      <Section
        tone="raised"
        title="Does a satellite see the same day?"
        aside={
          <ProvenanceTag
            kind="reanalysis"
            title="NASA POWER — satellite-derived surface shortwave, not an instrument at this site"
          />
        }
      >
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-shade-200">
          The Conduit exists in part to help calibrate and validate{' '}
          <strong className="text-bleach">satellite observations</strong>. Everything above
          scores a <em>model</em>. This is the other half of that sentence: the station and an
          orbiting instrument describing one day, neither of them the reference.
        </p>

        {solar.satelliteMJ === null ? (
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-amber-300">
            {solar.unavailable ??
              'The satellite returned no usable value for this day, so there is nothing to compare.'}{' '}
            <span className="text-shade-200">
              The station&apos;s own light curve below is unaffected.
            </span>
          </p>
        ) : (
          <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-shade-400">
                Satellite, whole day
              </p>
              <p className="font-display text-5xl tabular-nums text-bleach sm:text-6xl">
                {mjShown.toFixed(1)}
                <span className="ml-1 text-2xl text-shade-200">MJ/m²</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-shade-400">
                Station tracks the sun
              </p>
              <p className="font-display text-5xl tabular-nums text-kenya-green-400 sm:text-6xl">
                {rShown.toFixed(3)}
              </p>
              <p className="mt-1 text-xs text-shade-400">
                correlation across {solar.daylightSamples} daylight readings
              </p>
            </div>
          </div>
        )}

        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-shade-200">
          The correlation is against modelled <em>sun position</em>, not against the satellite&apos;s
          energy figure. The SI1145 reports raw counts and the satellite reports MJ/m² — the two
          cannot be compared in absolute terms without fitting a conversion this data does not
          support. What can be compared is the shape of the day, and that is what is measured
          here.
        </p>
      </Section>

      <Section title="What the satellite cannot see">
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-shade-200">
          One number a day is the most a satellite gives for this point. The mast samples every
          fifteen minutes, and on this day it caught{' '}
          <strong className="text-bleach">{solar.cloudEvents} sharp falls</strong> in light —
          cloud crossing overhead. A daily mean averages every one of them away.
        </p>

        <div className="mt-6">
          <LightCurve points={solar.points} darkFloor={solar.darkFloorCounts} />
        </div>

        <p className="mt-5 max-w-3xl text-xs leading-relaxed text-shade-200">
          This is also why the station&apos;s dead UV channel matters less than it might. The
          satellite supplies the daily energy total the instrument cannot integrate; the
          instrument supplies the minute-to-minute detail the satellite averages out. Neither
          replaces the other, and the app tags each for what it is.
        </p>
      </Section>
    </>
  );
}
