import test from 'node:test';
import assert from 'node:assert/strict';
import { dayFactor, groundExposurePaint, mixHex, routeColorFor, shadowPaint } from './sunTint.js';

const HEX = /^#[0-9a-f]{6}$/;

const night = { altitude: -0.2, azimuth: 0 };
const horizon = { altitude: 0, azimuth: 0 };
const lowSun = { altitude: 0.2, azimuth: -0.5 };
const noon = { altitude: 1.2, azimuth: 0 };

test('dayFactor is 0 at and below the horizon', () => {
  assert.equal(dayFactor(night), 0);
  assert.equal(dayFactor(horizon), 0);
});

test('dayFactor saturates at 1 for a high sun', () => {
  assert.equal(dayFactor(noon), 1);
  assert.equal(dayFactor({ altitude: 0.7, azimuth: 0 }), 1);
});

test('dayFactor rises monotonically between horizon and saturation', () => {
  const samples = [0, 0.1, 0.2, 0.35, 0.5, 0.7].map((altitude) =>
    dayFactor({ altitude, azimuth: 0 }),
  );
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i] >= samples[i - 1], `sample ${i} went backwards`);
  }
  // And it genuinely varies rather than sitting at an endpoint throughout.
  assert.ok(samples[0] < samples[samples.length - 1]);
});

test('mixHex interpolates channel-wise and returns a well-formed colour', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0), '#000000');
  assert.equal(mixHex('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.match(mixHex('#cc5c4f', '#5aa07d', 0.37), HEX);
});

test('mixHex clamps out-of-range blend factors rather than overshooting', () => {
  assert.equal(mixHex('#000000', '#ffffff', -3), '#000000');
  assert.equal(mixHex('#000000', '#ffffff', 42), '#ffffff');
});

test('the ground wash is faint at night and strongest at midday', () => {
  const dark = groundExposurePaint(night);
  const bright = groundExposurePaint(noon);
  assert.ok(dark.opacity < bright.opacity);
  assert.match(dark.color, HEX);
  assert.match(bright.color, HEX);
  // Midday should land on the ochre end of the ramp.
  assert.equal(bright.color, '#e8a33d');
});

test('shadows fade out as the sun drops', () => {
  const dusky = shadowPaint(lowSun);
  const midday = shadowPaint(noon);
  assert.ok(dusky.opacity < midday.opacity);
  assert.ok(midday.opacity <= 1, 'opacity must stay a valid paint value');
  assert.match(dusky.color, HEX);
});

test('route colour separates fully exposed from fully shaded', () => {
  const exposed = routeColorFor(0);
  const shaded = routeColorFor(1);
  const half = routeColorFor(0.5);
  assert.notEqual(exposed, shaded);
  assert.notEqual(half, exposed);
  assert.notEqual(half, shaded);
  for (const c of [exposed, shaded, half]) assert.match(c, HEX);
});
