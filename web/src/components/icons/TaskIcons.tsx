/**
 * Task icons for the Overview decision cards.
 *
 * Hand-drawn rather than pulled from an icon set: neither of the common
 * libraries ships a spray-nozzle glyph, so a dependency would buy one usable
 * icon out of two. Both use `stroke="currentColor"`, so a card tints its icon
 * by putting the status colour on `className` — reusing the existing ACCENT
 * map instead of introducing a second source of status colour.
 */

const BASE =
  'h-6 w-6 shrink-0' as const;

function iconProps(className: string) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    role: 'presentation' as const,
    className: `${BASE} ${className}`,
  };
}

/** Nozzle with a spreading cone of droplets. */
export function SprayIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      {/* Bottle body */}
      <path d="M8 21h6a1 1 0 0 0 1-1v-6a3 3 0 0 0-3-3h-2a3 3 0 0 0-3 3v6a1 1 0 0 0 1 1Z" />
      {/* Neck and trigger head */}
      <path d="M10 11V8h3V6h-3" />
      <path d="M13 6h3l1.5 2" />
      {/* Droplet spray, widening away from the nozzle */}
      <path d="M19 6.5h.01M20.5 9h.01M19 11.5h.01M21.5 5h.01M22 12.5h.01" />
    </svg>
  );
}

/** Sun over grain heads — the two things the drying window depends on. */
export function DryingIcon({ className = '' }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      {/* Sun */}
      <circle cx="12" cy="7" r="3" />
      <path d="M12 1.5v1.5M12 11v1M17.5 7h-1.5M8 7H6.5M15.9 3.1l-1 1M9.1 9.9l-1 1M15.9 10.9l-1-1M9.1 4.1l-1-1" />
      {/* Grain heads */}
      <path d="M7 22v-5M12 22v-6M17 22v-5" />
      <path d="M7 17c-1.2 0-2-.8-2-2 1.2 0 2 .8 2 2Zm0 0c1.2 0 2-.8 2-2-1.2 0-2 .8-2 2Z" />
      <path d="M17 17c-1.2 0-2-.8-2-2 1.2 0 2 .8 2 2Zm0 0c1.2 0 2-.8 2-2-1.2 0-2 .8-2 2Z" />
    </svg>
  );
}
