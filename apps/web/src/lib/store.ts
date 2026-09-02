import type {
  BodyMetric,
  RepRangePolicy,
  Exercise,
  Food,
  FoodEntry,
  MemoryFact,
  Profile,
  Program,
  WorkoutSession,
} from "@fitme/core";
import { DEFAULT_REP_RANGE_POLICY } from "@fitme/core";
import { idbGet, idbSet } from "./idb";

export const STORAGE_KEY = "app-state";
export const SCHEMA_VERSION = 1;

/**
 * Synchronous durability journal.
 *
 * IndexedDB writes are asynchronous, so a page torn down mid-write — locking
 * the phone straight after ticking a set, or closing the tab the moment
 * onboarding finishes — loses whatever had not yet committed. localStorage is
 * synchronous and completes before teardown, so we mirror the document there
 * whenever the page is hidden and reconcile on the next load.
 */
const JOURNAL_KEY = "fitme:journal";

export interface AppSettings {
  /** Rep ranges that drive the progressive-overload suggestions. */
  repRange: RepRangePolicy;
  /** Default rest between sets, in seconds. */
  restSeconds: number;
  /** Play a sound and vibrate when the rest timer finishes. */
  restAlert: boolean;
  /** Bar weight used by the plate calculator, kg. */
  barWeightKg: number;
  theme: "dark" | "light" | "system";
}

export interface AppData {
  version: number;
  profile: Profile | null;
  /** User-created and imported foods. The seed catalog is code, not data. */
  customFoods: Food[];
  /** Exercises invented during an import, on top of the seed catalog. */
  customExercises: Exercise[];
  entries: FoodEntry[];
  sessions: WorkoutSession[];
  metrics: BodyMetric[];
  program: Program | null;
  /** Things the user has taught the app about how they eat. */
  memory: MemoryFact[];
  /** Millilitres of water per date key. */
  water: Record<string, number>;
  /** Food ids in most-recently-used order, for search ranking. */
  recentFoodIds: string[];
  settings: AppSettings;
  updatedAt: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  repRange: { ...DEFAULT_REP_RANGE_POLICY },
  restSeconds: 120,
  restAlert: true,
  barWeightKg: 20,
  theme: "dark",
};

export const emptyData = (): AppData => ({
  version: SCHEMA_VERSION,
  profile: null,
  customFoods: [],
  customExercises: [],
  entries: [],
  sessions: [],
  metrics: [],
  program: null,
  memory: [],
  water: {},
  recentFoodIds: [],
  settings: { ...DEFAULT_SETTINGS },
  updatedAt: new Date().toISOString(),
});

/**
 * Bring a stored document up to the current schema.
 *
 * Kept deliberately forgiving: a user's training history is not something to
 * lose because a field was added, so anything unrecognised is defaulted rather
 * than rejected.
 */
export const migrate = (raw: unknown): AppData => {
  const base = emptyData();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<AppData>;

  return {
    ...base,
    ...data,
    version: SCHEMA_VERSION,
    customFoods: data.customFoods ?? [],
    customExercises: data.customExercises ?? [],
    entries: data.entries ?? [],
    sessions: data.sessions ?? [],
    metrics: data.metrics ?? [],
    memory: data.memory ?? [],
    water: data.water ?? {},
    recentFoodIds: data.recentFoodIds ?? [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(data.settings ?? {}),
      // Nested, so a spread would drop fields added after the document was saved.
      repRange: { ...DEFAULT_REP_RANGE_POLICY, ...(data.settings?.repRange ?? {}) },
    },
  };
};

/** Write the journal. Returns false if it did not fit (very large histories). */
export const writeJournal = (data: AppData): boolean => {
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
};

export const readJournal = (): AppData | null => {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? (JSON.parse(raw) as AppData) : null;
  } catch {
    return null;
  }
};

/**
 * Mark the document as modified now.
 *
 * `updatedAt` means *last modified*, not *last saved*. That distinction is what
 * makes sync correct: if saving or syncing re-stamped it, a device that had
 * merely opened the app would look newer than one that had actually logged a
 * workout, and would overwrite it.
 */
export const stamp = (data: AppData): AppData => ({
  ...data,
  updatedAt: new Date().toISOString(),
});

export const loadData = async (): Promise<AppData> => {
  const [stored, journalled] = [await idbGet<AppData>(STORAGE_KEY), readJournal()];

  // The journal only wins when the last session ended before its asynchronous
  // write committed. When it does, heal the primary store from it.
  if (
    journalled?.updatedAt &&
    (!stored?.updatedAt || journalled.updatedAt > stored.updatedAt)
  ) {
    const recovered = migrate(journalled);
    void idbSet(STORAGE_KEY, recovered);
    return recovered;
  }

  return migrate(stored);
};

/** Persist as-is; `updatedAt` is set when the data changes, not when it is written. */
export const saveData = async (data: AppData): Promise<boolean> =>
  idbSet(STORAGE_KEY, data);

/* -------------------------------------------------------------------------- */
/*                            Export / import                                 */
/* -------------------------------------------------------------------------- */

export const exportData = (data: AppData): string =>
  JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);

export interface ImportOutcome {
  ok: boolean;
  data?: AppData;
  error?: string;
}

export const parseImport = (json: string): ImportOutcome => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "That file does not contain a FitMe backup." };
    }
    const candidate = parsed as Partial<AppData>;
    if (!("entries" in candidate) && !("sessions" in candidate) && !("profile" in candidate)) {
      return { ok: false, error: "That file does not look like a FitMe backup." };
    }
    return { ok: true, data: migrate(candidate) };
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
};
