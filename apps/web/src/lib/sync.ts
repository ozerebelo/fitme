import type { AppData } from "./store";

/**
 * Client half of the account's stored copy.
 *
 * Authentication is the session cookie, so nothing here carries a credential —
 * the browser attaches it, and a signed-out request simply gets a 401.
 *
 * The device stays the source of truth: it pulls once on load, adopts the
 * stored document only if it is newer, and pushes when the page is hidden. That
 * cadence is deliberate — the document is a single blob that can run to a few
 * megabytes with years of training history, and pushing it on every keystroke
 * would be wasteful for something one person edits on two devices.
 */

export interface Account {
  id: string;
  email: string;
}

export interface AuthState {
  /** False when the deployment has no database, so accounts cannot exist. */
  available: boolean;
  user: Account | null;
  /** Before the first /api/auth/me reply, we do not yet know. */
  known: boolean;
}

export const fetchAccount = async (): Promise<AuthState> => {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const json = (await response.json()) as { available?: boolean; user?: Account | null };
    return { available: !!json.available, user: json.user ?? null, known: true };
  } catch {
    // Offline. Say nothing about accounts rather than claiming there are none.
    return { available: false, user: null, known: false };
  }
};

export interface CredentialResult {
  ok: boolean;
  user?: Account;
  message?: string;
}

const credentials = async (
  path: "login" | "register",
  email: string,
  password: string,
): Promise<CredentialResult> => {
  try {
    const response = await fetch(`/api/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = (await response.json()) as { user?: Account; message?: string };
    if (!response.ok) return { ok: false, message: json.message ?? "That did not work." };
    return { ok: true, user: json.user };
  } catch {
    return { ok: false, message: "Could not reach the account service." };
  }
};

export const signIn = (email: string, password: string): Promise<CredentialResult> =>
  credentials("login", email, password);

export const signUp = (email: string, password: string): Promise<CredentialResult> =>
  credentials("register", email, password);

export const signOutRemote = async (): Promise<void> => {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    /* the cookie expires on its own */
  }
};

export type SyncState =
  | "off"
  | "idle"
  | "syncing"
  | "error"
  | "conflict"
  /** Both sides hold real data and the user has to say which one wins. */
  | "choose";

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: string | null;
  message?: string;
  /** Populated when `state` is "choose", to describe what each side holds. */
  choice?: {
    local: DataSummary;
    remote: DataSummary;
  };
}

export interface DataSummary {
  entries: number;
  sessions: number;
  metrics: number;
  transactions: number;
  updatedAt: string | null;
}

/** Enough of a picture for someone to tell which copy is the one they want. */
export const summarise = (data: AppData | null): DataSummary => ({
  entries: data?.entries?.length ?? 0,
  sessions: data?.sessions?.length ?? 0,
  metrics: data?.metrics?.length ?? 0,
  transactions: data?.money?.transactions?.length ?? 0,
  updatedAt: data?.updatedAt ?? null,
});

/**
 * Has anything actually been logged here?
 *
 * A device that has only been through onboarding has a profile and maybe one
 * weigh-in. Adopting the synced copy over that is obviously right; adopting it
 * over months of logs is obviously wrong. This is the line between the two.
 */
export const hasRealData = (data: AppData): boolean =>
  (data.entries?.length ?? 0) > 0 ||
  (data.sessions?.length ?? 0) > 0 ||
  (data.money?.transactions?.length ?? 0) > 0 ||
  (data.metrics?.length ?? 0) > 1;

interface RemoteDocument {
  document: AppData | null;
  updatedAt: string | null;
}

export interface PullResult {
  ok: boolean;
  remote?: RemoteDocument;
  message?: string;
}

export const pull = async (): Promise<PullResult> => {
  try {
    const response = await fetch("/api/sync", { cache: "no-store" });
    const json = (await response.json()) as RemoteDocument & { message?: string };
    if (!response.ok) return { ok: false, message: json.message ?? "Sync failed." };
    return { ok: true, remote: json };
  } catch {
    return { ok: false, message: "Could not reach the sync service." };
  }
};

export interface PushResult {
  ok: boolean;
  /** Set when the server holds newer data than the document that was pushed. */
  conflict?: RemoteDocument;
  updatedAt?: string;
  message?: string;
}

export const push = async (document: AppData): Promise<PushResult> => {
  try {
    const response = await fetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document }),
    });
    const json = (await response.json()) as {
      updatedAt?: string;
      stored?: RemoteDocument;
      message?: string;
    };
    if (response.status === 409) return { ok: false, conflict: json.stored, message: json.message };
    if (!response.ok) return { ok: false, message: json.message ?? "Sync failed." };
    return { ok: true, updatedAt: json.updatedAt };
  } catch {
    return { ok: false, message: "Could not reach the sync service." };
  }
};

/** Whichever document is newer. Ties go to the local one — it is being used. */
export const newerOf = (local: AppData, remote: AppData | null): "local" | "remote" => {
  if (!remote?.updatedAt) return "local";
  if (!local.updatedAt) return "remote";
  return remote.updatedAt > local.updatedAt ? "remote" : "local";
};
