import { useOutletContext } from 'react-router-dom';
import { ShadeMap } from '../components/ShadeMap';
import type { AppContext } from '../lib/outletContext';
import { StationUnavailable } from '../components/StationUnavailable';

/**
 * Deliberately not wrapped in `<Reveal>` like the other pages. Reveal animates
 * a transform on its wrapper, which (a) makes a viewport-height map visibly
 * slide up on entry rather than simply being there, and (b) turns the wrapper
 * into a containing block, which anything `fixed` inside the map — Mapbox's
 * own popups and controls — would then be positioned against.
 */
export function ShadeMapPage() {
  const { data, error, mapboxToken } = useOutletContext<AppContext>();
  // The station is one instrument at one point and can be unreachable. This
  // page reports what it measured, so it says so rather than rendering blanks.
  if (!data) return <StationUnavailable error={error} />;

  return (
    <ShadeMap
      token={mapboxToken}
      dayDate={data.timeline[0]?.ts.slice(0, 10) ?? ''}
      timeline={data.timeline}
    />
  );
}
