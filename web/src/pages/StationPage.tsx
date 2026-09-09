import { useOutletContext } from 'react-router-dom';
import { StationPanel } from '../components/StationPanel';
import { HeatNote } from '../components/HeatNote';
import { Reveal } from '../components/Reveal';
import type { AppContext } from '../lib/outletContext';
import { StationUnavailable } from '../components/StationUnavailable';

export function StationPage() {
  const { data, error } = useOutletContext<AppContext>();
  // The station is one instrument at one point and can be unreachable. This
  // page reports what it measured, so it says so rather than rendering blanks.
  if (!data) return <StationUnavailable error={error} />;

  const d = data.decisions;

  return (
    <>
      <section className="pt-10 sm:pt-12">
        <h1 className="font-display text-3xl text-bleach sm:text-4xl">The instrument</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
          Everything on this page is a reading from {data.source}, not a model output. It is one
          sensor at one point: it measures air, not soil, and it speaks for its own mast rather than
          the district. What it does not measure is listed here too, because the gaps are the
          reason the rest of the app is careful about what it claims.
        </p>
      </section>

      <Reveal>
        <StationPanel reading={data.latest} sourceName={data.source} />
      </Reveal>
      {d && (
        <Reveal delayMs={100}>
          <HeatNote heat={d.heat} thi={d.thi} />
        </Reveal>
      )}
    </>
  );
}
