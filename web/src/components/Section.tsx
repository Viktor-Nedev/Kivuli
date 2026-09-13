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

/**
 * Two surfaces, and only two.
 *
 * An audit counted nine distinct card treatments across the app, several
 * differing only by a 10% opacity step that is invisible on screen. That is
 * not a system, it is drift. Evidence sits on `plain`; conclusions sit on
 * `glass`.
 *
 * The glass recipe is lifted from `MapPanels`, which was the one genuinely
 * well-made surface in the codebase and the only `backdrop-blur` anywhere.
 * Used sparingly on purpose — a blur on every card is just a new uniform.
 */
const TONE: Record<'plain' | 'raised', string> = {
  plain: 'border-t border-shade-700 py-10 sm:py-12',
  raised:
    'relative mt-10 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-8',
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
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          aria-hidden
        />
      )}

      {(title || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          {/* Was 14px uppercase grey — visually weaker than the body text
              underneath it, which is the wrong way round for a heading.
              Sentence case at 22px in the primary ink reads as a heading
              without needing letter-spacing to look deliberate. */}
          {title && (
            <h2 className="font-display text-xl tracking-[-0.01em] text-bleach sm:text-2xl">
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
