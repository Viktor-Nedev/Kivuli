import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/react';
import { KenyaDivider } from './KenyaDivider';

/**
 * This band has twice been reported as looking wrong, and both faults were the
 * same class of thing: geometry that did not survive contact with a real
 * viewport.
 *
 * It was an SVG `<pattern>` inside a viewBox spanning two tiles, so the zigzag
 * repeated exactly twice and each copy stretched across half the screen — the
 * "stops in the middle and starts again" the reviews described. It is now a
 * CSS gradient with nothing to tile, which is why these tests check for the
 * absence of the tiling machinery as much as for what is present.
 */

describe('KenyaDivider', () => {
  test('is drawn in CSS, with nothing that can tile or restart', () => {
    const { container } = render(<KenyaDivider />);
    // No SVG means no viewBox, no pattern, and no way to repeat short of the
    // full width.
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('pattern')).toBeNull();
  });

  test('spans the full width', () => {
    const { container } = render(<KenyaDivider />);
    expect(container.firstElementChild?.className).toContain('w-full');
  });

  test('carries the flag hues, muted into the palette', () => {
    const { container } = render(<KenyaDivider variant="bold" />);
    const band = container.querySelector('[style*="linear-gradient"]');
    const style = band?.getAttribute('style') ?? '';
    // Red and green are present, but as the palette's muted values rather
    // than flag saturation — the earlier hard zigzag read as a warning stripe.
    // Matched as rgb() because jsdom normalises hex when it parses the style
    // attribute; the source is hex.
    expect(style).toContain('rgb(143, 47, 40)'); // #8f2f28, muted flag red
    expect(style).toContain('rgb(63, 107, 70)'); // #3f6b46, muted flag green
    expect(style).toContain('rgb(185, 96, 60)'); // #b9603c, the terracotta accent
  });

  test('the bold variant is thicker and lit, the thin one is a hairline', () => {
    const bold = render(<KenyaDivider variant="bold" />).container;
    const thin = render(<KenyaDivider variant="thin" />).container;

    const boldH = parseInt((bold.firstElementChild as HTMLElement).style.height, 10);
    const thinH = parseInt((thin.firstElementChild as HTMLElement).style.height, 10);
    expect(boldH).toBeGreaterThan(thinH);

    // Only the header's band spills light upward; the footer's stays flat.
    expect(bold.querySelectorAll('[style*="linear-gradient"]').length).toBe(2);
    expect(thin.querySelectorAll('[style*="linear-gradient"]').length).toBe(1);
  });

  test('it is decoration, and says so to assistive tech', () => {
    const { container } = render(<KenyaDivider />);
    const root = container.firstElementChild!;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.getAttribute('role')).toBe('presentation');
  });
});
