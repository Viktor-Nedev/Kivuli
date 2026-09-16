import { describe, test, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DecisionTrace } from './DecisionTrace';
import type { Reading, Calibration, Instruction } from '../lib/types';

/**
 * The one invariant: the trace must agree with the decision it explains.
 *
 * It exists to let a reader check the instruction rather than trust it, so a
 * panel showing figures that differ from the ones the gates were evaluated on
 * would be worse than no panel — it would look like evidence while being
 * noise. These tests pin the numbers to the payload.
 */

const instruction: Instruction = {
  headline: 'Do not spray today — no safe window left',
  headlineSw: 'Usinyunyize leo',
  detail: 'Wind below 0.8 m/s — inversion risk, spray will drift off-target',
  status: 'stop',
};

const latest: Reading = {
  ts: '2026-09-01T13:00:00.000Z',
  tempC: 16.3,
  humidityPct: 88,
  wetBulbC: 14.7,
  wbgtC: 12.5,
  pressureHpa: 853,
  windSpeedMs: 0.3,
  windDirDeg: 109,
  visCounts: 700,
  rainMm: 0,
  temps: { bmxC: 16.3, mcpC: 16.5, shtC: 16.4 },
};

const calibration = {
  variables: { tempC: { bias: -1.1201, metrics: { n: 24, mae_before: 1.12, mae_after: 0.565 } } },
} as unknown as Calibration;

const renderTrace = () =>
  render(
    <DecisionTrace
      instruction={instruction}
      latest={latest}
      calibration={calibration}
      // Deliberately not tempC - wetBulbC. The server reports what the gates
      // actually ran on, and the panel must show that, not its own arithmetic.
      assessment={{ deltaT: 1.6, windSpeedMs: 0.3 }}
    />,
  );

describe('DecisionTrace', () => {
  test('is collapsed until asked for, so the card still leads with its instruction', () => {
    renderTrace();
    expect(screen.getByRole('button', { name: /why this instruction/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText(/Gates/)).not.toBeInTheDocument();
  });

  test('shows the figures the decision was taken on, not its own recomputation', () => {
    renderTrace();
    fireEvent.click(screen.getByRole('button', { name: /why this instruction/i }));

    // 1.6 comes from the assessment. A panel deriving 16.3 - 14.7 would also
    // print 1.6 here, so the value alone is not the guard — the prop is.
    expect(screen.getAllByText('1.6 °C').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.3 m/s').length).toBeGreaterThan(0);
  });

  test('marks the gates that failed, matching the instruction above', () => {
    renderTrace();
    fireEvent.click(screen.getByRole('button', { name: /why this instruction/i }));

    // Delta-T 1.6 is below the 2 °C floor and wind 0.3 below the 0.8 m/s
    // floor, so both gates fail — which is exactly why the card says stop.
    expect(screen.getAllByText('fail')).toHaveLength(2);
    expect(screen.queryByText('pass')).not.toBeInTheDocument();
    expect(screen.getByText(instruction.headline)).toBeInTheDocument();
  });

  test('reports the thermometer spread as evidence the instrument is healthy', () => {
    renderTrace();
    fireEvent.click(screen.getByRole('button', { name: /why this instruction/i }));
    // 16.5 - 16.3 = 0.2
    expect(screen.getByText(/agree within 0.2/i)).toBeInTheDocument();
  });

  test('carries the validated bias with the evidence for it', () => {
    renderTrace();
    fireEvent.click(screen.getByRole('button', { name: /why this instruction/i }));
    expect(screen.getByText('-1.12 °C')).toBeInTheDocument();
    expect(screen.getByText(/leave-one-out/i)).toBeInTheDocument();
  });
});
