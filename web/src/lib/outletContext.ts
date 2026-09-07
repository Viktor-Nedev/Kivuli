import type { TodayResponse } from './types';

/**
 * Shared payload every page reads via react-router's useOutletContext().
 *
 * The single /api/today and /api/config fetches live once in the layout
 * route (App.tsx), not per-page — this is the value threaded down so no
 * page re-fetches on navigation.
 *
 * `data` is nullable on purpose. The station is one instrument at one point,
 * and it can be unreachable; but only four of the seven routes read it. The
 * layout used to render nothing at all when /api/today failed, which blanked
 * the Season page, the shade map and the validation page — none of which
 * touch station data. Pages that need a reading now check for null and render
 * `StationUnavailable`; the rest simply ignore it.
 */
export interface StationError {
  message: string;
  hint?: string;
  detail?: string;
}

export interface AppContext {
  /** Null when the station could not be read. Check before use. */
  data: TodayResponse | null;
  /** Present only when `data` is null. */
  error?: StationError;
  mapboxToken: string | null;
}
