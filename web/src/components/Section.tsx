import type { ReactNode } from 'react';

/**
 * The page section, as one component instead of twenty copies of the same
 * class string.
 *
 * `<section className="border-t border-shade-700 py-10 sm:py-12">` with an
 * uppercase tracked `<h2>` appeared in eighteen places, always identically.
 * That is a convention held together by copy-paste: nothing enforced it, and
 * nothing could vary it without varying all of it.
 *
 * `plain` reproduces that string exactly, so adopting this component is a
 * no-op everywhere before any tone is opted into. That sequencing is what
 * makes a twenty-site change safe — a test pins the plain output byte for
 * byte, so a regression in the shared convention fails loudly rather than
 * quietly restyling the whole app.
 *
 * `raised` is for the app's conclusions, not its evidence. Used sparingly —
 * the point of elevation is that most things are not elevated.
 */

const TONE: Record<'plain' | 'raised', string> = {
  plain: 'border-t border-shade-700 py-10 sm:py-12',
  // Sits on the page rather than being ruled off from it, with a 1px ochre
  // hairline along the top edge — the decorative-only role the palette's own
  // comment reserves that token for.
  raised:
    'relative mt-10 overflow-hidden rounded-2xl bg-shade-800/40 p-6 ring-1 ring-shade-700 sm:p-8',
};

export function Section({
  title,
  aside,
  tone = 'plain',
  id,
  className = '',
  children,
}: {
  /** Rendered as the section's h2 in the house style. Omit for an unlabelled section. */
  title?: string;
  /** Right-aligned on the title row — a provenance tag, a date range, a note. */
  aside?: ReactNode;
  tone?: 'plain' | 'raised';
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`${TONE[tone]} ${className}`.trimEnd()}>
      {tone === 'raised' && (
        <span
          className="absolute inset-x-0 top-0 h-px bg-kenya-ochre/40"
          aria-hidden
        />
      )}

      {(title || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          {title && (
            <h2 className="font-display text-sm uppercase tracking-[0.2em] text-shade-200">
              {title}
            </h2>
          )}
          {aside}
        </div>
      )}

      {children}
    </section>
  );
}
