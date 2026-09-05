import type { RainOutlook } from '../lib/types';
import { ProvenanceTag } from './Provenance';

/**
 * How much rain is coming, against how much this site actually gets.
 *
 * Deliberately **not** a dismissible alert banner. It is a standing statement
 * that renders identically whether or not anything is wrong, because at this
 * site the honest answer is usually "nothing is coming" — and a warning
 * component that only appears when triggered is indistinguishable from a
 * broken one for everybody who never sees it fire.
 *
 * So the null state is the designed state: a real number, the thresholds, and
 * how often those thresholds are genuinely crossed here. "0 mm ahead, and this
 * site sees 20 mm about every 2 months" tells a reader more about the system's
 * integrity than a red box ever could. The same markup turns amber and red on
 * real data — there is no separate alert path to rot.
 *
 * Two provenances share one sentence: the forecast total is `raw_forecast`
 * (no coefficients are fitted for precipitation), while the exceedance
 * statistics behind it are `reanalysis`. That pairing is exactly what the tag
 * system was built to express.
 */

const LEVEL_RULE: Record<RainOutlook['level'], string> = {
  none: 'border-kenya-green-500',
  notable: 'border-amber-500',
  heavy: 'border-kenya-red-500',
};

const LEVEL_TEXT: Record<RainOutlook['level'], string> = {
  none: 'text-kenya-green-400',
  notable: 'text-amber-300',
  heavy: 'text-kenya-red-400',
};

export function RainOutlookPanel({ outlook }: { outlook: RainOutlook }) {
  return (
    <section className="border-t border-shade-700 py-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Rain ahead
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceTag
            kind="raw_forecast"
            title="Forecast rainfall from Open-Meteo. No bias coefficients are fitted for precipitation, so this value is uncorrected."
          />
          <ProvenanceTag
            kind="reanalysis"
            title={`How often each threshold is crossed here, from ${outlook.referenceYears} years of ERA5 daily rainfall`}
          />
        </div>
      </div>

      <div className={`mt-5 rounded-r-lg border-l-4 bg-shade-800/40 p-5 ${LEVEL_RULE[outlook.level]}`}>
        <p className={`font-display text-2xl ${LEVEL_TEXT[outlook.level]}`}>{outlook.headline}</p>
        <p lang="sw" className="mt-1 font-display text-base text-shade-200">
          {outlook.headlineSw}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-shade-200">{outlook.detail}</p>
      </div>

      {/* The scale itself, so the headline can be checked rather than trusted. */}
      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-shade-700 bg-shade-800/40 p-4">
          <dt className="text-[11px] uppercase tracking-[0.2em] text-shade-400">
            Wettest day ahead
          </dt>
          <dd className="mt-1 font-display text-3xl tabular-nums text-bleach">
            {outlook.peakDayMm.toFixed(1)}
            <span className="ml-1 text-base text-shade-200">mm</span>
          </dd>
          <p className="mt-1 text-xs text-shade-400">
            {outlook.peakDate ? `on ${outlook.peakDate}` : `over ${outlook.horizonDays} days`}
          </p>
        </div>

        {outlook.thresholds.map((t) => (
          <div key={t.mm} className="rounded-lg border border-shade-700 bg-shade-800/40 p-4">
            <dt className="text-[11px] uppercase tracking-[0.2em] text-shade-400">
              {t.mm} mm in a day
            </dt>
            <dd className="mt-1 font-display text-3xl tabular-nums text-bleach">
              {t.exceedances}
              <span className="ml-1 text-base text-shade-200">
                {t.exceedances === 1 ? 'day' : 'days'}
              </span>
            </dd>
            <p className="mt-1 text-xs text-shade-400">
              {t.exceedances
                ? `about every ${
                    t.everyMonths < 1.5
                      ? `${Math.round(t.everyMonths * 30)} days`
                      : `${Math.round(t.everyMonths)} months`
                  } here`
                : 'never in this record'}
            </p>
          </div>
        ))}
      </dl>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-shade-400">
        Frequencies are counted from {outlook.referenceYears} years of reanalysis at this exact
        point, so they describe this site rather than a regional average. That record is too short
        to name a genuinely rare event — the wettest day in it is the wettest day it knows — so this
        panel reports how often a threshold is actually crossed and never how rare it is.
      </p>
    </section>
  );
}
