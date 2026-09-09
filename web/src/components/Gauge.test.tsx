import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Gauge } from './Gauge';
import { Thermometer } from './Thermometer';

/**
 * Two failure modes, both invisible on screen.
 *
 * The `label` prop is optional and four call sites omit it, because a text
 * block beside the arc already names the value. The accessible name was
 * interpolating it unconditionally, so those four gauges announced
 * "undefined: 24.3°C" — wrong for exactly the users who cannot see the text
 * block that made the label redundant.
 *
 * The second is the reveal: both components used to animate on mount, so the
 * six gauges below the fold on the Station page had finished long before
 * anyone scrolled to them. A regression here shows up as a gauge stuck at its
 * minimum, which looks like a working gauge reading zero.
 */

class ImmediateObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
}

describe('Gauge', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ImmediateObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('an unlabelled gauge never announces "undefined"', () => {
    render(<Gauge value={24.3} min={0} max={35} unit="°C" />);
    const name = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(name).not.toContain('undefined');
    expect(name).toBe('24.3°C');
  });

  test('a labelled gauge still names the metric', () => {
    render(<Gauge label="WBGT" value={24.3} min={0} max={35} unit="°C" />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'WBGT: 24.3°C');
  });

  test('the arc reaches its value once scrolled into view', async () => {
    const { container } = render(<Gauge label="WBGT" value={35} min={0} max={35} />);
    await waitFor(() => {
      // At full value the dash offset closes to zero. A gauge stranded at the
      // minimum would leave the whole dash length showing.
      const arc = container.querySelectorAll('circle')[1];
      expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5);
    });
  });
});

describe('Thermometer', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', ImmediateObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('the mercury reaches its value once scrolled into view', async () => {
    const { container } = render(
      <Thermometer label="Air" value={30} min={0} max={30} />,
    );
    await waitFor(() => {
      const filled = Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
        (el) => el.style.height.endsWith('%'),
      );
      expect(filled.length).toBeGreaterThan(0);
      expect(parseFloat(filled[0].style.height)).toBeCloseTo(100, 1);
    });
  });
});
