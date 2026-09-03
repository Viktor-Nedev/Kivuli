import { KenyaDivider } from './KenyaDivider';

/**
 * Full-bleed footer strip. The thin zigzag divider along its top edge is the
 * "subtle" half of the Kenya decoration pair (SiteHeader's bolder divider is
 * the other half) — same visual language, quieter placement.
 */
export function SiteFooter() {
  return (
    <footer className="mt-20">
      <KenyaDivider variant="thin" />
      <div className="bg-shade-800/60 px-5 py-8 sm:px-8">
        <p className="mx-auto max-w-5xl text-xs leading-relaxed text-shade-400">
          Observations come from the Conduit climate station at JKUAT. Forecast and reanalysis come
          from Open-Meteo. The station measures weather only — it carries no soil, vegetation or
          water-quality sensors, and nothing here is derived from them.
        </p>
      </div>
    </footer>
  );
}
