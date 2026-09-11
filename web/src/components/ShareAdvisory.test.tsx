import { describe, test, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShareAdvisory } from './ShareAdvisory';

/**
 * The failure path is the reason this file exists.
 *
 * The catch block used to set the idle state, so a refused clipboard showed
 * nothing at all — while the comment above it claimed the fallback was "to say
 * so plainly rather than to fail silently". A demo served over plain HTTP is
 * exactly where the clipboard is refused, so this is a path that fires in the
 * one situation that matters most.
 */

const ADVISORY = { en: 'Rainfall is close to normal.', sw: 'Mvua ni ya kawaida.' };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubClipboard(impl: () => Promise<void>) {
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn(impl) } });
}

describe('ShareAdvisory', () => {
  test('a successful copy is announced, not just shown on the button', async () => {
    stubClipboard(() => Promise.resolve());
    render(<ShareAdvisory advisory={ADVISORY} />);
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
    await waitFor(() => expect(screen.getByText(/copied to the clipboard/i)).toBeInTheDocument());
  });

  test('a refused clipboard says so and names the way out', async () => {
    stubClipboard(() => Promise.reject(new Error('refused')));
    render(<ShareAdvisory advisory={ADVISORY} />);
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
    await waitFor(() => expect(screen.getByText(/refused the clipboard/i)).toBeInTheDocument());
    // The text is selectable on screen, so that is the honest recovery.
    expect(screen.getByText(/copy it by hand/i)).toBeInTheDocument();
  });

  test('the status is in a polite live region', () => {
    const { container } = render(<ShareAdvisory advisory={ADVISORY} />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  test('both languages are offered and the text follows the choice', () => {
    render(<ShareAdvisory advisory={ADVISORY} />);
    expect(screen.getByText(ADVISORY.en)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /kiswahili/i }));
    expect(screen.getByText(ADVISORY.sw)).toBeInTheDocument();
  });
});
