import { useEffect, useState } from 'react';
import type { ValidationResponse } from '../lib/types';
import { Reveal } from '../components/Reveal';
import { ValidationPanel } from '../components/ValidationPanel';

/**
 * How wrong is the model here?
 *
 * Fetches for itself rather than reading the layout's `/api/today`, because
 * the comparison needs a full day of station history against the matching
 * archive hours — a different query from the one the decision cards make.
 */
type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: ValidationResponse };

export function ValidationPage() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/validation')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ValidationResponse>;
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
      <section className="py-16">
        <p className="text-sm text-shade-200">Comparing the station against the model…</p>
      </section>
    );
  }

  if (state.phase === 'error' || state.data.degraded) {
    const detail = state.phase === 'error' ? state.message : state.data.detail;
    return (
      <section className="py-16">
        <h1 className="font-display text-2xl text-amber-300">Comparison unavailable</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-shade-200">
          This page needs both the station&apos;s own readings and the reanalysis for the same
          hours. One of them could not be read, so rather than show half a comparison it shows
          none.
        </p>
        {detail && <p className="mt-2 font-mono text-xs text-shade-200">{detail}</p>}
      </section>
    );
  }

  return (
    <Reveal>
      <ValidationPanel
        variables={state.data.variables}
        station={state.data.station}
        agreement={state.data.agreement}
      />
    </Reveal>
  );
}
