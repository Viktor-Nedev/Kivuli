import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { setScrollLocked } from '../lib/useSmoothScroll';

/**
 * The navigation, below `sm`.
 *
 * Seven links do not fit on a phone. Measured at 390px, the desktop bar is
 * 525px wide, and because the header clips its overflow the last two routes --
 * "Model check" and "Calibration" -- were not merely awkward to reach, they
 * were impossible: no scroll, no wrap, nothing to tap. This exists to make
 * every route reachable.
 *
 * It is deliberately a real disclosure widget rather than a styled checkbox:
 * once a menu covers the page it owns focus, the Escape key and the background
 * scroll, and getting those wrong is what makes a mobile menu feel broken.
 */
export function MobileNav({
  items,
}: {
  items: readonly { to: string; label: string; end?: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Navigating is the one case where the menu must close without returning
  // focus to the trigger: the user is now on a new page, and pulling focus
  // back to a button in the header would drop them above the content they
  // just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // The page behind a full-screen panel must not scroll with it.
  useEffect(() => {
    setScrollLocked(open);
    return () => setScrollLocked(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    // The first *link*, not the first focusable node -- that is the close
    // button, and landing on "Close" announces the way out of a menu the user
    // has just deliberately opened. Tab reaches close from here anyway.
    panel?.querySelector<HTMLElement>('a')?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;

      // Keep Tab inside the panel: with the rest of the page still in the
      // DOM behind it, tabbing out would walk invisible links.
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div className="sm:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label={open ? 'Close menu' : 'Menu'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (!next) triggerRef.current?.focus();
        }}
        // 44x44 is the smallest reliably tappable target; the bar's own links
        // were 28px tall, which is why they were easy to miss.
        className="glass glass-edge relative flex h-11 w-11 items-center justify-center"
        style={{ transform: 'skewX(-12deg)' }}
      >
        {/* Three rules that become a cross. Transform-only, so the global
            reduced-motion rule zeroes it without this needing to ask. */}
        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        <span aria-hidden className="block h-3.5 w-5" style={{ transform: 'skewX(12deg)' }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute block h-px w-5 bg-bleach transition-transform duration-300"
              style={{
                top: `calc(50% + ${(i - 1) * 6}px)`,
                transform: open
                  ? i === 1
                    ? 'scaleX(0)'
                    : `translateY(${(1 - i) * 6}px) rotate(${i === 0 ? 45 : -45}deg)`
                  : 'none',
                opacity: open && i === 1 ? 0 : 1,
              }}
            />
          ))}
        </span>
      </button>

      {open && (
        <>
          {/* A tap anywhere off the panel closes it. Not `fixed inset-0` behind
              the panel alone -- the panel sits inside this stacking context, so
              the scrim goes under it and the panel stays clickable. */}
          <div
            className="fixed inset-0 z-40 bg-shade-950/70"
            aria-hidden
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
          />
          <div
            id={panelId}
            ref={panelRef}
            className="glass-strong fixed inset-x-3 top-3 z-50 rounded-2xl p-2"
          >
            {/* The panel opens over the trigger that spawned it, so without
                this there is no visible way back -- only Escape, which a
                phone does not have, or a tap on the scrim, which is not
                signposted. This is the affordance; the scrim and Escape stay
                as shortcuts for people who expect them. */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-shade-200 transition-colors duration-200 hover:text-bleach"
              >
                <span aria-hidden className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>
            <nav aria-label="Site">
              <ul className="flex flex-col">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end ?? false}
                      className={({ isActive }) =>
                        `flex min-h-[44px] items-center rounded-xl px-4 font-display text-base tracking-[0.06em] transition-colors duration-200 ${
                          isActive
                            ? 'bg-[rgb(255_240_226_/_0.14)] text-bleach'
                            : 'text-shade-200 hover:text-bleach'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
