import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SitePicker } from './SitePicker';
import { SITE_OPTIONS } from '../lib/site';

/**
 * Every location's note must be reachable without a hover.
 *
 * These notes used to live in a bare `title` attribute, which renders nothing
 * on a phone — the exact defect DataTip was built to remove, surviving in the
 * one component DataTip could not be used on (its trigger is a focusable span,
 * and nesting one inside these buttons would double the tab stops).
 */

describe('SitePicker', () => {
  test('every option carries its note, not just the selected one', () => {
    render(<SitePicker selected={SITE_OPTIONS[0]} onSelect={vi.fn()} busy={false} />);
    for (const option of SITE_OPTIONS) {
      // Present in the accessibility tree for all five, not only on hover.
      expect(screen.getAllByText(option.note).length).toBeGreaterThan(0);
    }
  });

  test('each button points at its own note', () => {
    const { container } = render(
      <SitePicker selected={SITE_OPTIONS[0]} onSelect={vi.fn()} busy={false} />,
    );
    for (const option of SITE_OPTIONS) {
      const btn = screen.getByRole('button', { name: new RegExp(option.label, 'i') });
      const id = btn.getAttribute('aria-describedby');
      expect(id).toBe(`site-note-${option.id}`);
      expect(container.querySelector(`#${CSS.escape(id!)}`)?.textContent).toBe(option.note);
    }
  });

  test('no bare title attribute survives', () => {
    const { container } = render(
      <SitePicker selected={SITE_OPTIONS[0]} onSelect={vi.fn()} busy={false} />,
    );
    expect(container.querySelector('button[title]')).toBeNull();
  });
});
