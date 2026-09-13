/**
 * Loading placeholders shaped like the thing that is loading.
 *
 * The app's loading states were single lines of grey text that blanked the
 * whole page — including the first frame anyone ever sees, and every switch
 * between sites on the climate page. A shape that matches the real layout
 * means the page does not jump when the data lands, and it tells the reader
 * that something specific is coming rather than that the app has stopped.
 *
 * All three use the `.shimmer` utility, which under the global
 * prefers-reduced-motion rule settles into a flat gradient block. That is the
 * correct reduced-motion skeleton, not a degraded one.
 *
 * The copy that used to be the whole loading state is kept as a caption in a
 * `role="status"` region: "Reading eleven years of rainfall records" is part
 * of the app's voice, and it is also what a screen reader needs, since a
 * shimmering rectangle announces nothing.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block rounded shimmer ${className}`} aria-hidden />;
}

/** A bar chart's silhouette: a row of columns of varied height. */
export function SkeletonChart({
  bars = 12,
  height = 140,
  className = '',
}: {
  bars?: number;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex items-end gap-1 sm:gap-2 ${className}`}
      style={{ height }}
      aria-hidden
    >
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="flex-1 rounded-t-sm shimmer"
          // Deterministic rather than random: a placeholder that reshuffles on
          // every render reads as a glitch, and Math.random() here would also
          // make the component untestable.
          style={{ height: `${45 + ((i * 37) % 55)}%` }}
        />
      ))}
    </div>
  );
}

/** A card's silhouette: heading, headline figure, two lines of prose. */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`glass glass-edge lift rounded-2xl p-5 ${className}`}
      aria-hidden
    >
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="mt-4 h-9 w-2/3" />
      <Skeleton className="mt-3 h-2.5 w-full" />
      <Skeleton className="mt-2 h-2.5 w-4/5" />
    </div>
  );
}

/**
 * A skeleton plus the sentence explaining what is being fetched.
 *
 * The sentence is the accessible name for the whole loading state — the
 * shapes above it are `aria-hidden`, because "rectangle rectangle rectangle"
 * is worse than silence.
 */
export function SkeletonBlock({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite">
      {children}
      <p className="mt-4 text-sm text-shade-200">{caption}</p>
    </div>
  );
}
