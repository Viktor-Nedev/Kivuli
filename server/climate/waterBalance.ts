import type { Provenance } from '../ingest/types.js';

/**
 * Forward crop water balance, after FAO-56.
 *
 * Answers "how much water does this crop owe, and when must I act" from
 * reference evapotranspiration and forecast rain. Pure arithmetic over a
 * standardised quantity — there is no model here to be wrong about, which is
 * the only reason a number this consequential can be offered at all.
 *
 * ## What this is not
 *
 * **It is not a soil moisture measurement.** The station has no soil probe,
 * and `ingest/types.ts` carries a standing rule that no soil field may exist
 * without a sensor to back it. This module never claims to know how much water
 * is in the ground; it accounts for water *arriving* (rain) and *leaving*
 * (crop evapotranspiration) and reports the running difference. Open-Meteo
 * does publish a modelled soil-moisture field for this point and it is
 * deliberately not used: a land-surface model on a ~11 km grid with an assumed
 * soil column, rendered as m³/m³ beside a provenance tag, would look exactly
 * like a probe reading, and there is no probe.
 *
 * ## The soil problem, which is bigger than the answer
 *
 * The accrued deficit is soil-independent — evaporation and rain do not care
 * what the ground is made of. Converting it into "irrigate on Tuesday" does:
 * readily-available water spans **16 mm on sand to 50 mm on clay** at a 0.6 m
 * rooting depth (FAO-56 Table 19, p = 0.55), a 3.1× spread that is wider than
 * a whole week's accrued deficit at this site.
 *
 * So this module computes the crossing day for *every* texture and never
 * emits a single date. The spread is the headline, exactly as `SeasonOnset`
 * treats its 82-day onset spread as the message rather than the median. A
 * confident-looking default would hide the largest uncertainty in the
 * calculation behind the most authoritative-looking part of the output.
 */

/** One day of the forward balance. */
export interface BalanceDay {
  date: string;
  /** Reference evapotranspiration, mm. Model output. */
  et0Mm: number;
  /** et0 × Kc — what this crop at this stage actually transpires. */
  cropEtMm: number;
  rainMm: number;
  /**
   * Chance of any rain that day, %. Context beside the depth, never a
   * multiplier on it: 2 mm at 20% and 2 mm at 85% are different instructions,
   * but scaling the depth by the probability would invent a third number that
   * is neither the forecast nor the odds.
   */
  rainProbabilityPct: number | null;
  /** Running depletion, mm. Soil-independent, and the honest headline. */
  deficitMm: number;
}

export type SoilTexture = 'sand' | 'loamy_sand' | 'sandy_loam' | 'loam' | 'clay_loam' | 'clay';

export interface SoilProfile {
  texture: SoilTexture;
  label: string;
  labelSw: string;
  /** Total available water for the rooting depth, mm. */
  tawMm: number;
  /** Readily available water — depletion the crop tolerates before stress. */
  rawMm: number;
  /** 1-based day the deficit first exceeds `rawMm`; null if never in horizon. */
  crossesOnDay: number | null;
  crossesDate: string | null;
}

export interface CropStage {
  id: string;
  label: string;
  labelSw: string;
  /** FAO-56 Table 12 crop coefficient. */
  kc: number;
  /** FAO-56 Table 22 rooting depth, m. */
  rootDepthM: number;
  /** FAO-56 Table 22 depletion fraction before stress. */
  depletionFraction: number;
}

export interface WaterBalance {
  crop: CropStage;
  days: BalanceDay[];
  totalCropEtMm: number;
  totalRainMm: number;
  closingDeficitMm: number;
  /** One entry per texture. The spread is the answer. */
  soils: SoilProfile[];
  daysToActionRange: { earliest: number | null; latest: number | null };
  horizonDays: number;
  headline: string;
  headlineSw: string;
  detail: string;
  detailSw: string;
  /**
   * Always `raw_forecast`. No bias coefficients are fitted for reference
   * evapotranspiration or precipitation, so `bias_corrected` would be a
   * claim the calibration never made.
   */
  provenance: Provenance;
}

