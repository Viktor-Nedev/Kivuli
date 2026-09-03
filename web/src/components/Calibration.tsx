import { useEffect, useState } from 'react';
import type { Calibration } from '../lib/types';

const LABELS: Record<string, { name: string; unit: string }> = {
  tempC: { name: 'Temperature', unit: '°C' },
  humidityPct: { name: 'Relative humidity', unit: '%' },
  windSpeedMs: { name: 'Wind speed', unit: 'm/s' },
  pressureHpa: { name: 'Pressure', unit: 'hPa' },
};

/**
 * Before/after accuracy of the bias correction.
 *
 * This is the evidence that the Conduit station does real work: a global
 * forecast is systematically wrong here, and one ground station measurably
 * fixes it. Shown as a primary screen, not an appendix.
 */
export function CalibrationTable({ calibration }: { calibration: Calibration | null }) {
  if (!calibration) {
    return (
      <section className="border-t border-shade-700 py-10 sm:py-12">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Forecast calibration
        </h2>
        <p className="mt-3 text-sm text-shade-200">
          No coefficients yet. Run{' '}
          <code className="rounded bg-shade-800 px-1.5 py-0.5 text-amber-300">
            python analysis/calibrate.py
          </code>{' '}
          to fit them against the station record.
        </p>
      </section>
    );
  }

  const rows = Object.entries(calibration.variables);

  return (
    <section className="border-t border-shade-700 py-10 sm:py-12">
      <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
        Forecast calibration
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-shade-200">
        The global forecast is measurably wrong at this point. Correcting it against the Conduit
        station cuts the error shown below. Every figure is{' '}
        <span className="text-amber-300">{calibration.validation.replace(/-/g, ' ')}</span> validated,
        so no value helped predict itself.
      </p>

      <div className="mt-6 space-y-4">
        {rows.map(([key, v]) => (
          <MaeBar
            key={key}
            name={LABELS[key]?.name ?? key}
            before={v.metrics.mae_before}
            after={v.metrics.mae_after}
          />
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-shade-700 text-left text-xs uppercase tracking-wide text-shade-400">
              <th scope="col" className="py-2 pr-4 font-medium">Variable</th>
              <th scope="col" className="py-2 pr-4 font-medium">Bias</th>
              <th scope="col" className="py-2 pr-4 font-medium">MAE before</th>
              <th scope="col" className="py-2 pr-4 font-medium">MAE after</th>
              <th scope="col" className="py-2 pr-4 font-medium">RMSE before</th>
              <th scope="col" className="py-2 font-medium">RMSE after</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map(([key, v]) => {
              const meta = LABELS[key] ?? { name: key, unit: '' };
              const improved = v.metrics.mae_after < v.metrics.mae_before;
              return (
                <tr key={key} className="border-b border-shade-800">
                  <th scope="row" className="py-2.5 pr-4 text-left font-medium text-bleach">
                    {meta.name}
                    <span className="ml-1 text-xs font-normal text-shade-400">{meta.unit}</span>
                  </th>
                  <td className="py-2.5 pr-4 text-shade-200">
                    {v.bias > 0 ? '+' : ''}
                    {v.bias.toFixed(2)}
                  </td>
                  <td className="py-2.5 pr-4 text-shade-200">{v.metrics.mae_before.toFixed(2)}</td>
                  <td className={`py-2.5 pr-4 font-medium ${improved ? 'text-kenya-green-400' : 'text-shade-200'}`}>
                    {v.metrics.mae_after.toFixed(2)}
                  </td>
                  <td className="py-2.5 pr-4 text-shade-200">{v.metrics.rmse_before.toFixed(2)}</td>
                  <td className={`py-2.5 font-medium ${improved ? 'text-kenya-green-400' : 'text-shade-200'}`}>
                    {v.metrics.rmse_after.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-shade-400">
        Fitted on {calibration.training_window.station_hours} station hours (
        {calibration.training_window.from}). {calibration.training_window.note}
      </p>
    </section>
  );
}

/**
 * One variable's MAE improvement, normalized to its own "before" as 100%.
 *
 * Deliberately not on one shared scale across variables: temperature (°C),
 * humidity (%), wind (m/s) and pressure (hPa) have unrelated magnitudes, so a
 * shared axis lets whichever variable has the largest raw MAE (humidity, at
 * 5.69) visually flatten every other bar even though its own relative
 * improvement is unremarkable. Normalizing per row makes the bars comparable
 * on the thing that actually matters here — how much each variable improved.
 *
 * Drawn as a single fill against a ghost marker for "before" rather than two
 * overlapping fills: when after is only slightly less than before (as with
 * humidity), two stacked fills of similar color are nearly indistinguishable,
 * where a fill-vs-marker reads clearly at any gap size.
 */
function MaeBar({ name, before, after }: { name: string; before: number; after: number }) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // "before" is always the full-width baseline; "after" is expressed as a
  // fraction of it, so the fill directly shows the fraction of the original
  // error that remains.
  const afterPct = before > 0 ? Math.min((after / before) * 100, 100) : 0;
  const improved = after < before;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-shade-400">
        <span>{name}</span>
        <span>
          MAE {before.toFixed(2)} <span className="text-shade-600">→</span>{' '}
          <span className={improved ? 'font-medium text-kenya-green-400' : 'font-medium text-shade-200'}>
            {after.toFixed(2)}
          </span>
        </span>
      </div>
      <div className="relative h-5 overflow-hidden rounded-full bg-shade-800">
        {/* Ghost marker for "before" — the full bar is already 100% of it, so
            this reads as "here is where we started" rather than a length. */}
        <div className="absolute inset-y-0 right-0 w-px bg-shade-400" />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-kenya-green-400"
          style={{
            width: animate ? `${afterPct}%` : 0,
            transition: 'width 900ms cubic-bezier(0.16, 1, 0.3, 1) 200ms',
          }}
        />
      </div>
    </div>
  );
}
