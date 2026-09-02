import { useMemo, useState } from 'react';
import type { TimelinePoint } from '../lib/types';
import { DAY_MINUTES, hhmm, makeDayAxis } from '../lib/format';

type BandKey = 'spray' | 'drying' | 'heat';

const BANDS: { key: BandKey; label: string; hint: string }[] = [
  { key: 'spray', label: 'Spray', hint: 'Delta-T 2–8 °C and wind 0.8–4.2 m/s' },
  { key: 'drying', label: 'Dry grain', hint: 'Humidity under 60% with direct sun' },
  { key: 'heat', label: 'Outdoor work', hint: 'ISO 7243 work/rest band from measured WBGT' },
];

interface Segment {
  startPct: number;
  widthPct: number;
  pass: boolean;
  reason: string;
  startTs: string;
  endTs: string;
}

/** Collapses consecutive equal-state points into drawable segments. */
function segmentsFor(
  points: TimelinePoint[],
  key: BandKey,
  axis: (iso: string) => number,
  span: number,
): Segment[] {
  const stateOf = (p: TimelinePoint) =>
    key === 'spray' ? p.spray.pass : key === 'drying' ? p.drying.pass : p.heatBand === 'continuous';
  const reasonOf = (p: TimelinePoint) =>
    key === 'spray' ? p.spray.reason : key === 'drying' ? p.drying.reason : '';

  const out: Segment[] = [];
  let run: { pass: boolean; from: string; to: string; reason: string } | null = null;

  const push = () => {
    if (!run) return;
    const start = axis(run.from);
    // Give a single-sample run a visible width rather than a zero-width sliver.
    const end = Math.max(axis(run.to), start + 8);
    out.push({
      startPct: (start / span) * 100,
      widthPct: ((end - start) / span) * 100,
      pass: run.pass,
      reason: run.reason,
      startTs: run.from,
      endTs: run.to,
    });
    run = null;
  };

  for (const p of points) {
    const pass = stateOf(p);
    if (run && run.pass === pass) run.to = p.ts;
    else {
      push();
      run = { pass, from: p.ts, to: p.ts, reason: reasonOf(p) };
    }
  }
  push();
  return out;
}

/**
 * The working day as a horizontal axis.
 *
 * Each task gets its own band, so the eye compares when the day is usable for
 * spraying against when it is usable for drying — the comparison a farmer
 * actually makes.
 */
export function Timeline({ points }: { points: TimelinePoint[] }) {
  const [hovered, setHovered] = useState<Segment | null>(null);

  const { axis, span, hours } = useMemo(() => {
    const raw = makeDayAxis(points[0]?.ts ?? new Date().toISOString());
    const first = points.length ? raw(points[0].ts) : 0;
    const last = points.length ? raw(points[points.length - 1].ts) : DAY_MINUTES;

    // Anchor to whole hours either side so labels land on round times.
    const from = Math.floor(first / 60) * 60;
    const to = Math.ceil(last / 60) * 60;
    const width = Math.max(to - from, 60);

    const ticks: number[] = [];
    for (let m = from; m <= to; m += 180) ticks.push(m);

    return {
      axis: (iso: string) => raw(iso) - from,
      span: width,
      hours: ticks.map((m) => ({ minutes: m - from, label: m })),
    };
  }, [points]);

  const bands = useMemo(
    () => BANDS.map((b) => ({ ...b, segments: segmentsFor(points, b.key, axis, span) })),
    [points, axis, span],
  );

  return (
    <section className="border-t border-shade-700 py-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          The working day
        </h2>
        <p className="text-xs text-shade-400">Times are East Africa Time</p>
      </div>

      <div className="mt-6 space-y-5">
        {bands.map((band) => (
          <div key={band.key}>
            <div className="mb-1.5 flex items-baseline gap-3">
              <span className="w-24 shrink-0 font-display text-base text-bleach sm:w-28">
                {band.label}
              </span>
              <span className="text-xs text-shade-400">{band.hint}</span>
            </div>

            <div className="relative h-8 w-full overflow-hidden rounded bg-shade-800 ring-1 ring-shade-700">
              {band.segments.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(s)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${band.label} ${s.pass ? 'suitable' : 'not suitable'} ${hhmm(s.startTs)} to ${hhmm(s.endTs)}${s.reason ? `: ${s.reason}` : ''}`}
                  className={`absolute top-0 h-full transition-opacity hover:opacity-80 ${
                    s.pass ? 'bg-sun-500' : 'bg-shade-600'
                  }`}
                  style={{ left: `${s.startPct}%`, width: `${s.widthPct}%` }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-2 h-4" aria-hidden>
        {hours.map((h) => (
          <span
            key={h.label}
            className="absolute -translate-x-1/2 text-[10px] tabular-nums text-shade-400"
            style={{ left: `${(h.minutes / span) * 100}%` }}
          >
            {String(Math.floor((h.label / 60) % 24)).padStart(2, '0')}:00
          </span>
        ))}
      </div>

      <p className="mt-4 min-h-[2.5rem] text-sm text-shade-200">
        {hovered ? (
          <>
            <span className="font-medium text-bleach">
              {hhmm(hovered.startTs)}–{hhmm(hovered.endTs)}
            </span>{' '}
            — {hovered.pass ? 'suitable' : hovered.reason || 'not suitable'}
          </>
        ) : (
          <span className="text-shade-400">
            Hover or tab through a band to see why a period is open or closed.
          </span>
        )}
      </p>
    </section>
  );
}
