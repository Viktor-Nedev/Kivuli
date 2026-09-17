import type { ConduitSource } from './types.js';
import { ApiAdapter } from './adapters/apiAdapter.js';
import { GeoCsvAdapter, defaultGeoCsvDir } from './adapters/geoCsvAdapter.js';

export type { ConduitSource, Reading, Provenance, Tagged } from './types.js';

/**
 * Picks the station source from the environment.
 *
 * Both CONDUIT_API_KEY and CONDUIT_EMAIL must be set to go live — data.php
 * authenticates on the pair. Anything less reads the station's official GeoCSV
 * exports from `data/conduit/`, so a clean clone runs with no configuration.
 *
 * The exports are not a mock. They are the same instrument's record, published
 * through the CHORDS portal with a DOI, covering 13 days at roughly one
 * reading a minute — the API would serve the same numbers with a shorter
 * latency, and it was not available before the deadline.
 */
export function createConduitSource(root: string): ConduitSource {
  const key = process.env.CONDUIT_API_KEY?.trim();
  const email = process.env.CONDUIT_EMAIL?.trim();

  if (key && email) return new ApiAdapter(key, email);
  return new GeoCsvAdapter(defaultGeoCsvDir(root));
}
