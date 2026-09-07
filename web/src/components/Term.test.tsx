import { describe, expect, test } from 'vitest';
import { render } from '@testing-library/react';
import { Term, TERMS, type TermKey } from './Term';

describe('Term', () => {
  // The label appears twice by design — in the <abbr> and again as the
  // popover's heading — so queries are scoped to the abbr element itself.
  const abbrOf = (container: HTMLElement) => container.querySelector('abbr')!;

  test('renders a real abbr carrying the definition', () => {
    const { container } = render(<Term term="deltaT" />);
    const el = abbrOf(container);
    expect(el.tagName).toBe('ABBR');
    expect(el.textContent).toBe('Delta-T');
    expect(el).toHaveAttribute('title', expect.stringContaining('wet-bulb'));
  });

  test('is reachable by keyboard', () => {
    // Native title tooltips never appear on focus, so the definition would be
    // mouse-only without this. The repo had zero tabIndex before.
    const { container } = render(<Term term="wbgt" />);
    expect(abbrOf(container)).toHaveAttribute('tabindex', '0');
  });

  test('every term has a non-empty definition', () => {
    // Stops a key being added to the union and never defined.
    for (const key of Object.keys(TERMS) as TermKey[]) {
      expect(TERMS[key].short.length, `${key} short`).toBeGreaterThan(0);
      expect(TERMS[key].full.length, `${key} full`).toBeGreaterThan(20);
    }
  });

  test('custom children replace the label but keep the definition', () => {
    const { container } = render(<Term term="rh">RH</Term>);
    const el = abbrOf(container);
    expect(el.textContent).toBe('RH');
    expect(el).toHaveAttribute('title', expect.stringContaining('Relative humidity'));
  });
});
