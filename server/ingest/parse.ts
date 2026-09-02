import type { Reading } from './types.js';

/**
 * Parses the Conduit CSV/JSON column set into `Reading`s.
 *
 * Shared by the CSV and API adapters: data.php returns the same column names,
 * so one parser serves both and the adapters differ only in transport.
 */

const num = (raw: string | number | undefined): number => {
  if (raw === undefined || raw === null || raw === '') return NaN;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : NaN;
};

/** Rain arrives split across two gauges; take the larger non-NaN reading. */
const rainOf = (row: Record<string, string>): number => {
  const a = num(row.rg1tp);
  const b = num(row.rg2tp);
  const vals = [a, b].filter((v) => Number.isFinite(v));
  return vals.length ? Math.max(...vals) : 0;
};

export function rowToReading(row: Record<string, string>): Reading | null {
  const ts = row.ts?.trim();
  if (!ts) return null;

  const tempC = num(row.temp_bmx);
  const humidityPct = num(row.humidity_sht);
  const wetBulbC = num(row.wet_bulb_temp);

  // These three drive every downstream index. A row missing any of them
  // cannot produce a decision, so drop it rather than emit a hole.
  if (!Number.isFinite(tempC) || !Number.isFinite(humidityPct) || !Number.isFinite(wetBulbC)) {
    return null;
  }

  return {
    ts: new Date(ts).toISOString(),
    tempC,
    humidityPct,
    wetBulbC,
    wbgtC: num(row.wet_bulb_globe_temp),
    pressureHpa: num(row.press_bmx),
    windSpeedMs: num(row.wind_spd),
    windDirDeg: num(row.wind_dir),
    windGustMs: num(row.wind_gust),
    visCounts: num(row.si1145_vis),
    irCounts: num(row.si1145_ir),
    rainMm: rainOf(row),
  };
}

/** Parses a CSV document. Handles CRLF and a trailing newline. */
export function parseCsv(text: string): Reading[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map((h) => h.trim());
  const out: Reading[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, j) => (row[h] = cells[j]?.trim() ?? ''));
    const reading = rowToReading(row);
    if (reading) out.push(reading);
  }

  out.sort((a, b) => a.ts.localeCompare(b.ts));
  return out;
}
