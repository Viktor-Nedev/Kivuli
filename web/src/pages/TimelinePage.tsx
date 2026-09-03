import { useOutletContext } from 'react-router-dom';
import { Timeline } from '../components/Timeline';
import { Reveal } from '../components/Reveal';
import type { AppContext } from '../lib/outletContext';

export function TimelinePage() {
  const { data } = useOutletContext<AppContext>();
  return (
    <Reveal>
      <Timeline points={data.timeline} />
    </Reveal>
  );
}
