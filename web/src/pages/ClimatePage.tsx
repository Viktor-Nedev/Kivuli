import { useEffect, useState } from 'react';
import type { ClimateResponse } from '../lib/types';
import { Reveal } from '../components/Reveal';
import { RainfallStanding } from '../components/RainfallStanding';
import { SeasonOnset } from '../components/SeasonOnset';
import { WaterHarvest } from '../components/WaterHarvest';
import { ShareAdvisory } from '../components/ShareAdvisory';

/**
 * Eleven years of rainfall history for this site.
 *
 * The only page that fetches for itself. Every other page reads the single
 * `/api/today` call made once in `AppLayout`, and that is the right default —
 * but this page needs a multi-year archive, and putting that behind the shared
 * fetch would make every visitor wait on it before seeing whether they can
 * spray this afternoon. A slow or failed archive stays contained here.
 */

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: ClimateResponse };

export function ClimatePage() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/climate')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ClimateResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ phase: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          phase: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === 'loading') {
    return (
      <section className="py-16">
        <p className="text-sm text-shade-200">Reading eleven years of rainfall records…</p>
      </section>
    );
  }

  if (state.phase === 'error') {
    return (
      <section className="py-16">
        <h2 className="font-display text-2xl text-kenya-red-400">
          Rainfall history unavailable
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-shade-200">
          The multi-year archive could not be read, so nothing on this page can be computed. The
          rest of the site is unaffected — today&apos;s decisions come from the station and do not
          depend on this.
        </p>
        <p className="mt-2 font-mono text-xs text-shade-400">{state.message}</p>
      </section>
    );
  }

  const { data } = state;

  // `degraded` is the server saying it could not reach the archive and had no
  // cache to fall back on. Showing a page of zeroes would be worse than
  // showing nothing, so this is a full stop rather than a banner.
  if (data.degraded) {
    return (
      <section className="py-16">
        <h2 className="font-display text-2xl text-amber-300">Rainfall history unavailable</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-shade-200">
          The rainfall archive could not be reached and there was no cached copy to fall back on.
          Rather than show an empty comparison, this page waits — today&apos;s station decisions
          are unaffected.
        </p>
        {data.detail && <p className="mt-2 font-mono text-xs text-shade-400">{data.detail}</p>}
      </section>
    );
  }

  return (
    <>
      <Reveal>
        <section className="pt-10 sm:pt-12">
          <h1 className="font-display text-3xl text-bleach sm:text-4xl">
            How this season compares
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
            The station&apos;s own record is one day long, so everything here comes from ERA5
            reanalysis — a gridded reconstruction of weather that has already happened — for this
            exact location, {data.referenceYears.from} to {data.referenceYears.to}. It describes
            rain that has fallen. Nothing on this page forecasts the season ahead.
          </p>
        </section>
      </Reveal>

      <Reveal>
        <RainfallStanding
          windows={data.windows}
          climatology={data.climatology}
          throughDate={data.throughDate}
          referenceYears={data.referenceYears}
        />
      </Reveal>

      <Reveal>
        <SeasonOnset mam={data.onset.mam} ond={data.onset.ond} />
      </Reveal>

      <Reveal>
        <WaterHarvest harvest={data.harvest} climatology={data.climatology} />
      </Reveal>

      <Reveal>
        <ShareAdvisory advisory={data.advisory} />
      </Reveal>

      <Reveal>
        <section className="border-t border-shade-700 py-8">
          <p className="max-w-3xl text-xs leading-relaxed text-shade-400">
            Eleven years is not a climate normal — the WMO standard is thirty — so the extreme
            percentiles here are coarse, and the smallest event this record can honestly name is
            roughly a one-in-eleven year. ERA5 is a model reconstruction on a ~9 km grid, not a rain
            gauge: it will not capture a storm that hit one field and missed the next. Rainfall
            measured by the Conduit station itself appears on the Station page and covers a single
            day.
          </p>
        </section>
      </Reveal>
    </>
  );
}
