import { useOutletContext } from 'react-router-dom';
import { Hero } from '../components/Hero';
import { HeroMedia } from '../components/HeroMedia';
import { AnimatedText } from '../components/AnimatedText';
import { Term } from '../components/Term';
import { AskBox } from '../components/AskBox';
import { Reveal } from '../components/Reveal';
import { RainOutlookPanel } from '../components/RainOutlookPanel';
import { useOutlook } from '../lib/useOutlook';
import { SprayIcon, DryingIcon } from '../components/icons/TaskIcons';
import type { AppContext } from '../lib/outletContext';
import { StationUnavailable } from '../components/StationUnavailable';
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
  const { data, error } = useOutletContext<AppContext>();
  // Own fetch, so the decision cards never wait on a three-day forecast.
  const outlook = useOutlook();

  // After the hooks, never before — an early return above useOutlook would
  // change hook order between renders.
  if (!data) return <StationUnavailable error={error} />;

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
      {/* The header flows straight into the hero sequence. This block used to
          sit between them, which put a paragraph of body copy where the film
          should begin — the design review called it out and was right.

          It is still above the fold's fold, so the pitch is not buried: the
          hero itself is now text-first and readable before any media settles,
          which was the reason this block was hoisted in the first place. */}
      <HeroMedia />

      {/* Two columns rather than a stack. The claim and its answer carry the
          left, at a size that makes them the argument of the page; the reading
          of how to use the site sits beside them in glass, where it reads as a
          note rather than as more headline. Below `lg` it falls back to one
          column in the same order. */}
      <section className="grid grid-cols-1 gap-x-14 gap-y-8 pt-14 sm:pt-20 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end">
        <div>
          <p
            className="rise-in mb-5 flex items-center gap-3 font-display text-xs uppercase tracking-[0.3em] text-accent-400"
            style={{ '--i': 0 } as React.CSSProperties}
          >
            <span className="h-px w-8 bg-accent-400/60" aria-hidden />
            The problem, and the fix
          </p>

          <AnimatedText
            as="h1"
            text="A forecast built for a continent is wrong for one field."
            className="font-display text-4xl leading-[1.04] tracking-[-0.025em] text-bleach sm:text-6xl lg:text-7xl"
          />

          <AnimatedText
            as="p"
            text="KIVULI corrects it against a ground station in Juja, Kenya, and turns it into one instruction."
            className="text-gradient mt-5 font-display text-2xl leading-[1.14] tracking-[-0.02em] sm:text-4xl"
            delay={480}
          />
        </div>

        {/* The operating note, set apart. */}
        <aside
          className="glass glass-edge rise-in rounded-3xl p-6 sm:p-7"
          style={{ '--i': 11 } as React.CSSProperties}
        >
          <p className="font-display text-lg leading-snug text-bleach sm:text-xl">
            Spray now or wait. Spread grain or keep it covered.
          </p>
          <div className="rule-fade my-5" />
          <p className="text-sm leading-relaxed text-shade-200">
            Every number below says whether it was measured at the station, corrected against it,
            or modelled — so you can tell what is evidence and what is inference.
          </p>
        </aside>
      </section>

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
            metricUnit={<>°C <Term term="deltaT">Delta-T</Term></>}
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
            metricUnit={<>% <Term term="rh">RH</Term></>}
            icon={<DryingIcon className={ICON_TINT[d.drying.status]} />}
            timelinePoints={data.timeline}
            timelineKey="drying"
          />
        </Reveal>
      </div>

      {outlook.phase === 'ready' && !outlook.data.degraded && outlook.data.rainOutlook && (
        <Reveal>
          <RainOutlookPanel outlook={outlook.data.rainOutlook} />
        </Reveal>
      )}

      <Reveal>
        <AskBox />
      </Reveal>
    </>
  );
}
