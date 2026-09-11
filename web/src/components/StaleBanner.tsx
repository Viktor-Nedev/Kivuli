import type { StaleInfo } from '../lib/outletContext';
import { hhmm, longDate, relativeAge } from '../lib/format';

/**
 * Says, before anything else on the page, that these numbers are old.
 *
 * The app can now open with no connection and show the last reading it
 * received. That is worth having — a farmer out of signal still gets the
 * station's own measurements rather than a blank screen — but it introduces
 * the one failure this project cannot accept: data that looks current and is
 * not.
 *
 * So the banner sits in the chrome, above every route, outside the content
 * column. It cannot be scrolled past before the decision cards are read, and
 * it appears identically on whichever page the reader lands on from an
 * installed icon.
 *
 * The copy leads with the reading's own timestamp rather than when the file
 * was cached, because that is the number that governs whether the advice still
 * holds. Both are in the type; only the one that matters is on screen.
 */
export function StaleBanner({ stale, nowMs }: { stale: StaleInfo; nowMs?: number }) {
  return (
    <div
      role="status"
      className="border-b border-amber-500/40 bg-amber-500/10 px-5 py-3 sm:px-8"
    >
      <p className="mx-auto max-w-5xl text-sm leading-relaxed text-shade-200">
        <strong className="text-amber-300">Offline</strong> — showing the last reading KIVULI
        received. Measured at{' '}
        <span className="tabular-nums text-bleach">{hhmm(stale.readingTs)}</span> on{' '}
        <span className="text-bleach">{longDate(stale.readingTs)}</span>,{' '}
        {relativeAge(stale.readingTs, nowMs)}. The spray and drying verdicts below were computed
        from that reading and have not been rechecked since. Conditions change within the hour —
        treat these as a record of what was true, not as advice for now.
      </p>
    </div>
  );
}
