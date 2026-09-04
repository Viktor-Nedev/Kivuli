import type { OnsetDistribution } from '../lib/types';
import { ProvenanceTag } from './Provenance';

/**
 * When the rains have historically started.
 *
 * Presented as a distribution, never as a date to plant on. At JKUAT the long
 * rains have begun anywhere from 1 February to 26 April across the record — an
 * 84-day spread. A single median date would read as advice and would be wrong
 * in most individual years, and a farmer who commits seed on a false start
 * loses it. The spread is the honest product: it says when to *start watching*,
 * which the data supports, rather than when to plant, which it does not.
 *
 * The onset rule itself is the standard agronomic one: 20 mm across three days,
 * with no ten-day dry spell in the three weeks that follow. The second half is
 * what rejects a single storm that is not actually the season arriving.
 */

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const SEASON_NAME: Record<'MAM' | 'OND', string> = {
  MAM: 'Long rains',
  OND: 'Short rains',
};

const SEASON_MONTHS: Record<'MAM' | 'OND', string> = {
  MAM: 'March – May',
  OND: 'October – December',
};

/** '03-23' -> '23 Mar'. Returns an em dash for a missing value. */
function prettyMonthDay(md: string | null): string {
  if (!md) return '—';
  const [m, d] = md.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1] ?? ''}`;
}

/** Day-of-year for a 'MM-DD', on a common non-leap reference year. */
function doy(md: string): number {
  const [m, d] = md.split('-').map(Number);
  return Math.round((Date.UTC(2001, m - 1, d) - Date.UTC(2001, 0, 1)) / 86_400_000) + 1;
}

function OnsetCard({ dist }: { dist: OnsetDistribution }) {
  const { earliestMonthDay, latestMonthDay, medianMonthDay } = dist;

  // Lay the observed range out on its own track. The track spans the full
  // earliest-to-latest range with a little padding, so the width of the band
  // is the visual statement.
  const hasRange = Boolean(earliestMonthDay && latestMonthDay && medianMonthDay);
  const from = hasRange ? doy(earliestMonthDay as string) : 0;
  const to = hasRange ? doy(latestMonthDay as string) : 0;
  const mid = hasRange ? doy(medianMonthDay as string) : 0;
  const pad = Math.max(10, Math.round((to - from) * 0.15));
  const axisFrom = from - pad;
  const axisSpan = Math.max(1, to - from + pad * 2);
  const pos = (d: number) => ((d - axisFrom) / axisSpan) * 100;

  return (
    <div className="rounded-xl border border-shade-700 bg-shade-800/40 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          {SEASON_NAME[dist.season]}
        </h3>
        <span className="text-[11px] text-shade-400">{SEASON_MONTHS[dist.season]}</span>
      </div>

      <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-shade-400">
        Typical start
      </p>
      <p className="font-display text-4xl text-bleach">{prettyMonthDay(medianMonthDay)}</p>

      {hasRange && (
        <>
          <div className="mt-5">
            <div className="relative h-8">
              {/* Observed range */}
              <span
                className="absolute top-3 h-2 rounded-full bg-kenya-green-500/40 ring-1 ring-kenya-green-500/50"
                style={{ left: `${pos(from)}%`, width: `${pos(to) - pos(from)}%` }}
              />
              {/* Median marker */}
              <span
                className="absolute top-1 h-6 w-0.5 -translate-x-1/2 rounded bg-kenya-green-300"
                style={{ left: `${pos(mid)}%` }}
                aria-hidden
              />
            </div>
            <div className="flex justify-between text-[10px] text-shade-400">
              <span>{prettyMonthDay(earliestMonthDay)}</span>
              <span>{prettyMonthDay(latestMonthDay)}</span>
            </div>
          </div>

          <p className="mt-3 text-sm text-shade-200">
            Started anywhere across{' '}
            <span className="font-display text-bleach">{dist.spreadDays} days</span> in{' '}
            {dist.observedYears} years on record.
          </p>
        </>
      )}

      {!hasRange && (
        <p className="mt-3 text-sm text-shade-200">
          No qualifying onset was detected in the record for this season.
        </p>
      )}

      {/* The per-year list, so the spread is verifiable rather than asserted. */}
      <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-shade-700/60 pt-3 text-[11px] tabular-nums text-shade-400">
        {dist.years.map((y) => (
          <li key={y.year}>
            <span className="text-shade-200">{y.year}</span>{' '}
            {y.onset ? prettyMonthDay(y.onset.slice(5)) : '—'}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SeasonOnset({ mam, ond }: { mam: OnsetDistribution; ond: OnsetDistribution }) {
  return (
    <section className="border-t border-shade-700 py-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          When the rains start
        </h2>
        <ProvenanceTag
          kind="reanalysis"
          title="Onset dates derived from ERA5 daily rainfall, not forecast"
        />
      </div>

      {/* Stated up front, because this is the one number on the site most
          likely to be mistaken for advice. */}
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
        This is <strong className="text-bleach">history, not a forecast</strong>. Nothing here
        predicts when the rains will start this year. The spread is the useful part: it says when to
        begin watching, and how wrong a single expected date can be.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OnsetCard dist={mam} />
        <OnsetCard dist={ond} />
      </div>

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-shade-400">
        A season counts as started after 20 mm of rain across three days, provided no ten-day dry
        spell follows within three weeks. The dry-spell condition is what separates the real onset
        from a single storm — planting on a false start costs the seed.
      </p>
    </section>
  );
}
