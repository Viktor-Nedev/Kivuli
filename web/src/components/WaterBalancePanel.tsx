import { useState } from 'react';
import type { CropStage, SoilProfile, WaterBalance } from '../lib/types';
import { ProvenanceTag } from './Provenance';
import { Term } from './Term';

/**
 * How much water the crop is owed, and when that starts to matter.
 *
 * The deficit is a running account of water arriving (rain) and leaving (crop
 * evapotranspiration). It is **not** a soil moisture reading — there is no
 * probe at this station, and this panel never implies one.
 *
 * ## Why every soil is shown at once
 *
 * The accrued deficit is soil-independent, so it can be stated plainly. The
 * *timing* cannot: readily-available water runs from 16 mm on sand to 50 mm on
 * clay at this rooting depth, a 3.1x spread that is wider than a whole week's
 * deficit here. Picking a default soil would put the calculation's largest
 * uncertainty behind its most confident-looking sentence.
 *
 * So the spread is the headline. Choosing a soil highlights one row; it never
 * hides the others, and it never turns the answer into a date.
 */

const BAND_COLOUR: Record<string, string> = {
  crossed: 'bg-kenya-red-500',
  safe: 'bg-kenya-green-500',
};

function SoilRow({
  soil,
  closingDeficitMm,
  maxRaw,
  selected,
  onSelect,
}: {
  soil: SoilProfile;
  closingDeficitMm: number;
  maxRaw: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const crossed = soil.crossesOnDay !== null;
  // Bar length is the soil's capacity; the marker is where the deficit sits.
  const capacityPct = (soil.rawMm / maxRaw) * 100;
  const deficitPct = Math.min((closingDeficitMm / maxRaw) * 100, 100);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`block w-full rounded-lg border p-3 text-left transition-colors ${
        selected
          ? 'border-kenya-green-400 bg-shade-800/60'
          : 'border-shade-700 bg-shade-800/30 hover:border-shade-400'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-sm text-bleach">{soil.label}</span>
        <span className="text-[11px] tabular-nums text-shade-400">
          holds {soil.rawMm.toFixed(0)} mm before stress
        </span>
      </div>

      <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-shade-900 ring-1 ring-shade-700">
        {/* The soil's readily-available water. */}
        <span
          className="absolute inset-y-0 left-0 bg-shade-600"
          style={{ width: `${capacityPct}%` }}
        />
        {/* Where the deficit has actually reached. */}
        <span
          className={`absolute inset-y-0 left-0 ${crossed ? BAND_COLOUR.crossed : BAND_COLOUR.safe}`}
          style={{ width: `${deficitPct}%`, opacity: 0.85 }}
        />
      </div>

      <p className={`mt-1.5 text-xs ${crossed ? 'text-kenya-red-400' : 'text-kenya-green-400'}`}>
        {crossed
          ? `Stress begins on day ${soil.crossesOnDay}`
          : 'Stays within reach through this window'}
      </p>
    </button>
  );
}

export function WaterBalancePanel({
  balance,
  crops,
  onCropChange,
}: {
  balance: WaterBalance;
  crops: CropStage[];
  onCropChange: (id: string) => void;
}) {
  const [soil, setSoil] = useState<string | null>(null);
  const maxRaw = Math.max(...balance.soils.map((s) => s.rawMm), balance.closingDeficitMm, 1);
  const chosen = balance.soils.find((s) => s.texture === soil) ?? null;

  return (
    <section className="border-t border-shade-700 py-10 sm:py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Water owed
        </h2>
        <ProvenanceTag
          kind="raw_forecast"
          title="Reference evapotranspiration and rainfall from Open-Meteo. No bias coefficients are fitted for either, so these are uncorrected model values."
        />
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-shade-200">
        An account of water arriving and leaving — rain in, crop evapotranspiration out. This is not
        a soil moisture reading: the station has no probe, and nothing here claims to know how much
        water is in your ground.
      </p>

      {/* Crop selector. Changes Kc, which is a server round-trip. */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="crop" className="text-[11px] uppercase tracking-[0.2em] text-shade-400">
          Crop and stage
        </label>
        <select
          id="crop"
          value={balance.crop.id}
          onChange={(e) => onCropChange(e.target.value)}
          className="rounded border border-shade-700 bg-shade-800 px-3 py-1.5 font-display text-sm text-bleach focus-visible:outline focus-visible:outline-2 focus-visible:outline-kenya-green-400"
        >
          {crops.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-shade-400">
          <Term term="kc">Kc</Term> {balance.crop.kc}, roots {balance.crop.rootDepthM} m (FAO-56)
        </span>
      </div>

      <div className={`mt-6 rounded-r-lg border-l-4 bg-shade-800/40 p-5 ${
        balance.closingDeficitMm > 0 ? 'border-amber-500' : 'border-kenya-green-500'
      }`}>
        <p className="font-display text-2xl text-bleach">{balance.headline}</p>
        <p lang="sw" className="mt-1 font-display text-base text-shade-200">
          {balance.headlineSw}
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-shade-200">{balance.detail}</p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* The ledger — the substantive content, identical in shape whether the
            closing figure is 26 mm or zero. */}
        <div>
          <h3 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
            Day by day
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-shade-400">
                  <th className="py-1 pr-2 font-normal">Day</th>
                  <th className="py-1 pr-2 text-right font-normal">Crop use</th>
                  <th className="py-1 pr-2 text-right font-normal">Rain</th>
                  <th className="py-1 pr-2 text-right font-normal">Chance</th>
                  <th className="py-1 text-right font-normal">Owed</th>
                </tr>
              </thead>
              <tbody>
                {balance.days.map((d) => (
                  <tr key={d.date} className="border-t border-shade-700/50">
                    <td className="py-1.5 pr-2 text-shade-200">{d.date.slice(5)}</td>
                    <td className="py-1.5 pr-2 text-right text-shade-200">
                      {d.cropEtMm.toFixed(1)}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-shade-200">{d.rainMm.toFixed(1)}</td>
                    {/* The odds beside the depth. 2 mm at 20% and 2 mm at 85%
                        are different instructions, and the depth alone hides
                        which one you are being given. */}
                    <td className="py-1.5 pr-2 text-right text-shade-400">
                      {d.rainProbabilityPct === null ? '—' : `${d.rainProbabilityPct}%`}
                    </td>
                    <td className="py-1.5 text-right font-display text-bleach">
                      {d.deficitMm.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-shade-400">All figures in mm.</p>
        </div>

        {/* The spread — the argument. */}
        <div>
          <h3 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
            When it matters, by soil
          </h3>
          <p className="mt-1 text-xs text-shade-400">
            Tap a soil to highlight it. The others stay visible on purpose.
          </p>
          <div className="mt-3 space-y-2">
            {balance.soils.map((s) => (
              <SoilRow
                key={s.texture}
                soil={s}
                closingDeficitMm={balance.closingDeficitMm}
                maxRaw={maxRaw}
                selected={chosen?.texture === s.texture}
                onSelect={() => setSoil(chosen?.texture === s.texture ? null : s.texture)}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-5 max-w-3xl text-xs leading-relaxed text-shade-400">
        Soil capacities are FAO-56 table values for a texture class, not measurements of your field
        — the same kind of published convention as the runoff coefficient above. The crop
        coefficient is a single mid-stage figure, so it ignores the partitioning between soil
        evaporation and transpiration and any stress feedback. And the far end of a seven-day
        forecast is soft: the first two days carry most of the confidence.
      </p>
    </section>
  );
}
