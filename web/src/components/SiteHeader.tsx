import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { KenyaDivider } from './KenyaDivider';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/timeline', label: 'Working day' },
  { to: '/station', label: 'Station' },
  { to: '/shade-map', label: 'Shade map' },
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
    <header className="relative flex min-h-[62vh] flex-col justify-end overflow-hidden bg-shade-900 sm:min-h-[58vh]">
      {/* The photo is 1.905:1, so `object-cover` only crops on portrait-ish
          viewports: a 1440x900 laptop shows the full frame, a 390x844 phone
          shows about 39% of its height. `38%` biases the visible band upward
          to 14-53%, which keeps every standing figure's face intact — the
          default `50%` would show 30-70% and cut their heads off. The two
          kneeling figures (around 65-75%) are unavoidably lost on phones. */}
      <img
        src="/hero-community.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-[50%_38%]"
      />
      {/* Dark scrim so the title and nav stay legible over any part of the photo. */}
      <div className="absolute inset-0 bg-gradient-to-t from-shade-900 via-shade-900/70 to-shade-900/30" />
      <div className="absolute inset-0 bg-shade-900/25" />

      <div className="relative flex flex-col items-center px-5 pb-10 text-center sm:px-8 sm:pb-14">
        {/* Mask reveal: the outer div clips at the baseline, the inner h1
            starts a full line below it and rides up. `pb-[0.12em]` gives the
            clip enough room that the text-shadow (moved onto the h1, so it
            travels with the glyphs) isn't sliced flat along the bottom edge.
            `leading-[0.9]` matters too — Archivo Black's default leading
            leaves a gap under the caps, so with normal leading the word
            would already be partly visible before the rise begins. */}
        <div className="overflow-hidden pb-[0.12em]">
          <h1
            className="animate-wordmark-rise font-wordmark text-5xl leading-[0.9] tracking-tight text-bleach sm:text-7xl"
            style={{ textShadow: '0 2px 24px rgba(11,18,32,0.6)' }}
          >
            KIVULI
          </h1>
        </div>
        <p
          className="animate-title-in-delayed mt-3 max-w-md text-sm text-bleach/90 sm:text-base"
          style={{ textShadow: '0 1px 10px rgba(11,18,32,0.9)' }}
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

        <SiteNav className="animate-title-in-delayed mt-8 justify-center" />
      </div>

      <KenyaDivider variant="bold" className="relative" />
    </header>
  );
}

/** The route links, shared by both header variants. */
function SiteNav({ className = '' }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap gap-x-6 gap-y-2 ${className}`}>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={'end' in item ? item.end : false}
          className={({ isActive }) =>
            `relative pb-1 font-display text-sm uppercase tracking-[0.2em] transition-colors after:absolute after:-bottom-[1px] after:left-0 after:h-[2px] after:rounded-full after:bg-kenya-green-400 after:transition-all after:duration-300 ${
              isActive
                ? 'text-kenya-green-400 after:w-full'
                : 'text-shade-200 after:w-0 hover:text-bleach hover:after:w-full hover:after:bg-shade-400'
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
      {/* Stacks below `sm`: the five tracked-out links plus the wordmark are
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
