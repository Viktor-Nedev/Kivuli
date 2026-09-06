/**
 * UV exposure from the forecast UV index.
 *
 * ## Why this comes from a model and not the station
 *
 * The Conduit's SI1145 has a UV channel and it reads **0 for every row** in
 * the available sample — a dead or unconfigured sensor. `ingest/types.ts`
 * deliberately omits it rather than surfacing a zero that would imply a
 * working instrument.
 *
 * That was the right call about the *sensor*, but it left the *hazard*
 * unreported, and the hazard is real: this site sits at 1527 m almost on the
 * equator, where the modelled UV index peaks near 9 — "very high" on the WHO
 * scale — essentially year-round. Reporting a modelled 9 is more useful than
 * reporting a broken 0, provided the two are never mixed and the model output
 * is tagged as such. It is, everywhere it appears.
 *
 * The bands below are the WHO/WMO Global Solar UV Index, the same
 * published-standard footing as ISO 7243 in `heat.ts` and FAO-56 in
 * `waterBalance.ts`. Nothing here is invented.
 *
 * Indicative only. Burn times vary with skin type, altitude, reflection,
 * cloud and medication. This is not medical advice and must not be presented
 * as either.
 */

export type UvBand = 'low' | 'moderate' | 'high' | 'very_high' | 'extreme';

export interface UvAssessment {
  date: string;
  uvIndexMax: number;
  band: UvBand;
  /**
   * Minutes of unprotected midday exposure before erythema **for Fitzpatrick
   * type III skin**, the standard reference. Emitted only with that reference
   * named, because it is not the reader's skin type unless they say so.
   * Null when the index is too low for the figure to mean anything.
   */
  burnMinutes: number | null;
  instruction: string;
  instructionSw: string;
}

/**
 * WHO/WMO Global Solar UV Index bands.
 *
 * `max` is exclusive: an index of exactly 8 is "very high", not "high",
 * matching the published table's 6–7 / 8–10 grouping.
 */
const BANDS: { max: number; band: UvBand; instruction: string; instructionSw: string }[] = [
  {
    max: 3,
    band: 'low',
    instruction: 'No protection needed for normal outdoor work',
    instructionSw: 'Hakuna kinga inayohitajika kwa kazi za kawaida nje',
  },
  {
    max: 6,
    band: 'moderate',
    instruction: 'Seek shade near midday; a hat and sleeves help',
    instructionSw: 'Tafuta kivuli karibu na adhuhuri; kofia na mikono mirefu husaidia',
  },
  {
    max: 8,
    band: 'high',
    instruction: 'Shade, hat and long sleeves between 11:00 and 15:00',
    instructionSw: 'Kivuli, kofia na mikono mirefu kati ya saa 11:00 na 15:00',
  },
  {
    max: 11,
    band: 'very_high',
    instruction: 'Avoid open sun 11:00–15:00; cover up and use shade',
    instructionSw: 'Epuka jua kali saa 11:00–15:00; jifunike na tumia kivuli',
  },
  {
    max: Infinity,
    band: 'extreme',
    instruction: 'Do not work in open sun near midday; unprotected skin burns in minutes',
    instructionSw: 'Usifanye kazi kwenye jua wazi adhuhuri; ngozi huungua kwa dakika chache',
  },
];

/**
 * Minimal erythemal dose for Fitzpatrick III, ~250 J/m². The UV index is
 * defined as 25 mW/m² of erythemally-weighted irradiance per unit, so
 * minutes-to-burn ≈ 250 / (index × 25 × 60/1000).
 */
function burnMinutesFor(uvIndexMax: number): number | null {
  if (uvIndexMax < 3) return null;
  return Math.round(250 / (uvIndexMax * 25 * 0.06));
}

export function assessUv(date: string, uvIndexMax: number): UvAssessment {
  const uv = Number.isFinite(uvIndexMax) ? Math.max(0, uvIndexMax) : 0;
  const entry = BANDS.find((b) => uv < b.max) ?? BANDS[BANDS.length - 1];

  return {
    date,
    uvIndexMax: Math.round(uv * 10) / 10,
    band: entry.band,
    burnMinutes: burnMinutesFor(uv),
    instruction: entry.instruction,
    instructionSw: entry.instructionSw,
  };
}

/** The worst day in a horizon — what a weekly card should lead with. */
export function peakUv(days: UvAssessment[]): UvAssessment | null {
  if (!days.length) return null;
  return days.reduce((worst, d) => (d.uvIndexMax > worst.uvIndexMax ? d : worst));
}
