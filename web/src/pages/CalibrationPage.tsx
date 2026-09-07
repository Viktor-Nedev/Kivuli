import { useOutletContext } from 'react-router-dom';
import { CalibrationTable } from '../components/Calibration';
import { Reveal } from '../components/Reveal';
import type { AppContext } from '../lib/outletContext';
import { StationUnavailable } from '../components/StationUnavailable';

export function CalibrationPage() {
  const { data, error } = useOutletContext<AppContext>();
  // The station is one instrument at one point and can be unreachable. This
  // page reports what it measured, so it says so rather than rendering blanks.
  if (!data) return <StationUnavailable error={error} />;

  return (
    <Reveal>
      <CalibrationTable calibration={data.calibration} />
    </Reveal>
  );
}
