import { describe, test, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { stationDate, useToday } from './useToday';

/**
 * The failure this guards against: a dashboard left open across midnight,
 * still displaying yesterday's date as today's.
 *
 * The station is in Kenya, so the day must turn over at midnight in Nairobi
 * rather than wherever the viewer happens to be — otherwise the header and the
 * readings under it disagree for several hours.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe('stationDate', () => {
  test('reports the Kenyan calendar day, not the viewer‘s', () => {
    // 22:30 UTC on 17 Sep is already 01:30 on 18 Sep in Nairobi (UTC+3).
    expect(stationDate(new Date('2026-09-17T22:30:00Z'))).toBe('2026-09-18');
    // And 21:00 UTC is exactly the Nairobi midnight boundary.
    expect(stationDate(new Date('2026-09-17T21:00:00Z'))).toBe('2026-09-18');
    expect(stationDate(new Date('2026-09-17T20:59:00Z'))).toBe('2026-09-17');
  });

  test('sorts and compares as a plain string', () => {
    const a = stationDate(new Date('2026-09-04T09:00:00Z'));
    const b = stationDate(new Date('2026-09-11T09:00:00Z'));
    expect(a < b).toBe(true);
  });
});

describe('useToday', () => {
  test('starts on the current station date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T09:00:00Z'));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe('2026-09-18');
  });

  test('rolls over at midnight without a reload', () => {
    vi.useFakeTimers();
    // 23:30 in Nairobi, half an hour before the day turns.
    vi.setSystemTime(new Date('2026-09-18T20:30:00Z'));
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe('2026-09-18');

    act(() => {
      vi.advanceTimersByTime(31 * 60 * 1000);
    });
    // A page nobody has touched now knows it is tomorrow.
    expect(result.current).toBe('2026-09-19');
  });

  test('catches up after a sleep that skipped the timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T09:00:00Z'));
    const { result } = renderHook(() => useToday());

    // A laptop closed for two days never fires the scheduled timeout, so the
    // date would stay stale until the next midnight without this path.
    vi.setSystemTime(new Date('2026-09-20T09:00:00Z'));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(result.current).toBe('2026-09-20');
  });
});
