import type { PointerEventHandler, ReactNode } from 'react';

/**
 * Floating chrome for the full-screen shade map.
 *
 * Each panel positions itself absolutely against the map container. There is
 * deliberately no full-size wrapper holding them: an `absolute inset-0`
 * parent would be tidier to lay out but would swallow every drag and scroll
 * over the entire map, since the wrapper — not the map canvas — would be the
 * event target. Only the panel rectangles should capture pointer events.
 */
export function MapPanel({
  children,
  className = '',
  onPointerDownCapture,
}: {
  children: ReactNode;
  className?: string;
  /**
   * For panels holding a drag control (the time slider). Mapbox listens on the
   * canvas, but a drag that starts on the slider and overshoots onto the map
   * would otherwise hand off mid-gesture and pan the view.
   */
  onPointerDownCapture?: PointerEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className={`pointer-events-auto rounded-lg border border-shade-700 bg-shade-900/80 p-4 shadow-lg backdrop-blur-md ${className}`}
      onPointerDownCapture={onPointerDownCapture}
    >
      {children}
    </div>
  );
}

/**
 * One legend row. Swatch colours are passed in from the same `sunTint`
 * functions that paint the layers, so the legend cannot drift out of sync
 * with what is actually on screen.
 */
export function LegendRow({
  color,
  opacity = 1,
  children,
}: {
  color: string;
  opacity?: number;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        aria-hidden
        className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-shade-600"
        style={{ backgroundColor: color, opacity }}
      />
      <span className="text-[11px] leading-tight text-shade-200">{children}</span>
    </li>
  );
}
