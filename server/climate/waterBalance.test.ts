import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableWater,
  buildWaterBalance,
  runningDeficit,
  CROP_STAGES,
  SOIL_TEXTURES,
  DEFAULT_CROP_ID,
} from './waterBalance.js';

/**
 * The forward water balance.
 *
 * Two of these are honesty guards rather than correctness checks: one pins the
 * clamp that stops the model claiming stored water it does not have, and one
 * greps the generated text to make sure no single irrigation date is ever
 * emitted — the soil spread is 3.1x wider than a week's deficit, so a
 * confident date would hide the largest uncertainty in the calculation.
 */

const crop = (id = DEFAULT_CROP_ID) => CROP_STAGES.find((c) => c.id === id)!;

/** `n` days of constant ET0 and rain, dated from 2026-09-05. */
function horizon(n: number, et0Mm: number, rainMm: number) {
  const out: { date: string; et0Mm: number; rainMm: number }[] = [];
  const start = Date.UTC(2026, 8, 5);
  for (let i = 0; i < n; i++) {
    out.push({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      et0Mm,
      rainMm,
    });
  }
  return out;
}

test('deficit accumulates when crop demand exceeds rain', () => {
  // Seven days at ET0 5.4 and Kc 1.20 with no rain: 5.4 * 1.2 * 7 = 45.4 mm.
  const days = runningDeficit(horizon(7, 5.4, 0), 1.2);
  assert.equal(days.length, 7);
  assert.ok(Math.abs(days[6].deficitMm - 45.4) < 0.2, `got ${days[6].deficitMm}`);
  // Monotonic while it never rains.
  for (let i = 1; i < days.length; i++) {
    assert.ok(days[i].deficitMm > days[i - 1].deficitMm);
  }
});

test('rain reduces the deficit but can never drive it negative', () => {
  // THE central invariant. Without the clamp, 100 mm of rain against 1.2 mm of
  // demand leaves a deficit of -98.8 mm — the model silently banking water the
  // soil cannot hold, which would then absorb the next several days of demand
  // for free.
  const days = runningDeficit(
    [
      { date: '2026-09-05', et0Mm: 1, rainMm: 0 },
      { date: '2026-09-06', et0Mm: 1, rainMm: 100 },
      { date: '2026-09-07', et0Mm: 5, rainMm: 0 },
    ],
    1.2,
  );

  assert.equal(days[1].deficitMm, 0, 'a downpour empties the debt, it does not overpay it');
  assert.ok(days[2].deficitMm > 0, 'the day after a downpour starts accruing again');
  assert.ok(Math.abs(days[2].deficitMm - 6) < 0.1, `got ${days[2].deficitMm}`);
});

test('a wet horizon reports zero deficit as a real answer, not an empty state', () => {
  const balance = buildWaterBalance(horizon(7, 4, 20), crop());
  assert.equal(balance.closingDeficitMm, 0);
  assert.ok(balance.headline.length > 0);
  assert.ok(balance.headlineSw.length > 0, 'Swahili is present in the null state too');
  assert.match(balance.detail, /rain/i);
  assert.equal(balance.daysToActionRange.earliest, null);
});

test('soil textures produce genuinely different days of action', () => {
  // The spread is the product. If every soil crossed on the same day the
  // feature would be pretending to a precision it does not have.
  const balance = buildWaterBalance(horizon(10, 6, 0), crop());
  const sand = balance.soils.find((s) => s.texture === 'sand')!;
  const clay = balance.soils.find((s) => s.texture === 'clay')!;

  assert.ok(sand.crossesOnDay !== null, 'sand must cross inside a 10-day dry spell');
  assert.ok(clay.crossesOnDay !== null);
  assert.ok(
    sand.crossesOnDay! < clay.crossesOnDay!,
    `sand ${sand.crossesOnDay} should precede clay ${clay.crossesOnDay}`,
  );
  assert.ok(sand.rawMm < clay.rawMm, 'sand holds less readily-available water');
});

test('every soil texture is reported, not just the selected one', () => {
  const balance = buildWaterBalance(horizon(7, 5.4, 0), crop());
  assert.equal(balance.soils.length, SOIL_TEXTURES.length);
  assert.equal(balance.soils.length, 6);
});

