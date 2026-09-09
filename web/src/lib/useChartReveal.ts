import { useEffect, useRef, useState } from 'react';
import { useInView } from './useInView';
import { prefersReducedMotion } from './prefersReducedMotion';

/**
 * Growth animation for charts, as one primitive instead of seven copies.
 *
 * ## Why `progress` is a flag and not a tweened number
 *
 * Everything here animates through **CSS transitions**, driven by flipping a
 * single boolean. That is deliberate: the global `prefers-reduced-motion` rule
 * in `index.css` zeroes every transition duration, so reduced motion is
 * handled for free and the chart simply snaps to its final geometry. A
 * JS-tweened value (GSAP, requestAnimationFrame ticking a number) would ignore
 * that rule and need its own branch in every consumer.
 *
 * **Do not "fix" this by adding a `prefersReducedMotion()` check.** It is not
 * missing; it is unnecessary. `useCountUp` below is the one exception, because
 * CSS cannot zero a number that JavaScript is writing into `textContent`.
 *
 * ## Why it reveals on scroll rather than on mount
 *
 * The older `Gauge` and `Thermometer` pattern animates on mount, which means a
 * chart below the fold has finished its 900 ms growth long before anyone
 * scrolls to it. The animation exists and nobody ever sees it. This hook hangs
 * off `useInView`, so a chart animates when it is actually read — and inherits
 * that hook's 2500 ms safety timeout, so content can never be stranded
 * invisible by an observer that does not fire.
 */

/** Longest the whole stagger may run. Past this a chart out-lives its reader. */
const MAX_STAGGER_TOTAL_MS = 500;

const HOUSE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

export function useChartReveal(opts?: {
  /** ms between consecutive items. Clamped against `count`. */
  stagger?: number;
  duration?: number;
  /** ms before the first item starts. */
  delay?: number;
  threshold?: number;
}) {
  const { stagger = 28, duration = 700, delay = 0, threshold = 0.2 } = opts ?? {};
  const { ref, inView } = useInView<HTMLDivElement>(threshold);

  const transition = (index = 0, prop = 'height', count = 1) => {
    // A 144-cell chart at 28 ms would tail for four seconds. Squeeze the step
    // so the whole series always lands inside MAX_STAGGER_TOTAL_MS.
    const span = Math.max(count - 1, 1);
    const step = Math.min(stagger, MAX_STAGGER_TOTAL_MS / span);
    return `${prop} ${duration}ms ${HOUSE_EASING} ${Math.round(delay + index * step)}ms`;
  };

  return { ref, progress: inView ? 1 : 0, transition };
}

/**
 * Counts a number up when it scrolls into view.
 *
 * The one place in this module that needs an explicit reduced-motion check:
 * the value is written by JavaScript, so no CSS rule can shorten it. Under
 * reduced motion it returns the real number on the first render and never
 * starts a frame loop at all.
 *
 * Returns the live `value` once the count has finished, so a figure that keeps
 * changing afterwards — the roof-area slider on the harvest card, for one —
 * tracks its input instead of being frozen at whatever it counted up to.
 */
export function useCountUp(
  value: number,
  opts?: { durationMs?: number; startWhen?: boolean },
): number {
  const { durationMs = 900, startWhen = true } = opts ?? {};
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0));
  const finished = useRef(prefersReducedMotion());

  useEffect(() => {
    if (finished.current || !startWhen) return;
    if (prefersReducedMotion()) {
      finished.current = true;
      setDisplay(value);
      return;
    }

    let raf = 0;
    const from = 0;
    // Taken from the first frame rather than from performance.now(), because
    // the rAF timestamp is not guaranteed to share performance.now()'s time
    // origin. Where it does not, `now - started` comes out negative, the cubic
    // below amplifies it, and the headline number counts away to a large
    // negative instead of up to its value.
    let started: number | null = null;

    const tick = (now: number) => {
      if (started === null) started = now;
      // Clamped at both ends: a backwards clock must not run the easing
      // outside 0..1, whatever the frame timestamps do.
      const t = Math.min(Math.max((now - started) / durationMs, 0), 1);
      // Matches the house easing curve closely enough that a counting number
      // and a growing bar beside it feel like one gesture.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        finished.current = true;
        // Land exactly on the target: the eased approach can leave a
        // sub-unit shortfall that .toFixed() would render as 99.9.
        setDisplay(value);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, startWhen]);

  // Once the intro has played, follow the real value.
  return finished.current ? value : display;
}
