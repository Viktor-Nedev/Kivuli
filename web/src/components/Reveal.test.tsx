import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Reveal } from './Reveal';

/**
 * Reveal has one subtle rule: content already on screen when the page arrives
 * must NOT fade itself, because PageTransition is already fading the whole
 * route. Content scrolled to later must. Getting this backwards either
 * double-fades the first screen or kills the scroll animation everywhere, and
 * neither shows up in a typecheck.
 */

/** Reports intersection immediately, as it does for anything above the fold. */
class ImmediateObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) {
    this.cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
}

/** Never fires on its own — stands in for content below the fold. */
class ManualObserver {
  static last: ManualObserver | null = null;
  private el: Element | null = null;
  constructor(private cb: IntersectionObserverCallback) {
    ManualObserver.last = this;
  }
  observe(el: Element) {
    this.el = el;
  }
  fire() {
    if (this.el) {
      this.cb([{ isIntersecting: true, target: this.el } as IntersectionObserverEntry], this as never);
    }
  }
  unobserve() {}
  disconnect() {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Reveal', () => {
  test('content already on screen does not fade itself', async () => {
    vi.stubGlobal('IntersectionObserver', ImmediateObserver);
    render(
      <Reveal>
        <p>above the fold</p>
      </Reveal>,
    );
    const wrapper = screen.getByText('above the fold').parentElement!;
    await waitFor(() => {
      // No opacity-0 and no transition: PageTransition owns this fade.
      expect(wrapper.className).not.toContain('opacity-0');
      expect(wrapper.className).not.toContain('transition-all');
    });
  });

  test('content scrolled to later animates itself', async () => {
    vi.stubGlobal('IntersectionObserver', ManualObserver);
    render(
      <Reveal>
        <p>below the fold</p>
      </Reveal>,
    );
    const wrapper = screen.getByText('below the fold').parentElement!;
    // Starts hidden, with its transition armed.
    expect(wrapper.className).toContain('opacity-0');
    expect(wrapper.className).toContain('transition-all');

    // Scrolled to well after mount.
    await new Promise((r) => setTimeout(r, 300));
    ManualObserver.last!.fire();

    await waitFor(() => expect(wrapper).toHaveAttribute('data-visible'));
    // Still the animating variant — this one earned its fade.
    expect(wrapper.className).toContain('transition-all');
  });

  test('a custom className survives both paths', async () => {
    vi.stubGlobal('IntersectionObserver', ImmediateObserver);
    render(
      <Reveal className="mt-8">
        <p>x</p>
      </Reveal>,
    );
    await waitFor(() => {
      expect(screen.getByText('x').parentElement!.className).toContain('mt-8');
    });
  });
});
