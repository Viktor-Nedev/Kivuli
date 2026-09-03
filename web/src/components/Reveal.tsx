import type { ReactNode } from 'react';
import { useInView } from '../lib/useInView';

/**
 * Fades and slides content up as it scrolls into view.
 *
 * A thin CSS-transition wrapper, not a JS animation timeline: the project's
 * `prefers-reduced-motion` rule in index.css already zeroes every
 * transition-duration, so this needs no separate reduced-motion handling of
 * its own — that would be required with a JS-driven library instead.
 */
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

  return (
    <div
      ref={ref}
      data-visible={inView || undefined}
      style={{ transitionDelay: inView ? `${delayMs}ms` : '0ms' }}
      className={`translate-y-3 opacity-0 transition-all duration-500 ease-out data-[visible]:translate-y-0 data-[visible]:opacity-100 ${className}`}
    >
      {children}
    </div>
  );
}
