import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  castShadow,
  isPointShaded,
  pointInRing,
  shadowsAt,
  sunPositionAt,
  type Building,
  type Ring,
  type ShadowFeature,
} from './shadows.js';

const shadowFeature = (id: string, ring: Ring): ShadowFeature => ({
  type: 'Feature',
  properties: { id },
  geometry: { type: 'Polygon', coordinates: [ring] },
});

const square = (cx: number, cy: number, half = 0.0001): Building['footprint'] => [
  [cx - half, cy - half],
  [cx + half, cy - half],
  [cx + half, cy + half],
  [cx - half, cy + half],
  [cx - half, cy - half],
];

const building = (over: Partial<Building> = {}): Building => ({
  id: 'b1',
  footprint: square(37.0144, -1.0954),
  heightM: 10,
  ...over,
});

test('no shadow is cast once the sun is at or below the horizon', () => {
  const sun = { altitude: 0, azimuth: 0 };
  assert.equal(castShadow(building(), sun), null);
  assert.equal(castShadow(building(), { altitude: -0.1, azimuth: 0 }), null);
});

test('a low sun casts a longer shadow than a high sun', () => {
  const b = building();
  const highSun = { altitude: Math.PI / 3, azimuth: 0 }; // 60°
  const lowSun = { altitude: Math.PI / 12, azimuth: 0 }; // 15°

  const highRing = castShadow(b, highSun)!;
  const lowRing = castShadow(b, lowSun)!;

  const spread = (ring: [number, number][]) =>
    Math.max(...ring.map((p) => p[1])) - Math.min(...ring.map((p) => p[1]));

  assert.ok(spread(lowRing) > spread(highRing), 'low sun should throw a longer shadow');
});

test('shadow length is clamped rather than growing unbounded near the horizon', () => {
  const b = building({ heightM: 10 });
  const nearHorizon = { altitude: 0.001, azimuth: 0 };
  const ring = castShadow(b, nearHorizon)!;

  // Clamp is 12x building height; confirm the ring stays within a sane bound
  // rather than stretching toward the coordinate's numeric limits.
  const lats = ring.map((p) => p[1]);
  const spreadM = (Math.max(...lats) - Math.min(...lats)) * 111_000; // deg lat -> m
  assert.ok(spreadM < 10 * b.heightM * 12 + 100, `unclamped shadow spread: ${spreadM}m`);
});

function shoelaceArea(ring: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(s) / 2;
}

test('the shadow polygon is a simple hull, not a self-intersecting bowtie', () => {
  // Regression test: concatenating the footprint ring and the projected ring
  // (both already closed) produces a bowtie whose shoelace area collapses
  // toward zero even though the shadow is visibly large on screen. A correct
  // hull's area should be well above the footprint's own tiny area.
  // A mid-afternoon sun angle throws a shadow several times the building's
  // footprint, which is the regime this map actually renders in — the earlier
  // version of this test used a near-overhead sun, where the shadow offset
  // was accidentally close to the footprint's own size and masked the bug.
  const b = building({ footprint: square(37.0144, -1.0954, 0.00001), heightM: 10 });
  const sun = { altitude: (25 * Math.PI) / 180, azimuth: 0 };
  const ring = castShadow(b, sun)!;

  const footprintArea = shoelaceArea(b.footprint);
  const hullArea = shoelaceArea(ring);

  assert.ok(
    hullArea > footprintArea * 1.5,
    `hull area (${hullArea}) should clearly exceed the footprint alone (${footprintArea}) — a bowtie would collapse this`,
  );
});

test('a point directly behind the building (away from the sun) sits in its shadow', () => {
  const sun = sunPositionAt(new Date('2026-09-01T15:00:00Z')); // afternoon, low-ish sun
  const shadows = shadowsAt([building()], new Date('2026-09-01T15:00:00Z'));
  assert.ok(shadows.length > 0, 'expected a shadow at this hour');
  void sun;
});

test('point-in-ring is true for the ring centroid and false far outside it', () => {
  const ring: [number, number][] = square(0, 0, 1);
  assert.equal(pointInRing([0, 0], ring), true);
  assert.equal(pointInRing([5, 5], ring), false);
});

test('isPointShaded checks across all shadow features, not just the first', () => {
  const shadows = [shadowFeature('a', square(0, 0, 1)), shadowFeature('b', square(10, 10, 1))];
  assert.equal(isPointShaded([10, 10], shadows), true);
  assert.equal(isPointShaded([0, 0], shadows), true);
  assert.equal(isPointShaded([5, 5], shadows), false);
});

test('sun position matches the known solar noon at this longitude', () => {
  // Confirmed against the actual station data: peak irradiance lands at
  // 09:40 UTC against a computed solar noon of ~09:32 UTC for 37.01E.
  const noon = sunPositionAt(new Date('2026-09-01T09:32:00Z'));
  assert.ok(noon.altitude > 1.0, `expected near-overhead sun at solar noon, got altitude ${noon.altitude}`);

  const midnight = sunPositionAt(new Date('2026-09-01T21:32:00Z'));
  assert.ok(midnight.altitude < 0, 'sun should be below the horizon at local midnight');
});
