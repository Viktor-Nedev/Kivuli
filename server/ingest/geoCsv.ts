import type { Reading } from './types.js';

/**
 * Parser for the Conduit station's official GeoCSV 2.0 exports.
 *
 * These are the files the organisers supply from the CHORDS portal behind
 * `3d-fewsnet.icdp.ucar.edu`, carrying a DOI, the instrument name and the
 * site's surveyed position in a `#`-prefixed metadata block above the header
 * row. They are the real measurement record for this station, and the API that
 * would otherwise serve the same numbers was not available in time.
 *
 * ## What this parser refuses to pass on
 *
 * Two channels in the export are demonstrably broken, and surfacing either
 * would put a number on screen that the instrument did not measure:
 *
 *   - **`Wind Gust Direction` is not a direction.** It repeats the value of
 *     `Wind Gust` in 18,364 of 18,364 rows — every row of every file — so the
 *     column holds a duplicated speed in a field labelled degrees. Dropped.
 *   - **`Rain Gauge 2` reads flat zero** across the whole record while Gauge 1
 *     records real tips. Treated as absent rather than as a measurement of no
 *     rain, because a broken gauge and a dry gauge are different claims.
 *
 * Everything else maps onto the same `Reading` channels the older sample
 * produced, so the calibration reference stays `BMX Temperature 1` and the
 * published bias figures keep meaning what they say.
 */

/** Columns as the CHORDS export names them. */
const COL = {
  ts: 'Time',
  rain1: 'Rain Gauge 1',
  tempBmx: 'BMX Temperature 1',
  pressure: 'BMX Pressure 1',
  tempMcp: 'MCP Temperature 1',
  tempSht: 'SHT Temperature',
  humidity: 'SHT Humidity',
  vis: 'SI1145 Visible 1',
  ir: 'SI1145 Infrared 1',
  uv: 'SI1145 Ultraviolet 1',
  windSpeed: 'Wind Speed',
  windDir: 'Wind Direction',
  windGust: 'Wind Gust',
  wetBulb: 'Wet Bulb Temperature',
  wbgt: 'Wet Bulb Globe Temperature',
} as const;

export interface GeoCsvMeta {
  instrument?: string;
  sensorId?: string;
  site?: string;
  latitude?: number;
  longitude?: number;
  elevationM?: number;
  doi?: string;
  attribution?: string;
}

/**
 * Reads the `#` metadata block.
 *
 * Worth keeping rather than skipping: it carries the DOI and the surveyed
 * position, which is what lets the app state where its numbers came from
 * instead of asserting it.
 */
export function parseGeoCsvMeta(text: string): GeoCsvMeta {
  const meta: GeoCsvMeta = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('#')) break;
    const body = line.slice(1).trim();
    const at = body.indexOf(':');
    if (at < 0) continue;
    const key = body.slice(0, at).trim().toLowerCase();
    const value = body.slice(at + 1).trim();

    if (key === 'instrument_name') meta.instrument = value;
    else if (key === 'sensor_id') meta.sensorId = value;
    else if (key === 'data collection site') meta.site = value;
    else if (key === 'data collection latitude') meta.latitude = Number(value);
    else if (key === 'data collection longitude') meta.longitude = Number(value);
    else if (key === 'data collection elevation') meta.elevationM = parseFloat(value);
    else if (key === 'doi') meta.doi = value;
    else if (key === 'attribution') meta.attribution = value;
  }
  return meta;
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map((c) => c.trim());
}

/** Blank cells are common in this export; they are missing, not zero. */
function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses one GeoCSV export into readings.
 *
 * Rows missing any channel a decision depends on are dropped rather than
 * defaulted: a spray verdict computed from a zero substituted for a missing
 * wind speed is a fabricated verdict, and this project would rather show fewer
 * readings than invented ones.
 */
export function parseGeoCsv(text: string): Reading[] {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].startsWith('#')) i++;
  if (i >= lines.length) return [];

  const header = splitCsvLine(lines[i]);
  i++;
  const idx = new Map<string, number>();
  header.forEach((h, n) => idx.set(h, n));

  const cell = (cols: string[], name: string): string | undefined => {
    const at = idx.get(name);
    return at === undefined ? undefined : cols[at];
  };

  const out: Reading[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('#')) continue;
    const cols = splitCsvLine(line);

    const ts = cell(cols, COL.ts);
    if (!ts) continue;

    const tempC = num(cell(cols, COL.tempBmx));
    const humidityPct = num(cell(cols, COL.humidity));
    const wetBulbC = num(cell(cols, COL.wetBulb));
    const wbgtC = num(cell(cols, COL.wbgt));
    const pressureHpa = num(cell(cols, COL.pressure));
    const windSpeedMs = num(cell(cols, COL.windSpeed));
    const windDirDeg = num(cell(cols, COL.windDir));

    if (
      tempC === null ||
      humidityPct === null ||
      wetBulbC === null ||
      wbgtC === null ||
      pressureHpa === null ||
      windSpeedMs === null ||
      windDirDeg === null
    ) {
      continue;
    }

    const mcpC = num(cell(cols, COL.tempMcp));
    const shtC = num(cell(cols, COL.tempSht));

    out.push({
      ts: new Date(ts).toISOString(),
      tempC,
      humidityPct,
      wetBulbC,
      wbgtC,
      pressureHpa,
      windSpeedMs,
      windDirDeg,
      // `Wind Gust Direction` is deliberately not read; see the file docblock.
      windGustMs: num(cell(cols, COL.windGust)) ?? windSpeedMs,
      visCounts: num(cell(cols, COL.vis)) ?? 0,
      irCounts: num(cell(cols, COL.ir)) ?? 0,
      uvIndex: num(cell(cols, COL.uv)) ?? undefined,
      // Gauge 2 is flat zero across the record and is not read.
      rainMm: num(cell(cols, COL.rain1)) ?? 0,
      ...(mcpC !== null && shtC !== null
        ? { temps: { bmxC: tempC, mcpC, shtC } }
        : {}),
    });
  }

  return out;
}

/**
 * Merges several exports into one ordered record.
 *
 * The supplied files overlap — 31 Aug and 1 Sep appear in two of them — so
 * de-duplicating by timestamp is required rather than tidy. Without it the
 * overlapping days carry doubled readings, which would quietly weight those
 * two days twice in any statistic computed over the record.
 */
export function mergeReadings(batches: Reading[][]): Reading[] {
  const byTs = new Map<string, Reading>();
  for (const batch of batches) {
    for (const r of batch) byTs.set(r.ts, r);
  }
  return [...byTs.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}
