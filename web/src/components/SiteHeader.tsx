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
    // Cropped to 78vh rather than sized to the photograph.
    //
    // At the image's own 3:2 the header ran 107% of viewport height on a
    // laptop and 119% on 16:9, which put the nav below the fold. Trimming the
    // bottom brings it back on screen at every size; `object-[50%_35%]` keeps
    // the band the picture is actually about — sun, horizon and most of the
    // walking figure — inside the crop.
    <header className="relative flex h-[78vh] min-h-[480px] w-full flex-col overflow-hidden bg-shade-950">
      <img
        src="/kenya.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-[50%_35%]"
      />

      {/* Scrims: a base gradient to seat the type, a warm rise from the
          horizon, and a left-weighted wash so the headline has ground to sit
          on now that it is no longer centred. */}
      <div className="absolute inset-0 bg-gradient-to-t from-shade-950 via-shade-950/70 to-shade-950/35" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_118%,rgba(185,96,60,0.3),transparent_62%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(5,5,9,0.82)_0%,rgba(5,5,9,0.45)_42%,transparent_72%)]" />

      {/* Nav first, at the top left — on the same axis as the wordmark below,
          so the two read as one left-hand column rather than as a centred bar
          over a left-aligned title. */}
      <div className="relative px-5 pt-6 sm:px-8 sm:pt-8">
        <div className="mx-auto w-full max-w-5xl">
          <SiteNav className="w-fit" />
        </div>
      </div>

      {/* The title block, left-aligned and pushed to the lower third. */}
      <div className="relative mt-auto px-5 pb-16 sm:px-8 sm:pb-24">
        <div className="mx-auto w-full max-w-5xl">
          {/* Each letter swings up on its own axis and the word is swept once
              by a highlight after it lands. No `overflow-hidden` clip here:
              the letters rotate out of the baseline in 3D rather than sliding
              up behind a mask, and a clip would cut the overshoot.

              `leading-[0.9]` matters — Archivo Black's default leading leaves
              a gap under the caps, which at this size is a visible band of
              nothing between the wordmark and the line below it.

              The wordmark is branding, not the page's heading: as an <h1> it
              gave every route two, and made the document outline say "KIVULI"
              where it should name the page. `aria-label` keeps it one word to
              a screen reader rather than six letters. */}
          <p
            aria-label="KIVULI"
            className="wordmark-stage font-wordmark text-7xl leading-[0.9] tracking-tight sm:text-9xl lg:text-[10rem]"
          >
            {'KIVULI'.split('').map((letter, i) => (
              <span
                key={i}
                aria-hidden="true"
                className="wordmark-letter"
                style={{ '--l': i } as React.CSSProperties}
              >
                {letter}
              </span>
            ))}
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <p
              className="rise-in max-w-xl text-lg text-shade-200 sm:text-xl"
              style={{ '--i': 7, textShadow: '0 1px 14px rgba(5,5,9,0.95)' } as React.CSSProperties}
            >
              Field decisions from the JKUAT Conduit station, Juja
            </p>

            {subtitle && (
              <p
                className="rise-in flex items-center gap-2.5 text-sm text-shade-400"
                style={{ '--i': 9, textShadow: '0 1px 10px rgba(5,5,9,0.95)' } as React.CSSProperties}
              >
                <span className="h-px w-7 bg-accent-400/50" aria-hidden />
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>

      <KenyaDivider variant="bold" className="relative" />
    </header>
  );
}

/** The route links, shared by both header variants. */
function SiteNav({ className = '' }: { className?: string }) {
  return (
    // A floating glass pill rather than a row of bare links. The active route
    // A parallelogram rather than a pill, sheared 12 degrees — the angle of a
    // long shadow, which is the one shape this project is named after. The
    // shear is applied to the bar and to each chip, then undone on the label
    // inside so the type stays upright and readable; skewed text would be the
    // point at which a motif becomes a legibility problem.
    <nav
      className={`glass glass-edge flex items-center justify-center gap-1 px-2 py-1.5 ${className}`}
      style={{ transform: 'skewX(-12deg)' }}
    >
      {NAV_ITEMS.map((item, i) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={'end' in item ? item.end : false}
          // Staggered in from the left, so the bar assembles itself rather
          // than appearing whole.
          style={{ '--i': i + 2 } as React.CSSProperties}
          className={({ isActive }) =>
            `group rise-in relative px-3.5 py-1.5 transition-all duration-300 ${
              isActive
                ? 'bg-[rgb(255_240_226_/_0.14)] shadow-[0_2px_14px_-4px_rgba(12,9,7,0.85)]'
                : 'hover:bg-[rgb(255_240_226_/_0.07)]'
            }`
          }
        >
          {({ isActive }: { isActive: boolean }) => (
            <span
              className={`block font-display text-xs tracking-[0.08em] transition-colors duration-300 sm:text-sm ${
                isActive ? 'text-bleach' : 'text-shade-200 group-hover:text-bleach'
              }`}
              style={{ transform: 'skewX(12deg)' }}
            >
              {item.label}
            </span>
          )}
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
