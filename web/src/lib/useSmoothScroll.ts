import { useEffect } from 'react';
import Lenis from 'lenis';
// Lenis ships required CSS, and adds the `lenis` classes to <html> expecting
// it. Without it `html.lenis, html.lenis body { height: auto }` never applies
// and `data-lenis-prevent` elements never get `overscroll-behavior: contain`,
// so a scroll that reaches the map's edge chains back to the page.
import 'lenis/dist/lenis.css';
import { prefersReducedMotion } from './prefersReducedMotion';
import { isCoarsePointer } from './isCoarsePointer';

/**
 * Smooth scrolling, app-wide.
 *
 * A browser's native scroll jumps in ~100px steps from a mouse wheel. That is
 * why a page can look well-made when still and feel cheap the moment anyone
 * scrolls it — the parallax, the reveals and the sticky hero all inherit those
 * steps. Lenis interpolates between them, so everything downstream moves
 * continuously without any of it having to know.
 *
 * ## Why a library rather than a hand-rolled lerp
 *
 * This is the one place where the do-it-ourselves rule this project follows
 * elsewhere does not hold. Smooth scroll has to keep anchor links, keyboard
 * paging, touch momentum, nested scrollers and `scroll-behavior` all working,
 * and every one of those is a separate browser quirk. Lenis is ~6 kB gzipped
 * and handles them; a hand-rolled version handles the wheel and breaks the
 * rest, which is worse than no smooth scroll at all.
 */
/**
 * The live instance, or null when smooth scroll opted out (reduced motion).
 *
 * Module-level rather than context: exactly one Lenis exists for the app, it is
 * created in one place, and the only other code that needs it -- the mobile
 * menu, which must stop the page scrolling behind itself -- would otherwise
 * need a provider threaded through the tree for a single imperative call.
 */
let current: Lenis | null = null;

/**
 * Freezes or releases page scrolling.
 *
 * Prefers Lenis's own stop()/start(), because setting `overflow: hidden` on
 * <body> while Lenis is running fights it: Lenis keeps translating its own
 * scroll position against a container the browser has stopped scrolling, and
 * the page jumps when it is released. Falls back to `overflow: hidden` when
 * Lenis opted out under reduced motion, where there is nothing to fight.
 *
 * Returns nothing and is safe to call repeatedly; both paths are idempotent.
 */
export function setScrollLocked(locked: boolean): void {
  if (current) {
    if (locked) current.stop();
    else current.start();
    return;
  }
  if (typeof document === 'undefined') return;
  document.body.style.overflow = locked ? 'hidden' : '';
}

export function useSmoothScroll(): void {
  useEffect(() => {
    // Someone who has asked for less motion has asked for exactly this.
    if (prefersReducedMotion()) return;

    // Touch devices already have momentum scrolling in hardware. Overriding it
    // costs battery and makes the page feel detached from the finger.
    const coarse = isCoarsePointer();

    const lenis = new Lenis({
      // Long enough to read as gliding, short enough that a deliberate scroll
      // still lands where the reader meant it to.
      duration: 1.05,
      // An exponential ease-out: fast to respond, slow to settle.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: !coarse,
      touchMultiplier: 1.6,
    });

    let raf = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    current = lenis;

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      current = null;
    };
  }, []);
}
