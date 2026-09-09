import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AgreementSection } from './Agreement';
import type { Agreement } from '../lib/types';

/**
 * The claims in this section are quantitative and they contradict each other
 * if the wrong one is dropped. Two things must hold:
 *
 *   1. Every figure comes from the API. A hardcoded number would stay
 *      confident and become false the moment a live feed supplies a different
 *      day.
 *   2. Both robustness counts are shown. Quoting only the flattering one
 *      (the full verdict) hides that most of the agreement comes from the wind
 *      gate deciding the question before temperature gets a vote.
 */

class ImmediateObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
}

function agreement(over: Partial<Agreement> = {}): Agreement {
  const points = Array.from({ length: 6 }, (_, i) => ({
    ts: `2026-09-01T0${i}:00:00.000Z`,
    bmxC: 19 + i * 0.1,
    mcpC: 19.25 + i * 0.1,
    shtC: 19.4 + i * 0.1,
    medianC: 19.25 + i * 0.1,
    spreadC: 0.4,
  }));
  return {
    channels: [
      {
        id: 'bmxC',
        sensor: 'BMX280',
        meanC: 19.594,
        minC: 15.1,
        maxC: 26.2,
        meanOffsetFromMedianC: -0.237,
        isReference: true,
        n: 95,
      },
      {
        id: 'mcpC',
        sensor: 'MCP9808',
        meanC: 19.848,
        minC: 15.5,
        maxC: 25.9,
        meanOffsetFromMedianC: 0.018,
        isReference: false,
        n: 95,
      },
      {
        id: 'shtC',
        sensor: 'SHT31',
        meanC: 19.998,
        minC: 15.5,
        maxC: 27.5,
        meanOffsetFromMedianC: 0.167,
        isReference: false,
        n: 95,
      },
    ],
    points,
    pairs: [{ a: 'bmxC', b: 'mcpC', meanOffsetC: -0.255, maeC: 0.255 }],
    meanSpreadC: 0.435,
    medianSpreadC: 0.4,
    minSpreadC: 0.1,
    maxSpread: { ts: '2026-09-01T12:29:57.000Z', spreadC: 1.6 },
    daylightMeanSpreadC: 0.479,
    nightMeanSpreadC: 0.398,
    robustness: {
      evaluated: 95,
      verdictFlips: 1,
      deltaTFlips: 11,
      verdictFlippedAt: ['2026-09-01T23:40:21.000Z'],
      withinSpreadOfThreshold: 21,
    },
    n: 95,
    ...over,
  };
}

describe('AgreementSection', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ImmediateObserver);
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: true, // reduced motion: useCountUp lands on the value immediately
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('the headline spread comes from the data, not from the copy', async () => {
    render(<AgreementSection agreement={agreement({ meanSpreadC: 0.62 })} modelMaeC={1.12} />);
    // 0.62, not the 0.44 of the bundled day — proving nothing is written in.
    await waitFor(() => expect(screen.getByText('0.620')).toBeInTheDocument());
  });

  test('both robustness counts are shown, not just the flattering one', () => {
    render(<AgreementSection agreement={agreement()} modelMaeC={1.12} />);
    // 95 - 1 = 94 full verdicts agree; 95 - 11 = 84 on the temperature gate.
    expect(screen.getByText('94')).toBeInTheDocument();
    expect(screen.getByText('84')).toBeInTheDocument();
  });

  test('the reference channel is named as the one in use', () => {
    render(<AgreementSection agreement={agreement()} modelMaeC={1.12} />);
    // BMX280 appears twice by design: once in the legend, once on its card.
    expect(screen.getAllByText('BMX280').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MCP9808').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SHT31').length).toBeGreaterThan(0);
    // Only the reference channel is marked as the one the app actually reads.
    expect(screen.getAllByText(/the one used|\(used\)/i).length).toBeGreaterThan(0);
  });

  test('the cost of the sensor choice is stated, not buried', () => {
    render(<AgreementSection agreement={agreement()} modelMaeC={1.12} />);
    // The reference runs 0.237 C below the median, rendered to 2 dp.
    expect(screen.getByText(/0\.24\s*°C/)).toBeInTheDocument();
  });

  test('the daylight difference is reported without a mechanism', () => {
    render(<AgreementSection agreement={agreement()} modelMaeC={1.12} />);
    const body = document.body.textContent ?? '';
    expect(body).toMatch(/did not support it|left unexplained/i);
    // The tested-and-failed hypothesis must not be asserted as fact.
    expect(body).not.toMatch(/because of solar|due to solar|caused by/i);
  });

  test('the model comparison is omitted rather than faked when absent', () => {
    render(<AgreementSection agreement={agreement()} modelMaeC={null} />);
    const body = document.body.textContent ?? '';
    expect(body).not.toMatch(/misses the station by/);
    // The spread itself still renders — the section is not all-or-nothing.
    // Matched against the whole body because the figure and its unit are
    // separate elements, so the count-up can animate the number alone.
    // Three decimals: the argument is a comparison against 0.565, so 0.43
    // would lose the precision the comparison depends on.
    expect(body).toMatch(/0\.435/);
  });

  test('the chart draws one column per reading', () => {
    const { container } = render(
      <AgreementSection agreement={agreement()} modelMaeC={1.12} />,
    );
    expect(container.querySelectorAll('[role="button"]').length).toBe(6);
  });
});
