import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import type { Instruction, TimelinePoint } from '../lib/types';
import { ProvenanceTag } from './Provenance';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';
import { hhmm } from '../lib/format';
import { dayAxisFor, segmentsFor, type BandKey } from '../lib/timelineSegments';

// go/stop map to the flag's green/red, muted for legibility; wait is a
// genuine third state (not on the flag) and keeps its own amber identity
// rather than being folded into either.
const ACCENT: Record<Instruction['status'], string> = {
  go: 'text-kenya-green-400',
  wait: 'text-amber-300',
  stop: 'text-kenya-red-400',
};

const RULE: Record<Instruction['status'], string> = {
  go: 'bg-kenya-green-400',
  wait: 'bg-amber-300',
  stop: 'bg-kenya-red-400',
};

const STATUS_WORD: Record<Instruction['status'], string> = {
  go: 'Go',
  wait: 'Hold',
  stop: 'Stop',
};

/**
 * The headline decision, as a card rather than stacked paragraphs.
 *
 * A status rail on the left carries the go/wait/stop color as a persistent
 * band (not just a small dot), the headline is the dominant element, and the
 * metric counts up on mount via GSAP rather than appearing as a static
 * number — the same information as before, structured so the eye has a
 * clear entry point instead of reading top-to-bottom through equal-weight
 * lines.
 */
export function Hero({
  label,
  instruction,
  metric,
  metricUnit,
  icon,
  timelinePoints,
  timelineKey,
}: {
  label: string;
  instruction: Instruction;
  metric?: string;
  metricUnit?: string;
  /** Tinted by the caller with this card's status colour. */
  icon?: ReactNode;
  /** Supply both to draw the mini day-band; omit either and it is skipped. */
  timelinePoints?: TimelinePoint[];
  timelineKey?: BandKey;
}) {
  const metricRef = useRef<HTMLSpanElement>(null);

  // Reuses the same geometry as the full-width Timeline page rather than a
  // second implementation, so a band that reads "suitable" here cannot
  // disagree with the same band there.
  const band = useMemo(() => {
    if (!timelinePoints?.length || !timelineKey) return null;
    const { axis, span } = dayAxisFor(timelinePoints);
    const segments = segmentsFor(timelinePoints, timelineKey, axis, span);
    const openRanges = segments
      .filter((s) => s.pass)
      .map((s) => `${hhmm(s.startTs)}–${hhmm(s.endTs)}`);
    return {
      segments,
      label: openRanges.length
        ? `Suitable ${openRanges.join(', ')}`
        : 'Not suitable at any point today',
    };
  }, [timelinePoints, timelineKey]);

  useEffect(() => {
    const el = metricRef.current;
    if (!el || !metric) return;
    const target = Number(metric);
    if (!Number.isFinite(target)) return;

    const decimals = (metric.split('.')[1] ?? '').length;

    // Unlike a page-enter fade, this element genuinely starts at "0" (both
    // the JSX fallback and the tween's start value) — skipping the tween
    // outright under reduced motion would leave the real reading stuck at
    // zero forever, not just remove a flourish, so the correct value still
    // needs to be set, just without animating to it.
    if (prefersReducedMotion()) {
      el.textContent = target.toFixed(decimals);
      return;
    }

    const proxy = { v: 0 };
    const tween = gsap.to(proxy, {
      v: target,
      duration: 1.1,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = proxy.v.toFixed(decimals);
      },
    });
    return () => {
      tween.kill();
    };
  }, [metric]);

  return (
    <section className="lift-on-hover relative flex h-full flex-col overflow-hidden rounded-xl border border-shade-700 bg-shade-800/40 py-6 pl-5 pr-4 sm:py-8 sm:pl-7 sm:pr-6">
      {/* Persistent status rail — carries the color as a band down the left
          edge, not just a small dot, so the card's overall state reads
          before any text is read. */}
      <span className={`absolute inset-y-0 left-0 w-1.5 ${RULE[instruction.status]}`} aria-hidden />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon}
          <span className="relative flex h-3 w-3" aria-hidden>
            {instruction.status === 'go' && (
              <span
                className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${RULE[instruction.status]}`}
              />
            )}
            <span className={`relative inline-flex h-3 w-3 rounded-full ${RULE[instruction.status]}`} />
          </span>
          <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">{label}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`font-display text-xs font-semibold uppercase tracking-[0.25em] ${ACCENT[instruction.status]}`}
          >
            {STATUS_WORD[instruction.status]}
          </span>
          <ProvenanceTag kind="measured" title="Computed from Conduit station observations" />
        </div>
      </div>

      {/* One step down from the old full-width scale: at half width `text-6xl`
          wrapped a three-word headline onto three lines. */}
      <p
        className={`mt-5 font-display text-3xl leading-[1.05] sm:text-4xl lg:text-5xl ${ACCENT[instruction.status]}`}
      >
        {instruction.headline}
      </p>

      <p lang="sw" className="mt-2 font-display text-lg text-shade-200 sm:text-xl">
        {instruction.headlineSw}
      </p>

      {/* `mt-auto` pins the footer to the bottom of the card, so two cards of
          different headline length still line their readings up with each
          other. A fixed stack rather than the old `flex-wrap` row, which at
          half width wrapped unpredictably. */}
      <div className="mt-auto space-y-4 border-t border-shade-700/60 pt-5">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          {metric && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-shade-400">Reading</p>
              <span className="font-display text-4xl tabular-nums text-bleach sm:text-5xl">
                <span ref={metricRef}>0</span>
                {metricUnit && <span className="ml-1 text-base text-shade-200">{metricUnit}</span>}
              </span>
            </div>
          )}
          {instruction.detail && (
            <div className="max-w-sm">
              <p className="text-[11px] uppercase tracking-[0.2em] text-shade-400">Why</p>
              <p className="mt-1 text-sm leading-relaxed text-shade-200">{instruction.detail}</p>
            </div>
          )}
        </div>

        {band && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-shade-400">Across the day</p>
            {/* Deliberately not interactive: the full-width Timeline page
                already offers per-segment inspection, and six focusable
                segments per card would add a dozen tab stops here for
                information that is a glance, not a control. One label on the
                container carries the whole band to a screen reader. */}
            <div
              className="relative mt-2 h-2 overflow-hidden rounded-full bg-shade-800 ring-1 ring-shade-700"
              role="img"
              aria-label={band.label}
            >
              {band.segments.map((seg, i) => (
                <span
                  key={i}
                  className={`absolute top-0 h-full ${
                    seg.pass ? 'bg-kenya-green-500' : 'bg-shade-600'
                  }`}
                  style={{ left: `${seg.startPct}%`, width: `${seg.widthPct}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-shade-400">
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
