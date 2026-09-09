import { useRef, type ReactNode } from 'react';
import { useInView } from '../lib/useInView';

/**
 * Fades and slides content up as it scrolls into view.
 *
 * A thin CSS-transition wrapper, not a JS animation timeline: the project's
 * `prefers-reduced-motion` rule in index.css already zeroes every
 * transition-duration, so this needs no separate reduced-motion handling of
 * its own — that would be required with a JS-driven library instead.
 *
 * ## Why content already on screen is not faded
 *
 * `PageTransition` in App.tsx fades the whole route in over 500ms on every
 * navigation. Anything above the fold is inside that wrapper *and* was
 * revealing itself over its own 500ms at the same time, so the first screen of
 * every page faded twice at once — visibly slower and mushier than either
 * animation alone, and for no gain, since a reader cannot see two fades as two
 * things.
 *
 * So a Reveal that is already in view on its first frame skips straight to
 * visible and lets the page transition carry it. Only content that genuinely
 * arrives later — scrolled to, below the fold — animates itself.
 */
/**
 * How soon after mount a reveal counts as "already on screen". Comfortably
 * longer than an observer callback (a frame or two) and far shorter than any
 * plausible human scroll.
 */
const IMMEDIATE_MS = 250;

export function Reveal({
  children,
  delayMs = 0,
  className = '',
}: {
  children: ReactNode;
  /** Stagger multiple Reveals in a row without a separate orchestration tool. */
  delayMs?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  // `inView` always starts false — the observer fires asynchronously, one
  // frame or more after mount. So "was this on screen when the page arrived?"
  // cannot be read from the first render; it has to be timed. Anything that
  // reports visible within IMMEDIATE_MS was on screen at load, not scrolled
  // to, and is therefore already inside PageTransition's fade.
  const mountedAt = useRef(Date.now());
  const immediate = useRef<boolean | null>(null);
  if (immediate.current === null && inView) {
    immediate.current = Date.now() - mountedAt.current < IMMEDIATE_MS;
  }
  const wasImmediate = immediate.current === true;

  const visible = inView || undefined;

  return (
    <div
      ref={ref}
      data-visible={visible}
      style={{ transitionDelay: inView && !wasImmediate ? `${delayMs}ms` : '0ms' }}
      className={
        wasImmediate
          ? // Already on screen: no fade of its own, the page transition has it.
            className
          : `translate-y-3 opacity-0 transition-all duration-500 ease-out data-[visible]:translate-y-0 data-[visible]:opacity-100 ${className}`
      }
    >
      {children}
    </div>
  );
}
