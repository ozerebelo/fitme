import { Pool } from "pg";
import { hashToken, sessionExpiry } from "./auth";

/**
 * Postgres access for accounts and their data.
 *
 * FitMe is local-first: the database is a mirror, not the source of truth. The
 * whole app works with this unconfigured — you simply have one device and no
 * way back if you lose it. Signing in is what links a device to an account, and
 * from then on the account holds the copy of record.
 *
 * The stored value is the same state document the client already keeps, with
 * the same `updatedAt` stamp the local journal uses, so reconciliation is one
 * comparison rather than a merge algorithm.
 */

const CONNECTION_STRING = process.env.DATABASE_URL;

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export const isAuthConfigured = (): boolean => !!CONNECTION_STRING;

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

/**
 * Create the tables on first use. Cheap, idempotent, and avoids a migration
 * step for a schema this small.
 *
 * `fitme_state` from the old shared-key sync is deliberately left alone rather
 * than dropped: it is nobody's source of truth, and destroying data to tidy up
 * is never worth it.
 */
const ensureSchema = async (): Promise<void> => {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(
        `create table if not exists fitme_users (
           id            uuid primary key default gen_random_uuid(),
           email         text not null unique,
           password_hash text not null,
           created_at    timestamptz not null default now()
         );

         create table if not exists fitme_sessions (
           token_hash   text primary key,
           user_id      uuid not null references fitme_users(id) on delete cascade,
           created_at   timestamptz not null default now(),
           expires_at   timestamptz not null,
           last_seen_at timestamptz not null default now()
         );
         create index if not exists fitme_sessions_user on fitme_sessions (user_id);

         create table if not exists fitme_documents (
           user_id    uuid primary key references fitme_users(id) on delete cascade,
           document   jsonb not null,
           updated_at timestamptz not null
         );

         create table if not exists fitme_throttle (
           key          text primary key,
           count        int not null,
           window_start timestamptz not null
         );`,
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

/* -------------------------------------------------------------------------- */
/*                                 Throttling                                 */
/* -------------------------------------------------------------------------- */

const WINDOW_MINUTES = 15;

/**
 * Count an attempt and say whether the caller is over its limit.
 *
 * Keyed by whatever the caller passes — the login route uses both the address
 * and the account, so neither a single noisy IP nor a targeted guessing run
 * gets an unbounded number of tries. It is a fixed window rather than a sliding
 * one: an attacker can get up to 2× the limit across a boundary, which is an
 * acceptable trade for one statement and no extra state.
 */
export const throttle = async (key: string, limit: number): Promise<boolean> => {
  await ensureSchema();
  const result = await getPool().query<{ count: number }>(
    `insert into fitme_throttle (key, count, window_start)
     values ($1, 1, now())
     on conflict (key) do update
       set count = case
             when fitme_throttle.window_start < now() - ($2 || ' minutes')::interval then 1
             else fitme_throttle.count + 1
           end,
           window_start = case
             when fitme_throttle.window_start < now() - ($2 || ' minutes')::interval then now()
             else fitme_throttle.window_start
           end
     returning count`,
    [key, String(WINDOW_MINUTES)],
  );
  return (result.rows[0]?.count ?? 1) > limit;
};

/** Called after a success, so a legitimate user is not punished for a typo. */
export const clearThrottle = async (keys: string[]): Promise<void> => {
  if (keys.length === 0) return;
  await getPool().query("delete from fitme_throttle where key = any($1)", [keys]);
};

/* -------------------------------------------------------------------------- */
/*                                   Users                                    */
/* -------------------------------------------------------------------------- */

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
}

export const findUserByEmail = async (email: string): Promise<UserRow | null> => {
  await ensureSchema();
  const result = await getPool().query<{ id: string; email: string; password_hash: string }>(
    "select id, email, password_hash from fitme_users where email = $1",
    [email],
  );
  const row = result.rows[0];
  return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null;
};

/** Returns null when the address is already taken. */
export const createUser = async (
  email: string,
  passwordHash: string,
): Promise<UserRow | null> => {
  await ensureSchema();
  const result = await getPool().query<{ id: string; email: string }>(
    `insert into fitme_users (email, password_hash) values ($1, $2)
     on conflict (email) do nothing
     returning id, email`,
    [email, passwordHash],
  );
  const row = result.rows[0];
  return row ? { id: row.id, email: row.email, passwordHash } : null;
};

export const changePassword = async (userId: string, passwordHash: string): Promise<void> => {
  await getPool().query("update fitme_users set password_hash = $1 where id = $2", [
    passwordHash,
    userId,
  ]);
};

/* -------------------------------------------------------------------------- */
/*                                  Sessions                                  */
/* -------------------------------------------------------------------------- */

export const startSession = async (userId: string, token: string): Promise<void> => {
  await ensureSchema();
  await getPool().query(
    "insert into fitme_sessions (token_hash, user_id, expires_at) values ($1, $2, $3)",
    [hashToken(token), userId, sessionExpiry()],
  );
};

export interface SessionUser {
  id: string;
  email: string;
}

/** Resolve a cookie to its account, or null if it is unknown or expired. */
export const userForToken = async (token: string): Promise<SessionUser | null> => {
  if (!token) return null;
  await ensureSchema();
  const result = await getPool().query<{ id: string; email: string }>(
    `update fitme_sessions s
        set last_seen_at = now()
       from fitme_users u
      where s.token_hash = $1
        and s.expires_at > now()
        and u.id = s.user_id
     returning u.id, u.email`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  return row ? { id: row.id, email: row.email } : null;
};

export const endSession = async (token: string): Promise<void> => {
  if (!token) return;
  await ensureSchema();
  await getPool().query("delete from fitme_sessions where token_hash = $1", [hashToken(token)]);
};

/** Used when the password changes: every other device has to sign in again. */
export const endAllSessions = async (userId: string, keep?: string): Promise<void> => {
  await getPool().query(
    "delete from fitme_sessions where user_id = $1 and ($2::text is null or token_hash <> $2)",
    [userId, keep ? hashToken(keep) : null],
  );
};

/* -------------------------------------------------------------------------- */
/*                                 Documents                                  */
/* -------------------------------------------------------------------------- */

export interface StoredDocument {
  document: unknown;
  updatedAt: string;
}

export const readDocument = async (userId: string): Promise<StoredDocument | null> => {
  await ensureSchema();
  const result = await getPool().query<{ document: unknown; updated_at: Date }>(
    "select document, updated_at from fitme_documents where user_id = $1",
    [userId],
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
  userId: string,
  document: unknown,
  updatedAt: string,
): Promise<WriteOutcome> => {
  await ensureSchema();
  const result = await getPool().query<{ updated_at: Date }>(
    `insert into fitme_documents (user_id, document, updated_at)
     values ($1, $2, $3)
     on conflict (user_id) do update
       set document = excluded.document, updated_at = excluded.updated_at
       where fitme_documents.updated_at <= excluded.updated_at
     returning updated_at`,
    [userId, JSON.stringify(document), updatedAt],
  );

  const row = result.rows[0];
  if (row) return { status: "written", updatedAt: row.updated_at.toISOString() };

  const stored = await readDocument(userId);
  return { status: "stale", stored: stored ?? { document: null, updatedAt } };
};

/** Deleting the account takes its sessions and its data with it. */
export const deleteAccount = async (userId: string): Promise<void> => {
  await getPool().query("delete from fitme_users where id = $1", [userId]);
};
