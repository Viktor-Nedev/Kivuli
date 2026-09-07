import { useOutletContext } from 'react-router-dom';
import { Timeline } from '../components/Timeline';
import { ForwardOutlook } from '../components/ForwardOutlook';
import { UvCard } from '../components/UvCard';
import { Reveal } from '../components/Reveal';
import type { AppContext } from '../lib/outletContext';
import { StationUnavailable } from '../components/StationUnavailable';
import { useOutlook, useWater } from '../lib/useOutlook';

export function TimelinePage() {
  const { data, error } = useOutletContext<AppContext>();
  // Fetched here rather than in the layout: the day's measured bands render
  // immediately, and the forecast strip fills in when it arrives.
  const outlook = useOutlook();
  const water = useWater();

  // After the hooks, never before — an early return above useOutlook would
  // change hook order between renders.
  if (!data) return <StationUnavailable error={error} />;

  return (
    <>
      <Reveal>
        <Timeline points={data.timeline} />
      </Reveal>

      {outlook.phase === 'loading' && (
        <section className="border-t border-shade-700 py-10">
          <p className="text-sm text-shade-200">Reading the next three days…</p>
        </section>
      )}

      {outlook.phase === 'ready' && !outlook.data.degraded && (
        <Reveal>
          <ForwardOutlook outlook={outlook.data} />
        </Reveal>
      )}

      {/* UV rides on /api/water, not /api/outlook. Nesting it inside
          ForwardOutlook meant an outlook failure hid UV data that had arrived
          perfectly well — the opposite of the granular degradation the rest of
          the app follows. */}
      {water.phase === 'ready' && water.data.uv.peak && (
        <Reveal>
          <section className="border-t border-shade-700 py-10 sm:py-12">
            <UvCard peak={water.data.uv.peak} />
          </section>
        </Reveal>
      )}

      {/* A forecast outage costs the forward strip and nothing else — the
          measured day above is unaffected, and saying so beats a blank gap. */}
      {(outlook.phase === 'error' || (outlook.phase === 'ready' && outlook.data.degraded)) && (
        <section className="border-t border-shade-700 py-10">
          <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
            The next three days
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-shade-200">
            The forecast could not be reached, so no forward windows are shown. Today&apos;s bands
            above come from the station and are unaffected.
          </p>
        </section>
      )}
    </>
  );
}
