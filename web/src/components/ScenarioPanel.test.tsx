import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScenarioPanel } from './ScenarioPanel';

/**
 * The claim this panel must never make: that a scenario is a measurement.
 *
 * It exists because the station's real record never crosses the heat
 * threshold, and the tempting shortcut — shipping a hot day that never
 * happened — would undo the provenance discipline the rest of the app is built
 * on. So the measured column is always present, always labelled, and always
 * one tap away.
 */

const outcome = (over: Record<string, unknown> = {}) => ({
  sprayOk: 40,
  sprayTotal: 100,
  sprayWindows: [{ start: '2026-09-15T07:00:00.000Z', end: '2026-09-15T09:00:00.000Z' }],
  peakWbgtC: 21.5,
  heatBand: 'Work through the hour — no heat restriction',
  heatFires: false,
  commonestBlocker: null,
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  day: '2026-09-15',
  offsets: { tempC: 0, windMs: 0, humidityPct: 0 },
  measured: outcome(),
  scenario: outcome(),
  isMeasured: true,
  limits: {
    tempC: { min: -5, max: 12, step: 0.5 },
    windMs: { min: -3, max: 8, step: 0.1 },
    humidityPct: { min: -30, max: 30, step: 1 },
  },
  ...over,
});

const mockFetch = (b: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => b } as Response);

describe('ScenarioPanel', () => {
  beforeEach(() => vi.stubGlobal('fetch', mockFetch(body())));
  afterEach(() => vi.unstubAllGlobals());

  test('opens on the measured day, with no offsets applied', async () => {
    render(<ScenarioPanel />);
    await waitFor(() => expect(screen.getByText('As measured')).toBeInTheDocument());
    expect(screen.getByText('Scenario (no change)')).toBeInTheDocument();
    // Nothing to undo yet, so no reset offered.
    expect(screen.queryByText(/back to the measured day/i)).not.toBeInTheDocument();
  });

  test('always shows the measured column beside the scenario', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(
        body({
          isMeasured: false,
          offsets: { tempC: 12, windMs: 0, humidityPct: 30 },
          scenario: outcome({ peakWbgtC: 31.4, heatFires: true, sprayOk: 0 }),
        }),
      ),
    );

    render(<ScenarioPanel />);
    await waitFor(() => expect(screen.getByText('Scenario')).toBeInTheDocument());

    // The real day is still on screen and still honest.
    expect(screen.getByText('As measured')).toBeInTheDocument();
    expect(screen.getByText(/21.5 °C/)).toBeInTheDocument();
    expect(screen.getByText(/no restriction/i)).toBeInTheDocument();

    // And the scenario is labelled with the offset that produced it.
    expect(screen.getByText(/31.4 °C/)).toBeInTheDocument();
    expect(screen.getByText(/rest breaks needed/i)).toBeInTheDocument();
    expect(screen.getByText(/\+12 °C/)).toBeInTheDocument();
  });

  test('offers a way back to the measured day once a slider has moved', async () => {
    vi.stubGlobal('fetch', mockFetch(body({ isMeasured: false })));
    render(<ScenarioPanel />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /back to the measured day/i })).toBeInTheDocument(),
    );
  });

  test('moving a slider asks the server rather than computing locally', async () => {
    const spy = mockFetch(body());
    vi.stubGlobal('fetch', spy);
    render(<ScenarioPanel />);
    await waitFor(() => expect(screen.getByText('As measured')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/temperature/i), { target: { value: '6' } });

    // The thresholds live in the server's index functions; a panel that did
    // its own arithmetic could disagree with the live page.
    await waitFor(() => expect(spy.mock.calls.at(-1)?.[0]).toContain('temp=6'));
  });

  test('a failed request says so instead of showing a blank comparison', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<ScenarioPanel />);
    await waitFor(() =>
      expect(screen.getByText(/could not be run/i)).toBeInTheDocument(),
    );
  });
});
