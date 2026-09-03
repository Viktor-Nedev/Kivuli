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
      preserveAspectRatio="none"
      viewBox={`0 0 ${triangleWidth * 2} ${height}`}
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
    </svg>
  );
}
