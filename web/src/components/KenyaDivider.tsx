/**
 * Geometric divider motif, inspired by Maasai shuka/beadwork zigzag patterns —
 * a subtle, purely decorative signal that the site is built for Kenya without
 * spelling it out in words or leaning on literal flag colors.
 *
 * Two sizes share one visual language rather than introducing unrelated
 * motifs for the "subtle" and "more visible" decoration levels: `thin` is a
 * quiet section divider, `bold` is a more visible ornament (e.g. behind a
 * header or footer edge).
 */
export function KenyaDivider({
  variant = 'thin',
  className = '',
}: {
  variant?: 'thin' | 'bold';
  className?: string;
}) {
  const height = variant === 'thin' ? 10 : 22;
  const triangleWidth = variant === 'thin' ? 20 : 36;

  // A repeating zigzag built from two colors alternating peak/trough, plus a
  // muted ochre accent line — reads as woven beadwork at a glance, never as
  // data (aria-hidden, no semantic role).
  const patternId = `kenya-zigzag-${variant}`;

  return (
    <svg
      role="presentation"
      aria-hidden="true"
      className={`block w-full ${className}`}
      style={{ height }}
      // No viewBox, deliberately.
      //
      // With one, the SVG scales its user space to the element width — and the
      // old value spanned two pattern tiles, so the zigzag repeated exactly
      // twice and each copy was stretched across half the screen. That is the
      // "line stops in the middle and starts again" the design review
      // reported, and no `preserveAspectRatio` setting fixes it, because the
      // problem is the scaling itself.
      //
      // Without a viewBox, one user unit is one CSS pixel, so the `<pattern>`
      // tiles in real pixels across whatever width the element happens to be:
      // a continuous edge-to-edge zigzag whose triangles keep the proportions
      // they are drawn with at every viewport.
    >
      <defs>
        <pattern
          id={patternId}
          width={triangleWidth}
          height={height}
          patternUnits="userSpaceOnUse"
        >
          <polygon
            points={`0,${height} ${triangleWidth / 2},0 ${triangleWidth},${height}`}
            className="fill-kenya-green-500"
          />
          <polygon
            points={`${triangleWidth / 2},${height} ${triangleWidth},0 ${triangleWidth * 1.5},${height}`}
            className="fill-kenya-red-500"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} opacity={variant === 'thin' ? 0.5 : 0.85} />
      {/* The ochre baseline this component's own docstring has always
          described. It was never drawn, which also left `kenya-ochre` — a
          token the palette reserves for exactly this — unused everywhere. */}
      <rect
        y={height - 1}
        width="100%"
        height={1}
        className="fill-kenya-ochre"
        opacity={variant === 'thin' ? 0.55 : 0.8}
      />
    </svg>
  );
}
