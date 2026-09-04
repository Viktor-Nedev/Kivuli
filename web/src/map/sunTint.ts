import type { SunPosition } from './shadows';

/**
 * Continuous colouring for the shade map's own layers.
 *
 * Mapbox's Standard style exposes time of day as `basemap.lightPreset`, which
 * takes one of four discrete strings — so as the slider crosses a bucket
 * boundary the whole basemap snaps. This module supplies the *continuous*
 * half: the ground wash, the shadow polygons and the route line are all
 * layers this project owns, so their paint can be interpolated against sun
 * altitude on every slider tick and eased with Mapbox's `-transition`
 * suffixes.
 *
 * That does not make the basemap step disappear, and this file should not
 * pretend otherwise — but since these layers carry most of the map's visual
 * weight, easing them across the moment the basemap flips is enough that the
 * eye reads one continuous change.
 *
 * Deliberately separate from `shadows.ts`: `lightPresetFor` and its threshold
 * are pinned by existing tests at exact bucket edges, so everything here is
 * additive rather than a modification of that contract.
 */

/** Altitude (radians) at which the sun counts as fully "up" for tinting. ~40°. */
const FULL_DAY_ALTITUDE_RAD = 0.7;

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/**
 * 0 at or below the horizon, rising to 1 at ~40° altitude.
 *
 * The continuous analogue of `lightPresetFor`'s four buckets. Intentionally
 * saturates well below the zenith: past ~40° the light stops changing much,
 * and anchoring to the true maximum would leave the interesting dawn/dusk
 * range compressed into the bottom of the scale.
 */
export function dayFactor(sun: SunPosition): number {
  return clamp01(sun.altitude / FULL_DAY_ALTITUDE_RAD);
}

/** Blends two `#rrggbb` colours. `t` is clamped to [0, 1]. */
export function mixHex(a: string, b: string, t: number): string {
  const k = clamp01(t);
  const parse = (hex: string) => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const chan = (x: number, y: number) => Math.round(x + (y - x) * k);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(chan(ar, br))}${hex(chan(ag, bg))}${hex(chan(ab, bb))}`;
}

/**
 * The warm wash over exposed ground: red-shifted and nearly absent at low
 * sun, full ochre at midday.
 */
export function groundExposurePaint(sun: SunPosition): { color: string; opacity: number } {
  const f = dayFactor(sun);
  return {
    color: mixHex('#cc5c4f', '#e8a33d', f),
    // Low ceiling on purpose. This drives a `background` layer, which tints
    // the entire viewport rather than just open ground, so it has to stay a
    // wash: at the 0.20 peak this originally used, the basemap flattened
    // into one sheet of peach and the shadow polygons — the thing the map
    // exists to show — had nothing left to contrast against.
    opacity: 0.02 + 0.05 * f,
  };
}

/**
 * Shadow polygons: lighter and bluer at low sun, near-black at midday.
 *
 * Fading toward transparent as the sun sets is not just decoration —
 * `castShadow` returns null below the horizon, so the layer empties out
 * anyway. This makes the approach to empty a fade rather than a pop.
 */
export function shadowPaint(sun: SunPosition): { color: string; opacity: number } {
  const f = dayFactor(sun);
  return {
    // Shifted off the building fill (#273553) rather than toward it. These
    // started at #1c2840 -> #0b1220, which is the same navy family the
    // extruded buildings are painted in, so on screen a shadow and the
    // building casting it merged into one shape and the map looked like it
    // was drawing no shadows at all. A cooler, bluer shade keeps the two
    // readable as separate things while still saying "absence of sun".
    color: mixHex('#3d5a8a', '#1e3a6b', f),
    opacity: 0.35 + 0.6 * f,
  };
}

/** Exposed stretches of the route read red, shaded stretches green. */
export function routeColorFor(shadedFraction: number): string {
  return mixHex('#cc5c4f', '#5aa07d', shadedFraction);
}
