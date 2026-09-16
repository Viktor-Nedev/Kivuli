import { useEffect, useState } from 'react';
import { Section } from './Section';
import { ProvenanceTag } from './Provenance';
import type { Provenance } from '../lib/types';

/**
 * The watch board: every standing threshold, and whether it is firing.
 *
 * ## Why a clear watch shows its margin
 *
 * A board of green ticks is indistinguishable from a board that is not
 * running. So each clear watch states the value it measured, the threshold it
 * was compared against, and the distance between them — "21.5 °C WBGT, 6.5 °C
 * below the 28 °C work/rest threshold". That sentence is evidence the
 * detector ran; a tick is not.
 *
 * ## Why `unavailable` is its own state and not a failure
 *
 * "No modelled river reach here" is a true, useful answer, and it is a
 * different claim from "the river was checked and is fine". Collapsing the two
 * into one green row would be the most consequential lie this screen could
 * tell, so an unmeasured watch is drawn in its own muted state with the reason
 * attached.
 */

interface Watch {
  id: string;
  label: string;
  state: 'firing' | 'clear' | 'unavailable';
  hazard: string;
  value: number | null;
  unit: string;
  threshold: number | null;
  marginToFire: number | null;
  provenance: Provenance;
  summary: string;
  reason?: string;
}

interface WatchResponse {
  generatedAt: string;
  watches: Watch[];
  firing: number;
}

type State =
  | { phase: 'loading' }
  | { phase: 'ready'; data: WatchResponse }
  | { phase: 'error'; message: string };

const STATE_STYLE: Record<Watch['state'], { dot: string; text: string; word: string }> = {
  firing: { dot: 'bg-kenya-red-400', text: 'text-kenya-red-400', word: 'Firing' },
  clear: { dot: 'bg-kenya-green-400', text: 'text-kenya-green-400', word: 'Clear' },
  unavailable: { dot: 'bg-shade-500', text: 'text-shade-400', word: 'Not measured' },
};

export function WatchBoard() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/watch')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<WatchResponse>;
      })
      .then((data) => {
        if (!cancelled) setState({ phase: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === 'loading') {
    return (
      <Section title="Standing watches">
        <p className="text-sm text-shade-400">Evaluating watches…</p>
      </Section>
    );
  }

  if (state.phase === 'error') {
    return (
      <Section title="Standing watches">
        <p className="text-sm text-shade-200">
          The watch layer could not be reached, so nothing here has been checked.{' '}
          <span className="text-shade-400">{state.message}</span>
        </p>
      </Section>
    );
  }

  const { watches, firing } = state.data;

  return (
    <Section
      title="Standing watches"
      aside={
        <span className={firing ? 'text-sm text-kenya-red-400' : 'text-sm text-shade-400'}>
          {firing === 0
            ? 'Nothing firing'
            : `${firing} firing`}
        </span>
      }
    >
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-shade-200">
        Each watch is a standing threshold on a quantity this site already measures or forecasts,
        checked against the same limits the rest of the app uses. A clear watch reports how far it
        sits from firing, so an ordinary day still shows the detector working.
      </p>

      <ul className="flex flex-col gap-3">
        {watches.map((w) => {
          const style = STATE_STYLE[w.state];
          return (
            <li
              key={w.id}
              className="rounded-xl border border-white/10 bg-shade-800/40 p-4 backdrop-blur-sm"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} aria-hidden />
                <h3 className="font-display text-base text-bleach">{w.label}</h3>
                <span className={`text-xs uppercase tracking-[0.15em] ${style.text}`}>
                  {style.word}
                </span>
                <span className="ml-auto">
                  <ProvenanceTag kind={w.provenance} title={w.label} />
                </span>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-shade-200">{w.summary}</p>

              {/* The measurement behind the verdict, so the row can be checked
                  rather than believed. */}
              {w.value !== null && w.threshold !== null && (
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-micro text-shade-400">
                  <div className="flex gap-1.5">
                    <dt>Measured</dt>
                    <dd className="tabular-nums text-shade-200">
                      {w.value}
                      {w.unit}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>Threshold</dt>
                    <dd className="tabular-nums text-shade-200">{w.threshold}</dd>
                  </div>
                  {w.marginToFire !== null && (
                    <div className="flex gap-1.5">
                      <dt>Clear by</dt>
                      <dd className="tabular-nums text-shade-200">{w.marginToFire}</dd>
                    </div>
                  )}
                </dl>
              )}

              {w.reason && <p className="mt-2 text-micro text-shade-400">{w.reason}</p>}

              <p className="mt-2 text-micro text-shade-400">Watching for: {w.hazard}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
