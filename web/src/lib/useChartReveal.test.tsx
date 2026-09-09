import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { useChartReveal, useCountUp } from './useChartReveal';

/**
 * The animation primitive.
 *
 * The failure mode that would actually cost credibility is a chart stuck at
 * zero — an animation that never completes leaves the reader looking at an
 * empty box where a number should be. Both the reduced-motion path and the
 * no-IntersectionObserver path are pinned here for that reason.
 */

class ImmediateObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  constructor(private readonly cb: IntersectionObserverCallback) {}
  observe(): void {
    this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this);
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', ImmediateObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useChartReveal', () => {
  test('emits the house easing curve and the requested property', () => {
    const { result } = renderHook(() => useChartReveal());
    const t = result.current.transition(0, 'width');
    expect(t).toContain('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(t).toContain('width');
  });

  test('clamps the stagger so a long series cannot outlive its reader', () => {
    // 144 cells at the 28ms default would tail for four seconds.
    const { result } = renderHook(() => useChartReveal({ stagger: 28 }));
    const last = result.current.transition(143, 'opacity', 144);
    const delay = Number(/(\d+)ms$/.exec(last)?.[1]);
    expect(delay).toBeLessThanOrEqual(500);
  });

  test('progress reaches 1 once the element is in view', async () => {
    // Rendered rather than renderHook'd: the ref has to be attached to a real
    // element for the observer to observe anything.
    function Probe() {
      const reveal = useChartReveal();
      return (
        <div ref={reveal.ref} data-testid="chart">
          {reveal.progress}
        </div>
      );
    }
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('chart')).toHaveTextContent('1'));
  });

  test('a chart is never stranded at zero without an IntersectionObserver', async () => {
    // Old browsers and some capture tools have no observer. useInView falls
    // back to visible; if that regressed, every chart in the app would render
    // as an empty box.
    vi.unstubAllGlobals();
    vi.stubGlobal('IntersectionObserver', undefined);
    function Probe() {
      const reveal = useChartReveal();
      return (
        <div ref={reveal.ref} data-testid="fallback">
          {reveal.progress}
        </div>
      );
    }
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('fallback')).toHaveTextContent('1'));
  });
});

describe('useCountUp', () => {
  test('returns the real number immediately under reduced motion', () => {
    // CSS cannot zero a JS-driven count, so this is the one place that needs
    // an explicit check — and getting it wrong strands the figure at 0.
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { result } = renderHook(() => useCountUp(42_178));
    expect(result.current).toBe(42_178);
  });

  test('settles on the true value rather than wherever it stopped counting', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    function Probe() {
      const n = useCountUp(100, { durationMs: 20 });
      return <span data-testid="count">{Math.round(n)}</span>;
    }
    render(<Probe />);

    // Polls for the settled value rather than asserting a single frame:
    // pinning an exact rAF endpoint is flaky under load, and a flaky test is
    // worse than none. What matters is that it converges and never overshoots.
    await waitFor(
      () => {
        const shown = Number(screen.getByTestId('count').textContent);
        expect(shown).toBe(100);
      },
      { timeout: 3000, interval: 25 },
    );
  });

  test('never overshoots the target while counting', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const seen: number[] = [];
    function Probe() {
      const n = useCountUp(50, { durationMs: 60 });
      seen.push(n);
      return <span data-testid="c">{Math.round(n)}</span>;
    }
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('c')).toHaveTextContent('50'), {
      timeout: 3000,
      interval: 25,
    });
    // An eased counter that overshoots reads as a glitch on a data figure.
    expect(Math.max(...seen)).toBeLessThanOrEqual(50);
  });
});
