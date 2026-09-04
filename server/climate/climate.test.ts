import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  annualTotals,
  detectOnset,
  harvestPotential,
  monthlyClimatology,
  onsetDistribution,
  rollingTotal,
  seasonalPercentile,
  type DailyRain,
} from './rainfall.js';

const DAY_MS = 86_400_000;

/**
 * Builds a synthetic daily series between two dates, `mm` chosen per date.
 * Deterministic and explicit — every test below states exactly which days
 * carry rain, so a failure names the input rather than a random seed.
 */
function series(from: string, to: string, mm: (date: string) => number): DailyRain[] {
  const out: DailyRain[] = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  for (let t = Date.UTC(fy, fm - 1, fd); t <= Date.UTC(ty, tm - 1, td); t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push({ date, mm: mm(date) });
  }
  return out;
}

/** Rain only in the months listed, a fixed amount every day of them. */
const inMonths = (months: string[], mmPerDay: number) => (date: string) =>
  months.includes(date.slice(5, 7)) ? mmPerDay : 0;

test('rollingTotal sums the window ending on the given day, inclusive', () => {
  const s = series('2020-01-01', '2020-01-31', () => 2);
  const { totalMm, coverage } = rollingTotal(s, '2020-01-10', 5);
  // Jan 6,7,8,9,10 -> five days at 2 mm.
  assert.equal(totalMm, 10);
  assert.equal(coverage, 1);
});

test('rollingTotal reports partial coverage instead of pretending the window is full', () => {
  const s = series('2020-01-08', '2020-01-31', () => 2);
  const { coverage } = rollingTotal(s, '2020-01-10', 10);
  // Only Jan 8,9,10 exist of the ten requested.
  assert.equal(coverage, 0.3);
});

test('a dry season is not reported as drought when the rains themselves were normal', () => {
  // The headline honesty case, modelled on the real JKUAT numbers. Every year
  // has a wet March-May and a bone-dry September. 2026 is completely typical.
  const s = series('2015-01-01', '2026-09-03', inMonths(['03', '04', '05'], 8));

  const short = seasonalPercentile(s, '2026-09-03', 90);
  const long = seasonalPercentile(s, '2026-09-03', 180);

  // The 90-day window sits in the dry season and collects nothing...
  assert.equal(short.totalMm, 0);
  // ...but it must NOT be flagged as an anomaly, because every other year
  // collected nothing over the same window too.
  assert.equal(short.category, 'normal');
  // And the 180-day window, which reaches back into the long rains, is normal.
  assert.equal(long.category, 'normal');
});

test('percentile compares like calendar windows, not the whole year', () => {
  // July is dry in every year; June-July 2026 is therefore unremarkable even
  // though it would rank near the bottom of an all-days-of-the-year ranking.
  const s = series('2015-01-01', '2026-07-31', inMonths(['04'], 10));
  const july = seasonalPercentile(s, '2026-07-31', 30);
  assert.equal(july.totalMm, 0);
  assert.equal(july.category, 'normal', 'a reliably dry month is not an anomaly');
  assert.ok(july.referenceYears >= 10);
});

test('a genuinely failed rainy season is flagged as very dry', () => {
  // Same climatology, except 2026 April gets almost nothing. This is the case
  // the feature exists to catch, and it must still fire.
  const s = series('2015-01-01', '2026-05-31', (date) => {
    if (date.slice(5, 7) !== '04') return 0;
    return date.slice(0, 4) === '2026' ? 0.2 : 10;
  });
  const stat = seasonalPercentile(s, '2026-05-31', 90);
  assert.equal(stat.category, 'very-dry');
  assert.equal(stat.percentile, 0);
  assert.ok(stat.totalMm < stat.medianMm);
});

test('percentile reports how many reference years it had', () => {
  const s = series('2020-01-01', '2026-09-03', () => 1);
  const stat = seasonalPercentile(s, '2026-09-03', 30);
  // 2020..2025 inclusive.
  assert.equal(stat.referenceYears, 6);
});

test('onset requires both the rain trigger and no dry spell after it', () => {
  // A 25 mm burst on 1 March, then three dry weeks: the classic false start
  // that costs a farmer the seed. April opens with the same 25 mm burst but
  // keeps raining afterwards, so that is the real onset.
  const s = series('2026-01-01', '2026-05-31', (date) => {
    if (date === '2026-03-01') return 25;
    if (date === '2026-04-01') return 25;
    if (date > '2026-04-01' && date <= '2026-04-30') return 8;
    return 0;
  });
  assert.equal(detectOnset(s, 2026, 'MAM'), '2026-04-01');
});

