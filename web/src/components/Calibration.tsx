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
      <section className="border-t border-shade-700 py-8">
        <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
          Forecast calibration
        </h2>
        <p className="mt-3 text-sm text-shade-200">
          No coefficients yet. Run{' '}
          <code className="rounded bg-shade-800 px-1.5 py-0.5 text-sun-300">
            python analysis/calibrate.py
          </code>{' '}
          to fit them against the station record.
        </p>
      </section>
    );
  }

  const rows = Object.entries(calibration.variables);

  return (
    <section className="border-t border-shade-700 py-8">
      <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
        Forecast calibration
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-shade-200">
        The global forecast is measurably wrong at this point. Correcting it against the Conduit
        station cuts the error shown below. Every figure is{' '}
        <span className="text-sun-300">{calibration.validation.replace(/-/g, ' ')}</span> validated,
        so no value helped predict itself.
      </p>

      <div className="mt-5 overflow-x-auto">
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
                  <td className={`py-2.5 pr-4 font-medium ${improved ? 'text-sun-400' : 'text-shade-200'}`}>
                    {v.metrics.mae_after.toFixed(2)}
                  </td>
                  <td className="py-2.5 pr-4 text-shade-200">{v.metrics.rmse_before.toFixed(2)}</td>
                  <td className={`py-2.5 font-medium ${improved ? 'text-sun-400' : 'text-shade-200'}`}>
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