/**
 * Field capacity and wilting point by texture, FAO-56 Table 19 mid-ranges.
 *
 * These are published table constants describing a soil *class*, not
 * measurements of anyone's field. They carry no provenance tag for the same
 * reason `RUNOFF_COEFFICIENT` does not: tagging a lookup value as `measured`,
 * `reanalysis` or `raw_forecast` would misrepresent what kind of thing it is.
 * The UI states them as the convention they are.
 */
export const SOIL_TEXTURES = [
  { texture: 'sand', fieldCapacity: 0.1, wiltingPoint: 0.05, label: 'Sand', labelSw: 'Mchanga' },
  {
    texture: 'loamy_sand',
    fieldCapacity: 0.12,
    wiltingPoint: 0.06,
    label: 'Loamy sand',
    labelSw: 'Mchanga tifutifu',
  },
  {
    texture: 'sandy_loam',
    fieldCapacity: 0.18,
    wiltingPoint: 0.08,
    label: 'Sandy loam',
    labelSw: 'Tifutifu ya mchanga',
  },
  { texture: 'loam', fieldCapacity: 0.28, wiltingPoint: 0.14, label: 'Loam', labelSw: 'Tifutifu' },
  {
    texture: 'clay_loam',
    fieldCapacity: 0.32,
    wiltingPoint: 0.2,
    label: 'Clay loam',
    labelSw: 'Tifutifu ya mfinyanzi',
  },
  { texture: 'clay', fieldCapacity: 0.36, wiltingPoint: 0.21, label: 'Clay', labelSw: 'Mfinyanzi' },
] as const satisfies readonly {
  texture: SoilTexture;
  fieldCapacity: number;
  wiltingPoint: number;
  label: string;
  labelSw: string;
}[];

/**
 * Crop stages, FAO-56 Tables 12 and 22.
 *
 * A deliberately short list. Each entry is a published coefficient for a named
 * crop at a named stage; inventing intermediate stages by interpolation would
 * be presenting a guess with the authority of a table.
 */
export const CROP_STAGES: CropStage[] = [
  {
    id: 'maize_mid',
    label: 'Maize, mid-season',
    labelSw: 'Mahindi, katikati ya msimu',
    kc: 1.2,
    rootDepthM: 0.6,
    depletionFraction: 0.55,
  },
  {
    id: 'maize_vegetative',
    label: 'Maize, growing',
    labelSw: 'Mahindi, yanakua',
    kc: 0.75,
    rootDepthM: 0.4,
    depletionFraction: 0.55,
  },
  {
    id: 'beans_mid',
    label: 'Beans, mid-season',
    labelSw: 'Maharage, katikati ya msimu',
    kc: 1.05,
    rootDepthM: 0.5,
    depletionFraction: 0.45,
  },
  {
    id: 'bare',
    label: 'Bare soil',
    labelSw: 'Udongo wazi',
    kc: 0.3,
    rootDepthM: 0.3,
    depletionFraction: 0.55,
  },
];

export const DEFAULT_CROP_ID = 'maize_mid';

const r1 = (n: number) => Math.round(n * 10) / 10 + 0;

/**
 * FAO-56 Eq. 82/83.
 *
 * TAW = 1000 × (θ_FC − θ_WP) × Zr, and RAW = p × TAW.
 */
export function availableWater(
  texture: SoilTexture,
  rootDepthM: number,
  depletionFraction: number,
): { tawMm: number; rawMm: number } {
  const soil = SOIL_TEXTURES.find((s) => s.texture === texture);
  if (!soil) return { tawMm: 0, rawMm: 0 };
  const tawMm = 1000 * (soil.fieldCapacity - soil.wiltingPoint) * rootDepthM;
  return { tawMm: r1(tawMm), rawMm: r1(depletionFraction * tawMm) };
}

/**
 * Running depletion across the horizon.
 *
 * The `Math.max(0, ...)` is the one piece of physics that must not be dropped.
 * Without it a wet day drives the running total negative and the balance
 * silently claims stored water it does not have — the soil cannot hold more
 * than field capacity, and surplus rain drains or runs off rather than
 * banking against next week's demand. Its own test pins this.
 */
