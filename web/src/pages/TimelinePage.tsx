import { useOutletContext } from 'react-router-dom';
import { Timeline } from '../components/Timeline';
import { ForwardOutlook } from '../components/ForwardOutlook';
import { UvCard } from '../components/UvCard';
import { Reveal } from '../components/Reveal';
import { ExportButtons } from '../components/ExportButtons';
import { Section } from '../components/Section';
import { TIMELINE_COLUMNS, TIMELINE_NOTES } from '../lib/exportColumns';
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
      <section className="pt-10 sm:pt-12">
        <h1 className="font-display text-3xl text-bleach sm:text-4xl">The working day</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
          Today hour by hour, and the three days after it. The bands above are{' '}
          <strong className="text-bleach">measured</strong> — station readings run through the same
          gates the advice uses. The forward grid below them is a corrected forecast, and is
          labelled as one. Nothing here mixes the two.
        </p>
      </section>

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

      {/* The measured day, as a file. This is the Conduit's own readings beside
          the decision each one produced — the project's argument in one
          download. */}
      <Section title="Take the data">
        <ExportButtons
          rows={data.timeline}
          columns={TIMELINE_COLUMNS}
          coversDate={data.timeline[0]?.ts.slice(0, 10) ?? ''}
          label={`these ${data.timeline.length} station readings and the gates run on them`}
          meta={{
            dataset: 'working-day',
            title: 'the working day — station readings and decision gates',
            source: `JKUAT Conduit station via ${data.source}`,
            notes: TIMELINE_NOTES,
          }}
        />
      </Section>
    </>
  );
}
