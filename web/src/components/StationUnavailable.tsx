import type { StationError } from '../lib/outletContext';

/**
 * Shown by the pages that genuinely need a station reading when there isn't
 * one.
 *
 * Extracted from App.tsx so the wording stays identical across all four, and
 * so the layout can render every route rather than blanking the whole app on
 * a station outage. The Season page, the shade map and the validation page
 * read no station bytes and keep working.
 */
export function StationUnavailable({ error }: { error?: StationError }) {
  return (
    <section className="py-16">
      <h2 className="font-display text-2xl text-kenya-red-400">
        {error?.message ?? 'No station reading available.'}
      </h2>
      {error?.detail && <p className="mt-2 font-mono text-sm text-shade-200">{error.detail}</p>}
      {error?.hint && <p className="mt-2 text-sm text-shade-400">{error.hint}</p>}
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-shade-200">
        This page reports what the Conduit station measured, so it needs that reading. The Season
        page, the shade map and the model-validation page do not — they are still available from
        the navigation above.
      </p>
    </section>
  );
}
