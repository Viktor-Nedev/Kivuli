import type { OutlookHour, OutlookResponse } from '../lib/types';
import { ProvenanceTag } from './Provenance';

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

function HourCell({ hour, band }: { hour: OutlookHour; band: 'spray' | 'drying' }) {
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

  return (
    <span
      className={`h-6 flex-1 rounded-[2px] ${fill}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}

export function ForwardOutlook({ outlook }: { outlook: OutlookResponse }) {
  const days = byDay(outlook.hours);
  const sprayWindows = outlook.windows.filter((w) => w.band === 'spray');
  const dryingWindows = outlook.windows.filter((w) => w.band === 'drying');

  return (
    <section className="border-t border-shade-700 py-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          The next three days
        </h2>
        <ProvenanceTag
          kind={outlook.uncalibrated ? 'raw_forecast' : 'bias_corrected'}
          title={
            outlook.uncalibrated
              ? 'Forecast values, uncorrected — no calibration coefficients were available'
              : 'Forecast temperature, humidity and wind corrected against this station'
          }
        />
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
        The same gates as today, run forward over the forecast. These are model values, never
        station readings — the forward Delta-T uses an approximated wet bulb, where today&apos;s is
        measured directly.
      </p>

      <div className="mt-6 space-y-8">
        {BANDS.map((band) => {
          const windows = band.key === 'spray' ? sprayWindows : dryingWindows;
          return (
            <div key={band.key}>
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
                      {d.hours.map((h) => (
                        <HourCell key={h.time} hour={h} band={band.key} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-2 text-sm text-shade-200">
                {windows.length
                  ? `${windows.length} window${windows.length > 1 ? 's' : ''}: ` +
                    windows
                      .map((w) => `${w.start.slice(11, 16)}–${w.end.slice(11, 16)} ${dayLabel(w.start.slice(0, 10))}`)
                      .join(', ')
                  : `No ${band.label.toLowerCase()} window in the next three days.`}
              </p>
            </div>
          );
        })}
      </div>

      {/* Legend. Night is named, not left as an unexplained gap. */}
      <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-shade-700/60 pt-4 text-[11px] text-shade-200">
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
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-shade-400">
          {outlook.nightHoursExcluded} night{' '}
          {outlook.nightHoursExcluded === 1 ? 'hour' : 'hours'} in this window would have passed the
          spray gates on the numbers alone. Night air is cool and humid, so it satisfies limits
          written for working hours — they are excluded rather than offered as opportunities.
        </p>
      )}

      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-shade-400">
        Peak projected heat over the window is {outlook.heat.peakWbgtC.toFixed(1)} °C WBGT against a{' '}
        {outlook.heat.thresholdC} °C first-action threshold, so{' '}
        {outlook.heat.anyRestriction
          ? 'a work/rest restriction applies at the peak.'
          : 'no work/rest restriction applies — reported plainly rather than manufactured.'}
      </p>
    </section>
  );
}