test('no single irrigation date is ever emitted', () => {
  // The structural analogue of rainOutlook's "1-in-N-year" guard. Readily
  // available water spans 16 mm (sand) to 50 mm (clay), so a specific date
  // would encode a soil assumption the reader never made.
  for (const rain of [0, 2, 20]) {
    const balance = buildWaterBalance(horizon(7, 5.4, rain), crop());
    const text = `${balance.headline} ${balance.detail}`;
    assert.doesNotMatch(text, /irrigate on /i, `emitted a date: ${text}`);
    assert.doesNotMatch(text, /apply \d+ ?mm on /i, `emitted a prescription: ${text}`);
    assert.doesNotMatch(text, /on (mon|tue|wed|thu|fri|sat|sun)/i, `named a weekday: ${text}`);
  }
});

test('the balance is never tagged measured', () => {
  // Nothing here is an instrument reading: ET0 and rain are model output, and
  // the soil constants are published table values.
  const balance = buildWaterBalance(horizon(7, 5.4, 0), crop());
  assert.equal(balance.provenance, 'raw_forecast');
  assert.doesNotMatch(JSON.stringify(balance), /measured/);
});

test('crop coefficient scales demand proportionally', () => {
  const maize = buildWaterBalance(horizon(7, 5, 0), crop('maize_mid'));
  const bare = buildWaterBalance(horizon(7, 5, 0), crop('bare'));

  assert.ok(maize.closingDeficitMm > bare.closingDeficitMm);
  // Kc 1.2 against 0.3 is exactly 4x the demand.
  assert.ok(Math.abs(maize.totalCropEtMm / bare.totalCropEtMm - 4) < 0.05);
});

test('available water follows FAO-56 for a known texture', () => {
  // Loam: (0.28 - 0.14) * 1000 * 0.6 m = 84 mm TAW; RAW at p=0.55 = 46.2 mm.
  const { tawMm, rawMm } = availableWater('loam', 0.6, 0.55);
  assert.ok(Math.abs(tawMm - 84) < 0.5, `TAW ${tawMm}`);
  assert.ok(Math.abs(rawMm - 46.2) < 0.5, `RAW ${rawMm}`);
});

test('a shallower rooting depth holds less water', () => {
  const deep = availableWater('loam', 0.6, 0.55);
  const shallow = availableWater('loam', 0.3, 0.55);
  assert.ok(shallow.tawMm < deep.tawMm);
  assert.ok(Math.abs(shallow.tawMm - deep.tawMm / 2) < 0.5, 'TAW is linear in root depth');
});

test('an empty horizon does not throw', () => {
  const balance = buildWaterBalance([], crop());
  assert.equal(balance.horizonDays, 0);
  assert.equal(balance.closingDeficitMm, 0);
  assert.equal(balance.days.length, 0);
  assert.ok(balance.headline.length > 0);
});

test('the reported totals match the day rows', () => {
  const balance = buildWaterBalance(horizon(5, 4, 1), crop());
  const sumEt = balance.days.reduce((a, d) => a + d.cropEtMm, 0);
  const sumRain = balance.days.reduce((a, d) => a + d.rainMm, 0);
  assert.ok(Math.abs(balance.totalCropEtMm - sumEt) < 0.2);
  assert.ok(Math.abs(balance.totalRainMm - sumRain) < 0.2);
});

test('rain probability rides through as context and never scales the rain', () => {
  // The odds are shown beside the depth, not folded into it. Scaling 10 mm by
  // a 20% chance would invent a 2 mm figure that is neither the forecast nor
  // the probability, and the deficit would silently inherit it.
  const withOdds = buildWaterBalance(
    [{ date: '2026-09-05', et0Mm: 5, rainMm: 10, rainProbabilityPct: 20 }],
    crop(),
  );
  const withoutOdds = buildWaterBalance(
    [{ date: '2026-09-05', et0Mm: 5, rainMm: 10 }],
    crop(),
  );

  assert.equal(withOdds.days[0].rainProbabilityPct, 20);
  assert.equal(withoutOdds.days[0].rainProbabilityPct, null, 'absent odds read as null, not 0');
  assert.equal(
    withOdds.days[0].deficitMm,
    withoutOdds.days[0].deficitMm,
    'the probability must not change the balance',
  );
  assert.equal(withOdds.days[0].rainMm, 10, 'the rain depth is reported as forecast');
});
