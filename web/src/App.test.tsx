import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

/**
 * The offline banner, end to end.
 *
 * `StaleBanner.test.tsx` covers the component with hand-built props. Nothing
 * covered the step that actually decides whether it appears: App reading
 * `X-Kivuli-From-Cache` off the response the service worker replayed. A typo
 * in that header name would silently disable the entire stale warning — the
 * app would show hours-old readings as current — and every other web test
 * would still pass.
 *
 * This also pins the demo pin. The app opens on 10:15 because that is the
 * moment the sample day produces "Spray now until 10:38", the sentence the
 * README leads with; at the previous 13:00 the same card read "do not spray"
 * and contradicted the pitch on the first screen.
 */

const READING = {
  ts: '2026-09-01T07:15:00.000Z',
  tempC: 19.4,
  humidityPct: 64,
  wetBulbC: 15.6,
  wbgtC: 15.4,
  pressureHpa: 853,
  windSpeedMs: 0.9,
  windDirDeg: 120,
  windGustMs: 1.4,
  visCounts: 500,
  irCounts: 3000,
  rainMm: 0,
};

function todayBody() {
  return {
    source: 'CSV sample (2026-09-01)',
    latest: READING,
    decisions: {
      ts: READING.ts,
      spray: {
        status: 'go',
        headline: 'Spray now until 10:38',
        headlineSw: 'Nyunyiza sasa hadi 10:38',
        detail: '',
        // The Hero card reads deltaT off here, so the fixture carries the
        // real shape rather than a convenient subset.
        assessment: {
          ts: READING.ts,
          deltaT: 3.8,
          windSpeedMs: 0.9,
          pass: true,
          failures: [],
          reason: '',
        },
        windows: [],
      },
      drying: {
        status: 'wait',
        headline: 'Keep grain covered',
        headlineSw: 'Weka nafaka imefunikwa',
        detail: '',
        assessment: { ts: READING.ts, pass: false, reason: 'Humidity 64%' },
        windows: [],
      },
      heat: null,
      thi: null,
    },
    timeline: [],
    calibration: null,
    forecastDegraded: false,
  };
}

/** Stubs the two fetches AppLayout makes, with control over the today headers. */
function stubFetch(headers: Record<string, string> = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/api/config')) {
        return new Response(JSON.stringify({ mapboxToken: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // The Overview also mounts the watch board and the scenario panel, which
      // call their own endpoints. Without their own shapes here they would be
      // handed the `today` body, and a panel parsing the wrong payload hangs
      // this test rather than the page it is supposed to be checking.
      if (url.includes('/api/days')) {
        return new Response(JSON.stringify({ days: ['2026-09-15'], count: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/watch')) {
        return new Response(JSON.stringify({ generatedAt: '', watches: [], firing: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/api/scenario')) {
        const outcome = {
          sprayOk: 0,
          sprayTotal: 0,
          sprayWindows: [],
          peakWbgtC: 0,
          heatBand: '',
          heatFires: false,
          commonestBlocker: null,
        };
        return new Response(
          JSON.stringify({
            day: '2026-09-15',
            offsets: { tempC: 0, windMs: 0, humidityPct: 0 },
            measured: outcome,
            scenario: outcome,
            isMeasured: true,
            limits: {
              tempC: { min: -5, max: 12, step: 0.5 },
              windMs: { min: -3, max: 8, step: 0.1 },
              humidityPct: { min: -30, max: 30, step: 1 },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(todayBody()), {
        status: 200,
        headers: { 'content-type': 'application/json', ...headers },
      });
    }),
  );
  return calls;
}

beforeEach(() => {
  window.location.hash = '#/';
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('offline banner', () => {
  test('a cached response raises the banner', async () => {
    stubFetch({
      'X-Kivuli-From-Cache': '1',
      'X-Kivuli-Cached-At': '2026-09-01T07:20:00.000Z',
    });
    render(<App />);

    // The exact sentence that stops an old reading being taken as advice.
    await waitFor(() =>
      expect(screen.getByText(/record of what was true, not as advice for now/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/^offline$/i)).toBeInTheDocument();
  });

  test('a live response does not', async () => {
    stubFetch();
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Spray now until 10:38/)).toBeInTheDocument());
    // No banner: the reading is current, and saying otherwise would be a
    // false claim in the other direction.
    expect(screen.queryByText(/record of what was true/i)).not.toBeInTheDocument();
  });

  test('the header name is what triggers it, not merely its presence', async () => {
    // Guards against the header being renamed on one side only.
    stubFetch({ 'X-Kivuli-From-Cache': '0' });
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Spray now until 10:38/)).toBeInTheDocument());
    expect(screen.queryByText(/record of what was true/i)).not.toBeInTheDocument();
  });
});

describe('the demo pin', () => {
  test('opens on the moment the README quotes', async () => {
    const calls = stubFetch();
    render(<App />);
    await waitFor(() => expect(calls.some((u) => u.includes('/api/today'))).toBe(true));

    const today = calls.find((u) => u.includes('/api/today'))!;
    // 10:15 is where the sample day yields "Spray now until 10:38". At the
    // previous 13:00 the card read "do not spray" while the pitch promised
    // the opposite.
    expect(today).toContain('at=10%3A15');
  });

  test('an explicit ?at in the URL still wins', async () => {
    const calls = stubFetch();
    const original = window.location.search;
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?at=06:30', hash: '#/' },
      writable: true,
    });
    render(<App />);
    await waitFor(() => expect(calls.some((u) => u.includes('/api/today'))).toBe(true));
    expect(calls.find((u) => u.includes('/api/today'))!).toContain('at=06%3A30');
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: original },
      writable: true,
    });
  });
});
