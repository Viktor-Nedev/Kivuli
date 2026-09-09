import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTip, alignFor } from './DataTip';

/**
 * The defect this component exists to fix is that `title=` shows nothing on a
 * phone. These tests pin the parts that make it work there: the trigger is
 * reachable, the popover opens on states a touch device can actually produce,
 * and the plain-text fallback never degrades to "[object Object]".
 */

describe('DataTip', () => {
  test('the trigger is keyboard reachable', () => {
    render(
      <DataTip label="measured">
        <span>tag</span>
      </DataTip>,
    );
    expect(screen.getByText('tag').closest('[tabindex]')).toHaveAttribute('tabindex', '0');
  });

  test('the popover opens on touch, not only on hover', () => {
    render(
      <DataTip label="measured" detail="Read by an instrument.">
        <span>tag</span>
      </DataTip>,
    );
    const tip = screen.getByRole('tooltip');
    // group-active is the touch fix: without it a tap produces nothing, which
    // is the exact failure that made the native title attribute useless here.
    expect(tip.className).toContain('group-active:block');
    expect(tip.className).toContain('group-hover:block');
    expect(tip.className).toContain('group-focus-within:block');
  });

  test('a string detail is carried into the native title fallback', () => {
    render(
      <DataTip label="measured" detail="Read by an instrument.">
        <span>tag</span>
      </DataTip>,
    );
    expect(screen.getByText('tag').closest('[title]')).toHaveAttribute(
      'title',
      'measured — Read by an instrument.',
    );
  });

  test('a rich detail never stringifies into [object Object]', () => {
    render(
      <DataTip
        label="measured"
        detail={<strong>Read by an instrument.</strong>}
        detailText="Read by an instrument."
      >
        <span>tag</span>
      </DataTip>,
    );
    const title = screen.getByText('tag').closest('[title]')?.getAttribute('title') ?? '';
    expect(title).toBe('measured — Read by an instrument.');
    expect(title).not.toContain('object Object');
  });

  test('a rich detail with no detailText falls back to the label alone', () => {
    // Dropping the detail is correct; stringifying it is not.
    render(
      <DataTip label="measured" detail={<strong>rich</strong>}>
        <span>tag</span>
      </DataTip>,
    );
    const title = screen.getByText('tag').closest('[title]')?.getAttribute('title') ?? '';
    expect(title).toBe('measured');
    expect(title).not.toContain('object Object');
  });

  test('align anchors the popover so edge items are not clipped', () => {
    const { rerender } = render(
      <DataTip label="x" align="end">
        <span>t</span>
      </DataTip>,
    );
    expect(screen.getByRole('tooltip').className).toContain('right-0');

    rerender(
      <DataTip label="x" align="start">
        <span>t</span>
      </DataTip>,
    );
    expect(screen.getByRole('tooltip').className).toContain('left-0');
  });
});

describe('alignFor', () => {
  test('anchors the first and last few items inward', () => {
    // A centred popover on bar 0 of 24 would hang off the left edge.
    expect(alignFor(0, 24)).toBe('start');
    expect(alignFor(2, 24)).toBe('start');
    expect(alignFor(12, 24)).toBe('center');
    expect(alignFor(23, 24)).toBe('end');
    expect(alignFor(21, 24)).toBe('end');
  });

  test('a short row is all edges and no centre', () => {
    // With 4 items every one is within 3 of an end; none should be centred
    // off the side of the chart.
    const alignments = [0, 1, 2, 3].map((i) => alignFor(i, 4));
    expect(alignments).not.toContain('center');
  });
});
