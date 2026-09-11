import type { Provenance } from './types';

/**
 * Taking the Conduit data out of the browser.
 *
 * Everything this app computes is on screen and none of it could leave. A
 * reader who wanted to check a figure, plot it, or hand it to someone else had
 * to retype it. For a project whose whole argument is that a ground station's
 * measurements are worth something, that is a strange place to stop.
 *
 * ## Provenance travels with the data, or the export is a lie
 *
 * The one thing that must not happen is a file leaving here as bare numbers. A
 * CSV that says `tempC,26.4` with no indication of whether an instrument or a
 * ~9 km model produced it has stripped off every guarantee the interface makes
 * — and it has done so at exactly the moment the number stops being watched.
 * So every column header carries its provenance tag, and every file opens with
 * a comment block naming the source, the window, and what the station does not
 * measure.
 *
 * ## Why the formatters here are pure
 *
 * Everything below is a string transform. The single DOM-touching function,
 * `downloadText`, is isolated at the bottom so the interesting logic can be
 * tested without faking a browser.
 */

/**
 * Provenance as it appears in an export.
 *
 * Extends the server's four kinds with `derived`, for figures KIVULI computes
 * from measured inputs — Delta-T, WBGT, the pass/fail gates. Those are not
 * `measured` (no instrument reads a Delta-T) and not `raw_forecast` (no model
 * produced them), so calling them either would be false. `derived` is honest
 * and is deliberately **export-local**: the server never emits it, and adding
 * it to the `Provenance` union in `types.ts` would break that file's mirror of
 * `server/ingest/types.ts`.
 */
export type ExportProvenance = Provenance | 'derived';

const PROVENANCE_NOTE: Record<ExportProvenance, string> = {
  measured: 'read directly by an instrument at the station',
  bias_corrected: "a model value with this station's measured offset removed",
  raw_forecast: 'straight from the forecast provider, with no local correction',
  reanalysis: 'a model reconstruction on a ~9 km grid, not a measurement',
  derived: 'computed by KIVULI from the columns above',
};

/** One exported column: where it comes from and how to read it off a row. */
export interface Column<T> {
  header: string;
  provenance: ExportProvenance;
  value: (row: T) => string | number | boolean | null | undefined;
}

export interface ExportMeta {
  /** Filename stem, and the `dataset` field in JSON. kebab-case. */
  dataset: string;
  /** Human title for the comment block. */
  title: string;
  /** e.g. "JKUAT Conduit weather station (CSV sample 2026-09-01)". */
  source: string;
  /** Limits and caveats, one per line, written into both formats. */
  notes: string[];
  /** Injected so exports are deterministic under test. */
  now?: Date;
}

/**
 * One CSV field, RFC 4180.
 *
 * The quoting is not decorative: a spray reason reads "Wind below 0.8 m/s —
 * inversion risk, spray will drift off-target". That embedded comma would
 * silently shift every column to its right by one, and the file would still
 * open cleanly — a wrong answer that looks like a right one.
 */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Only the tags actually used by these columns, so the legend stays short. */
function legendFor<T>(columns: Column<T>[]): string[] {
  const seen = new Set(columns.map((c) => c.provenance));
  return (Object.keys(PROVENANCE_NOTE) as ExportProvenance[])
    .filter((k) => seen.has(k))
    .map((k) => `#   [${k}]${' '.repeat(Math.max(1, 16 - k.length))}${PROVENANCE_NOTE[k]}`);
}

export function toCsv<T>(rows: T[], columns: Column<T>[], meta: ExportMeta): string {
  const now = (meta.now ?? new Date()).toISOString();
  const head = [
    `# KIVULI — ${meta.title}`,
    `# Source: ${meta.source}`,
    `# Exported: ${now}`,
    '#',
    '# Each column header carries the provenance of that column:',
    ...legendFor(columns),
    '#',
    ...meta.notes.map((n) => `# ${n}`),
  ];

  const header = columns.map((c) => csvCell(`${c.header} [${c.provenance}]`)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','));

  return [...head, header, ...body].join('\n');
}

/**
 * JSON export.
 *
 * The rows go in untouched under `data`, so a consumer can take `.data` and
 * get exactly what the API returned. The provenance map and the caveats ride
 * alongside in an envelope rather than being merged into the rows, for the
 * same reason: the payload should stay byte-comparable with the server's.
 */
export function toJson<T>(rows: T[], columns: Column<T>[], meta: ExportMeta): string {
  const provenance: Record<string, ExportProvenance> = {};
  for (const c of columns) provenance[c.header] = c.provenance;

  return JSON.stringify(
    {
      kivuli: {
        title: meta.title,
        dataset: meta.dataset,
        source: meta.source,
        exportedAt: (meta.now ?? new Date()).toISOString(),
        provenance,
        notes: meta.notes,
      },
      data: rows,
    },
    null,
    2,
  );
}

/**
 * `kivuli-timeline-2026-09-01.csv`.
 *
 * Dated by the day the *data* covers, not the day it was exported — two
 * exports of the same reading should collide rather than accumulate
 * "file (1)", "file (2)", which is what someone comparing them actually wants.
 */
export function exportFilename(dataset: string, coversDate: string, ext: 'csv' | 'json'): string {
  return `kivuli-${dataset}-${coversDate}.${ext}`;
}

/**
 * Hands the browser a file. The only function here that touches the DOM.
 *
 * The BOM is not optional: without it Excel on Windows decodes the file as the
 * system codepage, and every `°C` and every Kiswahili string arrives as
 * mojibake on the one machine most likely to open it.
 */
export function downloadText(filename: string, mime: string, text: string): void {
  const withBom = mime.startsWith('text/csv') ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([withBom], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously races the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
