import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Section } from './Section';

/**
 * The reason this file exists: `plain` must stay byte-identical to the class
 * string it replaced in eighteen places. If it drifts, every section in the
 * app restyles at once and nothing else fails — which is the worst kind of
 * regression, silent and everywhere.
 */

/** The literal that was copy-pasted across the app before this component. */
const ORIGINAL = 'border-t border-shade-700 py-10 sm:py-12';

describe('Section', () => {
  test('plain reproduces the original class string exactly', () => {
    const { container } = render(
      <Section title="Rainfall standing">
        <p>body</p>
      </Section>,
    );
    expect(container.querySelector('section')?.className).toBe(ORIGINAL);
  });

  test('the heading is rendered in the house style', () => {
    render(
      <Section title="Rainfall standing">
        <p>body</p>
      </Section>,
    );
    const h2 = screen.getByRole('heading', { level: 2, name: 'Rainfall standing' });
    // Uppercase tracked display type is the convention every section shared.
    expect(h2.className).toContain('font-display');
    expect(h2.className).toContain('uppercase');
    expect(h2.className).toContain('tracking-[0.2em]');
  });

  test('an untitled section renders no heading row at all', () => {
    // Not an empty <h2>, which would put a blank entry in the outline.
    render(
      <Section>
        <p>body</p>
      </Section>,
    );
    expect(screen.queryByRole('heading')).toBeNull();
  });

  test('raised carries the ochre hairline and no top rule', () => {
    const { container } = render(
      <Section tone="raised" title="Conclusion">
        <p>body</p>
      </Section>,
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('ring-1');
    // A raised block sits on the page; a top border would fight the ring.
    expect(section?.className).not.toContain('border-t');
    // Attribute match rather than a class selector: the "/" in a Tailwind
    // opacity modifier needs CSS escaping that jsdom's parser rejects.
    expect(container.querySelector('[class*="bg-kenya-ochre/40"]')).not.toBeNull();
  });

  test('the aside sits on the title row', () => {
    render(
      <Section title="Rainfall standing" aside={<span>2015–2026</span>}>
        <p>body</p>
      </Section>,
    );
    const heading = screen.getByRole('heading', { level: 2 });
    const aside = screen.getByText('2015–2026');
    expect(heading.parentElement).toBe(aside.parentElement);
  });
});
