import { useEffect, useRef, useState } from 'react';

/**
 * Tracks whether an element has scrolled into the viewport, for CSS-driven
 * reveal animations. No animation library needed: this pairs with a CSS
 * transition on the consumer, which — unlike a JS-timeline library — already
 * respects the project's global `prefers-reduced-motion` rule for free.
 *
 * Fires once and disconnects: a reveal should not replay every time the user
 * scrolls an element back into view.
 */
export function useInView<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Environments without IntersectionObserver (old browsers, some test
    // runners) should still show content rather than hide it forever.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold },
    );

    observer.observe(el);

    // Safety net: content must never depend on a scroll that might not
    // happen (a very short viewport, a tool that captures the page without
    // scrolling, an observer that never fires for some reason) to become
    // visible at all. A fixed delay is a plain worst-case backstop, not the
    // primary mechanism — the observer above still fires immediately for any
    // element already on screen.
    const fallback = setTimeout(() => setInView(true), 2500);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, [threshold]);

  return { ref, inView };
}
