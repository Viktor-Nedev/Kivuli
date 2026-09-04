import { useEffect, useRef, useState } from 'react';
import { HashRouter, Routes, Route, Outlet, useLocation } from 'react-router-dom';
import gsap from 'gsap';
import type { TodayResponse } from './lib/types';
import type { AppContext } from './lib/outletContext';
import { longDate } from './lib/format';
import { prefersReducedMotion } from './lib/prefersReducedMotion';
import { Overview } from './pages/Overview';
import { TimelinePage } from './pages/TimelinePage';
import { StationPage } from './pages/StationPage';
import { ShadeMapPage } from './pages/ShadeMapPage';
import { CalibrationPage } from './pages/CalibrationPage';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from './components/SiteFooter';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string; hint?: string; detail?: string }
  | { phase: 'ready'; data: TodayResponse };

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

function AppLayout() {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);

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
    <Shell subtitle={subtitle}>
      {state.phase === 'loading' && (
        <div key="loading" className="py-16">
          <p className="text-shade-200">Reading the station…</p>
        </div>
      )}

      {state.phase === 'error' && (
        <div key="error" className="py-16">
          <p className="font-display text-2xl text-kenya-red-400">{state.message}</p>
          {state.detail && (
            <p className="mt-2 font-mono text-sm text-shade-200">{state.detail}</p>
          )}
          {state.hint && <p className="mt-2 text-sm text-shade-400">{state.hint}</p>}
        </div>
      )}

      {state.phase === 'ready' && (
        <PageTransition>
          <Outlet context={{ data: state.data, mapboxToken } satisfies AppContext} />
        </PageTransition>
      )}
    </Shell>
  );
}

/**
 * GSAP-driven page transition: on every route change (nav click or browser
 * back/forward), the new page's content fades and rises in. React Router
 * unmounts the old route's tree immediately on navigation, so there is no
 * outgoing element left to animate out by the time this effect runs — this
 * animates the incoming page instead, which is the transition that is
 * actually achievable without a library-level exit-animation coordinator
 * (e.g. Framer Motion's AnimatePresence).
 */
function PageTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: 'power2.out',
          // Left in place, GSAP's own inline transform (even resolved to an
          // identity matrix at y: 0) creates a new containing block for any
          // descendant `position: fixed` element — which silently breaks
          // HeroMedia's fullscreen video-scrub section, positioning it
          // relative to this wrapper instead of the viewport. Clearing the
          // transform/opacity inline styles once the tween finishes removes
          // that side effect entirely.
          clearProps: 'transform,opacity',
        },
      );
    }, el);
    return () => ctx.revert();
  }, [pathname]);

  return (
    <div key={pathname} ref={ref}>
      {children}
    </div>
  );
}

/**
 * Only `<main>`'s data-dense content (tables, gauges, timeline bands) keeps a
 * readable max-width — the header and footer are full-bleed siblings outside
 * that constraint, so imagery can genuinely reach the viewport edges instead
 * of fighting an inherited max-width via negative margins.
 */
function Shell({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  // The shade map is a viewport-height map; behind the full 62vh photo header
  // it opened mostly below the fold. This one route gets the slim header so
  // the map is actually on screen when the page loads.
  const { pathname } = useLocation();
  const compactHeader = pathname.startsWith('/shade-map');

  return (
    // `overflow-x-clip` because the full-bleed children (the scrubbed hero,
    // the shade map) size themselves with `w-screen`, and `100vw` counts the
    // classic scrollbar gutter that the content box does not have — roughly
    // 15px of horizontal overflow on desktop Windows/Linux. Clip rather than
    // `overflow-x-hidden`: hidden makes this a scroll container, which
    // silently breaks `position: sticky` for any descendant and gives the
    // browser a second scrollport to fight over.
    <div className="min-h-screen overflow-x-clip">
      <SiteHeader subtitle={subtitle} compact={compactHeader} />
      {/* The shade map is full-bleed and supplies its own chrome, so it opts
          out of the reading-width column and the bottom padding — both would
          just add dead scroll under a viewport-height section. */}
      <main
        className={
          compactHeader ? '' : 'mx-auto max-w-5xl px-5 pb-20 sm:px-8'
        }
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
