import { useState } from 'react';
import type { OutlookHour, OutlookResponse } from '../lib/types';
import { ProvenanceTag } from './Provenance';
import { useChartReveal } from '../lib/useChartReveal';
import { Section } from './Section';

/**
 * The next three days as working windows.
 *
 * The single-day timeline above this answers "when could I have worked today".
 * This answers "when can I work between now and Sunday" — the same gates, the
 * same thresholds, run over a bias-corrected forecast instead of an
 * instrument.
 *
 * ## Why night is drawn rather than hidden
 *
 * Over a live 72-hour window at this site, 29 hours pass the spray Delta-T and
 * wind bands and only 9 of them are in daylight: night air is cool and humid,
 * so it sails through gates designed for working hours. Dropping those hours
 * silently would make the strip look like the night simply had no data.
 * Drawing them as an explicitly labelled excluded band, and printing the count,
 * says what actually happened — the conditions were fine and the clock was not.
 */

const BANDS = [
  {
    key: 'spray' as const,
    label: 'Spray',
    hint: 'Delta-T 2–8 °C and wind 0.8–4.2 m/s, in daylight',
  },
  {
    key: 'drying' as const,
    label: 'Dry grain',
    hint: 'Humidity under 60% with sun above 200 W/m²',
  },
];

/** Groups the flat hour list into local calendar days. */
function byDay(hours: OutlookHour[]): { date: string; hours: OutlookHour[] }[] {
  const days = new Map<string, OutlookHour[]>();
  for (const h of hours) {
    const date = h.time.slice(0, 10);
    if (!days.has(date)) days.set(date, []);
    days.get(date)!.push(h);
  }
  return [...days.entries()].map(([date, hs]) => ({ date, hours: hs }));
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00+03:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

function HourCell({
  hour,
  band,
  style,
  onRead,
}: {
  hour: OutlookHour;
  band: 'spray' | 'drying';
  style?: React.CSSProperties;
  /** Reports this cell to the read-out line below the grid. */
  onRead?: (text: string | null) => void;
}) {
  const verdict = band === 'spray' ? hour.spray : hour.drying;
  const clock = hour.time.slice(11, 16);

  // Three states, three distinct fills — and the night state is deliberately
  // distinguishable from a plain failure, because "we did not consider this
  // hour" and "this hour is unsuitable" are different claims.
  const fill = !hour.daylight
    ? 'bg-shade-900 ring-1 ring-inset ring-shade-700'
    : verdict.pass
      ? 'bg-kenya-green-500'
      : 'bg-shade-600';

  const label = !hour.daylight
    ? `${clock}: outside field hours`
    : verdict.pass
      ? `${clock}: suitable`
      : `${clock}: ${verdict.reason}`;

  // These cells are ~8px wide. A popover over one would cover the hours on
  // either side, which are exactly what it is being compared against — so the
  // detail goes to a read-out line under the grid instead. `title` is gone
  // rather than kept: it did nothing on touch, which is where this is read.
  return (
    <span
      className={`h-6 flex-1 origin-bottom cursor-pointer rounded-[2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-kenya-green-400 ${fill}`}
      role="img"
      aria-label={label}
      tabIndex={onRead ? 0 : undefined}
      onMouseEnter={() => onRead?.(label)}
      onMouseLeave={() => onRead?.(null)}
      onFocus={() => onRead?.(label)}
      onBlur={() => onRead?.(null)}
      onTouchStart={() => onRead?.(label)}
      style={style}
    />
  );
}

/**
 * One band's grid, plus its own read-out line.
 *
 * The read-out state lives here rather than in the parent because the two
 * bands render the same clock times: a single shared value meant pointing at
 * an hour in the spray grid also rewrote the drying grid's line underneath it.
 */
function BandGrid({
  band,
  days,
  windows,
  reveal,
}: {
  band: (typeof BANDS)[number];
  days: { date: string; hours: OutlookHour[] }[];
  windows: OutlookResponse['windows'];
  reveal: ReturnType<typeof useChartReveal>;
}) {
  // Six rows share the same clock times, so the read-out carries the day too
  // or "09:00: suitable" is ambiguous across the grid.
  const [reading, setReading] = useState<string | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm uppercase tracking-[0.2em] text-bleach">
          {band.label}
        </h3>
        <span className="text-xs text-shade-400">{band.hint}</span>
      </div>

      <div className="mt-3 space-y-2">
        {days.map((d) => (
          <div key={d.date} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs tabular-nums text-shade-400">
              {dayLabel(d.date)}
            </span>
            <div className="flex flex-1 gap-[2px]">
              {d.hours.map((h, i) => (
                <HourCell
                  key={h.time}
                  hour={h}
                  band={band.key}
                  onRead={(text) => setReading(text ? `${dayLabel(d.date)} ${text}` : null)}
                  style={{
                    opacity: reveal.progress,
                    transform: `scaleY(${reveal.progress || 0.25})`,
                    transition: `${reveal.transition(i, 'opacity', 24)}, ${reveal.transition(i, 'transform', 24)}`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Read-out for the grid above. Held at a fixed height so pointing at an
          hour never shifts the layout under the cursor. */}
      <p className="mt-2 min-h-[1.5rem] text-xs text-shade-200">
        {reading ?? (
          <span className="text-shade-400">
            Hover, tap or tab through an hour for its verdict.
          </span>
        )}
      </p>

      <p className="mt-1 text-sm text-shade-200">
        {windows.length
          ? `${windows.length} window${windows.length > 1 ? 's' : ''}: ` +
            windows
              .map(
                (w) =>
                  `${w.start.slice(11, 16)}–${w.end.slice(11, 16)} ${dayLabel(w.start.slice(0, 10))}`,
              )
              .join(', ')
          : `No ${band.label.toLowerCase()} window in the next three days.`}
      </p>
    </div>
  );
}

export function ForwardOutlook({ outlook }: { outlook: OutlookResponse }) {
  const days = byDay(outlook.hours);
  // Staggered by hour-of-day column rather than by cell, so the strip wipes
  // left to right like a day passing. 144 cells staggered individually would
  // tail for seconds and read as decoration; 24 columns reads as time.
  // scaleY + opacity rather than height: compositor-only, so it stays smooth
  // on a cheap phone.
  const reveal = useChartReveal({ stagger: 18, duration: 550 });
  const sprayWindows = outlook.windows.filter((w) => w.band === 'spray');
  const dryingWindows = outlook.windows.filter((w) => w.band === 'drying');

  return (
      <Section
        title="The next three days"
        aside={
          <ProvenanceTag
            kind={outlook.uncalibrated ? 'raw_forecast' : 'bias_corrected'}
            title={
              outlook.uncalibrated
                ? 'Forecast values, uncorrected — no calibration coefficients were available'
                : 'Forecast temperature, humidity and wind corrected against this station'
            }
          />
        }
      >

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
        The same gates as today, run forward over the forecast. These are model values, never
        station readings — the forward Delta-T uses an approximated wet bulb, where today&apos;s is
        measured directly.
      </p>

      <div ref={reveal.ref} className="mt-6 space-y-8">
        {BANDS.map((band) => {
          const windows = band.key === 'spray' ? sprayWindows : dryingWindows;
          return (
            <BandGrid
              key={band.key}
              band={band}
              days={days}
              windows={windows}
              reveal={reveal}
            />
          );
        })}
      </div>

      {/* Legend. Night is named, not left as an unexplained gap. */}
      <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-shade-700/60 pt-4 text-xs text-shade-200">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[2px] bg-kenya-green-500" aria-hidden /> Suitable
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[2px] bg-shade-600" aria-hidden /> Not suitable
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-[2px] bg-shade-900 ring-1 ring-inset ring-shade-700"
            aria-hidden
          />{' '}
          Outside field hours (06:00–18:00)
        </li>
      </ul>

      {outlook.nightHoursExcluded > 0 && (
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-shade-200">
          {outlook.nightHoursExcluded} night{' '}
          {outlook.nightHoursExcluded === 1 ? 'hour' : 'hours'} in this window would have passed the
          spray gates on the numbers alone. Night air is cool and humid, so it satisfies limits
          written for working hours — they are excluded rather than offered as opportunities.
        </p>
      )}

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-shade-200">
        Peak projected heat over the window is {outlook.heat.peakWbgtC.toFixed(1)} °C WBGT against a{' '}
        {outlook.heat.thresholdC} °C first-action threshold, so{' '}
        {outlook.heat.anyRestriction
          ? 'a work/rest restriction applies at the peak.'
          : 'no work/rest restriction applies — reported plainly rather than manufactured.'}
      </p>

    </Section>
  );
}
