import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonChart, SkeletonCard, SkeletonBlock } from './Skeleton';

/**
 * A skeleton's job is to say "something specific is coming" without saying
 * anything to a screen reader, which would hear only "rectangle rectangle
 * rectangle". The caption carries the announcement instead. These tests pin
 * that split, because getting it backwards is silent and invisible in review.
 */

describe('Skeleton', () => {
  test('placeholder shapes are hidden from assistive tech', () => {
    const { container } = render(<Skeleton className="h-4 w-1/2" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden');
  });

  test('the shimmer class is applied, so the utility is actually reached', () => {
    // The keyframe existed unused for a long time precisely because nothing
    // defined the background it animates. If this class stops being emitted,
    // the skeleton silently becomes an invisible block.
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild?.className).toContain('shimmer');
  });

  test('a chart skeleton draws the requested number of bars', () => {
    const { container } = render(<SkeletonChart bars={7} />);
    expect(container.querySelectorAll('span.shimmer').length).toBe(7);
  });

  test('bar heights are deterministic, not reshuffled per render', () => {
    // A placeholder that changes shape on every render reads as a glitch.
    const first = render(<SkeletonChart bars={6} />);
    const heightsA = Array.from(first.container.querySelectorAll<HTMLElement>('span')).map(
      (el) => el.style.height,
    );
    first.unmount();

    const second = render(<SkeletonChart bars={6} />);
    const heightsB = Array.from(second.container.querySelectorAll<HTMLElement>('span')).map(
      (el) => el.style.height,
    );
    expect(heightsB).toEqual(heightsA);
    expect(new Set(heightsA).size).toBeGreaterThan(1);
  });

  test('a card skeleton is a single hidden block, not four announced ones', () => {
    const { container } = render(<SkeletonCard />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden');
  });
});

describe('SkeletonBlock', () => {
  test('the caption is what a screen reader hears', () => {
    render(
      <SkeletonBlock caption="Reading eleven years of rainfall records…">
        <SkeletonChart bars={4} />
      </SkeletonBlock>,
    );
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Reading eleven years of rainfall records');
  });

  test('the shapes inside stay hidden while the caption does not', () => {
    render(
      <SkeletonBlock caption="Loading…">
        <SkeletonCard />
      </SkeletonBlock>,
    );
    expect(screen.getByText('Loading…')).not.toHaveAttribute('aria-hidden');
  });
});
