import type { Provenance } from '../lib/types';

const LABEL: Record<Provenance, string> = {
  measured: 'measured',
  bias_corrected: 'bias-corrected',
  raw_forecast: 'raw forecast',
  reanalysis: 'reanalysis',
};

const STYLE: Record<Provenance, string> = {
  measured: 'bg-kenya-green-500/15 text-kenya-green-300 ring-kenya-green-500/30',
  bias_corrected: 'bg-shade-400/20 text-shade-200 ring-shade-400/40',
  raw_forecast: 'bg-shade-700 text-shade-200 ring-shade-600',
  // Amber, so ERA5 reads as visibly distinct from the green `measured` tag at
  // a glance. Reanalysis is a model reconstruction on a ~9 km grid, not this
  // station's own instrument, and the two should never be mistaken for each
  // other in a screenshot.
  reanalysis: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
};

/**
 * Data-lineage tag shown beside every number.
 *
 * Being explicit that a value is a raw model output rather than a station
 * measurement is a credibility asset, so this is never hidden.
 */
export function ProvenanceTag({ kind, title }: { kind: Provenance; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${STYLE[kind]}`}
    >
      {LABEL[kind]}
    </span>
  );
}
