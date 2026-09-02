import { useEffect, useState } from 'react';
import type { TodayResponse } from './lib/types';
import { longDate } from './lib/format';
import { Hero } from './components/Hero';
import { Timeline } from './components/Timeline';
import { StationPanel } from './components/StationPanel';
import { CalibrationTable } from './components/Calibration';
import { HeatNote } from './components/HeatNote';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string; hint?: string; detail?: string }
  | { phase: 'ready'; data: TodayResponse };

export default function App() {
  const [state, setState] = useState<State>({ phase: 'loading' });

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

  if (state.phase === 'loading') {
    return (
      <Shell>
        <p className="py-16 text-shade-200">Reading the station…</p>
      </Shell>
    );
  }

  if (state.phase === 'error') {
    return (
      <Shell>
        <div className="py-16">
          <p className="font-display text-2xl text-ember">{state.message}</p>
          {state.detail && (
            <p className="mt-2 font-mono text-sm text-shade-200">{state.detail}</p>
          )}
          {state.hint && <p className="mt-2 text-sm text-shade-400">{state.hint}</p>}
        </div>
      </Shell>
    );
  }

  const { data } = state;
  const d = data.decisions;

  if (!d) {
    return (
      <Shell>
        <div className="py-16">
          <p className="font-display text-2xl text-ember">No observations to decide on.</p>
          <p className="mt-2 text-sm text-shade-200">
            The station returned no rows for the most recent day.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell subtitle={longDate(data.timeline[0]?.ts ?? d.ts)}>
      {data.forecastDegraded && (
        <p className="mt-6 rounded border border-sun-500/30 bg-sun-500/10 px-4 py-3 text-sm text-sun-300">
          The forecast service is unreachable, so rain is not being checked. Spray and drying advice
          below accounts for humidity and wind only — confirm the sky yourself before acting.
        </p>
      )}

      <Hero
        label="Spraying"
        instruction={d.spray}
        metric={d.spray.assessment.deltaT.toFixed(1)}
        metricUnit="°C Delta-T"
      />

      <Hero label="Grain drying" instruction={d.drying} />

      <Timeline points={data.timeline} />

      <StationPanel reading={data.latest} sourceName={data.source} />

      <HeatNote heat={d.heat} thi={d.thi} />

      <CalibrationTable calibration={data.calibration} />
    </Shell>
  );
}

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
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
