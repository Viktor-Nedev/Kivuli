import type { UvAssessment, UvBand } from '../lib/types';
import { ProvenanceTag } from './Provenance';

/**
 * Peak UV over the forward window.
 *
 * Sits beside the projected-WBGT sentence, which has to report "no heat
 * restriction" every single day at this site: WBGT peaks near 25 C against a
 * 28 C first-action threshold. UV is the heat-adjacent hazard that actually
 * fires here — 1527 m almost on the equator puts the index near 9 year-round —
 * so the pair reads as calibration rather than as an empty feature.
 *
 * The station's own UV channel reads 0 on every sample row. That dead sensor
 * is why this number is tagged `raw forecast` and never mixed with anything
 * measured.
 */

const BAND_LABEL: Record<UvBand, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  very_high: 'Very high',
  extreme: 'Extreme',
};

const BAND_TEXT: Record<UvBand, string> = {
  low: 'text-kenya-green-400',
  moderate: 'text-kenya-green-300',
  high: 'text-amber-300',
  very_high: 'text-amber-400',
  extreme: 'text-kenya-red-400',
};

const BAND_RULE: Record<UvBand, string> = {
  low: 'border-kenya-green-500',
  moderate: 'border-kenya-green-400',
  high: 'border-amber-500',
  very_high: 'border-amber-500',
  extreme: 'border-kenya-red-500',
};

export function UvCard({ peak }: { peak: UvAssessment }) {
  return (
    <div className={`mt-4 rounded-r-lg border-l-4 bg-shade-800/40 p-5 ${BAND_RULE[peak.band]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Sun exposure
        </h3>
        <ProvenanceTag
          kind="raw_forecast"
          title="UV index from Open-Meteo. The station's own UV channel reads zero on every sample row, so no measured UV is available."
        />
      </div>

      <p className="mt-3">
        <span className={`font-display text-3xl tabular-nums ${BAND_TEXT[peak.band]}`}>
          {peak.uvIndexMax.toFixed(1)}
        </span>
        <span className={`ml-2 font-display text-lg ${BAND_TEXT[peak.band]}`}>
          {BAND_LABEL[peak.band]}
        </span>
        <span className="ml-2 text-sm text-shade-400">peak UV index in the window</span>
      </p>

      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-shade-200">{peak.instruction}</p>
      <p lang="sw" className="mt-1 max-w-2xl text-sm leading-relaxed text-shade-400">
        {peak.instructionSw}
      </p>

      {peak.burnMinutes !== null && (
        <p className="mt-3 text-xs leading-relaxed text-shade-400">
          Unprotected midday exposure reddens Fitzpatrick type III skin in roughly{' '}
          {peak.burnMinutes} minutes. Skin type, altitude, cloud and reflection all shift that —
          it is a reference figure, not a personal one, and this is not medical advice.
        </p>
      )}
    </div>
  );
}
