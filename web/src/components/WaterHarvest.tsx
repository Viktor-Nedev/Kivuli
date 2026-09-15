import { useState } from 'react';
import type { ClimateResponse, MonthClimate } from '../lib/types';
import { ProvenanceTag } from './Provenance';
import { useChartReveal, useCountUp } from '../lib/useChartReveal';
import { DataTip, alignFor } from './DataTip';
import { Section } from './Section';

/**
 * What a roof could collect here, and why storage is the point.
 *
 * The arithmetic is deliberately trivial — depth x area x runoff coefficient,
 * where 1 mm on 1 m2 is exactly 1 litre. There is no model to be wrong about,
 * which is why this can be offered with a plain number attached.
 *
 * The chart underneath is what makes it a recommendation rather than a
 * novelty. Across eleven years only April, May and November gain more water
 * than they lose to evaporation at this site; the other nine months run a
 * deficit. Rain here is not scarce so much as *badly timed*, so the useful
 * question is not "how much falls" but "how much can be held from the two wet
 * peaks to cover the nine dry months".
 */

const MONTHS_SHORT = [
  'J',
  'F',
  'M',
  'A',
  'M',
  'J',
  'J',
  'A',
  'S',
  'O',
  'N',
  'D',
];

const MONTH_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** A jerrycan is the unit people actually buy and carry water in. */
const JERRYCAN_L = 20;

function BalanceChart({ climatology }: { climatology: MonthClimate[] }) {
  const max = Math.max(...climatology.map((m) => Math.max(m.rainMm, m.et0Mm)), 1);
  // Staggered by month, so rain and evaporation rise together and the
  // surplus/deficit crossover forms as you watch rather than arriving done.
  const reveal = useChartReveal({ stagger: 40 });
  const count = climatology.length;

  return (
    <div ref={reveal.ref}>
      <div className="flex items-end gap-1 sm:gap-2" style={{ height: 140 }}>
        {climatology.map((m, i) => {
          const surplus = m.balanceMm > 0;
          const grow = reveal.transition(i, 'height', count);
          return (
            <div key={m.month} className="flex flex-1 flex-col justify-end gap-0.5">
              {/* One tip per month covering both bars: the surplus or deficit
                  is the difference between them, so splitting it across two
                  tooltips would hide the only number that matters here. */}
              <DataTip
                className="block"
                triggerClassName="block"
                align={alignFor(i, count)}
                label={MONTH_FULL[m.month - 1]}
                detailText={
                  `${m.rainMm.toFixed(0)} mm rain against ${m.et0Mm.toFixed(0)} mm ` +
                  `evaporation demand — a ${Math.abs(m.balanceMm).toFixed(0)} mm ` +
                  `${surplus ? 'surplus' : 'deficit'}.`
                }
                detail={
                  <>
                    <span className="tabular-nums text-kenya-green-300">
                      {m.rainMm.toFixed(0)} mm
                    </span>{' '}
                    rain against{' '}
                    <span className="tabular-nums text-amber-300">{m.et0Mm.toFixed(0)} mm</span>{' '}
                    evaporation demand.
                    <span className="mt-1 block text-bleach">
                      A {Math.abs(m.balanceMm).toFixed(0)} mm {surplus ? 'surplus' : 'deficit'}.
                    </span>
                  </>
                }
              >
                <span className="relative flex items-end gap-0.5" style={{ height: 116 }}>
                  {/* Rain */}
                  <span
                    className={`w-1/2 rounded-t-md ${surplus ? 'bg-gradient-to-t from-kenya-green-600 to-kenya-green-400 shadow-[0_0_18px_-5px_rgba(52,224,122,0.65)]' : 'bg-gradient-to-t from-shade-700 to-shade-500'}`}
                    style={{ height: `${(m.rainMm / max) * 100 * reveal.progress}%`, transition: grow }}
                  />
                  {/* Evapotranspiration */}
                  <span
                    className="w-1/2 rounded-t-md bg-gradient-to-t from-amber-600/50 to-amber-400/80"
                    style={{ height: `${(m.et0Mm / max) * 100 * reveal.progress}%`, transition: grow }}
                  />
                </span>
              </DataTip>
              <span
                className={`text-center text-micro ${surplus ? 'text-kenya-green-300' : 'text-shade-400'}`}
              >
                {MONTHS_SHORT[m.month - 1]}
              </span>
            </div>
          );
        })}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-shade-200">
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-kenya-green-500" aria-hidden />
          Rainfall, surplus month
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-shade-600" aria-hidden />
          Rainfall, deficit month
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/50" aria-hidden />
          Evaporation demand
        </li>
      </ul>
    </div>
  );
}

