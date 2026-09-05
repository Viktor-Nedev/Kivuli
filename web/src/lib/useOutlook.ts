import { useEffect, useState } from 'react';
import type { OutlookResponse } from './types';

/**
 * Fetches `/api/outlook` from the page that needs it.
 *
 * Deliberately not in `AppLayout` alongside `/api/today`. The decision cards
 * answer "can I spray this afternoon" from station data that is already local;
 * making every visitor wait on a three-day forecast before seeing that would
 * trade the fast answer for the slow one. Same reasoning as `/api/climate`.
 */
export type OutlookState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: OutlookResponse };

export function useOutlook(): OutlookState {
  const [state, setState] = useState<OutlookState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/outlook')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<OutlookResponse>;
      })
      .then((data) => {
        if (!cancelled) setState({ phase: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
