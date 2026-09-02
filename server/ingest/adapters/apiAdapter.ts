import type { ConduitSource, Reading } from '../types.js';
import { rowToReading } from '../parse.js';

const ENDPOINT = 'https://conduit.jhubafrica.com/data.php';
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Live Conduit station feed.
 *
 * data.php takes POST form fields (apikey, email, fromdate, todate) and
 * returns JSON. Without valid credentials it answers 401 with
 * {"status":"error","message":"Wrong Email or APIKey"}, which we surface
 * verbatim rather than silently falling back to sample data.
 */
export class ApiAdapter implements ConduitSource {
  readonly name = 'Conduit live API';

  constructor(
    private readonly apiKey: string,
    private readonly email: string,
  ) {}

  private async fetchRange(from: Date, to: Date): Promise<Reading[]> {
    const body = new URLSearchParams({
      apikey: this.apiKey,
      email: this.email,
      fromdate: ymd(from),
      todate: ymd(to),
    });

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const text = await res.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Conduit returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }

    if (!res.ok || (payload as any)?.status === 'error') {
      const msg = (payload as any)?.message ?? `HTTP ${res.status}`;
      throw new Error(`Conduit API rejected the request: ${msg}`);
    }

    // The endpoint may return a bare array or wrap rows under a key.
    const rows: Record<string, string>[] = Array.isArray(payload)
      ? payload
      : ((payload as any)?.data ?? (payload as any)?.records ?? []);

    const out = rows
      .map((r) => rowToReading(r))
      .filter((r): r is Reading => r !== null);
    out.sort((a, b) => a.ts.localeCompare(b.ts));
    return out;
  }

  async getLatest(): Promise<Reading | null> {
    // Span yesterday too, so an early-morning call still finds a reading.
    const to = new Date();
    const from = new Date(to.getTime() - 36 * 3600_000);
    const rows = await this.fetchRange(from, to);
    return rows.length ? rows[rows.length - 1] : null;
  }

  getHistory(from: Date, to: Date): Promise<Reading[]> {
    return this.fetchRange(from, to);
  }
}
