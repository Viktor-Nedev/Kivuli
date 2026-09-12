import { useEffect, useState } from 'react';
import type { ClimateResponse, WaterResponse } from '../lib/types';
import { Reveal } from '../components/Reveal';
import { RainfallStanding } from '../components/RainfallStanding';
import { SeasonOnset } from '../components/SeasonOnset';
import { WaterHarvest } from '../components/WaterHarvest';
import { ShareAdvisory } from '../components/ShareAdvisory';
import { SitePicker, SiteSplitNote } from '../components/SitePicker';
import { SkeletonCard, SkeletonChart, SkeletonBlock } from '../components/Skeleton';
import { Section } from '../components/Section';
import { ExportButtons } from '../components/ExportButtons';
import {
  ANNUAL_COLUMNS,
  ANNUAL_NOTES,
  CLIMATOLOGY_COLUMNS,
  CLIMATOLOGY_NOTES,
} from '../lib/exportColumns';
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
        {/* Every SitePicker switch used to blank the whole page. The shapes
            match the cards and chart that follow, so nothing jumps on swap. */}
        <section className="py-10">
          <SkeletonBlock caption={`Reading eleven years of rainfall records for ${site.label}…`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <SkeletonChart className="mt-8" />
          </SkeletonBlock>
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

      {/* The longest record in the app, and the one most likely to be plotted
          somewhere else. Both datasets are ERA5, and every column says so. */}
      {(data.annual.length > 0 || data.climatology.length > 0) && (
      <Reveal>
        <Section title="Take the record">
          {data.annual.length > 0 && (
            <ExportButtons
              rows={data.annual}
              columns={ANNUAL_COLUMNS}
              coversDate={data.throughDate}
              label={`these ${data.annual.length} years of annual rainfall`}
              meta={{
                dataset: 'annual-rainfall',
                title: 'annual rainfall totals, ERA5 reanalysis',
                source: `ERA5 via Open-Meteo for ${data.place ?? 'this site'}`,
                notes: ANNUAL_NOTES,
              }}
            />
          )}

          {data.climatology.length > 0 && (
            <ExportButtons
              rows={data.climatology}
              columns={CLIMATOLOGY_COLUMNS}
              coversDate={data.throughDate}
              label="the twelve-month rainfall and evaporation balance"
              meta={{
                dataset: 'monthly-balance',
                title: 'monthly rainfall against evaporation demand',
                source: `ERA5 via Open-Meteo for ${data.place ?? 'this site'}`,
                notes: CLIMATOLOGY_NOTES,
              }}
            />
          )}
        </Section>
      </Reveal>
      )}

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
