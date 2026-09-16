import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { WatchBoard } from './WatchBoard';

/**
 * The claims this board must never make.
 *
 * A watch that could not be evaluated must not read as an all-clear: "no
 * modelled river reach here" and "the river is fine" are different statements,
 * and merging them is the most consequential lie an alert screen can tell.
 *
 * And a clear watch must show its margin. On a quiet day every row is green,
 * and a board of green ticks is indistinguishable from a board that never
 * ran — the distance to the threshold is the evidence that it did.
 */

const watch = (over: Record<string, unknown> = {}) => ({
  id: 'heat',
  label: 'Heat stress',
  state: 'clear',
  hazard: 'Outdoor work without rest breaks',
  value: 21.5,
  unit: ' °C WBGT',
  threshold: 28,
  marginToFire: 6.5,
  provenance: 'measured',
  summary: 'Peak WBGT 21.5 °C, 6.5 °C below the 28 °C work/rest threshold.',
  ...over,
});

function mockFetch(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => body } as Response);
}

describe('WatchBoard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch({ generatedAt: '', watches: [watch()], firing: 0 }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('a clear watch shows the value, the threshold and the distance between', async () => {
    render(<WatchBoard />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Heat stress' })).toBeInTheDocument(),
    );

    expect(screen.getByText('Clear')).toBeInTheDocument();
    // The margin is the proof the detector ran on a quiet day.
    expect(screen.getByText('6.5')).toBeInTheDocument();
    expect(screen.getByText('28')).toBeInTheDocument();
  });

  test('an unavailable watch is never shown as clear, and gives its reason', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        generatedAt: '',
        firing: 0,
        watches: [
          watch({
            id: 'river',
            label: 'River discharge',
            state: 'unavailable',
            value: null,
            threshold: null,
            marginToFire: null,
            summary: 'No modelled river reach at this location.',
            reason: 'The global flood model resolves major river reaches.',
          }),
        ],
      }),
    );

    render(<WatchBoard />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'River discharge' })).toBeInTheDocument(),
    );

    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
    expect(screen.getByText(/global flood model/i)).toBeInTheDocument();
  });

  test('a firing watch is announced in the section aside', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        generatedAt: '',
        firing: 1,
        watches: [watch({ state: 'firing', marginToFire: null })],
      }),
    );

    render(<WatchBoard />);
    await waitFor(() => expect(screen.getByText('Firing')).toBeInTheDocument());
    expect(screen.getByText('1 firing')).toBeInTheDocument();
  });

  test('a failed request says nothing has been checked rather than showing green', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<WatchBoard />);
    await waitFor(() => expect(screen.getByText(/could not be reached/i)).toBeInTheDocument());
    expect(screen.queryByText('Clear')).not.toBeInTheDocument();
  });
});
