import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HeroMedia } from './HeroMedia';

/**
 * The hero's failure paths.
 *
 * These exist because of a real regression. The pitch copy was `opacity-0` in
 * markup and only revealed by a GSAP scrub, which needs `loadedmetadata` on a
 * 9.1 MB clip that Phase 3 correctly set to `preload="none"`. On a slow
 * connection the metadata never arrived, nothing set the opacity, and a reader
 * scrolled two viewport heights of black past the only text that explains what
 * KIVULI is. There was no timeout and no error handler.
 *
 * So the invariant under test is simple and worth stating plainly: **the pitch
 * is readable even when the video never loads.**
 */

// IntersectionObserver drives the lazy video load and does not exist in jsdom.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];
  constructor(private readonly cb: IntersectionObserverCallback) {}
  observe(): void {
    // Report the element as on-screen immediately, which is what triggers the
    // load attempt the tests below are about.
    this.cb(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  // jsdom has no media pipeline; `load()` would otherwise throw "not implemented".
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('HeroMedia', () => {
  /**
   * Presence is not enough. `getByText` finds an element whether or not it is
   * `opacity-0`, and the original bug was precisely that the copy was in the
   * DOM and invisible — so these assert the copy is not inside a
   * zero-opacity wrapper, which is what a reader actually experiences.
   */
  function expectPitchVisible() {
    for (const re of [/wrong for one field/i, /spray now, or wait/i]) {
      const el = screen.getByText(re);
      expect(el).toBeInTheDocument();
      const hidden = el.closest('[class*="opacity-0"]') ?? el.closest('[style*="opacity: 0"]');
      expect(hidden, `pitch matching ${re} is present but invisible`).toBeNull();
    }
  }

  test('shows the pitch even when the video never loads', async () => {
    vi.useFakeTimers();
    render(<HeroMedia />);

    // No `loadedmetadata` ever fires — the slow-connection case.
    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText(/wrong for one field/i)).toBeInTheDocument();
    });
    expectPitchVisible();
  });

  test('shows the pitch when the video errors outright', async () => {
    render(<HeroMedia />);

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    video!.dispatchEvent(new Event('error'));

    await waitFor(() => {
      expect(screen.getByText(/wrong for one field/i)).toBeInTheDocument();
    });
    expectPitchVisible();
  });

  test('renders both copy blocks under reduced motion', () => {
    // The accessibility path was already the better experience; this pins it
    // so a future change to the scrub cannot quietly regress it.
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('reduce'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );

    render(<HeroMedia />);
    expectPitchVisible();
  });
});
