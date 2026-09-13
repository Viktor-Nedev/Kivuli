import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { useInView } from '../lib/useInView';

/**
 * Headlines that arrive a word at a time.
 *
 * A whole heading fading in at once reads as a page loading. The same heading
 * arriving word by word reads as it being *said* — which is the difference
 * between a document and a product, and it costs one span per word.
 *
 * Splitting is done here rather than in the copy so the source stays a plain
 * string: a translator, a screen reader and `getByText` all still see one
 * sentence, because the spans are inline and carry no semantics of their own.
 */

export function AnimatedText({
  text,
  as: Tag = 'p',
  className = '',
  /** ms between consecutive words. */
  stagger = 65,
  /** ms before the first word. */
  delay = 0,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  stagger?: number;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLElement>(0.25);
  const words = text.split(' ');

  return (
    <Tag ref={ref} className={`${inView ? 'word-in' : ''} ${className}`}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          style={
            {
              // The trailing space rides inside the span so the words keep
              // their natural spacing and the line still wraps normally.
              '--w': (delay / stagger + i).toFixed(2),
              animationDuration: inView ? undefined : '0ms',
            } as React.CSSProperties
          }
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  );
}

/**
 * A number that counts up when it scrolls into view, with the digits held in
 * a tabular column so the width never jumps mid-count.
 *
 * Distinct from `useCountUp` in `useChartReveal`: that one is a hook a chart
 * calls for a value it already has. This is the whole element, for the single
 * figure a section is built around.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix,
  className = '',
  durationMs = 1400,
}: {
  value: number;
  decimals?: number;
  suffix?: ReactNode;
  className?: string;
  durationMs?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const [shown, setShown] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (!inView || done.current) return;

    // rAF rather than a CSS transition, because CSS cannot interpolate the
    // text content of a node. That means this one needs its own
    // reduced-motion branch — the global rule zeroes durations, not loops.
    const reduce =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      done.current = true;
      setShown(value);
      return;
    }

    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(Math.max((now - start) / durationMs, 0), 1);
      // Eased so it decelerates into the final figure rather than stopping.
      setShown(value * (1 - Math.pow(1 - t, 4)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else {
        done.current = true;
        setShown(value);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, durationMs]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {(done.current ? value : shown).toFixed(decimals)}
      {suffix}
    </span>
  );
}
