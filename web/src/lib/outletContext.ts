import type { TodayResponse } from './types';

/**
 * Shared payload every page reads via react-router's useOutletContext().
 *
 * The single /api/today and /api/config fetches live once in the layout
 * route (App.tsx), not per-page — this is the value threaded down so no
 * page re-fetches on navigation.
 */
export interface AppContext {
  data: TodayResponse;
  mapboxToken: string | null;
}
