import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseGeoCsv, parseGeoCsvMeta, mergeReadings } from './geoCsv.js';

const DIR = path.join(process.cwd(), 'data', 'conduit');

async function allFiles() {
  const names = (await readdir(DIR)).filter((f) => f.endsWith('.csv')).sort();
  return Promise.all(names.map((n) => readFile(path.join(DIR, n), 'utf8')));
}

test('reads the GeoCSV metadata block rather than skipping it', async () => {
  const [text] = await allFiles();
  const meta = parseGeoCsvMeta(text);
  assert.equal(meta.site, 'Site JKUAT');
  assert.equal(meta.sensorId, '61');
  assert.match(meta.doi ?? '', /^https:\/\/doi\.org\//);
  // The surveyed position is what lets the app state where its numbers came
  // from rather than asserting it.
  assert.ok(meta.latitude !== undefined && Math.abs(meta.latitude + 1.0997) < 0.01);
  assert.ok(meta.longitude !== undefined && Math.abs(meta.longitude - 37.0145) < 0.01);
});

test('parses every supplied export into readings', async () => {
  const texts = await allFiles();
  assert.equal(texts.length, 3, 'expected three official exports');
  for (const t of texts) {
    assert.ok(parseGeoCsv(t).length > 6000, 'each export should carry ~7000 readings');
  }
});

test('merging de-duplicates the overlap between exports', async () => {
  const texts = await allFiles();
  const batches = texts.map(parseGeoCsv);
  const raw = batches.reduce((n, b) => n + b.length, 0);
  const merged = mergeReadings(batches);

  // 31 Aug and 1 Sep appear in two files. Without de-duplication those two
  // days would carry doubled readings and would be weighted twice in any
  // statistic computed over the record.
  assert.ok(merged.length < raw, 'merge must drop duplicates');
  assert.equal(merged.length, new Set(merged.map((r) => r.ts)).size);
  assert.equal(merged.length, 18364);
});

test('readings are ordered, and the missing week stays missing', async () => {
  const merged = mergeReadings((await allFiles()).map(parseGeoCsv));
  for (let i = 1; i < merged.length; i++) {
    assert.ok(merged[i - 1].ts <= merged[i].ts, 'timestamps must ascend');
  }
  const days = new Set(merged.map((r) => r.ts.slice(0, 10)));
  assert.equal(days.size, 13);
  // Nothing interpolates across 5-10 September; the gap is the truth.
  for (const absent of ['2026-09-05', '2026-09-07', '2026-09-10']) {
    assert.ok(!days.has(absent), `${absent} must not be invented`);
  }
});

test('the broken gust-direction column is never surfaced as a direction', async () => {
  const [text] = await allFiles();
  // In the export this column repeats Wind Gust in every row, so it holds a
  // speed in a field labelled degrees. The Reading shape has no field for it.
  const readings = parseGeoCsv(text);
  const sample = readings[500] as unknown as Record<string, unknown>;
  assert.ok(!('windGustDirDeg' in sample));
  assert.ok(!('gustDirection' in sample));
});

test('UV is carried, because this sensor demonstrably works', async () => {
  const merged = mergeReadings((await allFiles()).map(parseGeoCsv));
  const uv = merged.map((r) => r.uvIndex).filter((v): v is number => v !== undefined);
  assert.equal(uv.length, merged.length, 'every row carries a UV value');
  // The reason UV was suppressed for most of this project was a sample that
  // read 0 everywhere. This record does not.
  assert.ok(uv.some((v) => v > 0), 'the sensor must show daylight response');
  assert.ok(Math.max(...uv) > 4);
});

test('a row keeps all three thermometers together or none', async () => {
  const merged = mergeReadings((await allFiles()).map(parseGeoCsv));
  const withTemps = merged.filter((r) => r.temps);
  assert.ok(withTemps.length > 0);
  for (const r of withTemps.slice(0, 200)) {
    assert.equal(r.temps?.bmxC, r.tempC, 'bmx channel is the reference dry bulb');
    assert.ok(Number.isFinite(r.temps?.mcpC));
    assert.ok(Number.isFinite(r.temps?.shtC));
  }
});

test('values land in physically plausible ranges for this site', async () => {
  const merged = mergeReadings((await allFiles()).map(parseGeoCsv));
  for (const r of merged) {
    assert.ok(r.tempC > 0 && r.tempC < 45, `temp out of range: ${r.tempC}`);
    assert.ok(r.humidityPct >= 0 && r.humidityPct <= 100);
    // Juja sits at ~1523 m, so sea-level pressure would signal a unit error.
    assert.ok(r.pressureHpa > 800 && r.pressureHpa < 900);
    assert.ok(r.wetBulbC <= r.tempC + 0.5, 'wet bulb cannot exceed dry bulb');
  }
});
