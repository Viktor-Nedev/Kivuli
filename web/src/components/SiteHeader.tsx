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
export function SiteHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="relative flex min-h-[52vh] flex-col justify-end overflow-hidden bg-shade-900 sm:min-h-[58vh]">
      {/* Blurred cover copy fills the frame behind the letterboxed edges, so
          object-contain (which shows the photo uncropped) never leaves flat
          empty bars — the same photo, softened, reads as an intentional mat. */}
      <img
        src="/hero-community.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
      />
      <img
        src="/hero-community.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-contain"
      />
      {/* Dark scrim so the title and nav stay legible over any part of the photo. */}
      <div className="absolute inset-0 bg-gradient-to-t from-shade-900 via-shade-900/70 to-shade-900/30" />
      <div className="absolute inset-0 bg-shade-900/25" />

      <div className="relative flex flex-col items-center px-5 pb-10 text-center sm:px-8 sm:pb-14">
        <h1
          className="animate-title-in font-display text-5xl tracking-tight text-bleach sm:text-7xl"
          style={{ textShadow: '0 2px 24px rgba(11,18,32,0.6)' }}
        >
          KIVULI
        </h1>
        <p className="animate-title-in-delayed mt-3 max-w-md text-sm text-shade-200 sm:text-base">
          Field decisions from the JKUAT Conduit station, Juja
        </p>
        {subtitle && (
          <p className="animate-title-in-delayed mt-1 text-xs text-shade-400 sm:text-sm">{subtitle}</p>
        )}

        <nav className="animate-title-in-delayed mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2">
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
      </div>

      <KenyaDivider variant="bold" className="relative" />
    </header>
  );
}
