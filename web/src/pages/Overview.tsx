import { useOutletContext } from 'react-router-dom';
import { Hero } from '../components/Hero';
import { HeroMedia } from '../components/HeroMedia';
import { Reveal } from '../components/Reveal';
import { SprayIcon, DryingIcon } from '../components/icons/TaskIcons';
import type { AppContext } from '../lib/outletContext';
import type { Instruction } from '../lib/types';

/** Tints each card's icon with that card's own status colour. */
const ICON_TINT: Record<Instruction['status'], string> = {
  go: 'text-kenya-green-400',
  wait: 'text-amber-300',
  stop: 'text-kenya-red-400',
};

/**
 * Landing page: the "read across a room" screen a judge sees first.
 * Both headline instructions, no supporting detail sections — those live on
 * their own pages.
 */
export function Overview() {
  const { data } = useOutletContext<AppContext>();
  const d = data.decisions;

  // Drying's own criterion is humidity ("under 60% with direct sun"), and the
  // server already phrases its detail line from this same reading — so the
  // card shows the number its verdict rests on, rather than being the one
  // card with an empty Reading slot next to a card that has one.
  const dryingHumidity = data.latest.humidityPct.toFixed(0);

  if (!d) {
    return (
      <div className="py-16">
        <p className="font-display text-2xl text-kenya-red-400">No observations to decide on.</p>
        <p className="mt-2 text-sm text-shade-200">
          The station returned no rows for the most recent day.
        </p>
      </div>
    );
  }

  return (
    <>
      <HeroMedia />

      {data.forecastDegraded && (
        <p className="mt-6 rounded border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          The forecast service is unreachable, so rain is not being checked. Spray and drying advice
          below accounts for humidity and wind only — confirm the sky yourself before acting.
        </p>
      )}

      {/* `lg`, not `md`: at 768px each column would be narrower than the
          card is on a phone. `h-full` has to be passed to Reveal too — it
          renders its own div between the grid and the card, so without it the
          grid's stretch stops there and the cards never match height (which
          would also make Hero's `mt-auto` footer alignment do nothing). */}
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Reveal className="h-full">
          <Hero
            label="Spraying"
            instruction={d.spray}
            metric={d.spray.assessment.deltaT.toFixed(1)}
            metricUnit="°C Delta-T"
            icon={<SprayIcon className={ICON_TINT[d.spray.status]} />}
            timelinePoints={data.timeline}
            timelineKey="spray"
          />
        </Reveal>

        <Reveal className="h-full" delayMs={100}>
          <Hero
            label="Grain drying"
            instruction={d.drying}
            metric={dryingHumidity}
            metricUnit="% RH"
            icon={<DryingIcon className={ICON_TINT[d.drying.status]} />}
            timelinePoints={data.timeline}
            timelineKey="drying"
          />
        </Reveal>
      </div>
    </>
  );
}
