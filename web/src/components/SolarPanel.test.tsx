import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SolarPanel } from './SolarPanel';
import type { SolarCrossCheck } from '../lib/types';

/**
 * Two claims this panel must never make.
 *
 * It must not present the satellite's MJ/m² and the station's counts as
 * comparable quantities — they are different units and the project refuses the
 * regression that would join them. And it must not render a satellite fill as
 * a reading; when there is no value the panel says so and the station half
 * stands alone.
 */

class ImmediateObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
}

function solar(over: Partial<SolarCrossCheck> = {}): SolarCrossCheck {
  return {
    satelliteMJ: 19.7,
    daylightAgreement: 0.727,
    daylightSamples: 46,
    cloudEvents: 10,
    peakCounts: 894,
    darkFloorCounts: 265,
    points: Array.from({ length: 8 }, (_, i) => ({
      ts: `2026-09-01T0${i}:00:00.000Z`,
      counts: 300 + i * 70,
      cloud: i === 5,
    })),
    ...over,
  };
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', ImmediateObserver);
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: true, // reduced motion: useCountUp lands on the value at once
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('SolarPanel', () => {
  test('both headline figures come from the data', async () => {
    render(<SolarPanel solar={solar({ satelliteMJ: 21.4, daylightAgreement: 0.813 })} />);
    await waitFor(() => expect(screen.getByText('21.4')).toBeInTheDocument());
    expect(screen.getByText('0.813')).toBeInTheDocument();
  });

  test('it says the correlation is against sun position, not against the satellite', () => {
    render(<SolarPanel solar={solar()} />);
    const body = document.body.textContent ?? '';
    // The honest framing: counts and MJ/m² are not comparable in absolute
    // terms, and the panel must not imply that they are.
    expect(body).toMatch(/against modelled/i);
    expect(body).toMatch(/cannot be compared in absolute terms/i);
  });

  test('a satellite fill is reported, and the station half survives it', () => {
    render(
      <SolarPanel
        solar={solar({ satelliteMJ: null, unavailable: 'The satellite returned no usable value.' })}
      />,
    );
    expect(screen.getByText(/no usable value/i)).toBeInTheDocument();
    // No headline figure invented in its place. Scoped to the big number
    // rather than the string: "MJ/m²" also appears in the explanatory
    // paragraph, which correctly stays on screen.
    expect(screen.queryByText(/Satellite, whole day/i)).not.toBeInTheDocument();
    // And the light curve is still there — it does not depend on the satellite.
    expect(screen.getByText(/sharp falls/i)).toBeInTheDocument();
  });

  test('the cloud count is rendered from the data', () => {
    render(<SolarPanel solar={solar({ cloudEvents: 3 })} />);
    expect(screen.getByText('3 sharp falls')).toBeInTheDocument();
  });

  test('the curve draws one column per sample', () => {
    const { container } = render(<SolarPanel solar={solar()} />);
    expect(container.querySelectorAll('[role="button"]').length).toBe(8);
  });

  test('a cloud sample is marked distinctly from a clear one', () => {
    const { container } = render(<SolarPanel solar={solar()} />);
    // Colour is not the only channel — each column carries an aria-label
    // saying whether light fell sharply.
    const marked = Array.from(container.querySelectorAll('[role="button"]')).filter((el) =>
      (el.getAttribute('aria-label') ?? '').includes('fell sharply'),
    );
    expect(marked).toHaveLength(1);
  });

  test('the height axis is stated as counts above the night floor', () => {
    render(<SolarPanel solar={solar()} />);
    // Not zero-based, and the panel says so rather than leaving a reader to
    // infer a scale the instrument cannot actually enter.
    expect(screen.getByText(/night floor of 265/)).toBeInTheDocument();
  });
});
