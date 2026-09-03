/**
 * JKUAT main campus, Juja. Mirrors server/forecast/openMeteo.ts's SITE — kept
 * separate rather than imported across the server/web boundary, since Vite
 * bundles this file for the browser and the server module pulls in Node's
 * fs/path.
 */
export const SITE = { latitude: -1.0954, longitude: 37.0144, timezone: 'Africa/Nairobi' } as const;
