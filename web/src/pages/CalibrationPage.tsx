import { useOutletContext } from 'react-router-dom';
import { CalibrationTable } from '../components/Calibration';
import { Reveal } from '../components/Reveal';
import type { AppContext } from '../lib/outletContext';

export function CalibrationPage() {
  const { data } = useOutletContext<AppContext>();
  return (
    <Reveal>
      <CalibrationTable calibration={data.calibration} />
    </Reveal>
  );
}
