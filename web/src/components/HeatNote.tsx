import { Gauge } from './Gauge';

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
    <section className="border-t border-shade-700 py-10 sm:py-12">
      <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
        Heat exposure
      </h2>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="lift-on-hover flex items-center gap-5 rounded-lg py-2">
          <Gauge value={heat.wbgtC} min={0} max={35} unit="°C" color="#b8433a" size={92} />
          <div>
            <p className="text-xs text-shade-400">WBGT, measured</p>
            <p className="mt-1 text-sm text-shade-200">{heat.instruction}</p>
          </div>
        </div>

        <div className="lift-on-hover flex items-center gap-5 rounded-lg py-2">
          <Gauge value={thi.thi} min={40} max={100} color="#4a5f86" size={92} />
          <div>
            <p className="text-xs text-shade-400">Cattle heat index (THI)</p>
            <p className="mt-1 text-sm text-shade-200">{thi.instruction}</p>
          </div>
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
