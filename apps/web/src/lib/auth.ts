import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password and session-token handling.
 *
 * Deliberately small and dependency-free: the only primitives needed are a
 * memory-hard KDF for passwords and a CSPRNG for session tokens, and Node has
 * both. Everything here runs server-side only.
 *
 * Two properties this file exists to guarantee:
 *
 *   1. A stolen database does not yield passwords. They are stored as scrypt
 *      digests with a per-password salt and the parameters recorded inline, so
 *      the cost can be raised later without invalidating existing hashes.
 *   2. A stolen database does not yield *sessions* either. The cookie holds a
 *      random token; the table holds only its SHA-256. Reading the table tells
 *      an attacker nothing they can present as a cookie.
 */

/** promisify picks the 3-argument overload; scrypt's options form needs 4. */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** ~32 MB and roughly 100 ms per hash on a small serverless instance. */
const N = 1 << 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
/** 128 * N * r is scrypt's working set; give it headroom or Node refuses. */
const MAX_MEM = 128 * N * R * 2;

const derive = (password: string, salt: Buffer, length: number, n = N, r = R, p = P) =>
  scryptAsync(password.normalize("NFKC"), salt, length, {
    N: n,
    r,
    p,
    maxmem: Math.max(MAX_MEM, 128 * n * r * 2),
  });

/** `scrypt$N$r$p$salt$hash`, all base64. Self-describing so N can change. */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH);
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Refuse absurd parameters from a tampered row rather than trying to honour
  // them and stalling the process.
  if (n < 1024 || n > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(parts[5]!, "base64");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  const salt = Buffer.from(parts[4]!, "base64");
  const key = await derive(password, salt, expected.length, n, r, p);
  return timingSafeEqual(key, expected);
};

/* -------------------------------------------------------------------------- */
/*                                  Sessions                                  */
/* -------------------------------------------------------------------------- */

export const SESSION_COOKIE = "fitme_session";
export const SESSION_DAYS = 90;

/** 256 bits from the CSPRNG. Cookie-safe without escaping. */
export const newSessionToken = (): string => randomBytes(32).toString("base64url");

/**
 * What goes in the database. A plain hash rather than a KDF is right here: the
 * token is already 256 bits of uniform randomness, so there is nothing to brute
 * force and nothing a salt would add.
 */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const sessionExpiry = (from: Date = new Date()): Date =>
  new Date(from.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

/* -------------------------------------------------------------------------- */
/*                                   Emails                                   */
/* -------------------------------------------------------------------------- */

/** One canonical form, so "Ze@Example.COM " and "ze@example.com" are one account. */
export const normaliseEmail = (email: string): string => email.trim().toLowerCase();

/**
 * Deliberately permissive. Anything stricter rejects real addresses, and the
 * only thing riding on this is a typo check — there is no confirmation mail to
 * misdeliver.
 */
export const isPlausibleEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

/**
 * Length is the only requirement worth enforcing. Composition rules ("one
 * capital, one symbol") measurably push people towards weaker, more predictable
 * passwords, and this is a personal app, not a bank.
 */
export const MIN_PASSWORD_LENGTH = 10;

export const passwordProblem = (password: string): string | null => {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 512) return "That password is too long.";
  return null;
};
