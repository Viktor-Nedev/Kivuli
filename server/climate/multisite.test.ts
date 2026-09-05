import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OpenMeteoClient, SITE, siteKey, type Site } from '../forecast/openMeteo.js';

/**
 * Guards the two ways multi-site can fail silently.
 *
 * Both were identified before the feature was written, and both produce a
 * confident wrong answer rather than an error — which is exactly the failure
 * mode this project exists to avoid. They are tested first for that reason.
 *
 *  1. A cache key that omits the site lets one town serve another's rainfall
 *     history. The page would render a percentile with full provenance
 *     tagging and be wrong.
 *  2. A prune that is not scoped to one site deletes the committed JKUAT
 *     snapshot the moment anyone views a second town, taking the offline
 *     demo with it.
 */

const GARISSA: Site = { latitude: -0.4536, longitude: 39.6461, timezone: 'Africa/Nairobi' };
const KISUMU: Site = { latitude: -0.0917, longitude: 34.768, timezone: 'Africa/Nairobi' };

async function tempCache(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'kivuli-cache-'));
}

/** Writes a cache entry in the shape `cached()` reads back. */
async function seed(dir: string, key: string, body: unknown): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${key}.json`), JSON.stringify({ at: Date.now(), body }));
}

function archiveBody(mmPerDay: number) {
  const time: string[] = [];
  const precipitation_sum: number[] = [];
  const et0: number[] = [];
  for (let d = 1; d <= 28; d++) {
    time.push(`2026-02-${String(d).padStart(2, '0')}`);
    precipitation_sum.push(mmPerDay);
    et0.push(4);
  }
  return { daily: { time, precipitation_sum, et0_fao_evapotranspiration: et0 } };
}

test('sites with different coordinates get different cache keys', () => {
  assert.notEqual(siteKey(SITE), siteKey(GARISSA));
  assert.notEqual(siteKey(GARISSA), siteKey(KISUMU));
});

test('coordinates inside the same ERA5 cell share a key rather than refetching', () => {
  // ~11 m apart. The grid is ~9 km, so these are the same cell and must not
  // produce two downloads of identical data.
  const a: Site = { ...SITE, latitude: SITE.latitude + 0.0001 };
  assert.equal(siteKey(a), siteKey(SITE));
});

test('one location cannot serve another location history', async () => {
  const dir = await tempCache();

  // Two pre-seeded caches with deliberately different rainfall, so a mix-up
  // is unmissable rather than subtle.
  const start = '2026-02-01';
  const end = '2026-02-28';
  await seed(dir, `daily_${siteKey(SITE)}_${start}_${end}`, archiveBody(1));
  await seed(dir, `daily_${siteKey(GARISSA)}_${start}_${end}`, archiveBody(9));

  const meteo = new OpenMeteoClient(dir);
  const jkuat = await meteo.dailyArchive(start, end, SITE);
  const garissa = await meteo.dailyArchive(start, end, GARISSA);

  assert.equal(jkuat.precipitation_sum[0], 1, 'JKUAT must read its own cache');
  assert.equal(garissa.precipitation_sum[0], 9, 'Garissa must read its own cache');
});

test('fetching a new site leaves another site cached snapshot in place', async () => {
  // The committed JKUAT archive is what makes the demo survive a dead venue
  // network. Viewing Garissa must not evict it.
  const dir = await tempCache();
  const start = '2026-02-01';
  const end = '2026-02-28';

  const jkuatKey = `daily_${siteKey(SITE)}_${start}_${end}`;
  await seed(dir, jkuatKey, archiveBody(1));
  await seed(dir, `daily_${siteKey(GARISSA)}_${start}_${end}`, archiveBody(9));

  const meteo = new OpenMeteoClient(dir);
  await meteo.dailyArchive(start, end, GARISSA);

  const files = await readdir(dir);
  assert.ok(
    files.includes(`${jkuatKey}.json`),
    `the JKUAT snapshot was evicted by a Garissa request: ${files.join(', ')}`,
  );
});

test('a superseded snapshot for the same site is pruned', async () => {
  // Keys carry the end date, so a long-running instance would otherwise
  // accumulate one ~90 KB file per day per site.
  const dir = await tempCache();
  const stale = `daily_${siteKey(SITE)}_2026-02-01_2026-02-27`;
  const fresh = `daily_${siteKey(SITE)}_2026-02-01_2026-02-28`;
  await seed(dir, stale, archiveBody(1));
  await seed(dir, fresh, archiveBody(1));

  const meteo = new OpenMeteoClient(dir);
  await meteo.dailyArchive('2026-02-01', '2026-02-28', SITE);

  const files = await readdir(dir);
  assert.ok(files.includes(`${fresh}.json`), 'the active snapshot must survive');
  assert.ok(!files.includes(`${stale}.json`), 'the superseded snapshot should be gone');
});
