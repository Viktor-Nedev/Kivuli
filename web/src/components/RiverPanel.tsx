import type { RiverOutlook } from '../lib/types';
import { ProvenanceTag } from './Provenance';
import { useChartReveal } from '../lib/useChartReveal';

/**
 * River discharge, where a river exists.
 *
 * The interesting case is the absent one. The global flood model answers a
 * point with no modelled reach — JKUAT campus, for instance — with a flat
 * 0.00 m³/s. Rendered as a gauge that would be a permanent, confident-looking
 * zero, and a reader would take it for a measurement of a very low river.
 *
 * So when there is no reach the panel says so in words and draws no chart at
 * all. Nothing here is a flood forecast for a particular field: discharge is a
 * catchment-scale quantity on a coarse grid, with no local terrain and no
 * drainage data behind it.
 */
export function RiverPanel({ river }: { river: RiverOutlook }) {
  const peak = Math.max(...river.days.map((d) => d.cumecs), 0.001);
  const reveal = useChartReveal({ stagger: 45 });

  return (
    <section className="border-t border-shade-700 py-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          The river
        </h2>
        <ProvenanceTag
          kind="raw_forecast"
          title="Modelled river discharge from Open-Meteo's flood API (GloFAS). Catchment-scale, on a coarse grid."
        />
      </div>

      <div
        className={`mt-5 rounded-r-lg border-l-4 bg-shade-800/40 p-5 ${
          !river.hasReach
            ? 'border-shade-400'
            : river.riseFactor && river.riseFactor > 1.5
              ? 'border-amber-500'
              : 'border-kenya-green-500'
        }`}
      >
        <p className="font-display text-2xl text-bleach">{river.headline}</p>
        <p lang="sw" className="mt-1 font-display text-base text-shade-200">
          {river.headlineSw}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-shade-200">{river.detail}</p>
      </div>

      {/* No reach means no data, so there is deliberately nothing to chart. */}
      {river.hasReach && (
        <div className="mt-6">
          <div ref={reveal.ref} className="flex h-24 items-end gap-1">
            {river.days.map((d, i) => (
              <div
                key={d.date}
                className="flex-1 rounded-t-sm bg-shade-400"
                style={{
                  height: `${Math.max((d.cumecs / peak) * 100, 2) * reveal.progress}%`,
                  transition: reveal.transition(i, 'height', river.days.length),
                }}
                title={`${d.date}: ${d.cumecs} m³/s`}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-shade-400">
            <span>{river.days[0]?.date.slice(5)}</span>
            <span>{river.days[river.days.length - 1]?.date.slice(5)}</span>
          </div>
          <p className="mt-2 text-xs text-shade-400">
            Daily mean discharge, m³/s. Peak {river.peakCumecs} on {river.peakDate}.
          </p>
        </div>
      )}
    </section>
  );
}
