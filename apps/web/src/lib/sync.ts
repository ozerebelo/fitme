import type { AppData } from "./store";

/**
 * Client half of cross-device sync.
 *
 * The device stays the source of truth: sync pulls once on load, adopts the
 * remote document only if it is newer, and pushes when the page is hidden. That
 * cadence is deliberate — the document is a single blob that can run to a few
 * megabytes with years of training history, and pushing it on every keystroke
 * would be wasteful for something one person edits on two devices.
 */

const SECRET_KEY = "fitme:sync-secret";

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
  updatedAt: string | null;
}

/** Enough of a picture for someone to tell which copy is the one they want. */
export const summarise = (data: AppData | null): DataSummary => ({
  entries: data?.entries?.length ?? 0,
  sessions: data?.sessions?.length ?? 0,
  metrics: data?.metrics?.length ?? 0,
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
  (data.metrics?.length ?? 0) > 1;

export const readSecret = (): string | null => {
  try {
    return localStorage.getItem(SECRET_KEY);
  } catch {
    return null;
  }
};

export const writeSecret = (secret: string | null): void => {
  try {
    if (secret) localStorage.setItem(SECRET_KEY, secret);
    else localStorage.removeItem(SECRET_KEY);
  } catch {
    /* private browsing; sync simply stays off */
  }
};

interface RemoteDocument {
  document: AppData | null;
  updatedAt: string | null;
}

export interface PullResult {
  ok: boolean;
  remote?: RemoteDocument;
  message?: string;
}

export const pull = async (secret: string): Promise<PullResult> => {
  try {
    const response = await fetch("/api/sync", {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
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

export const push = async (secret: string, document: AppData): Promise<PushResult> => {
  try {
    const response = await fetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
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
