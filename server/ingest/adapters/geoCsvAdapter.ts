import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ConduitSource, Reading } from '../types.js';
import { parseGeoCsv, parseGeoCsvMeta, mergeReadings, type GeoCsvMeta } from '../geoCsv.js';

/**
 * Reads the station's official GeoCSV exports from `data/conduit/`.
 *
 * This is the default source. The Conduit API was not available before the
 * deadline, and the organisers confirmed the CHORDS exports are the supported
 * substitute — so these files are not a stand-in for real data, they *are* the
 * station's measurement record, carrying its DOI and surveyed position.
 *
 * Every `.csv` in the directory is loaded and merged, because the export is
 * split into overlapping windows: 28 Aug – 1 Sep, 31 Aug – 4 Sep and
 * 11 – 15 Sep. `mergeReadings` de-duplicates the overlap, so 31 Aug and 1 Sep
 * are not counted twice.
 *
 * ## The gap is real and stays visible
 *
 * There is no data for 5 – 10 September. Nothing here interpolates across it.
 * A reader asking for that week gets no readings rather than invented ones,
 * and the UI says the record is discontinuous.
 */
export class GeoCsvAdapter implements ConduitSource {
  private cache: Reading[] | null = null;
  private meta: GeoCsvMeta = {};
  private label = 'Conduit GeoCSV export';

  constructor(private readonly dir: string) {}

  get name(): string {
    return this.label;
  }

  /** The export's own metadata: instrument, DOI, surveyed position. */
  async metadata(): Promise<GeoCsvMeta> {
    await this.load();
    return this.meta;
  }

  private async load(): Promise<Reading[]> {
    if (this.cache) return this.cache;

    const entries = (await readdir(this.dir)).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
    const batches: Reading[][] = [];
    for (const file of entries) {
      const text = await readFile(path.join(this.dir, file), 'utf8');
      if (!Object.keys(this.meta).length) this.meta = parseGeoCsvMeta(text);
      batches.push(parseGeoCsv(text));
    }

    this.cache = mergeReadings(batches);

    const days = new Set(this.cache.map((r) => r.ts.slice(0, 10)));
    this.label = `Conduit GeoCSV export (${days.size} days, ${this.cache.length} readings)`;

    return this.cache;
  }

  async getLatest(): Promise<Reading | null> {
    const rows = await this.load();
    return rows.length ? rows[rows.length - 1] : null;
  }

  async getHistory(from: Date, to: Date): Promise<Reading[]> {
    const rows = await this.load();
    const lo = from.getTime();
    const hi = to.getTime();
    return rows.filter((r) => {
      const t = new Date(r.ts).getTime();
      return t >= lo && t <= hi;
    });
  }

  /** Every day the record actually covers, ascending. Gaps are simply absent. */
  async days(): Promise<string[]> {
    const rows = await this.load();
    return [...new Set(rows.map((r) => r.ts.slice(0, 10)))].sort();
  }
}

export const defaultGeoCsvDir = (root: string) => path.join(root, 'data', 'conduit');
