import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { KenyaDivider } from './KenyaDivider';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/timeline', label: 'Working day' },
  { to: '/station', label: 'Station' },
  { to: '/shade-map', label: 'Shade map' },
  { to: '/climate', label: 'Season' },
  { to: '/validation', label: 'Model check' },
  { to: '/calibration', label: 'Calibration' },
] as const;

/**
 * Full-bleed photo header: the site's own image (Maasai community, JKUAT
 * region) sits behind a centered, animated title — the "front door" that was
 * previously just plain text inside the same narrow column as every other
 * page section. Rendered outside the app's width-constrained `<main>` so it
 * can genuinely reach the browser's edges rather than fighting an inherited
 * max-width via negative margins.
 */
export function SiteHeader({
  subtitle,
  compact = false,
}: {
  subtitle?: string;
  /**
   * Collapses the photo band to a slim nav bar. Used by the shade map, whose
   * whole point is a viewport-height map: with the full 62vh header above it
   * the map opened mostly off-screen and had to be scrolled to, which is the
   * opposite of "full screen". Navigation stays, the photo goes.
   */
  compact?: boolean;
}) {
  if (compact) return <CompactHeader />;

  return (
    // The header is sized by the photograph, not by the viewport: `aspect-[3/2]`
    // is kenya.jpg's own ratio, so the box is always exactly the shape of the
    // image and `object-cover` has nothing left to crop. The whole frame shows
    // — sun, horizon and the walking figure — at every width.
    //
    // No `max-h` cap, deliberately. Capping the height would make the box wider
    // than 3:2 and letterbox the photo: 99px of empty ground either side at
    // 1440, 215px at 1920. The point of this change was to remove empty space,
    // so the header is simply as tall as the picture needs, and the nav sits
    // just below the fold on a laptop.
    <header className="relative flex aspect-[3/2] w-full flex-col justify-end overflow-hidden bg-shade-950">
      <img
        src="/kenya.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Three layers rather than two flat scrims.

          The vertical gradient seats the type. The accent wash tints the photo
          into the same light the rest of the page sits in, so the header reads
          as part of the product instead of a stock image dropped on top. The
          vignette closes the corners so the eye lands on the wordmark. */}
      <div className="absolute inset-0 bg-gradient-to-t from-shade-950 via-shade-900/80 to-shade-900/25" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_118%,rgba(185,96,60,0.32),transparent_62%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(5,5,9,0.55)_100%)]" />

      <div className="relative flex flex-col items-center px-5 pb-10 text-center sm:px-8 sm:pb-14">
        {/* The wordmark is branding, not this page's heading. It renders on
            every route, so as an <h1> it gave every page two — and made the
            document outline say "KIVULI" where it should say what the page is
            about. A <p> with the same classes is byte-identical on screen.

            Mask reveal: the outer div clips at the baseline, the inner element
            starts a full line below it and rides up. `pb-[0.12em]` gives the
            clip enough room that the text-shadow (moved onto the wordmark, so it
            travels with the glyphs) isn't sliced flat along the bottom edge.
            `leading-[0.9]` matters too — Archivo Black's default leading
            leaves a gap under the caps, so with normal leading the word
            would already be partly visible before the rise begins. */}
        <div className="overflow-hidden pb-[0.12em]">
          <p
            className="animate-wordmark-rise text-gradient font-wordmark text-6xl leading-[0.9] tracking-tight sm:text-8xl"
          >
            KIVULI
          </p>
        </div>
        <p
          className="animate-title-in-delayed mt-4 max-w-md text-base text-shade-200 sm:text-lg"
          style={{ textShadow: '0 1px 12px rgba(5,5,9,0.9)' }}
        >
          Field decisions from the JKUAT Conduit station, Juja
        </p>
        {/* `text-shade-400` (#4a5f86) is the palette's dimmest ink and was
            effectively invisible here — the scrim is weakest at the top of
            the gradient, and this line lands over the photo's bright sky.
            Stepped up to shade-200 with its own shadow so it stays readable
            over whichever band of the photo the viewport happens to crop to. */}
        {subtitle && (
          <p
            className="animate-title-in-delayed mt-1 text-xs text-shade-200 sm:text-sm"
            style={{ textShadow: '0 1px 8px rgba(11,18,32,0.9)' }}
          >
            {subtitle}
          </p>
        )}

        <SiteNav className="animate-title-in-delayed mt-9" />
      </div>

      <KenyaDivider variant="bold" className="relative" />
    </header>
  );
}

/** The route links, shared by both header variants. */
function SiteNav({ className = '' }: { className?: string }) {
  return (
    // A floating glass pill rather than a row of bare links. The active route
    // gets a filled chip inside it, so "where am I" is a shape rather than a
    // colour difference a reader has to hunt for.
    <nav
      className={`glass glass-edge flex flex-wrap items-center justify-center gap-1 rounded-full px-2 py-1.5 ${className}`}
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={'end' in item ? item.end : false}
          className={({ isActive }) =>
            `relative rounded-full px-3 py-1.5 font-display text-xs tracking-[0.08em] transition-all duration-300 sm:text-sm ${
              isActive
                ? 'bg-[rgb(255_240_226_/_0.13)] text-bleach shadow-[0_2px_12px_-4px_rgba(12,9,7,0.8)]'
                : 'text-shade-200 hover:bg-[rgb(255_240_226_/_0.07)] hover:text-bleach'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Slim variant: wordmark and nav on one line, no photo. Keeps the same links
 * and the same Kenya divider so the site still reads as one piece, while
 * leaving the viewport to the page below it.
 */
function CompactHeader() {
  const ref = useRef<HTMLElement>(null);

  // Publishes its own rendered height as `--site-header-h` so a full-height
  // page below can size itself to the remaining viewport. Measured rather
  // than hardcoded: the bar wraps to two lines on narrow screens, so its
  // height is not a constant.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => {
      document.documentElement.style.setProperty('--site-header-h', `${el.offsetHeight}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--site-header-h');
    };
  }, []);

  return (
    <header ref={ref} className="relative bg-shade-900">
      {/* Stacks below `sm`: the the tracked-out links plus the wordmark are
          wider than a 390px phone, so side-by-side clipped the last item.
          One row from `sm` up, where they fit. */}
      <div className="flex flex-col gap-y-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-x-8 sm:px-8">
        <NavLink to="/" className="font-wordmark text-xl tracking-tight text-bleach">
          KIVULI
        </NavLink>
        <SiteNav className="gap-x-5 sm:justify-end sm:gap-x-6" />
      </div>
      <KenyaDivider variant="bold" className="relative" />
    </header>
  );
}
