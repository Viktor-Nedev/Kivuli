import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { KenyaDivider } from './KenyaDivider';

/**
 * The divider used to stop halfway across the screen and start again.
 *
 * Its viewBox spanned two pattern tiles, so the SVG scaled that user space to
 * the element width: the zigzag repeated exactly twice and each copy was
 * stretched across half the screen. No `preserveAspectRatio` value fixes that,
 * because the scaling itself is the fault — the viewBox has to go, so one user
 * unit is one CSS pixel and the pattern tiles in real pixels.
 *
 * It is a decorative SVG with no text, so these assert structure. That is
 * still worth doing: the bug was invisible to every other test and shipped
 * across several design phases.
 */

describe('KenyaDivider', () => {
  test('declares no viewBox, so the pattern tiles rather than stretching', () => {
    const { container } = render(<KenyaDivider />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('viewBox')).toBeNull();
  });

  test('does not force a non-uniform aspect ratio', () => {
    // `preserveAspectRatio="none"` was what stretched each tile sideways.
    const { container } = render(<KenyaDivider />);
    expect(container.querySelector('svg')!.getAttribute('preserveAspectRatio')).not.toBe('none');
  });

  test('the pattern tile carries both flag colours and the ochre baseline', () => {
    const { container } = render(<KenyaDivider variant="bold" />);
    expect(container.querySelector('.fill-kenya-green-500')).not.toBeNull();
    expect(container.querySelector('.fill-kenya-red-500')).not.toBeNull();
    // The baseline the component's docstring has always promised.
    expect(container.querySelector('.fill-kenya-ochre')).not.toBeNull();
  });

  test('both variants render at their own height', () => {
    const thin = render(<KenyaDivider variant="thin" />).container.querySelector('svg')!;
    const bold = render(<KenyaDivider variant="bold" />).container.querySelector('svg')!;
    expect(parseInt(thin.style.height, 10)).toBeLessThan(parseInt(bold.style.height, 10));
  });

  test('it is decoration, and says so to assistive tech', () => {
    const { container } = render(<KenyaDivider />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBe('presentation');
  });
});
