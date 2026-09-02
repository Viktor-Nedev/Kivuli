import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from './parse.js';
import { toHourlyMeans } from './aggregate.js';
import { CsvAdapter } from './adapters/csvAdapter.js';

const HEADER =
  'ts,rg1,rg2,rg1tt,rg2tt,rg1tp,rg2tp,temp_bmx,press_bmx,temp_mcp,temp_sht,humidity_sht,' +
  'si1145_vis,si1145_ir,si1145_uv,wind_spd,wind_dir,wind_gust,wind_gust_dir,heat_idx,' +
  'wet_bulb_temp,wet_bulb_globe_temp';

test('parses a well-formed row into the canonical shape', () => {
  const csv = `${HEADER}\n2026-09-01T10:11:54Z,0,0,0,0,0.4,0,23.6,853,23.8,23.9,51.4,810,6347,0,1.1,110,1.4,1.4,23.9,17.5,19`;
  const [r] = parseCsv(csv);
  assert.equal(r.ts, '2026-09-01T10:11:54.000Z');
  assert.equal(r.tempC, 23.6);
  assert.equal(r.humidityPct, 51.4);
  assert.equal(r.wetBulbC, 17.5);
  assert.equal(r.wbgtC, 19);
  assert.equal(r.windSpeedMs, 1.1);
});

test('drops rows missing a field the indices depend on', () => {
  const csv =
    `${HEADER}\n` +
    `2026-09-01T10:00:00Z,0,0,0,0,0,0,,853,,,51.4,810,6347,0,1.1,110,1.4,1.4,,17.5,19\n` +
    `2026-09-01T10:15:00Z,0,0,0,0,0,0,23.6,853,23.8,23.9,51.4,810,6347,0,1.1,110,1.4,1.4,23.9,17.5,19`;
  assert.equal(parseCsv(csv).length, 1);
});

test('tolerates CRLF line endings and a trailing newline', () => {
  const csv = `${HEADER}\r\n2026-09-01T10:00:00Z,0,0,0,0,0,0,23.6,853,23.8,23.9,51.4,810,6347,0,1.1,110,1.4,1.4,23.9,17.5,19\r\n`;
  assert.equal(parseCsv(csv).length, 1);
});

test('hourly means collapse the 15-minute cadence', () => {
  const rows = parseCsv(
    `${HEADER}\n` +
      `2026-09-01T10:00:00Z,0,0,0,0,0,0,20,850,20,20,50,800,6000,0,1,110,1,1,20,17,19\n` +
      `2026-09-01T10:30:00Z,0,0,0,0,0,0,24,854,24,24,60,800,6000,0,3,110,3,3,24,17,19`,
  );
  const [h] = toHourlyMeans(rows);
  assert.equal(h.hour, '2026-09-01T10');
  assert.equal(h.n, 2);
  assert.equal(h.tempC, 22);
  assert.equal(h.humidityPct, 55);
});

test('the bundled sample loads and covers the demo day', async () => {
  const rows = await new CsvAdapter('data/weatherdata_september.csv').getHistory(
    new Date('2026-09-01T00:00:00Z'),
    new Date('2026-09-01T23:59:59Z'),
  );
  assert.equal(rows.length, 95);
  // Timestamps are genuinely UTC: peak irradiance lands near solar noon for
  // longitude 37.01 E (09:32 UTC), which is why the UI converts to UTC+3.
  const peak = rows.reduce((a, b) => (b.irCounts > a.irCounts ? b : a));
  assert.equal(peak.ts.slice(11, 13), '09');
});
