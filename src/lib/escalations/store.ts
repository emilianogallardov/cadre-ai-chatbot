import { EscalationRecord } from "./types";

/**
 * Escalation persistence (ADR-005).
 *
 * Inserts happen only server-side through a validated route, using server-only
 * Supabase credentials — the browser never sees the key and there is no public
 * read path. We talk to Supabase over its PostgREST HTTP endpoint with plain
 * `fetch` rather than the Supabase SDK: one auditable request, no transitive
 * dependency, and nothing in the wire format we cannot read here. When the
 * credentials are absent (local dev) we fall back to a non-durable in-memory
 * store so the form still demonstrably works.
 */

/** Thrown when the durable store rejects an insert. Message is user-safe: it
 * never contains the API key or the submitted record. */
export class StoreError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

export interface EscalationStore {
  insert(record: EscalationRecord): Promise<{ referenceId: string }>;
}

/**
 * Supabase PostgREST store. POSTs a single row and reads back the generated id.
 * A non-2xx response throws a StoreError carrying only the HTTP status — the
 * request key and the record body are deliberately excluded from the message so
 * they cannot leak into logs or the client.
 */
class SupabaseRestStore implements EscalationStore {
  constructor(
    private readonly url: string,
    private readonly key: string,
  ) {}

  async insert(record: EscalationRecord): Promise<{ referenceId: string }> {
    const endpoint = `${this.url}/rest/v1/escalations`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        name: record.name,
        email: record.email,
        question: record.question,
        consented_at: record.consented_at,
        status: "new",
      }),
    });

    if (!response.ok) {
      // Status only — never the key or the record.
      throw new StoreError(
        response.status,
        `Escalation store rejected the insert (HTTP ${response.status}).`,
      );
    }

    const rows = (await response.json()) as Array<{ id?: unknown }>;
    const id = Array.isArray(rows) ? rows[0]?.id : undefined;
    if (typeof id !== "string" || id.length === 0) {
      throw new StoreError(
        response.status,
        "Escalation store returned no reference id.",
      );
    }
    return { referenceId: id };
  }
}

/**
 * In-memory fallback for local dev without Supabase credentials. Not durable
 * across instances or restarts; warns once so the missing persistence is never
 * silent.
 */
class MemoryStore implements EscalationStore {
  private counter = 0;
  private readonly records: EscalationRecord[] = [];
  private warned = false;

  async insert(record: EscalationRecord): Promise<{ referenceId: string }> {
    if (!this.warned) {
      this.warned = true;
      console.warn(
        "[escalations] SUPABASE_URL/SUPABASE_SECRET_KEY not set; using " +
          "in-memory store (not durable — production requires Supabase, ADR-005).",
      );
    }
    this.counter += 1;
    this.records.push(record);
    return { referenceId: `local-${this.counter}` };
  }
}

// The store is chosen once from the process environment and cached: on
// serverless the env is fixed for the instance's life, and a module-level
// singleton keeps the MemoryStore counter/warn state stable within it.
let cachedStore: EscalationStore | null = null;

export function getEscalationStore(): EscalationStore {
  if (cachedStore) return cachedStore;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  cachedStore =
    url && key ? new SupabaseRestStore(url, key) : new MemoryStore();
  return cachedStore;
}

/** Clears the cached store (tests only). */
export function resetEscalationStoreForTests(): void {
  cachedStore = null;
}
