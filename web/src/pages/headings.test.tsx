import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Every route gets exactly one <h1>, and it says what the page is about.
 *
 * This is a source-level check rather than a render test on purpose. Rendering
 * the routed app would need every API endpoint mocked, and the regression this
 * guards against is structural: an <h1> added to shared chrome, or a page
 * shipped without one. Both are visible in the source and neither depends on
 * runtime data.
 *
 * The specific bug that motivated it: the KIVULI wordmark in SiteHeader was an
 * <h1>, and SiteHeader renders on every route — so the moment the pages grew
 * their own headings, every page had two, and the document outline announced
 * the site name where it should have announced the page.
 */

const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(here, '..', 'components');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * Counts headings a page renders at level 1, ignoring comments.
 *
 * Two forms count: a literal `<h1`, and `as="h1"` on a component that renders
 * the tag it is given — `AnimatedText` splits a headline into per-word spans,
 * so the page source no longer contains the literal tag even though the DOM
 * does.
 */
function countH1(source: string): number {
  const withoutComments = source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const literal = (withoutComments.match(/<h1[\s>]/g) ?? []).length;
  const polymorphic = (withoutComments.match(/as=['"]h1['"]/g) ?? []).length;
  return literal + polymorphic;
}

/** Page module -> the components it defers its heading to, if any. */
const PAGES: Record<string, string[]> = {
  'Overview.tsx': [],
  'TimelinePage.tsx': [],
  'StationPage.tsx': [],
  'ClimatePage.tsx': [],
  'CalibrationPage.tsx': [],
  // These two render their h1 inside the component that owns the page body.
  'ValidationPage.tsx': ['ValidationPanel.tsx'],
  'ShadeMapPage.tsx': ['ShadeMap.tsx'],
};

describe('heading structure', () => {
  test('every page module is covered by this test', () => {
    // So a new route cannot quietly ship without a heading check.
    const actual = readdirSync(here)
      .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
      .sort();
    expect(actual).toEqual(Object.keys(PAGES).sort());
  });

  test.each(Object.entries(PAGES))('%s reaches exactly one h1 on any path', (page, delegates) => {
    // Pages guard on load state and return early, so several h1s can appear in
    // one file while only ever one renders. What must hold is that every path
    // reaches one: at least one h1 exists, and none of the sources is empty.
    const sources = [read(join(here, page)), ...delegates.map((c) => read(join(componentsDir, c)))];
    const counts = sources.map(countH1);

    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    // A page that delegates must not also render its own heading alongside the
    // delegate's — only instead of it, from a branch that returns early.
    if (delegates.length && counts[0] > 0) {
      const source = sources[0];
      const beforeFirstH1 = source.slice(0, source.search(/<h1[\s>]/));
      expect(beforeFirstH1).toMatch(/return\s*\(/);
    }
  });

  test('shared chrome carries no h1 of its own', () => {
    // SiteHeader renders on every route. An h1 here is an h1 on all seven
    // pages at once, which is what broke the outline before.
    for (const chrome of ['SiteHeader.tsx', 'SiteFooter.tsx']) {
      expect(countH1(read(join(componentsDir, chrome)))).toBe(0);
    }
  });

  test('the shade map keeps a heading even though it renders none visibly', () => {
    // The map fills the viewport, so its h1 is sr-only rather than absent —
    // a route with no h1 at all is unnavigable by heading.
    const source = read(join(componentsDir, 'ShadeMap.tsx'));
    expect(source).toMatch(/<h1 className="sr-only">/);
  });
});
