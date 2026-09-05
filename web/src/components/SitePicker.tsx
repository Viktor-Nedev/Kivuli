import { SITE_OPTIONS, type SiteOption } from '../lib/site';

/**
 * Location switcher for the Season page.
 *
 * Deliberately scoped to this page rather than sitting in the global header.
 * The rainfall history is ERA5 reanalysis, which exists for anywhere in Kenya;
 * the spray, drying and heat pages come from one physical sensor at JKUAT and
 * cannot follow. A header-level switcher would imply the whole app moved and
 * quietly invite the reader to trust station-calibrated numbers for a town
 * 300 km away.
 *
 * The split is stated on screen instead of hidden — see `SiteSplitNote`.
 */
export function SitePicker({
  selected,
  onSelect,
  busy,
}: {
  selected: SiteOption;
  onSelect: (site: SiteOption) => void;
  busy: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-shade-400">Location</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Choose a location">
        {SITE_OPTIONS.map((option) => {
          const active = option.id === selected.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option)}
              disabled={busy && !active}
              aria-pressed={active}
              title={option.note}
              className={`rounded-full border px-3 py-1.5 font-display text-xs uppercase tracking-[0.15em] transition-colors disabled:opacity-50 ${
                active
                  ? 'border-kenya-green-400 bg-kenya-green-500/20 text-kenya-green-300'
                  : 'border-shade-700 text-shade-200 hover:border-shade-400 hover:text-bleach'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-shade-400">{selected.note}</p>
    </div>
  );
}

/**
 * The honest half of multi-site.
 *
 * Shown whenever the reader has moved away from the station. It names exactly
 * which claims travel with them (eleven years of reanalysis, available
 * anywhere) and which do not (anything the sensor measures, and the bias
 * calibration fitted against it).
 */
export function SiteSplitNote({ place }: { place: string }) {
  return (
    <div className="mt-6 rounded-r-lg border-l-4 border-amber-500 bg-shade-800/40 p-5">
      <p className="font-display text-lg text-bleach">Rainfall history for {place}</p>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-shade-200">
        Eleven years of ERA5 reanalysis, which exists for anywhere in Kenya, so this page follows
        you. The spray, drying and heat pages stay at JKUAT — those come from a physical sensor,
        and there is exactly one. Nothing here is calibrated against {place}, and no instrument on
        this page ever stood in it.
      </p>
    </div>
  );
}
