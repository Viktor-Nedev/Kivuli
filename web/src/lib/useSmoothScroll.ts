import { useEffect } from 'react';
import Lenis from 'lenis';
import { prefersReducedMotion } from './prefersReducedMotion';

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
export function useSmoothScroll(): void {
  useEffect(() => {
    // Someone who has asked for less motion has asked for exactly this.
    if (prefersReducedMotion()) return;

    // Touch devices already have momentum scrolling in hardware. Overriding it
    // costs battery and makes the page feel detached from the finger.
    const coarse =
      typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

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

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
}
