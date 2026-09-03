import { useOutletContext } from 'react-router-dom';
import { StationPanel } from '../components/StationPanel';
import { HeatNote } from '../components/HeatNote';
import { Reveal } from '../components/Reveal';
import type { AppContext } from '../lib/outletContext';

export function StationPage() {
  const { data } = useOutletContext<AppContext>();
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
