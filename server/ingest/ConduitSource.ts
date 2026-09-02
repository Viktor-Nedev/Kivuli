import type { ConduitSource } from './types.js';
import { CsvAdapter, defaultCsvPath } from './adapters/csvAdapter.js';
import { ApiAdapter } from './adapters/apiAdapter.js';

export type { ConduitSource, Reading, Provenance, Tagged } from './types.js';

/**
 * Picks the station source from the environment.
 *
 * Both CONDUIT_API_KEY and CONDUIT_EMAIL must be set to go live — data.php
 * authenticates on the pair. Anything less falls back to the bundled CSV, so
 * a clean clone runs with no configuration.
 */
export function createConduitSource(root: string): ConduitSource {
  const key = process.env.CONDUIT_API_KEY?.trim();
  const email = process.env.CONDUIT_EMAIL?.trim();

  if (key && email) return new ApiAdapter(key, email);
  return new CsvAdapter(defaultCsvPath(root));
}
