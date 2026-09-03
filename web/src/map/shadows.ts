import SunCalc from 'suncalc';
import { SITE } from '../lib/site';

/**
 * Projects building footprints into ground shadow polygons for a given time.
 *
 * Deliberately does not interpolate anything from the Conduit station: shadow
 * geometry comes purely from building height and the sun's position, which is
 * exact astronomy, not a station reading extended across space. The plan for
 * this project explicitly rules out inventing a regional heatmap from one
 * sensor, and a shadow layer built from geometry rather than interpolated
 * temperature keeps that line intact.
 */

export interface SunPosition {
  /** Radians above the horizon. Negative means the sun has set. */
  altitude: number;
  /** Radians, measured from south, clockwise (SunCalc convention). */
  azimuth: number;
}

export function sunPositionAt(date: Date): SunPosition {
  const pos = SunCalc.getPosition(date, SITE.latitude, SITE.longitude);
  return { altitude: pos.altitude, azimuth: pos.azimuth };
}

export type Ring = [number, number][];

export interface Building {
  id: string;
  /** Outer ring, closed (first point repeated last), [lng, lat] pairs. */
  footprint: Ring;
  heightM: number;
}

const EARTH_RADIUS_M = 6371000;

/** Offsets a [lng, lat] point by (dx, dy) metres using an equirectangular approximation. */
function offsetMeters(lng: number, lat: number, dxM: number, dyM: number): [number, number] {
  const dLat = (dyM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = ((dxM / EARTH_RADIUS_M) * (180 / Math.PI)) / Math.cos((lat * Math.PI) / 180);
  return [lng + dLng, lat + dLat];
}

/**
 * Projects one building's roofline onto the ground along the sun vector.
 *
 * Returns null when the sun is at or below the horizon: there is no finite
 * ground shadow to draw, and treating altitude 0 as a valid divisor would
 * produce a shadow stretching to infinity.
 */
export function castShadow(building: Building, sun: SunPosition): Ring | null {
  if (sun.altitude <= 0) return null;

  // Shadow length grows as the sun gets lower; clamp so a sun barely above
  // the horizon doesn't throw a kilometres-long sliver across the map.
  const rawLength = building.heightM / Math.tan(sun.altitude);
  const length = Math.min(rawLength, building.heightM * 12);

  // SunCalc's azimuth is measured from south, clockwise. Convert to the
  // direction the shadow is cast (opposite the sun) as a compass bearing.
  const shadowBearing = sun.azimuth + Math.PI;
  const dx = length * Math.sin(shadowBearing);
  const dy = length * Math.cos(shadowBearing) * -1;

  const projected: Ring = building.footprint.map(([lng, lat]) => offsetMeters(lng, lat, dx, dy));

  // The shadow polygon is the convex hull of the footprint plus its
  // projection. Simply concatenating the two closed rings (footprint, then
  // projected) does not produce a shadow shape: each ring closes on itself,
  // so the combined path self-intersects into a bowtie that a fill renderer
  // can rasterize as empty. The hull is the actual outline connecting the
  // building's base to where its roofline lands.
  return convexHull([...building.footprint.slice(0, -1), ...projected.slice(0, -1)]);
}

/** Andrew's monotone chain convex hull. Input need not be closed or sorted. */
function convexHull(points: [number, number][]): Ring {
  const pts = [...new Set(points.map((p) => p.join(',')))]
    .map((s) => s.split(',').map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  if (pts.length <= 2) return [...pts, pts[0]];

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return [...hull, hull[0]];
}

export interface ShadowFeature {
  type: 'Feature';
  properties: { id: string };
  geometry: { type: 'Polygon'; coordinates: [Ring] };
}

export function shadowsAt(buildings: Building[], date: Date): ShadowFeature[] {
  const sun = sunPositionAt(date);
  const out: ShadowFeature[] = [];

  for (const b of buildings) {
    const ring = castShadow(b, sun);
    if (ring) out.push({ type: 'Feature', properties: { id: b.id }, geometry: { type: 'Polygon', coordinates: [ring] } });
  }
  return out;
}

/** Point-in-polygon test (ray casting), for deciding whether a point sits in shade. */
export function pointInRing(point: [number, number], ring: Ring): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPointShaded(point: [number, number], shadows: ShadowFeature[]): boolean {
  return shadows.some((s) => pointInRing(point, s.geometry.coordinates[0]));
}
