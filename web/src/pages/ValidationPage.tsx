import { useEffect, useState } from 'react';
import type { ValidationResponse } from '../lib/types';
import { Reveal } from '../components/Reveal';
import { Section } from '../components/Section';
import { ExportButtons } from '../components/ExportButtons';
import {
  AGREEMENT_COLUMNS,
  AGREEMENT_NOTES,
  VALIDATION_COLUMNS,
  VALIDATION_NOTES,
} from '../lib/exportColumns';
import { ValidationPanel } from '../components/ValidationPanel';

/**
 * How wrong is the model here?
 *
 * Fetches for itself rather than reading the layout's `/api/today`, because
 * the comparison needs a full day of station history against the matching
 * archive hours — a different query from the one the decision cards make.
 */
type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: ValidationResponse };

export function ValidationPage() {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/validation')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ValidationResponse>;
      })
      .then((data) => {
        if (!cancelled) setState({ phase: 'ready', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.phase === 'loading') {
    return (
      <section className="py-16">
        <p className="text-sm text-shade-200">Comparing the station against the model…</p>
      </section>
    );
  }

  if (state.phase === 'error' || state.data.degraded) {
    const detail = state.phase === 'error' ? state.message : state.data.detail;
    return (
      <section className="py-16">
        <h1 className="font-display text-2xl text-amber-300">Comparison unavailable</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-shade-200">
          This page needs both the station&apos;s own readings and the reanalysis for the same
          hours. One of them could not be read, so rather than show half a comparison it shows
          none.
        </p>
        {detail && <p className="mt-2 font-mono text-xs text-shade-200">{detail}</p>}
      </section>
    );
  }

  const { station, variables, agreement } = state.data;
  // Temperature is the variable every gate on this site depends on, and the
  // one the calibration was fitted for, so it is the one worth exporting.
  const temp = variables.find((v) => v.variable === 'tempC');
  const hasHours = Boolean(temp && temp.hours.length > 0);

  return (
    <>
      <Reveal>
        <ValidationPanel variables={variables} station={station} agreement={agreement} />
      </Reveal>

      {/* The two comparisons this page makes, as files: the model scored
          against the station, and the station scored against itself.
          The heading is inside the guard: with a station reporting only one
          thermometer, or an archive hiccup, both children vanish and a lone
          bordered heading over empty space reads as a broken page. */}
      {(hasHours || agreement) && (
      <Section title="Take the comparison">
        {hasHours && temp && (
          <ExportButtons
            rows={temp.hours}
            columns={VALIDATION_COLUMNS}
            coversDate={station.day}
            label={`these ${temp.hours.length} paired hours of station against model`}
            meta={{
              dataset: 'model-check',
              title: 'station against model, hour by hour (temperature)',
              source: `${station.name}, compared against ERA5 reanalysis`,
              notes: VALIDATION_NOTES,
            }}
          />
        )}

        {agreement && (
          <ExportButtons
            rows={agreement.points}
            columns={AGREEMENT_COLUMNS}
            coversDate={station.day}
            label={`these ${agreement.n} readings from all three thermometers`}
            meta={{
              dataset: 'instrument-agreement',
              title: 'three thermometers on one mast',
              source: station.name,
              notes: AGREEMENT_NOTES,
            }}
          />
        )}
      </Section>
      )}
    </>
  );
}
