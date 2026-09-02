import { Pool } from "pg";

/**
 * Postgres access for cross-device sync.
 *
 * FitMe is local-first: the database is a mirror, not the source of truth. The
 * whole app works with this unconfigured, and nothing here is on the path of
 * any screen — it exists so a phone and a laptop can see the same data, and so
 * losing the device does not lose four years of training history.
 *
 * The stored value is the same state document the client already keeps, with
 * the same `updatedAt` stamp the local journal uses, so reconciliation is one
 * comparison rather than a merge algorithm.
 */

const CONNECTION_STRING = process.env.DATABASE_URL;

/** One row per user. Single-user by default; the key is overridable. */
export const userKey = (): string => process.env.FITME_SYNC_USER ?? "default";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export const isSyncConfigured = (): boolean =>
  !!CONNECTION_STRING && !!process.env.FITME_SYNC_SECRET;

const getPool = (): Pool => {
  if (!CONNECTION_STRING) throw new Error("DATABASE_URL is not set");
  if (!pool) {
    pool = new Pool({
      connectionString: CONNECTION_STRING,
      // Serverless functions are short-lived and Neon's pooler endpoint does
      // the real pooling; holding more than one connection per instance just
      // burns the connection budget.
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      // Neon terminates TLS with a public CA; a local test instance has none.
      ssl: CONNECTION_STRING.includes("sslmode=require")
        ? { rejectUnauthorized: true }
        : undefined,
    });
    pool.on("error", () => {
      // A dropped idle connection must not take the process down.
    });
  }
  return pool;
};

/** Create the table on first use. Cheap, idempotent, and avoids a migration step. */
const ensureSchema = async (): Promise<void> => {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(
        `create table if not exists fitme_state (
           user_key   text primary key,
           document   jsonb not null,
           updated_at timestamptz not null
         )`,
      )
      .then(() => undefined)
      .catch((error: unknown) => {
        // Let the next request retry rather than caching a failure forever.
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
};

export interface StoredDocument {
  document: unknown;
  updatedAt: string;
}

export const readDocument = async (): Promise<StoredDocument | null> => {
  await ensureSchema();
  const result = await getPool().query<{ document: unknown; updated_at: Date }>(
    "select document, updated_at from fitme_state where user_key = $1",
    [userKey()],
  );
  const row = result.rows[0];
  return row ? { document: row.document, updatedAt: row.updated_at.toISOString() } : null;
};

export type WriteOutcome =
  | { status: "written"; updatedAt: string }
  | { status: "stale"; stored: StoredDocument };

/**
 * Last write wins, by the document's own timestamp.
 *
 * Correct for one person on two devices, and wrong for a team — a genuinely
 * concurrent edit on another device loses. The guard makes that visible instead
 * of silent: an older push is rejected and handed the newer document back.
 */
export const writeDocument = async (
  document: unknown,
  updatedAt: string,
): Promise<WriteOutcome> => {
  await ensureSchema();
  const result = await getPool().query<{ updated_at: Date }>(
    `insert into fitme_state (user_key, document, updated_at)
     values ($1, $2, $3)
     on conflict (user_key) do update
       set document = excluded.document, updated_at = excluded.updated_at
       where fitme_state.updated_at <= excluded.updated_at
     returning updated_at`,
    [userKey(), JSON.stringify(document), updatedAt],
  );

  const row = result.rows[0];
  if (row) return { status: "written", updatedAt: row.updated_at.toISOString() };

  const stored = await readDocument();
  return { status: "stale", stored: stored ?? { document: null, updatedAt } };
};
