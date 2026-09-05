import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRainOutlook, rainThresholds, DEFAULT_LEVELS } from './rainOutlook.js';
import type { DailyRain } from './rainfall.js';

/**
 * Forward rainfall against the site's own record.
 *
 * The headline test here is the one that greps for rarity language. An earlier
 * design was going to call a 30 mm forecast day "a 1-in-11-year day" when the
 * committed record shows 30 mm happening about 2.6 times a year — a claim the
 * project's own data disproves. That class of error is now a test failure
 * rather than a code review note.
 */

const DAY_MS = 86_400_000;

/** A daily series of `days` entries, `mm` chosen per index. */
function series(days: number, mm: (i: number) => number): DailyRain[] {
  const out: DailyRain[] = [];
  const start = Date.UTC(2015, 0, 1);
  for (let i = 0; i < days; i++) {
    out.push({ date: new Date(start + i * DAY_MS).toISOString().slice(0, 10), mm: mm(i) });
  }
  return out;
}

/** Eleven years where every 100th day records 25 mm and the rest are dry. */
const ELEVEN_YEARS = series(4015, (i) => (i % 100 === 0 ? 25 : 0));

test('a dry window reports level none with a real number, not an empty state', () => {
  // The demo case: 0 mm forecast. The component must still say something
  // complete, because an empty panel is indistinguishable from a broken one.
  const outlook = buildRainOutlook(
    [
      { date: '2026-09-05', mm: 0 },
      { date: '2026-09-06', mm: 0 },
      { date: '2026-09-07', mm: 0 },
    ],
    ELEVEN_YEARS,
  );

  assert.equal(outlook.level, 'none');
  assert.equal(outlook.peakDayMm, 0);
  assert.ok(outlook.headline.length > 0);
  assert.match(outlook.detail, /0 mm/, 'the actual number must be stated');
  assert.match(outlook.detail, /\d+\s*mm about every/, 'a measured frequency must be stated');
  assert.ok(outlook.headlineSw.length > 0, 'Swahili must be present in the null state too');
});

test('the headline never claims a rarity the record cannot support', () => {
  // Guards the exact error that prompted this module's design.
  const cases = [0, 5, 22, 45, 120];
  for (const mm of cases) {
    const outlook = buildRainOutlook([{ date: '2026-09-05', mm }], ELEVEN_YEARS);
    for (const text of [outlook.headline, outlook.detail]) {
      assert.doesNotMatch(text, /1-in-\d+-year/i, `rarity claim at ${mm} mm: ${text}`);
      assert.doesNotMatch(text, /unprecedented|record-breaking|historic/i, `hyperbole at ${mm} mm`);
    }
  }
});

test('thresholds are measured from the series, not hardcoded', () => {
  // 40 days at exactly 20 mm, in a 400-day record.
  const s = series(400, (i) => (i < 40 ? 20 : 0));
  const [notable] = rainThresholds(s, [20]);
  assert.equal(notable.exceedances, 40);
  assert.ok(notable.everyMonths > 0);
});

test('a wetter site gets a different scale than a drier one', () => {
  // Guards against one location's thresholds leaking to another — the same
  // failure mode the multi-site cache key guards against.
  const wet = series(4000, (i) => (i % 10 === 0 ? 30 : 0));
  const dry = series(4000, (i) => (i % 400 === 0 ? 30 : 0));

  const [wetT] = rainThresholds(wet, [20]);
  const [dryT] = rainThresholds(dry, [20]);

  assert.ok(wetT.exceedances > dryT.exceedances);
  assert.ok(
    wetT.everyMonths < dryT.everyMonths,
    'a wetter site must reach the threshold more often',
  );
});

test('a threshold never reached is reported as never reached', () => {
  const s = series(1000, () => 1);
  const [t] = rainThresholds(s, [50]);
  assert.equal(t.exceedances, 0);
  assert.equal(t.everyMonths, 0);

  const outlook = buildRainOutlook([{ date: '2026-09-05', mm: 0 }], s);
  assert.match(outlook.detail, /has not occurred/);
});

test('a genuinely heavy day escalates the level', () => {
  const outlook = buildRainOutlook([{ date: '2026-09-05', mm: 55 }], ELEVEN_YEARS);
  assert.equal(outlook.level, 'heavy');
  assert.equal(outlook.peakDayMm, 55);
  assert.equal(outlook.peakDate, '2026-09-05');
  assert.match(outlook.headline, /55/);
});

test('a moderate day is notable but not heavy', () => {
  const outlook = buildRainOutlook([{ date: '2026-09-05', mm: 25 }], ELEVEN_YEARS);
  assert.equal(outlook.level, 'notable');
});

test('a dry forecast day is not scored at the bottom of the record', () => {
  // Midrank, for the same reason seasonalPercentile uses it: most days here
  // are dry, so a strict less-than count would put an ordinary day at the 0th
  // percentile and imply something is wrong.
  const outlook = buildRainOutlook([{ date: '2026-09-05', mm: 0 }], ELEVEN_YEARS);
  assert.ok(
    outlook.peakPercentile > 10,
    `a dry day in a mostly-dry record should not read as extreme, got ${outlook.peakPercentile}`,
  );
});

test('the peak is the wettest day in the horizon, not the total', () => {
  const outlook = buildRainOutlook(
    [
      { date: '2026-09-05', mm: 8 },
      { date: '2026-09-06', mm: 14 },
      { date: '2026-09-07', mm: 3 },
    ],
    ELEVEN_YEARS,
  );
  assert.equal(outlook.peakDayMm, 14);
  assert.equal(outlook.peakDate, '2026-09-06');
  assert.equal(outlook.totalMm, 25);
  assert.equal(outlook.horizonDays, 3);
});

test('the reference period is reported so the sample size is visible', () => {
  const outlook = buildRainOutlook([{ date: '2026-09-05', mm: 0 }], ELEVEN_YEARS);
  assert.ok(outlook.referenceYears >= 10);
  assert.match(outlook.detail, /years of reanalysis/);
});

test('default levels are ordered and distinct', () => {
  assert.equal(DEFAULT_LEVELS.length, 2);
  assert.ok(DEFAULT_LEVELS[0] < DEFAULT_LEVELS[1]);
});
