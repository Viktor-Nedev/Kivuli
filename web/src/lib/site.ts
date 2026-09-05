/**
 * JKUAT main campus, Juja. Mirrors server/forecast/openMeteo.ts's SITE — kept
 * separate rather than imported across the server/web boundary, since Vite
 * bundles this file for the browser and the server module pulls in Node's
 * fs/path.
 */
export const SITE = { latitude: -1.0954, longitude: 37.0144, timezone: 'Africa/Nairobi' } as const;

/** A location the Season page can report rainfall history for. */
export interface SiteOption {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  /** One line on why this place is worth comparing. */
  note: string;
}

/**
 * Curated locations for the Season page.
 *
 * ERA5 covers all of Kenya, and the API accepts any in-country coordinate, so
 * this list is a convenience rather than a limit. It exists because typing
 * coordinates at a demo is worse than clicking a name, and because these five
 * span genuinely different rainfall regimes — the whole point of being able to
 * change location is that the answer changes with it.
 *
 * Mombasa is deliberately absent. Coastal rainfall does not follow the same
 * bimodal MAM/OND pattern the onset rule assumes, so its onset figures would
 * need an asterisk. A shorter defensible list beats a longer one with a
 * caveat.
 */
export const SITE_OPTIONS: SiteOption[] = [
  {
    id: 'jkuat',
    label: 'JKUAT, Juja',
    latitude: SITE.latitude,
    longitude: SITE.longitude,
    note: 'The station site. The only one with a physical sensor.',
  },
  {
    id: 'nakuru',
    label: 'Nakuru',
    latitude: -0.3031,
    longitude: 36.08,
    note: 'Rift Valley cropland.',
  },
  {
    id: 'kisumu',
    label: 'Kisumu',
    latitude: -0.0917,
    longitude: 34.768,
    note: 'Lake Victoria basin — the wettest of these.',
  },
  {
    id: 'eldoret',
    label: 'Eldoret',
    latitude: 0.5143,
    longitude: 35.2698,
    note: 'High-altitude grain country.',
  },
  {
    id: 'garissa',
    label: 'Garissa',
    latitude: -0.4536,
    longitude: 39.6461,
    note: 'Semi-arid north-east — a far drier baseline.',
  },
];

export const DEFAULT_SITE_ID = 'jkuat';
