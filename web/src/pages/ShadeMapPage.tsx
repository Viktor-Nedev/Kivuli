import { useOutletContext } from 'react-router-dom';
import { ShadeMap } from '../components/ShadeMap';
import { Reveal } from '../components/Reveal';
import type { AppContext } from '../lib/outletContext';

export function ShadeMapPage() {
  const { data, mapboxToken } = useOutletContext<AppContext>();
  return (
    <Reveal>
      <ShadeMap
        token={mapboxToken}
        dayDate={data.timeline[0]?.ts.slice(0, 10) ?? ''}
        timeline={data.timeline}
      />
    </Reveal>
  );
}
