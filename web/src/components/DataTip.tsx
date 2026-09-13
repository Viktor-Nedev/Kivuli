import type { ReactNode } from 'react';

/**
 * A tooltip that survives contact with a phone.
 *
 * The native `title` attribute is functionally a lie on touch: it needs a
 * hover the device cannot produce, waits 500ms for it, and then renders an
 * unstyled OS box. Across KIVULI it was carrying real content — what a
 * provenance tag means, what a bar is worth — and on a mobile browser none of
 * that content existed at all. For an app whose stated audience is
 * mobile-first smallholders, that is an accessibility defect wearing a polish
 * costume, and it is written up as one in the README rather than apologised
 * for.
 *
 * Generalised from `Term.tsx`, which already proves a CSS-only popover works
 * here. The three additions that matter:
 *
 *   - `group-active:block` — the touch fix. A tap sets :active, so the popover
 *     appears on press. One class, no JavaScript, no library.
 *   - `align` — three static Tailwind variants instead of a positioning
 *     engine. Floating UI is 10-15kB to solve, on a bandwidth-conscious app,
 *     what three utility classes solve. At a viewport edge the popover wraps
 *     rather than being cleverly repositioned.
 *   - `title` is kept on the trigger, so the no-JS and no-CSS path still
 *     carries the text and screen readers still announce it.
 */

const SIDE: Record<'top' | 'bottom', string> = {
  top: 'bottom-full mb-2',
  bottom: 'top-full mt-2',
};

// Anchored rather than centred at the ends, so a tip on the first or last bar
// of a chart stays on screen instead of being clipped by the viewport.
const ALIGN: Record<'start' | 'center' | 'end', string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

/**
 * The `title` fallback text. Only a string `detail` can be interpolated
 * safely; anything richer must supply `detailText` or it is dropped rather
 * than stringified into "[object Object]".
 */
function fallbackText(label: string, detail: ReactNode, detailText?: string): string {
  const tail = detailText ?? (typeof detail === 'string' ? detail : undefined);
  return tail ? `${label} — ${tail}` : label;
}

export function DataTip({
  label,
  children,
  detail,
  detailText,
  side = 'top',
  align = 'center',
  className = '',
  triggerClassName = '',
}: {
  /** The headline line, and the `title` fallback. Keep it short. */
  label: string;
  /** The trigger. */
  children: ReactNode;
  /** Optional second line — the caveat, the source, the arithmetic. */
  detail?: ReactNode;
  /**
   * Plain-text spelling of `detail` for the native `title` fallback. Required
   * whenever `detail` is not a string: interpolating a ReactNode into a
   * template literal yields "[object Object]", which would be the only text a
   * no-CSS reader ever saw.
   */
  detailText?: string;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  /** Applied to the outer wrapper. */
  className?: string;
  /**
   * Applied to the trigger span. Needed when the trigger is a chart bar
   * rather than inline text: the wrapper's default `inline-block` would
   * otherwise break a percentage-height chain in a flex column.
   */
  triggerClassName?: string;
}) {
  return (
    <span className={`group relative inline-block ${className}`}>
      <span
        title={fallbackText(label, detail, detailText)}
        tabIndex={0}
        className={`cursor-help focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kenya-green-400 ${triggerClassName}`}
      >
        {children}
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-30 hidden w-56 glass-strong rounded-2xl p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-shade-200 shadow-lg group-hover:block group-focus-within:block group-active:block ${SIDE[side]} ${ALIGN[align]}`}
      >
        <span className="block font-display text-sm text-bleach">{label}</span>
        {detail && <span className="mt-1 block">{detail}</span>}
      </span>
    </span>
  );
}

/**
 * Which way a tip should be anchored, given its position in a row of `count`.
 *
 * The first and last few in a horizontal chart would otherwise centre their
 * popover over the viewport edge and be clipped.
 */
export function alignFor(index: number, count: number): 'start' | 'center' | 'end' {
  if (index < 3) return 'start';
  if (index >= count - 3) return 'end';
  return 'center';
}
