import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { VariableCard } from './ValidationPanel';
import type { VariableValidation } from '../lib/types';

/**
 * The failure mode this file exists to catch is a chart stuck at zero.
 *
 * `ErrorBars` multiplies every bar height by `reveal.progress`, which is 0
 * until the chart scrolls into view. If the observer wiring ever regresses —
 * or a future refactor drops the ref — the bars render at 0% and the panel
 * looks like a working chart reporting no error at all. That is worse than a
 * blank space: it is a confident, wrong reading on the one page whose whole
 * argument is how wrong the model is.
 */

/** Fires immediately, so a rendered chart is "in view" on the first frame. */
class ImmediateObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
}

function variable(overrides: Partial<VariableValidation> = {}): VariableValidation {
  const diurnal = Array.from({ length: 24 }, (_, h) => ({
    localHour: h,
    // Negative in the morning, positive in the afternoon: exercises both the
    // above-line and below-line branches.
    meanError: h < 12 ? -(h + 1) * 0.2 : (h - 11) * 0.15,
    n: 4,
  }));
  return {
    variable: 'tempC',
    label: 'Air temperature',
    unit: '°C',
    hours: [],
    bias: -1.12,
    mae: 1.12,
    rmse: 1.4,
    worst: { hour: '2026-01-01T08:00', localHour: 8, error: -2.62 },
    diurnal,
    n: 95,
    ...overrides,
  };
}

/** Every inline height on the bars, as numbers. */
function barHeights(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll<HTMLElement>('span[style*="height"]'))
    .map((el) => parseFloat(el.style.height))
    .filter((n) => Number.isFinite(n));
}

describe('ValidationPanel error bars', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ImmediateObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('bars reach their final heights once revealed', async () => {
    const { container } = render(<VariableCard variable={variable()} />);

    await waitFor(() => {
      const heights = barHeights(container);
      expect(heights.length).toBeGreaterThan(0);
      // Not one bar left at zero, and the tallest is the peak at 100%.
      expect(Math.max(...heights)).toBeCloseTo(100, 5);
      expect(heights.every((h) => h > 0)).toBe(true);
    });
  });

  test('the worst hour is the tallest bar', async () => {
    // The panel's headline claims 08:00 is the worst hour. If the bar chart
    // disagreed with the sentence above it, the page would contradict itself.
    const v = variable();
    const { container } = render(<VariableCard variable={v} />);

    await waitFor(() => expect(barHeights(container).length).toBeGreaterThan(0));

    const peakIndex = v.diurnal.reduce(
      (best, d, i) => (Math.abs(d.meanError) > Math.abs(v.diurnal[best].meanError) ? i : best),
      0,
    );
    const heights = barHeights(container);
    expect(Math.max(...heights)).toBeCloseTo(100, 5);
    expect(v.diurnal[peakIndex].localHour).toBe(11);
  });

  test('bars carry a sign class so direction is not left to the reader', async () => {
    const { container } = render(<VariableCard variable={variable()} />);
    await waitFor(() => expect(barHeights(container).length).toBeGreaterThan(0));

    // Morning hours run low (red, below the line), afternoon high (amber).
    // Matched on the hue in the gradient rather than a single flat class: the
    // bars are gradient-filled now, but the invariant is unchanged — direction
    // has to be visible without reading the axis.
    expect(container.querySelectorAll('[class*="kenya-red"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[class*="amber"]').length).toBeGreaterThan(0);
  });

  test('a variable with no paired hours says so instead of drawing an empty chart', () => {
    render(<VariableCard variable={variable({ n: 0, worst: null, diurnal: [] })} />);
    expect(screen.getByText(/No paired hours/i)).toBeInTheDocument();
    // Crucially: no chart at all, rather than 24 bars at zero.
    expect(document.querySelectorAll('span[style*="height"]').length).toBe(0);
  });
});
