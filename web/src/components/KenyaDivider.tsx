/**
 * The band that closes the header and the footer.
 *
 * It used to be a hard green-and-red zigzag — a literal flag motif, drawn as
 * repeating triangles. Two problems with that: it read as a warning stripe
 * rather than as part of the product, and a viewBox spanning two pattern tiles
 * meant the zigzag restarted halfway across the screen.
 *
 * This is the same idea carried quietly. A single continuous gradient runs the
 * full width — earth through terracotta through sage, the flag's colours
 * present but muted into the palette rather than shouted — with a soft glow
 * above it so the band reads as a horizon line catching light rather than as a
 * rule drawn across the page.
 *
 * Pure CSS: no SVG, no pattern, nothing to tile, so it cannot repeat or stop
 * short at any width.
 */
export function KenyaDivider({
  variant = 'thin',
  className = '',
}: {
  variant?: 'thin' | 'bold';
  className?: string;
}) {
  const bold = variant === 'bold';

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={`relative w-full ${className}`}
      style={{ height: bold ? 3 : 2 }}
    >
      {/* The band itself. `to-transparent` at both ends would fade it out at
          the screen edge; it runs edge to edge instead, because a horizon
          does. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, #2e2622 0%, #8f2f28 14%, #b9603c 34%, #b8894a 52%, #6b7350 72%, #3f6b46 88%, #2e2622 100%)',
          opacity: bold ? 0.95 : 0.7,
        }}
      />

      {/* Light spilling upward off the band, so it sits in the page rather
          than on it. Only on the bold variant — the footer's should stay a
          hairline. */}
      {bold && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
          style={{
            background:
              'linear-gradient(to top, rgba(185,96,60,0.18), rgba(185,96,60,0.06) 40%, transparent 100%)',
          }}
        />
      )}
    </div>
  );
}