export function runningDeficit(
  days: { date: string; et0Mm: number; rainMm: number; rainProbabilityPct?: number | null }[],
  kc: number,
): BalanceDay[] {
  let deficit = 0;
  return days.map((d) => {
    const cropEtMm = d.et0Mm * kc;
    deficit = Math.max(0, deficit + cropEtMm - d.rainMm);
    return {
      date: d.date,
      et0Mm: r1(d.et0Mm),
      cropEtMm: r1(cropEtMm),
      rainMm: r1(d.rainMm),
      rainProbabilityPct: d.rainProbabilityPct ?? null,
      deficitMm: r1(deficit),
    };
  });
}

function describeDay(days: BalanceDay[], index: number | null): string {
  if (index === null) return 'beyond this window';
  return `day ${index}`;
}

export function buildWaterBalance(
  forecastDaily: { date: string; et0Mm: number; rainMm: number; rainProbabilityPct?: number | null }[],
  crop: CropStage,
): WaterBalance {
  const days = runningDeficit(forecastDaily, crop.kc);

  const soils: SoilProfile[] = SOIL_TEXTURES.map((s) => {
    const { tawMm, rawMm } = availableWater(s.texture, crop.rootDepthM, crop.depletionFraction);
    const idx = days.findIndex((d) => d.deficitMm > rawMm);
    return {
      texture: s.texture,
      label: s.label,
      labelSw: s.labelSw,
      tawMm,
      rawMm,
      crossesOnDay: idx === -1 ? null : idx + 1,
      crossesDate: idx === -1 ? null : days[idx].date,
    };
  });

  const crossing = soils.map((s) => s.crossesOnDay).filter((d): d is number => d !== null);
  const daysToActionRange = {
    earliest: crossing.length ? Math.min(...crossing) : null,
    latest: crossing.length === soils.length ? Math.max(...crossing) : null,
  };

  const totalCropEtMm = r1(days.reduce((a, d) => a + d.cropEtMm, 0));
  const totalRainMm = r1(days.reduce((a, d) => a + d.rainMm, 0));
  const closingDeficitMm = days.length ? days[days.length - 1].deficitMm : 0;
  const horizonDays = days.length;
  const perDay = horizonDays ? r1(totalCropEtMm / horizonDays) : 0;

  const headline = closingDeficitMm
    ? `${closingDeficitMm} mm of water owed after ${horizonDays} days`
    : `No water owed over the next ${horizonDays} days`;
  const headlineSw = closingDeficitMm
    ? `mm ${closingDeficitMm} za maji zinadaiwa baada ya siku ${horizonDays}`
    : `Hakuna maji yanayodaiwa katika siku ${horizonDays} zijazo`;

  // Never a single date: the timing is stated as the span across soils, and
  // a test greps this text to make sure no "irrigate on <day>" sneaks in.
  const timing = closingDeficitMm
    ? ` When you must act depends on your soil: between ${describeDay(days, daysToActionRange.earliest)} on the lightest and ${describeDay(days, daysToActionRange.latest)} on the heaviest.`
    : ' Rain covers the crop demand across this window.';

  const detail =
    `${crop.label}: ${perDay} mm a day of crop demand against ${totalRainMm} mm of forecast rain.` +
    timing;
  const detailSw =
    `${crop.labelSw}: mm ${perDay} kwa siku ya mahitaji ya mazao dhidi ya mm ${totalRainMm} ya mvua inayotarajiwa.` +
    (closingDeficitMm
      ? ' Muda wa kumwagilia hutegemea udongo wako.'
      : ' Mvua inatosheleza mahitaji ya mazao.');

  return {
    crop,
    days,
    totalCropEtMm,
    totalRainMm,
    closingDeficitMm,
    soils,
    daysToActionRange,
    horizonDays,
    headline,
    headlineSw,
    detail,
    detailSw,
    provenance: 'raw_forecast',
  };
}