export function WaterHarvest({ harvest, climatology }: Pick<ClimateResponse, 'harvest' | 'climatology'>) {
  const [roofM2, setRoofM2] = useState(harvest.referenceRoofM2);

  const litres = Math.round(harvest.medianAnnualMm * roofM2 * harvest.runoffCoeff);
  // Counts up once on first read, then tracks the slider live — the figure has
  // to follow the roof-area input, not stay frozen at whatever it counted to.
  const litresShown = Math.round(useCountUp(litres));
  const perDay = Math.round(litres / 365);
  const jerrycans = Math.round(litres / JERRYCAN_L);

  const surplusMonths = climatology.filter((m) => m.balanceMm > 0);
  const deficitCount = 12 - surplusMonths.length;
  const surplusNames = surplusMonths.map((m) => MONTH_FULL[m.month - 1]);

  return (
      <Section
        title="Roof water harvesting"
        aside={
          <ProvenanceTag
            kind="reanalysis"
            title="Rainfall depth from ERA5 reanalysis; the runoff coefficient is an engineering convention"
          />
        }
      >

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
        Rain here is not so much scarce as badly timed. Over{' '}
        {harvest.medianAnnualMm.toFixed(0)} mm falls in a typical year, but only{' '}
        {surplusMonths.length} months —{' '}
        <span className="text-bleach">{surplusNames.join(', ')}</span> — gain more water than
        evaporation takes away. The other {deficitCount} run a deficit, so what a household can
        store from the wet peaks matters more than the annual total.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass glass-edge lift rounded-2xl p-5">
          <label
            htmlFor="roof-area"
            className="block text-xs uppercase tracking-[0.2em] text-shade-400"
          >
            Roof area
          </label>
          <div className="mt-2 flex items-center gap-4">
            <input
              id="roof-area"
              type="range"
              min={10}
              max={300}
              step={5}
              value={roofM2}
              onChange={(e) => setRoofM2(Number(e.target.value))}
              className="w-full accent-kenya-green-400"
            />
            <span className="w-20 shrink-0 text-right font-display text-lg tabular-nums text-bleach">
              {roofM2} m²
            </span>
          </div>

          <p className="mt-6 text-xs uppercase tracking-[0.2em] text-shade-400">
            Could collect in a typical year
          </p>
          <p className="font-display text-5xl tabular-nums text-kenya-green-400">
            {litresShown.toLocaleString()}
            <span className="ml-2 text-xl text-shade-200">litres</span>
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-shade-700/60 pt-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-shade-400">
                Averaged per day
              </dt>
              <dd className="font-display text-2xl tabular-nums text-bleach">{perDay} L</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.2em] text-shade-400">
                Jerrycans (20 L)
              </dt>
              <dd className="font-display text-2xl tabular-nums text-bleach">
                {jerrycans.toLocaleString()}
              </dd>
            </div>
          </dl>

          {/* The assumption is stated on the card, not buried in a footnote:
              the coefficient is a convention, not something measured here. */}
          <p className="mt-4 text-xs leading-relaxed text-shade-200">
            {harvest.medianAnnualMm.toFixed(0)} mm × {roofM2} m² ×{' '}
            {harvest.runoffCoeff} runoff coefficient. The coefficient is the usual figure for
            corrugated iron. This is what the roof <em>catches</em> — first-flush diversion, gutter
            losses and overflow once a tank is full all reduce what you actually keep.
          </p>
        </div>

        <div className="glass glass-edge lift rounded-2xl p-5">
          <h3 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
            Water balance through the year
          </h3>
          <p className="mt-1 mb-4 text-xs text-shade-200">
            Mean rainfall against evaporation demand, {climatology[0]?.years ?? 0} years
          </p>
          <BalanceChart climatology={climatology} />
        </div>
      </div>
    </Section>
  );
}
