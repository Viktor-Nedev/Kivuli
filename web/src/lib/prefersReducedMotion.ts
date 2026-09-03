/**
 * The project's global CSS rule (index.css) zeroes `animation-duration` and
 * `transition-duration` under `prefers-reduced-motion: reduce`, which covers
 * every plain CSS transition/animation for free. GSAP's tweens are driven by
 * JavaScript, not CSS animations or transitions, so that rule has no effect
 * on them — every direct GSAP usage must check this explicitly instead.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
