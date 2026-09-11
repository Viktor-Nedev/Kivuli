import { describe, test, expect } from 'vitest';
import { csvCell, toCsv, toJson, exportFilename, type Column } from './export';

/**
 * The invariant these tests exist to protect: **a number never leaves this app
 * without its provenance.**
 *
 * Everything else here is ordinary formatting. But a CSV that drops the
 * measured/modelled distinction has stripped the project's central guarantee
 * at exactly the moment the data stops being watched, and nothing on screen
 * would reveal it. So the provenance assertions below are pinned hard.
 */

interface Row {
  ts: string;
  tempC: number;
  reason: string | null;
}

const COLUMNS: Column<Row>[] = [
  { header: 'timestamp', provenance: 'measured', value: (r) => r.ts },
  { header: 'tempC', provenance: 'measured', value: (r) => r.tempC },
  { header: 'spray_reason', provenance: 'derived', value: (r) => r.reason },
];

const ROWS: Row[] = [
  { ts: '2026-09-01T08:00:00.000Z', tempC: 19.4, reason: null },
  // The comma is the point: this is a real spray reason string.
  { ts: '2026-09-01T09:00:00.000Z', tempC: 22.1, reason: 'Wind below 0.8 m/s, inversion risk' },
];

const META = {
  dataset: 'timeline',
  title: 'station readings',
  source: 'JKUAT Conduit station (CSV sample)',
  notes: ['The station measures weather only.'],
  now: new Date('2026-09-11T10:00:00.000Z'),
};

describe('csvCell', () => {
  test('quotes a field containing a comma', () => {
    // Unquoted, this would shift every column to its right by one — and the
    // file would still open cleanly, which is the dangerous part.
    expect(csvCell('Wind below 0.8 m/s, inversion risk')).toBe(
      '"Wind below 0.8 m/s, inversion risk"',
    );
  });

  test('doubles embedded quotes', () => {
    expect(csvCell('he said "no"')).toBe('"he said ""no"""');
  });

  test('quotes a field containing a newline', () => {
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  test('empty for null and undefined, but not for zero', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    // 0 is a reading, not a missing value. Blanking it would be a data loss.
    expect(csvCell(0)).toBe('0');
  });

  test('leaves an ordinary field alone', () => {
    expect(csvCell('19.4')).toBe('19.4');
  });
});

describe('toCsv', () => {
  test('every column header carries a provenance tag', () => {
    const header = toCsv(ROWS, COLUMNS, META)
      .split('\n')
      .find((l) => !l.startsWith('#'))!;
    for (const col of COLUMNS) {
      expect(header).toContain(`${col.header} [${col.provenance}]`);
    }
    // No bare header may escape: as many tags as columns.
    expect(header.match(/\[[a-z_]+\]/g)).toHaveLength(COLUMNS.length);
  });

  test('the comment block names the source and the export time', () => {
    const csv = toCsv(ROWS, COLUMNS, META);
    expect(csv).toContain('# Source: JKUAT Conduit station (CSV sample)');
    expect(csv).toContain('# Exported: 2026-09-11T10:00:00.000Z');
    expect(csv).toContain('# The station measures weather only.');
  });

  test('the legend explains only the tags actually used', () => {
    const csv = toCsv(ROWS, COLUMNS, META);
    expect(csv).toContain('[measured]');
    expect(csv).toContain('[derived]');
    // These columns use neither, so the legend must not pad itself out.
    expect(csv).not.toContain('[reanalysis]');
    expect(csv).not.toContain('[bias_corrected]');
  });

  test('one data row per input row, after the comments and header', () => {
    const lines = toCsv(ROWS, COLUMNS, META).split('\n');
    const body = lines.filter((l) => !l.startsWith('#')).slice(1);
    expect(body).toHaveLength(ROWS.length);
    expect(body[1]).toContain('"Wind below 0.8 m/s, inversion risk"');
  });

  test('an empty dataset still emits its header and provenance', () => {
    const csv = toCsv([], COLUMNS, META);
    const header = csv.split('\n').find((l) => !l.startsWith('#'))!;
    expect(header).toContain('tempC [measured]');
  });
});

describe('toJson', () => {
  test('data round-trips untouched, so it stays comparable with the API', () => {
    const parsed = JSON.parse(toJson(ROWS, COLUMNS, META));
    expect(parsed.data).toEqual(ROWS);
  });

  test('provenance rides in the envelope, not merged into the rows', () => {
    const parsed = JSON.parse(toJson(ROWS, COLUMNS, META));
    expect(parsed.kivuli.provenance).toEqual({
      timestamp: 'measured',
      tempC: 'measured',
      spray_reason: 'derived',
    });
    // The rows must not have gained a field.
    expect(Object.keys(parsed.data[0])).toEqual(['ts', 'tempC', 'reason']);
  });

  test('the envelope carries the caveats too', () => {
    const parsed = JSON.parse(toJson(ROWS, COLUMNS, META));
    expect(parsed.kivuli.notes).toContain('The station measures weather only.');
    expect(parsed.kivuli.source).toBe('JKUAT Conduit station (CSV sample)');
  });
});

describe('exportFilename', () => {
  test('is dated by the data, not by the export', () => {
    // Two exports of the same day should collide rather than accumulate
    // "(1)", "(2)" — someone comparing them wants one file per day.
    expect(exportFilename('timeline', '2026-09-01', 'csv')).toBe(
      'kivuli-timeline-2026-09-01.csv',
    );
    expect(exportFilename('validation', '2026-09-01', 'json')).toBe(
      'kivuli-validation-2026-09-01.json',
    );
  });
});
