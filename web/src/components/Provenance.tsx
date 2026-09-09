import type { Provenance } from '../lib/types';
import { DataTip } from './DataTip';

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

/** One sentence on what each kind actually means, for readers who have not
 *  read the README. Shown above the caller's own `title` detail. */
const MEANING: Record<Provenance, string> = {
  measured: 'Read directly by an instrument at the station.',
  bias_corrected: 'A model value with this station’s measured offset removed.',
  raw_forecast: 'Straight from the forecast provider, with no local correction.',
  reanalysis: 'A model reconstruction of past weather on a ~9 km grid — not a measurement.',
};

/**
 * Data-lineage tag shown beside every number.
 *
 * Being explicit that a value is a raw model output rather than a station
 * measurement is a credibility asset, so this is never hidden.
 *
 * The explanation behind the tag used to live in a native `title`, which meant
 * that on a phone — this project's stated primary device — the single most
 * important caveat in the app was unreachable. It now uses `DataTip`, which
 * opens on tap as well as hover and focus.
 */
export function ProvenanceTag({
  kind,
  title,
  align = 'center',
}: {
  kind: Provenance;
  /** Caller's context: what this particular number came from. */
  title?: string;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <DataTip
      label={LABEL[kind]}
      align={align}
      detailText={title ? `${MEANING[kind]} ${title}` : MEANING[kind]}
      detail={
        <>
          {MEANING[kind]}
          {title && <span className="mt-1 block text-shade-400">{title}</span>}
        </>
      }
    >
      <span
        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${STYLE[kind]}`}
      >
        {LABEL[kind]}
      </span>
    </DataTip>
  );
}
