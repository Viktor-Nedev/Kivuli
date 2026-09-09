import { useEffect, useState } from 'react';
import type { ClimateResponse, WaterResponse } from '../lib/types';
import { Reveal } from '../components/Reveal';
import { RainfallStanding } from '../components/RainfallStanding';
import { SeasonOnset } from '../components/SeasonOnset';
import { WaterHarvest } from '../components/WaterHarvest';
import { ShareAdvisory } from '../components/ShareAdvisory';
import { SitePicker, SiteSplitNote } from '../components/SitePicker';
import { WaterBalancePanel } from '../components/WaterBalancePanel';
import { RiverPanel } from '../components/RiverPanel';
import { DEFAULT_SITE_ID, SITE_OPTIONS, type SiteOption } from '../lib/site';

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
  // The water balance is fetched beside the rainfall history but kept in its
  // own state: it is a separate endpoint with a separate failure mode, and a
  // balance outage must not blank the page that works.
  const [water, setWater] = useState<WaterResponse | null>(null);
  const [crop, setCrop] = useState('maize_mid');
  const [site, setSite] = useState<SiteOption>(
    () => SITE_OPTIONS.find((o) => o.id === DEFAULT_SITE_ID) ?? SITE_OPTIONS[0],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });

    // The station site is the default and needs no parameters, so its request
    // stays byte-identical to the one the committed offline snapshot was
    // fetched with.
    const query =
      site.id === DEFAULT_SITE_ID
        ? ''
        : `?lat=${site.latitude}&lon=${site.longitude}&place=${encodeURIComponent(site.label)}`;

    fetch(`/api/climate${query}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ClimateResponse>;
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
    // Deliberately NOT keyed on `crop`. The crop only affects the water
    // balance; keying this effect on it too made every crop-dropdown change
    // re-download eleven years of rainfall, which is a real cost on the rural
    // bandwidth this project keeps saying it cares about.
  }, [site]);

  // The water balance is its own effect and its own failure. A balance outage
  // must not blank the rainfall page it sits under, and vice versa.
  useEffect(() => {
    let cancelled = false;
    const query =
      site.id === DEFAULT_SITE_ID
        ? `?crop=${crop}`
        : `?lat=${site.latitude}&lon=${site.longitude}&place=${encodeURIComponent(site.label)}&crop=${crop}`;

    fetch(`/api/water${query}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<WaterResponse>;
      })
      .then((data) => {
        if (!cancelled) setWater(data.degraded ? null : data);
      })
      .catch(() => {
        if (!cancelled) setWater(null);
      });

    return () => {
      cancelled = true;
    };
  }, [site, crop]);

  // The picker stays mounted through every phase. Unmounting it while a fetch
  // is in flight would remove the control the reader just used and leave them
  // stranded on a spinner with no way back.
  const header = (
    <section className="pt-10 sm:pt-12">
      <h1 className="font-display text-3xl text-bleach sm:text-4xl">How this season compares</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
        Eleven years of ERA5 reanalysis — a gridded reconstruction of weather that has already
        happened — for one point in Kenya. It describes rain that has fallen. Nothing on this page
        forecasts the season ahead.
      </p>
      <div className="mt-6">
        <SitePicker selected={site} onSelect={setSite} busy={state.phase === 'loading'} />
      </div>
    </section>
  );

  if (state.phase === 'loading') {
    return (
      <>
        {header}
        <section className="py-16">
          <p className="text-sm text-shade-200">
            Reading eleven years of rainfall records for {site.label}…
          </p>
        </section>
      </>
    );
  }

  if (state.phase === 'error') {
    return (
      <>
      {header}
      <section className="py-16">
        <h2 className="font-display text-2xl text-kenya-red-400">
          Rainfall history unavailable
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-shade-200">
          The multi-year archive could not be read, so nothing on this page can be computed. The
          rest of the site is unaffected — today&apos;s decisions come from the station and do not
          depend on this.
        </p>
        <p className="mt-2 font-mono text-xs text-shade-200">{state.message}</p>
      </section>
      </>
    );
  }

  const { data } = state;

  // `degraded` is the server saying it could not reach the archive and had no
  // cache to fall back on. Showing a page of zeroes would be worse than
  // showing nothing, so this is a full stop rather than a banner.
  if (data.degraded) {
    return (
      <>
      {header}
      <section className="py-16">
        <h2 className="font-display text-2xl text-amber-300">Rainfall history unavailable</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-shade-200">
          The rainfall archive could not be reached and there was no cached copy to fall back on.
          Rather than show an empty comparison, this page waits — today&apos;s station decisions
          are unaffected.
        </p>
        {data.detail && <p className="mt-2 font-mono text-xs text-shade-200">{data.detail}</p>}
      </section>
      </>
    );
  }

  return (
    <>
      {header}

      {site.id !== DEFAULT_SITE_ID && <SiteSplitNote place={data.place} />}

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

      {data.river && (
        <Reveal>
          <RiverPanel river={data.river} />
        </Reveal>
      )}

      {water && (
        <Reveal>
          <WaterBalancePanel
            balance={water.balance}
            crops={water.crops}
            onCropChange={setCrop}
          />
        </Reveal>
      )}

      <Reveal>
        <ShareAdvisory advisory={data.advisory} />
      </Reveal>

      <Reveal>
        <section className="border-t border-shade-700 py-8">
          <p className="max-w-3xl text-xs leading-relaxed text-shade-200">
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
