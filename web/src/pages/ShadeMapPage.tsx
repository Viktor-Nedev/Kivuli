import { useOutletContext } from 'react-router-dom';
import { ShadeMap } from '../components/ShadeMap';
import type { AppContext } from '../lib/outletContext';

/**
 * Deliberately not wrapped in `<Reveal>` like the other pages. Reveal animates
 * a transform on its wrapper, which (a) makes a viewport-height map visibly
 * slide up on entry rather than simply being there, and (b) turns the wrapper
 * into a containing block, which anything `fixed` inside the map — Mapbox's
 * own popups and controls — would then be positioned against.
 */
export function ShadeMapPage() {
  const { data, mapboxToken } = useOutletContext<AppContext>();
  return (
    <ShadeMap
      token={mapboxToken}
      dayDate={data.timeline[0]?.ts.slice(0, 10) ?? ''}
      timeline={data.timeline}
    />
  );
}
