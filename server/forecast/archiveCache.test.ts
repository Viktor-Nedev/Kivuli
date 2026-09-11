import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OpenMeteoClient, SITE } from './openMeteo.js';

/**
 * The offline snapshot must survive a dead network.
 *
 * `data/cache/daily_-1.095_37.014_*.json` is whitelisted in .gitignore
 * specifically so a bad venue network cannot empty the Season page. It was
 * being deleted by exactly that scenario.
 *
 * The archive key carries today's date in Nairobi, so it changes at local
 * midnight and the committed snapshot always sits under an older one. The
 * pruner ran *before* the fetch, so on a dead network the sequence was:
 * delete every older snapshot, try the network, fail, look for a stale entry
 * under today's key — which had never been written. One page load destroyed
 * the asset permanently, and the Season page stayed broken even after
 * connectivity came back.
 *
 * These tests pin both halves of the fix: prune only after a successful
 * fetch, and fall back to any snapshot for the site rather than only today's.
 */

async function fixture(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'kivuli-cache-'));
  await mkdir(dir, { recursive: true });
  return dir;
}

/** A snapshot under an older date, standing in for the committed one. */
async function seedOldSnapshot(dir: string, date: string, days = 4270): Promise<string> {
  const name = `daily_-1.095_37.014_2015-01-01_${date}.json`;
  await writeFile(
    path.join(dir, name),
    JSON.stringify({
      at: 0, // long expired, so the TTL path cannot be what rescues it
      body: { daily: { time: Array.from({ length: days }, (_, i) => `d${i}`) } },
    }),
  );
  return name;
}

function severNetwork(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('ENETUNREACH (simulated venue network)');
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function stubNetwork(days: number): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ daily: { time: Array.from({ length: days }, (_, i) => `n${i}`) } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

test('a dead network does not delete the committed offline snapshot', async () => {
  const dir = await fixture();
  const seeded = await seedOldSnapshot(dir, '2026-09-09');
  const restore = severNetwork();
  try {
    const client = new OpenMeteoClient(dir);
    // Today's key is a different filename from the seeded one, which is the
    // condition that used to make this destructive.
    await client.dailyArchive('2015-01-01', '2026-09-17', SITE);
  } finally {
    restore();
  }

  const left = (await readdir(dir)).filter((n) => n.startsWith('daily_-1.095'));
  assert.deepEqual(left, [seeded], 'the snapshot must still be on disk');
});

test('a dead network still returns the history, from the older snapshot', async () => {
  const dir = await fixture();
  await seedOldSnapshot(dir, '2026-09-09', 4270);
  const restore = severNetwork();
  try {
    const client = new OpenMeteoClient(dir);
    const daily = await client.dailyArchive('2015-01-01', '2026-09-17', SITE);
    // Eleven years of rainfall, a day or two stale. That is what a
    // climatology can absorb; an empty page is not.
    assert.equal(daily.time.length, 4270);
  } finally {
    restore();
  }
});

test('a successful fetch does prune the superseded snapshot', async () => {
  const dir = await fixture();
  await seedOldSnapshot(dir, '2026-09-09');
  const restore = stubNetwork(10);
  try {
    const client = new OpenMeteoClient(dir);
    await client.dailyArchive('2015-01-01', '2026-09-17', SITE);
  } finally {
    restore();
  }

  const left = (await readdir(dir)).filter((n) => n.startsWith('daily_-1.095'));
  // Pruning is still wanted — a ~90 KB file a day would accumulate. It is only
  // safe once the replacement is on disk.
  assert.deepEqual(left, ['daily_-1.095_37.014_2015-01-01_2026-09-17.json']);
  const written = JSON.parse(
    await readFile(path.join(dir, left[0]), 'utf8'),
  ) as { body: { daily: { time: string[] } } };
  assert.equal(written.body.daily.time.length, 10, 'the fresh snapshot is the one kept');
});

test('with no snapshot at all, a dead network still reports the failure', async () => {
  // Degrading to stale data is right; inventing data is not. With nothing on
  // disk the error must reach the route, which turns it into a flagged
  // response rather than a silent empty page.
  const dir = await fixture();
  const restore = severNetwork();
  try {
    const client = new OpenMeteoClient(dir);
    await assert.rejects(() => client.dailyArchive('2015-01-01', '2026-09-17', SITE));
  } finally {
    restore();
  }
});
