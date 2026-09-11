import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExportButtons } from './ExportButtons';
import type { Column } from '../lib/export';

/**
 * Two things must hold: a click actually writes a file, and a click that
 * cannot write one says so. The second matters more — a download button that
 * silently does nothing is indistinguishable from a broken app, and the
 * failure is invisible in review because it only happens in sandboxed or
 * quota-limited browsers.
 */

interface Row {
  ts: string;
  tempC: number;
}

const COLUMNS: Column<Row>[] = [
  { header: 'timestamp', provenance: 'measured', value: (r) => r.ts },
  { header: 'temp_c', provenance: 'measured', value: (r) => r.tempC },
];

const ROWS: Row[] = [{ ts: '2026-09-01T08:00:00.000Z', tempC: 19.4 }];

const META = {
  dataset: 'test-set',
  title: 'a test set',
  source: 'the bundled sample',
  notes: ['A caveat.'],
};

function renderIt(rows: Row[] = ROWS) {
  return render(
    <ExportButtons
      rows={rows}
      columns={COLUMNS}
      meta={META}
      coversDate="2026-09-01"
      label="these readings"
    />,
  );
}

let created: string[] = [];

beforeEach(() => {
  created = [];
  // jsdom implements neither of these.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => {
      created.push('blob:stub');
      return 'blob:stub';
    }),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ExportButtons', () => {
  test('offers both formats', () => {
    renderIt();
    expect(screen.getByRole('button', { name: /csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /json/i })).toBeInTheDocument();
  });

  test('a CSV click writes a file and names it in the status line', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /csv/i }));
    expect(created).toHaveLength(1);
    // Dated by the data, not by today.
    expect(screen.getByText(/kivuli-test-set-2026-09-01\.csv/)).toBeInTheDocument();
  });

  test('a JSON click writes the other extension', () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /json/i }));
    expect(screen.getByText(/kivuli-test-set-2026-09-01\.json/)).toBeInTheDocument();
  });

  test('a refused download says so rather than doing nothing visible', () => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => {
        throw new Error('refused');
      }),
      revokeObjectURL: vi.fn(),
    });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /csv/i }));
    expect(screen.getByText(/refused the download/i)).toBeInTheDocument();
    // And it points at the recovery that always works.
    expect(screen.getByText(/copied by hand/i)).toBeInTheDocument();
  });

  test('the status line is announced politely', () => {
    const { container } = renderIt();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  test('an empty dataset disables both buttons', () => {
    renderIt([]);
    expect(screen.getByRole('button', { name: /csv/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /json/i })).toBeDisabled();
  });

  test('the copy states that provenance travels with the file', () => {
    renderIt();
    expect(screen.getByText(/provenance tag/i)).toBeInTheDocument();
  });
});
