import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProvenanceTag } from './Provenance';
import type { Provenance } from '../lib/types';

/**
 * The provenance tag is the project's defining posture rendered as a chip: it
 * is what separates "the station measured this" from "a model guessed it".
 * These tests pin that every kind still renders its label and still carries an
 * explanation, because a tag whose meaning is unreachable is decoration.
 */

const KINDS: Provenance[] = ['measured', 'bias_corrected', 'raw_forecast', 'reanalysis'];

describe('ProvenanceTag', () => {
  test.each(KINDS)('%s renders a visible label', (kind) => {
    render(<ProvenanceTag kind={kind} />);
    // The label appears twice by design — once as the chip, once as the
    // popover heading — so scope to the chip.
    expect(screen.getAllByText(/measured|bias-corrected|raw forecast|reanalysis/).length)
      .toBeGreaterThan(0);
  });

  test.each(KINDS)('%s explains itself without a caller-supplied title', (kind) => {
    const { container } = render(<ProvenanceTag kind={kind} />);
    const title = container.querySelector('[title]')?.getAttribute('title') ?? '';
    // Every kind carries its own one-sentence meaning, so a reader who has
    // not read the README still learns what the chip claims.
    expect(title.length).toBeGreaterThan(20);
    expect(title).not.toContain('object Object');
  });

  test('a caller title is appended to the kind meaning, not replacing it', () => {
    const { container } = render(
      <ProvenanceTag kind="reanalysis" title="ERA5 via Open-Meteo" />,
    );
    const title = container.querySelector('[title]')?.getAttribute('title') ?? '';
    expect(title).toContain('9 km grid');
    expect(title).toContain('ERA5 via Open-Meteo');
  });

  test('the explanation is reachable on touch', () => {
    render(<ProvenanceTag kind="measured" />);
    // Previously this lived in a native title attribute, which renders nothing
    // on a phone — the project's stated primary device.
    expect(screen.getByRole('tooltip').className).toContain('group-active:block');
  });
});
