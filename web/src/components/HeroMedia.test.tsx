import { describe, expect, test, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroMedia } from './HeroMedia';

/**
 * The invariant is unchanged from when this hero was a video: **the pitch is
 * readable, whatever happens.**
 *
 * It used to be at risk because the copy was `opacity-0` in markup and only
 * revealed by a GSAP scrub that needed `loadedmetadata` from an 8.7 MB clip
 * set to `preload="none"`. On a slow connection nothing ever set the opacity
 * and a reader scrolled two viewports of black past the only text explaining
 * what KIVULI is.
 *
 * The video is gone — its container had no sync-sample table, which is why
 * scrubbing stuttered — but the invariant outlives it, so the tests do too.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function reducedMotion(on: boolean) {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: on && query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

/**
 * Presence is not enough — `getByText` finds an element whether or not it is
 * invisible, and the original bug was exactly that. These assert the copy is
 * not inside a zero-opacity wrapper.
 *
 * The scrolling hero drives opacity through a CSS custom property, so a
 * literal `opacity: 0` in the style attribute is the failure being excluded;
 * `var(--o0)` resolving to 1 at rest is the passing case.
 */
function expectPitchVisible() {
  for (const re of [/wrong for one field/i, /spray now, or wait/i]) {
    const el = screen.getByText(re);
    expect(el).toBeInTheDocument();
    const hidden = el.closest('[class*="opacity-0"]') ?? el.closest('[style*="opacity: 0"]');
    expect(hidden, `pitch matching ${re} is present but invisible`).toBeNull();
  }
}

describe('HeroMedia', () => {
  test('both statements are in the document with no media at all', () => {
    reducedMotion(false);
    render(<HeroMedia />);
    expectPitchVisible();
  });

  test('it no longer loads a video', () => {
    // The 8.7 MB clip is gone, along with the seek cost that made scrubbing
    // stutter and the bandwidth it spent on a page arguing about bandwidth.
    reducedMotion(false);
    const { container } = render(<HeroMedia />);
    expect(container.querySelector('video')).toBeNull();
  });

  test('reduced motion gets a shorter page, not a frozen tall one', () => {
    // Disabling the animation on the scrolling version would leave 260vh of
    // empty track to scroll past. Someone asking for less motion should get
    // less page.
    reducedMotion(true);
    const { container } = render(<HeroMedia />);
    expectPitchVisible();
    expect(container.querySelector('[class*="260vh"]')).toBeNull();
    expect(container.querySelector('[class*="sticky"]')).toBeNull();
  });

  test('the scrolling version animates only compositor properties', () => {
    // Anything touching layout here would stutter exactly as the video did.
    reducedMotion(false);
    const { container } = render(<HeroMedia />);
    const animated = container.querySelectorAll('[style*="transform"], [style*="opacity"]');
    expect(animated.length).toBeGreaterThan(0);
    for (const el of animated) {
      const style = el.getAttribute('style') ?? '';
      expect(style).not.toMatch(/(^|;)\s*(top|left|width|height|margin)\s*:/);
    }
  });

  test('the decorative image is hidden from assistive tech', () => {
    reducedMotion(false);
    const { container } = render(<HeroMedia />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('alt')).toBe('');
    expect(img!.getAttribute('aria-hidden')).toBe('true');
  });
});
