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
