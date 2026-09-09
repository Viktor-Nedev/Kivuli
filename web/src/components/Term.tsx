import type { ReactNode } from 'react';

/**
 * A defined term.
 *
 * KIVULI's whole posture is telling the reader what is evidence and what is
 * inference — and it was doing that in eight undefined acronyms. Delta-T is
 * the largest number on the landing page and nothing anywhere said what it
 * was. Honesty the reader cannot parse is not honesty.
 *
 * Built on a real `<abbr title>` so it works with no JavaScript and announces
 * correctly to a screen reader, with `tabIndex` so the definition is reachable
 * by keyboard — native `title` tooltips never appear on focus. The popover is
 * CSS-only: no state, no positioning engine, no dependency. At a viewport edge
 * it wraps rather than being cleverly repositioned, and the `title` attribute
 * remains as the fallback.
 */

export type TermKey =
  | 'deltaT'
  | 'wbgt'
  | 'wetBulb'
  | 'rh'
  | 'kc'
  | 'et0'
  | 'taw'
  | 'raw'
  | 'thi'
  | 'era5'
  | 'mae'
  | 'instrumentSpread'
  | 'bias'
  | 'uvIndex';

export interface TermDefinition {
  /** Expansion of the abbreviation, or the plain name. */
  short: string;
  /** One sentence saying what it is and why this app cares. */
  full: string;
  /** Swahili gloss where an established one exists. */
  sw?: string;
}

export const TERMS: Record<TermKey, TermDefinition> = {
  deltaT: {
    short: 'Delta-T',
    full: 'Air temperature minus wet-bulb temperature. It measures how fast a spray droplet evaporates: below 2 °C droplets hang in the air and drift, above 8 °C they evaporate before landing.',
    sw: 'Tofauti kati ya joto la hewa na joto la kipimo chenye unyevu',
  },
  wbgt: {
    short: 'Wet-bulb globe temperature',
    full: 'A heat-stress index combining temperature, humidity, radiation and wind. ISO 7243 uses it to set work and rest cycles for outdoor labour.',
    sw: 'Kipimo cha joto kali kwa wafanyakazi walio nje',
  },
  wetBulb: {
    short: 'Wet-bulb temperature',
    full: 'The lowest temperature reachable by evaporating water into the air. The station measures it directly; a forecast has to approximate it.',
    sw: 'Joto la chini kabisa linaloweza kufikiwa kwa uvukizi',
  },
  rh: {
    short: 'Relative humidity',
    full: 'How much water the air holds as a percentage of the most it could hold at that temperature. Grain will not dry into damp air.',
    sw: 'Unyevu wa hewa',
  },
  kc: {
    short: 'Crop coefficient',
    full: 'A multiplier from FAO-56 turning reference evapotranspiration into what a particular crop at a particular growth stage actually uses.',
  },
  et0: {
    short: 'Reference evapotranspiration',
    full: 'The water a standard grass surface would lose to evaporation and transpiration in a day — the demand side of a crop water balance.',
  },
  taw: {
    short: 'Total available water',
    full: 'The water a soil can hold between field capacity and the point a plant can no longer extract it, over the crop rooting depth.',
  },
  raw: {
    short: 'Readily available water',
    full: 'The share of total available water a crop can take without stress. Beyond it the plant starts closing stomata and yield suffers.',
  },
  thi: {
    short: 'Temperature-humidity index',
    full: 'A cattle heat-stress index. Shown here as a measurement; it drives no instruction in this app because the station carries no livestock context.',
  },
  era5: {
    short: 'ERA5 reanalysis',
    full: 'A global model reconstruction of past weather on a roughly 9 km grid. It is not a measurement, and this app tags it accordingly.',
  },
  mae: {
    short: 'Mean absolute error',
    full: 'The average size of a miss, ignoring whether it was high or low. Smaller is better.',
  },
  instrumentSpread: {
    short: 'Instrument spread',
    full: "The gap between the highest and lowest of the station's three thermometers at the same moment. It is the station measuring its own uncertainty — and the floor below which correcting a forecast stops meaning anything.",
    sw: 'Tofauti kati ya vipimo vitatu vya joto vya kituo kimoja',
  },
  bias: {
    short: 'Bias',
    full: 'The average signed error — whether a source reads consistently high or low. A bias can be subtracted; scatter cannot.',
  },
  uvIndex: {
    short: 'UV index',
    full: 'A WHO scale for ultraviolet strength. Above 8 is "very high": unprotected skin reddens in minutes.',
    sw: 'Kipimo cha nguvu ya miale ya jua',
  },
};

export function Term({ term, children }: { term: TermKey; children?: ReactNode }) {
  const def = TERMS[term];
  return (
    <span className="group relative inline-block">
      <abbr
        title={`${def.short} — ${def.full}`}
        tabIndex={0}
        className="cursor-help underline decoration-shade-400 decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kenya-green-400"
      >
        {children ?? def.short}
      </abbr>
      {/* CSS-only popover. `title` above is the no-JS and no-hover fallback. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-64 rounded-lg border border-shade-700 bg-shade-900 p-3 text-left text-xs font-normal leading-relaxed text-shade-200 shadow-lg group-hover:block group-focus-within:block group-active:block"
      >
        <span className="block font-display text-sm text-bleach">{def.short}</span>
        <span className="mt-1 block normal-case tracking-normal">{def.full}</span>
        {def.sw && (
          <span lang="sw" className="mt-1 block normal-case tracking-normal text-shade-400">
            {def.sw}
          </span>
        )}
      </span>
    </span>
  );
}

/** The full list, rendered as a definition list. Used on the model-check page. */
export function Glossary() {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
      {(Object.keys(TERMS) as TermKey[]).map((key) => (
        <div key={key}>
          <dt className="font-display text-sm text-bleach">{TERMS[key].short}</dt>
          <dd className="mt-1 text-xs leading-relaxed text-shade-200">{TERMS[key].full}</dd>
          {TERMS[key].sw && (
            <dd lang="sw" className="mt-0.5 text-xs leading-relaxed text-shade-400">
              {TERMS[key].sw}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
