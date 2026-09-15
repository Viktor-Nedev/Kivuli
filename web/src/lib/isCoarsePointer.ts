/**
 * Whether the primary pointer is a finger rather than a mouse.
 *
 * Asks the input device, not the screen width: a touchscreen laptop and a
 * phone in landscape are both wider than most breakpoints, and both want the
 * touch behaviour. Conversely a narrow browser window on a desktop does not.
 *
 * Callers use it for decisions about gestures and momentum, never for layout —
 * layout belongs in CSS media queries, which re-evaluate on resize where this
 * is read once per call.
 */
export function isCoarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}
