import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements neither of these, and both are touched at import time by
 * code under test: GSAP's ScrollTrigger calls `matchMedia` when it registers,
 * and `ResizeObserver` backs the compact header's height publishing.
 *
 * Defaults are deliberately the "no preference, normal motion" case so the
 * default rendering path is what gets exercised; individual tests stub
 * `matchMedia` themselves when they want the reduced-motion branch.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof window.ResizeObserver;
}