test('a burst that is never followed by rain is rejected outright', () => {
  // Same 25 mm trigger, nothing after it. There is no season here at all.
  const s = series('2026-01-01', '2026-05-31', (date) => (date === '2026-03-01' ? 25 : 0));
  assert.equal(detectOnset(s, 2026, 'MAM'), null);
});

test('onset returns null when no season materialises', () => {
  const s = series('2026-01-01', '2026-05-31', () => 0.1);
  assert.equal(detectOnset(s, 2026, 'MAM'), null);
});

test('onset distribution reports the spread, not just the median', () => {
  // Onset drifts a month later each year, so the spread must be visible.
  const s = series('2020-01-01', '2023-12-31', (date) => {
    const year = date.slice(0, 4);
    const starts: Record<string, string> = {
      '2020': '02-10',
      '2021': '03-10',
      '2022': '04-10',
      '2023': '03-10',
    };
    const start = `${year}-${starts[year]}`;
    if (date === start) return 25; // the opening burst that trips the trigger
    return date > start && date <= `${year}-05-31` ? 8 : 0;
  });
  const dist = onsetDistribution(s, 'MAM');
  assert.equal(dist.observedYears, 4);
  assert.ok(dist.spreadDays >= 55, `expected a wide spread, got ${dist.spreadDays}`);
  assert.equal(dist.earliestMonthDay, '02-10');
  assert.equal(dist.latestMonthDay, '04-10');
  assert.ok(dist.medianMonthDay);
});

test('harvest potential is depth times area times runoff coefficient', () => {
  // 900 mm over 60 m2 at 0.8 -> 43,200 L. 1 mm on 1 m2 is exactly 1 litre.
  assert.equal(harvestPotential(900, 60, 0.8), 43_200);
  // The default coefficient is the documented 0.8.
  assert.equal(harvestPotential(900, 60), 43_200);
  assert.equal(harvestPotential(1000, 1, 1), 1000);
});

test('a year with missing days is marked incomplete rather than summed silently', () => {
  const full = series('2020-01-01', '2020-12-31', () => 1);
  const partial = series('2021-01-01', '2021-03-31', () => 1);
  const totals = annualTotals([...full, ...partial]);

  const y2020 = totals.find((t) => t.year === 2020);
  const y2021 = totals.find((t) => t.year === 2021);
  assert.equal(y2020?.complete, true);
  assert.equal(y2021?.complete, false, '90 days is not a comparable annual total');
  assert.ok((y2021?.mm ?? 0) < (y2020?.mm ?? 0));
});

test('monthly climatology carries the rain-minus-evaporation balance', () => {
  const s = series('2020-01-01', '2021-12-31', (date) => (date.slice(5, 7) === '04' ? 10 : 0)).map(
    (row) => ({ ...row, et0Mm: 4 }),
  );
  const climate = monthlyClimatology(s);
  const april = climate.find((m) => m.month === 4)!;
  const july = climate.find((m) => m.month === 7)!;

  // April: 300 mm rain against 120 mm ET0 -> surplus.
  assert.ok(april.balanceMm > 0, 'a wet month should show a surplus');
  // July: no rain, still evaporating -> deficit.
  assert.ok(july.balanceMm < 0, 'a dry month should show a deficit');
  assert.equal(april.years, 2);
});

/**
 * Guard test against the committed cache, in the spirit of the existing
 * calibration guard. Skips rather than fails when the cache is absent, so a
 * fresh clone without network can still run the suite green.
 */
test('the committed rainfall archive supports a real multi-year comparison', async (t) => {
  const dir = path.join(process.cwd(), 'data', 'cache');
  let file: string | null = null;
  try {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(dir);
    file = entries.find((e) => e.startsWith('daily_')) ?? null;
  } catch {
    // No cache directory at all.
  }
  if (!file) return t.skip('no committed daily archive to check');

  // The cache stores Open-Meteo's whole response under `body`, with the
  // series nested in `body.daily` — the same shape `dailyArchive` reads.
  const raw = JSON.parse(await readFile(path.join(dir, file), 'utf8')) as {
    body: { daily?: { time: string[]; precipitation_sum: number[] } };
  };
  const daily = raw.body.daily;
  if (!daily?.time?.length) return t.skip('cached archive has no daily series');

  const rows: DailyRain[] = daily.time.map((date, i) => ({
    date,
    mm: daily.precipitation_sum[i] ?? 0,
  }));

  assert.ok(rows.length > 3000, `expected a multi-year series, got ${rows.length} days`);

  const end = rows[rows.length - 1].date;
  const stat = seasonalPercentile(rows, end, 90);
  assert.ok(
    stat.referenceYears >= 10,
    `a percentile needs a real reference period, got n=${stat.referenceYears}`,
  );
  assert.ok(stat.percentile >= 0 && stat.percentile <= 100);
});
