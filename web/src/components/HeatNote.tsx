/**
 * Heat and livestock indices.
 *
 * Reported plainly rather than dramatised: at 1527 m this site sits below the
 * heat-stress action thresholds, and saying so is more useful than inventing
 * an alert.
 */
export function HeatNote({
  heat,
  thi,
}: {
  heat: { wbgtC: number; band: string; instruction: string };
  thi: { thi: number; band: string; instruction: string };
}) {
  return (
    <section className="border-t border-shade-700 py-8">
      <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
        Heat exposure
      </h2>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs text-shade-400">WBGT, measured</p>
          <p className="mt-1 font-display text-4xl tabular-nums text-bleach">
            {heat.wbgtC.toFixed(1)}
            <span className="ml-1 text-lg text-shade-400">°C</span>
          </p>
          <p className="mt-1 text-sm text-shade-200">{heat.instruction}</p>
        </div>

        <div>
          <p className="text-xs text-shade-400">Cattle heat index (THI)</p>
          <p className="mt-1 font-display text-4xl tabular-nums text-bleach">
            {thi.thi.toFixed(0)}
          </p>
          <p className="mt-1 text-sm text-shade-200">{thi.instruction}</p>
        </div>
      </div>

      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-shade-400">
        Work/rest bands follow ISO 7243 for a moderate workload and an acclimatised worker. They are
        indicative: real limits shift with workload, clothing and individual health. This is not
        medical or regulatory advice.
      </p>
    </section>
  );
}
