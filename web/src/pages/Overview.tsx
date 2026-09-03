import { useOutletContext } from 'react-router-dom';
import { Hero } from '../components/Hero';
import { Reveal } from '../components/Reveal';
import type { AppContext } from '../lib/outletContext';

/**
 * Landing page: the "read across a room" screen a judge sees first.
 * Both headline instructions, no supporting detail sections — those live on
 * their own pages.
 */
export function Overview() {
  const { data } = useOutletContext<AppContext>();
  const d = data.decisions;

  if (!d) {
    return (
      <div className="py-16">
        <p className="font-display text-2xl text-ember">No observations to decide on.</p>
        <p className="mt-2 text-sm text-shade-200">
          The station returned no rows for the most recent day.
        </p>
      </div>
    );
  }

  return (
    <>
      {data.forecastDegraded && (
        <p className="mt-6 rounded border border-sun-500/30 bg-sun-500/10 px-4 py-3 text-sm text-sun-300">
          The forecast service is unreachable, so rain is not being checked. Spray and drying advice
          below accounts for humidity and wind only — confirm the sky yourself before acting.
        </p>
      )}

      <Reveal>
        <Hero
          label="Spraying"
          instruction={d.spray}
          metric={d.spray.assessment.deltaT.toFixed(1)}
          metricUnit="°C Delta-T"
        />
      </Reveal>

      <Reveal delayMs={100}>
        <Hero label="Grain drying" instruction={d.drying} />
      </Reveal>
    </>
  );
}
