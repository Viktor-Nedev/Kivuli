import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StaleBanner } from './StaleBanner';
import { relativeAge } from '../lib/format';

/**
 * The app can now open with no connection. That introduces the one failure
 * this project cannot accept — data that looks current and is not — so the
 * wording here is pinned by test, not left to a future copy edit.
 */

const STALE = {
  readingTs: '2026-09-01T10:55:00.000Z',
  cachedAt: '2026-09-01T11:02:00.000Z',
};

// Six hours after the reading.
const NOW = new Date('2026-09-01T16:55:00.000Z').getTime();

describe('StaleBanner', () => {
  test('names the reading time and how old it is', () => {
    render(<StaleBanner stale={STALE} nowMs={NOW} />);
    expect(screen.getByText(/about 6 hours ago/)).toBeInTheDocument();
    // 10:55Z is 13:55 in Nairobi — the absolute time must be local and exact,
    // because the relative one is only an approximation.
    expect(screen.getByText('13:55')).toBeInTheDocument();
  });

  test('says the verdicts are a record, not advice', () => {
    render(<StaleBanner stale={STALE} nowMs={NOW} />);
    // The sentence that carries the posture. A future edit that softens this
    // should fail rather than pass quietly.
    expect(
      screen.getByText(/record of what was true, not as advice for now/i),
    ).toBeInTheDocument();
  });

  test('is announced politely rather than as an alert', () => {
    // The app is working; the data is merely old. `alert` is for interruptions.
    const { container } = render(<StaleBanner stale={STALE} nowMs={NOW} />);
    const el = container.querySelector('[role="status"]');
    expect(el).not.toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  test('leads with the word offline', () => {
    render(<StaleBanner stale={STALE} nowMs={NOW} />);
    expect(screen.getByText(/^offline$/i)).toBeInTheDocument();
  });
});

describe('relativeAge', () => {
  test('rounds away from freshness, never toward it', () => {
    const base = new Date('2026-09-01T12:00:00.000Z').getTime();
    const at = (min: number) => relativeAge('2026-09-01T12:00:00.000Z', base + min * 60_000);

    // Never "just now": a precise count would imply live data.
    expect(at(1)).toBe('moments ago');
    expect(at(37)).toBe('about 35 minutes ago');
    expect(at(60)).toBe('about an hour ago');
    expect(at(6 * 60)).toBe('about 6 hours ago');
    expect(at(26 * 60)).toBe('yesterday');
    expect(at(72 * 60)).toBe('3 days ago');
  });

  test('a clock that ran backwards does not claim the future', () => {
    const base = new Date('2026-09-01T12:00:00.000Z').getTime();
    expect(relativeAge('2026-09-01T12:05:00.000Z', base)).toBe('just recorded');
  });
});
