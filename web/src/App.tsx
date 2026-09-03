import { useEffect, useState } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Outlet,
  NavLink,
  useNavigate,
  type NavigateFunction,
  type NavigateOptions,
  type To,
} from 'react-router-dom';
import type { TodayResponse } from './lib/types';
import type { AppContext } from './lib/outletContext';
import { longDate } from './lib/format';
import { Overview } from './pages/Overview';
import { TimelinePage } from './pages/TimelinePage';
import { StationPage } from './pages/StationPage';
import { ShadeMapPage } from './pages/ShadeMapPage';
import { CalibrationPage } from './pages/CalibrationPage';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string; hint?: string; detail?: string }
  | { phase: 'ready'; data: TodayResponse };

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/timeline', label: 'Working day' },
  { to: '/station', label: 'Station' },
  { to: '/shade-map', label: 'Shade map' },
  { to: '/calibration', label: 'Calibration' },
] as const;

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Overview />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="station" element={<StationPage />} />
          <Route path="shade-map" element={<ShadeMapPage />} />
          <Route path="calibration" element={<CalibrationPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

/**
 * Wraps navigate() in the native View Transitions API so page changes cross-
 * fade instead of hard-cutting. Falls back to a plain navigate() where the
 * API is unavailable (Safari/Firefox as of early 2026) — an invisible
 * degrade, not a broken feature.
 */
function useViewTransitionNavigate(): NavigateFunction {
  const navigate = useNavigate();
  return ((to: To, options?: NavigateOptions) => {
    if (typeof document === 'undefined' || !('startViewTransition' in document)) {
      navigate(to as string, options);
      return;
    }
    (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(
      () => navigate(to as string, options),
    );
  }) as NavigateFunction;
}

function AppLayout() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const viewTransitionNavigate = useViewTransitionNavigate();

  useEffect(() => {
    // Best-effort: the shade map is an optional module, so a failed fetch
    // here should not block the rest of the dashboard from rendering.
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => setMapboxToken(c.mapboxToken ?? null))
      .catch(() => setMapboxToken(null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // `?at=HH:MM` pins the evaluation moment. The bundled sample is a fixed
        // historical day, so without a pin the app opens on its final row at
        // 02:55 local — a dead night-time state that shows none of the day's
        // decisions. A live feed should drop the parameter.
        const at = new URLSearchParams(window.location.search).get('at') ?? '13:00';
        const res = await fetch(`/api/today?at=${encodeURIComponent(at)}`);
        const body = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setState({
            phase: 'error',
            message: body.error ?? 'Request failed',
            hint: body.hint,
            // e.g. the station's own "Wrong Email or APIKey" rejection —
            // without it a bad key looks like a generic outage.
            detail: body.detail,
          });
          return;
        }
        setState({ phase: 'ready', data: body as TodayResponse });
      } catch (err) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: 'Could not reach the KIVULI server.',
            hint: 'Start it with npm run dev, then reload this page.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const subtitle =
    state.phase === 'ready' ? longDate(state.data.timeline[0]?.ts ?? state.data.decisions?.ts) : undefined;

  return (
    <Shell subtitle={subtitle} navigate={viewTransitionNavigate}>
      {state.phase === 'loading' && (
        <div key="loading" className="page-enter py-16">
          <p className="text-shade-200">Reading the station…</p>
        </div>
      )}

      {state.phase === 'error' && (
        <div key="error" className="page-enter py-16">
          <p className="font-display text-2xl text-ember">{state.message}</p>
          {state.detail && (
            <p className="mt-2 font-mono text-sm text-shade-200">{state.detail}</p>
          )}
          {state.hint && <p className="mt-2 text-sm text-shade-400">{state.hint}</p>}
        </div>
      )}

      {state.phase === 'ready' && (
        <Outlet key="ready" context={{ data: state.data, mapboxToken } satisfies AppContext} />
      )}
    </Shell>
  );
}

function Shell({
  children,
  subtitle,
  navigate,
}: {
  children: React.ReactNode;
  subtitle?: string;
  navigate: NavigateFunction;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-5xl px-5 pb-20 sm:px-8">
      <header className="pt-10 sm:pt-14">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-3xl tracking-tight text-bleach sm:text-4xl">KIVULI</h1>
          <p className="text-sm text-shade-200">
            Field decisions from the JKUAT Conduit station, Juja
          </p>
        </div>
        {subtitle && <p className="mt-1 text-sm text-shade-400">{subtitle}</p>}

        <nav className="mt-6 flex gap-x-5 gap-y-2 overflow-x-auto whitespace-nowrap border-t border-shade-700 pt-4 sm:flex-wrap">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              onClick={(e) => {
                // Intercept plain left-clicks to run navigation through the
                // View Transition wrapper; let modified clicks (open in new
                // tab, etc.) behave as normal links.
                if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
                  return;
                }
                e.preventDefault();
                navigate(item.to);
              }}
              className={({ isActive }) =>
                `font-display text-sm uppercase tracking-[0.2em] transition-colors ${
                  isActive ? 'text-sun-400' : 'text-shade-200 hover:text-bleach'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main>{children}</main>

      <footer className="mt-16 border-t border-shade-700 pt-6 text-xs leading-relaxed text-shade-400">
        <p>
          Observations come from the Conduit climate station at JKUAT. Forecast and reanalysis come
          from Open-Meteo. The station measures weather only — it carries no soil, vegetation or
          water-quality sensors, and nothing here is derived from them.
        </p>
      </footer>
    </div>
  );
}
