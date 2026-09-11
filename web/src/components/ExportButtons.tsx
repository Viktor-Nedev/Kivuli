import { useState } from 'react';
import {
  downloadText,
  exportFilename,
  toCsv,
  toJson,
  type Column,
  type ExportMeta,
} from '../lib/export';

/**
 * Two buttons that let a dataset leave the browser.
 *
 * The app computes a great deal and, until now, none of it could go anywhere:
 * a reader who wanted to check a figure, plot it, or send it to someone had to
 * retype it off the screen. For a project arguing that a ground station's
 * measurements are worth something, that was a strange place to stop.
 *
 * The status line is not decoration. A download can fail silently — a blocked
 * popup, a refused quota, a sandboxed iframe — and a button that appears to do
 * nothing is indistinguishable from a broken one. It is announced politely so
 * a screen-reader user learns the file was written too.
 */

type Status = { kind: 'idle' } | { kind: 'done'; name: string } | { kind: 'failed' };

export function ExportButtons<T>({
  rows,
  columns,
  meta,
  coversDate,
  label,
}: {
  rows: T[];
  columns: Column<T>[];
  meta: ExportMeta;
  /** The day the data covers — the filename is dated by this, not by today. */
  coversDate: string;
  /** Completes "Download …" — e.g. "these 95 station readings". */
  label: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  function run(ext: 'csv' | 'json') {
    const name = exportFilename(meta.dataset, coversDate, ext);
    try {
      const body =
        ext === 'csv' ? toCsv(rows, columns, meta) : toJson(rows, columns, meta);
      downloadText(name, ext === 'csv' ? 'text/csv;charset=utf-8' : 'application/json', body);
      setStatus({ kind: 'done', name });
    } catch {
      // Deliberately not cleared on a timer: a failure message that vanishes
      // after two seconds is a failure message nobody reads.
      setStatus({ kind: 'failed' });
    }
  }

  const disabled = rows.length === 0;

  return (
    <div className="mt-6 border-t border-shade-700/60 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => run('csv')}
          disabled={disabled}
          className="rounded border border-shade-700 px-3 py-1.5 font-display text-xs uppercase tracking-[0.15em] text-shade-200 transition-colors hover:border-kenya-green-400 hover:text-kenya-green-300 disabled:opacity-50"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={() => run('json')}
          disabled={disabled}
          className="rounded border border-shade-700 px-3 py-1.5 font-display text-xs uppercase tracking-[0.15em] text-shade-200 transition-colors hover:border-kenya-green-400 hover:text-kenya-green-300 disabled:opacity-50"
        >
          Download JSON
        </button>
        <p aria-live="polite" className="text-xs text-shade-200">
          {status.kind === 'done' && <span className="text-kenya-green-300">Saved {status.name}</span>}
          {status.kind === 'failed' && (
            <span className="text-amber-300">
              The browser refused the download — the figures are all on this page and can be
              copied by hand.
            </span>
          )}
        </p>
      </div>

      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-shade-200">
        Download {label}. Every column carries the same provenance tag it has on screen, so the
        file still says which numbers an instrument measured and which a model produced once it is
        away from here.
      </p>
    </div>
  );
}
