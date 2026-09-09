import { useOutletContext } from 'react-router-dom';
import { CalibrationTable } from '../components/Calibration';
import { Reveal } from '../components/Reveal';
import type { AppContext } from '../lib/outletContext';
import type { Calibration } from '../lib/types';
import { StationUnavailable } from '../components/StationUnavailable';
import { useCountUp } from '../lib/useChartReveal';
import { Term } from '../components/Term';

/**
 * The page that answers "why does this station need to exist?".
 *
 * It previously opened on an unlabelled table with nothing above 14px, which
 * meant the most persuasive fact in the project — that the global forecast is
 * measurably wrong here, and that correcting it against this one instrument
 * roughly halves the error — first appeared as a cell in row one. Anyone
 * deep-linking here saw a table and had to derive the argument themselves.
 */
export function CalibrationPage() {
  const { data, error } = useOutletContext<AppContext>();
  // The station is one instrument at one point and can be unreachable. This
  // page reports what it measured, so it says so rather than rendering blanks.
  if (!data) return <StationUnavailable error={error} />;

  return (
    <>
      <CalibrationHeader calibration={data.calibration} />
      <Reveal>
        <CalibrationTable calibration={data.calibration} />
      </Reveal>
    </>
  );
}

function CalibrationHeader({ calibration }: { calibration: Calibration | null }) {
  const temp = calibration?.variables?.tempC;
  // Temperature is the headline because it is the variable every gate on this
  // site depends on, and the one with the largest relative improvement.
  const before = temp?.metrics.mae_before ?? 0;
  const after = temp?.metrics.mae_after ?? 0;
  const cut = before > 0 ? Math.round(((before - after) / before) * 100) : 0;
  const cutShown = Math.round(useCountUp(cut));

  return (
    <section className="pt-10 sm:pt-12">
      <h1 className="font-display text-3xl text-bleach sm:text-4xl">
        What the station is worth
      </h1>

      {temp && cut > 0 && (
        <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="font-display text-6xl leading-none tabular-nums text-kenya-green-400 sm:text-7xl">
            {cutShown}
            <span className="ml-1 text-3xl text-shade-200">%</span>
          </p>
          <p className="max-w-md pb-1 text-sm leading-relaxed text-shade-200">
            less error in the forecast temperature here, once it is corrected against this one
            instrument. <Term term="mae">MAE</Term> falls from{' '}
            <span className="tabular-nums text-bleach">{before.toFixed(2)} °C</span> to{' '}
            <span className="tabular-nums text-kenya-green-400">{after.toFixed(2)} °C</span>.
          </p>
        </div>
      )}

      <p className="mt-5 max-w-2xl text-sm leading-relaxed text-shade-200">
        A global forecast model does not know this hillside. It is fitted to a ~9 km grid cell and
        carries a consistent offset here — which is exactly the kind of error a local instrument
        can remove, because a <Term term="bias">bias</Term> can be subtracted where scatter cannot.
        This page shows how much of each variable&apos;s error is offset, and how much is left over
        afterwards. That leftover is the honest limit of what one station buys you.
      </p>
    </section>
  );
}
