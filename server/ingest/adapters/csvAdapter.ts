import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ConduitSource, Reading } from '../types.js';
import { parseCsv } from '../parse.js';

/**
 * Reads the bundled Conduit export. This is the default source so the app
 * runs from a clean clone with no API key.
 *
 * The sample covers a single day (2026-09-01) at 15-minute cadence.
 */
export class CsvAdapter implements ConduitSource {
  readonly name = 'CSV sample (2026-09-01)';
  private cache: Reading[] | null = null;

  constructor(private readonly file: string) {}

  private async load(): Promise<Reading[]> {
    if (!this.cache) {
      const text = await readFile(this.file, 'utf8');
      this.cache = parseCsv(text);
    }
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
}

export const defaultCsvPath = (root: string) =>
  path.join(root, 'data', 'weatherdata_september.csv');
