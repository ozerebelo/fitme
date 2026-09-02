"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BodyMetric,
  CoachContext,
  DailyTargets,
  Exercise,
  Food,
  FoodEntry,
  MemoryFact,
  ProgressionStatus,
  Profile,
  Program,
  WorkoutSession,
} from "@fitme/core";
import {
  EXERCISES,
  FOODS,
  buildCoachReport,
  findConflictingFact,
  progressionBoard,
  touchFact,
  generateProgram,
  resolveTargets,
  toDateKey,
  weightTrend,
} from "@fitme/core";
import {
  type AppData,
  type AppSettings,
  STORAGE_KEY,
  emptyData,
  loadData,
  migrate,
  saveData,
  stamp,
  writeJournal,
} from "./store";
import { idbSet } from "./idb";
import {
  type SyncStatus,
  hasRealData,
  newerOf,
  summarise,
  pull as pullRemote,
  push as pushRemote,
  readSecret,
  writeSecret,
} from "./sync";

interface AppState {
  ready: boolean;
  data: AppData;
  /** Seed catalog plus anything the user has added. */
  foods: Food[];
  exercises: Exercise[];
  exerciseMap: Map<string, Exercise>;
  targets: DailyTargets;
  coach: ReturnType<typeof buildCoachReport>;
  /** Every recently trained lift, with what to do about the weight next time. */
  progression: ProgressionStatus[];
  currentWeightKg: number | null;

  setProfile: (profile: Profile) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;

  addEntries: (entries: FoodEntry[]) => void;
  updateEntry: (entry: FoodEntry) => void;
  removeEntry: (id: string) => void;

  addCustomFood: (food: Food) => void;

  /** Teach the app something. Re-teaching an alias updates it in place. */
  rememberFacts: (facts: MemoryFact[]) => void;
  updateFact: (fact: MemoryFact) => void;
  forgetFact: (id: string) => void;
  markFactsUsed: (ids: string[]) => void;

  logWater: (date: string, deltaMl: number) => void;
  logWeight: (metric: BodyMetric) => void;
  removeMetric: (id: string) => void;

  saveSession: (session: WorkoutSession) => void;
  removeSession: (id: string) => void;
  importSessions: (sessions: WorkoutSession[], newExercises: Exercise[]) => void;

  setProgram: (program: Program | null) => void;
  regenerateProgram: () => void;

  replaceAll: (data: AppData) => void;

  /** Cross-device sync. "off" until a sync key is set. */
  sync: SyncStatus;
  syncEnabled: boolean;
  enableSync: (secret: string) => Promise<void>;
  disableSync: () => void;
  syncNow: () => Promise<void>;
  /** Answer a "choose" state: keep this device's data, or take the synced copy. */
  resolveSyncChoice: (keep: "local" | "remote") => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export const useApp = (): AppState => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
};

/** Placeholder profile used only to keep the coach types happy pre-onboarding. */
const provisionalProfile = (): Profile => ({
  id: "local",
  sex: "male",
  birthDate: "1995-01-01",
  heightCm: 175,
  units: "metric",
  activityLevel: "moderate",
  goal: "maintain",
  rateOfChangePctPerWeek: 0,
  trainingDaysPerWeek: 3,
  sessionMinutes: 60,
  experience: "beginner",
  availableEquipment: ["bodyweight"],
  dietPreference: "none",
  allergies: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);
  // Event handlers must see the latest document, not the one captured when they
  // were registered.
  const dataRef = useRef(data);
  dataRef.current = data;

  const [sync, setSync] = useState<SyncStatus>({ state: "off", lastSyncedAt: null });
  // Whether a key is actually stored — not derived from the status, or a failed
  // connection attempt would leave the UI claiming to be connected.
  const [syncEnabled, setSyncEnabled] = useState(false);
  const secretRef = useRef<string | null>(null);
  // Held while the user decides which copy wins on first connect.
  const pendingRef = useRef<{ secret: string; remote: AppData } | null>(null);
  // What was last successfully pushed, so an unchanged document is not re-sent.
  const pushedAtRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadData().then(async (loaded) => {
      if (cancelled) return;
      setData(loaded);
      hydrated.current = true;
      setReady(true);

      // Pull once on load. The remote only wins if it is genuinely newer, so a
      // device that has been offline and edited keeps its own work.
      const secret = readSecret();
      if (!secret) return;
      secretRef.current = secret;
      setSyncEnabled(true);
      setSync({ state: "syncing", lastSyncedAt: null });
      const result = await pullRemote(secret);
      if (cancelled) return;
      if (!result.ok) {
        setSync({ state: "error", lastSyncedAt: null, message: result.message });
        return;
      }
      const remote = result.remote?.document ?? null;
      if (remote && newerOf(loaded, remote) === "remote") {
        // Keep the remote timestamp: this device did not author those edits.
        const merged = migrate(remote);
        setData(merged);
        void saveData(merged);
      }
      pushedAtRef.current = result.remote?.updatedAt ?? null;
      setSync({ state: "idle", lastSyncedAt: new Date().toISOString() });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced persistence. Rapid edits during a workout should not each
  // rewrite the document.
  useEffect(() => {
    if (!hydrated.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveData(data);
    }, 150);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data]);

  /**
   * Flush on the way out, so a set logged a moment before the screen locks
   * still sticks.
   *
   * The synchronous journal is what actually makes this safe: an IndexedDB
   * write started here may never commit if the browser kills the page first,
   * whereas the localStorage write completes before teardown and is replayed
   * on the next load.
   */
  useEffect(() => {
    const flush = (): void => {
      if (!hydrated.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const snapshot = dataRef.current;
      writeJournal(snapshot);
      void idbSet(STORAGE_KEY, snapshot);

      // Push on the way out too, so the other device sees today's work.
      const secret = secretRef.current;
      if (secret && snapshot.updatedAt !== pushedAtRef.current) {
        void pushRemote(secret, snapshot).then((result) => {
          if (result.ok) pushedAtRef.current = snapshot.updatedAt;
        });
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const patch = useCallback((updater: (current: AppData) => AppData) => {
    // Every mutation moves `updatedAt`. This is the only place it advances, so
    // the timestamp always means "last edited" — which is what sync compares.
    setData((current) => stamp(updater(current)));
  }, []);

  /* ------------------------------- Actions ------------------------------- */

  const setProfile = useCallback(
    (profile: Profile) => {
      patch((current) => ({
        ...current,
        profile: { ...profile, updatedAt: new Date().toISOString() },
      }));
    },
    [patch],
  );

  const updateSettings = useCallback(
    (settingsPatch: Partial<AppSettings>) => {
      patch((current) => ({
        ...current,
        settings: { ...current.settings, ...settingsPatch },
      }));
    },
    [patch],
  );

  const addEntries = useCallback(
    (entries: FoodEntry[]) => {
      if (entries.length === 0) return;
      patch((current) => {
        const usedIds = entries.map((e) => e.foodId).filter((id): id is string => !!id);
        const recent = [...usedIds, ...current.recentFoodIds.filter((id) => !usedIds.includes(id))];
        return {
          ...current,
          entries: [...current.entries, ...entries],
          recentFoodIds: recent.slice(0, 40),
        };
      });
    },
    [patch],
  );

  const updateEntry = useCallback(
    (entry: FoodEntry) => {
      patch((current) => ({
        ...current,
        entries: current.entries.map((e) => (e.id === entry.id ? entry : e)),
      }));
    },
    [patch],
  );

  const removeEntry = useCallback(
    (id: string) => {
      patch((current) => ({
        ...current,
        entries: current.entries.filter((e) => e.id !== id),
      }));
    },
    [patch],
  );

  const addCustomFood = useCallback(
    (food: Food) => {
      patch((current) => ({ ...current, customFoods: [...current.customFoods, food] }));
    },
    [patch],
  );

  const rememberFacts = useCallback(
    (facts: MemoryFact[]) => {
      if (facts.length === 0) return;
      patch((current) => {
        let memory = current.memory;
        for (const fact of facts) {
          // Re-teaching "milk means X" should correct the existing fact rather
          // than leave two contradictory ones in play.
          const existing = findConflictingFact(memory, fact);
          memory = existing
            ? memory.map((f) =>
                f.id === existing.id
                  ? { ...fact, id: existing.id, createdAt: existing.createdAt, usageCount: existing.usageCount }
                  : f,
              )
            : [...memory, fact];
        }
        return { ...current, memory };
      });
    },
    [patch],
  );

  const updateFact = useCallback(
    (fact: MemoryFact) => {
      patch((current) => ({
        ...current,
        memory: current.memory.map((f) =>
          f.id === fact.id ? { ...fact, updatedAt: new Date().toISOString() } : f,
        ),
      }));
    },
    [patch],
  );

  const forgetFact = useCallback(
    (id: string) => {
      patch((current) => ({ ...current, memory: current.memory.filter((f) => f.id !== id) }));
    },
    [patch],
  );

  const markFactsUsed = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      patch((current) => ({
        ...current,
        memory: current.memory.map((f) => (ids.includes(f.id) ? touchFact(f) : f)),
      }));
    },
    [patch],
  );

  const logWater = useCallback(
    (date: string, deltaMl: number) => {
      patch((current) => ({
        ...current,
        water: {
          ...current.water,
          [date]: Math.max(0, (current.water[date] ?? 0) + deltaMl),
        },
      }));
    },
    [patch],
  );

  const logWeight = useCallback(
    (metric: BodyMetric) => {
      patch((current) => {
        // One weigh-in per day: a second entry replaces the first.
        const others = current.metrics.filter((m) => m.date !== metric.date);
        return {
          ...current,
          metrics: [...others, metric].sort((a, b) => a.date.localeCompare(b.date)),
        };
      });
    },
    [patch],
  );

  const removeMetric = useCallback(
    (id: string) => {
      patch((current) => ({ ...current, metrics: current.metrics.filter((m) => m.id !== id) }));
    },
    [patch],
  );

  const saveSession = useCallback(
    (session: WorkoutSession) => {
      patch((current) => {
        const exists = current.sessions.some((s) => s.id === session.id);
        const sessions = exists
          ? current.sessions.map((s) => (s.id === session.id ? session : s))
          : [...current.sessions, session];
        return { ...current, sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)) };
      });
    },
    [patch],
  );

  const removeSession = useCallback(
    (id: string) => {
      patch((current) => ({ ...current, sessions: current.sessions.filter((s) => s.id !== id) }));
    },
    [patch],
  );

  const importSessions = useCallback(
    (sessions: WorkoutSession[], newExercises: Exercise[]) => {
      patch((current) => {
        // Guard against a double-click on Import as well as a re-run of the
        // same export: externalId is the identity, not the row order.
        const known = new Set(
          current.sessions.map((s) => s.externalId).filter((v): v is string => !!v),
        );
        const fresh = sessions.filter((s) => !s.externalId || !known.has(s.externalId));
        const knownExercises = new Set(current.customExercises.map((e) => e.id));
        const exercises = newExercises.filter((e) => !knownExercises.has(e.id));
        return {
          ...current,
          sessions: [...current.sessions, ...fresh].sort((a, b) => a.date.localeCompare(b.date)),
          customExercises: [...current.customExercises, ...exercises],
        };
      });
    },
    [patch],
  );

  const setProgram = useCallback(
    (program: Program | null) => {
      patch((current) => ({ ...current, program }));
    },
    [patch],
  );

  const regenerateProgram = useCallback(() => {
    patch((current) =>
      current.profile
        ? { ...current, program: generateProgram(current.profile) }
        : current,
    );
  }, [patch]);

  const runSync = useCallback(async (secret: string): Promise<SyncStatus> => {
    // Deliberately not re-stamped: a device that has only opened the app must
    // not out-rank one that has actually logged something.
    const local = dataRef.current;
    const pulled = await pullRemote(secret);
    if (!pulled.ok) return { state: "error", lastSyncedAt: null, message: pulled.message };

    const remote = pulled.remote?.document ?? null;
    if (remote && newerOf(local, remote) === "remote") {
      const merged = migrate(remote);
      hydrated.current = true;
      setData(merged);
      void saveData(merged);
      pushedAtRef.current = pulled.remote?.updatedAt ?? null;
      return { state: "idle", lastSyncedAt: new Date().toISOString() };
    }

    const pushed = await pushRemote(secret, local);
    if (pushed.conflict) {
      return {
        state: "conflict",
        lastSyncedAt: null,
        message: pushed.message ?? "Another device has newer data.",
      };
    }
    if (!pushed.ok) return { state: "error", lastSyncedAt: null, message: pushed.message };

    pushedAtRef.current = local.updatedAt;
    return { state: "idle", lastSyncedAt: new Date().toISOString() };
  }, []);

  /**
   * First connect is the dangerous one.
   *
   * Plain last-write-wins would let a freshly set-up device — which by
   * definition was edited seconds ago — overwrite a phone holding years of
   * history. So when both sides have real data, stop and ask; when this device
   * has nothing but an onboarding profile, take the synced copy, which is what
   * "connect my other device" always means.
   */
  const enableSync = useCallback(
    async (secret: string) => {
      setSync({ state: "syncing", lastSyncedAt: null });

      const pulled = await pullRemote(secret);
      if (!pulled.ok) {
        setSync({ state: "error", lastSyncedAt: null, message: pulled.message });
        return;
      }

      const remote = pulled.remote?.document ?? null;
      const local = dataRef.current;

      if (remote && hasRealData(local) && hasRealData(migrate(remote))) {
        pendingRef.current = { secret, remote: migrate(remote) };
        setSync({
          state: "choose",
          lastSyncedAt: null,
          choice: { local: summarise(local), remote: summarise(migrate(remote)) },
        });
        return;
      }

      if (remote) {
        const merged = migrate(remote);
        setData(merged);
        void saveData(merged);
        pushedAtRef.current = merged.updatedAt;
      } else {
        const pushed = await pushRemote(secret, local);
        if (!pushed.ok) {
          setSync({ state: "error", lastSyncedAt: null, message: pushed.message });
          return;
        }
        pushedAtRef.current = local.updatedAt;
      }

      secretRef.current = secret;
      writeSecret(secret);
      setSyncEnabled(true);
      setSync({ state: "idle", lastSyncedAt: new Date().toISOString() });
    },
    [],
  );

  const resolveSyncChoice = useCallback(async (keep: "local" | "remote") => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setSync({ state: "syncing", lastSyncedAt: null });

    if (keep === "remote") {
      setData(pending.remote);
      void saveData(pending.remote);
      pushedAtRef.current = pending.remote.updatedAt;
    } else {
      // Their data wins, so it has to out-rank what the server holds.
      const local = stamp(dataRef.current);
      setData(local);
      const pushed = await pushRemote(pending.secret, local);
      if (!pushed.ok) {
        setSync({ state: "error", lastSyncedAt: null, message: pushed.message });
        return;
      }
      pushedAtRef.current = local.updatedAt;
    }

    secretRef.current = pending.secret;
    writeSecret(pending.secret);
    setSyncEnabled(true);
    setSync({ state: "idle", lastSyncedAt: new Date().toISOString() });
  }, []);

  const disableSync = useCallback(() => {
    secretRef.current = null;
    pushedAtRef.current = null;
    writeSecret(null);
    setSyncEnabled(false);
    setSync({ state: "off", lastSyncedAt: null });
  }, []);

  const syncNow = useCallback(async () => {
    const secret = secretRef.current;
    if (!secret) return;
    setSync((current) => ({ ...current, state: "syncing" }));
    setSync(await runSync(secret));
  }, [runSync]);

  /**
   * Wholesale replacement — restoring a backup, or erasing.
   *
   * These are explicit user acts, so the document is stamped as modified now:
   * restoring a year-old backup should win over whatever sync is holding,
   * rather than being silently reverted on the next pull.
   */
  const replaceAll = useCallback((next: AppData) => {
    hydrated.current = true;
    const stamped = stamp(next);
    setData(stamped);
    void saveData(stamped);
  }, []);

  /* ------------------------------ Derived -------------------------------- */

  const foods = useMemo(
    () => [...data.customFoods, ...FOODS],
    [data.customFoods],
  );

  const exercises = useMemo(
    () => [...EXERCISES, ...data.customExercises],
    [data.customExercises],
  );

  const exerciseMap = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  );

  const asOf = toDateKey();

  const currentWeightKg = useMemo(() => {
    const trend = weightTrend(data.metrics, { asOf });
    return trend.latestKg;
  }, [data.metrics, asOf]);

  const targets = useMemo(
    () =>
      resolveTargets({
        profile: data.profile ?? provisionalProfile(),
        metrics: data.metrics,
        entries: data.entries,
        asOf,
      }),
    [data.profile, data.metrics, data.entries, asOf],
  );

  const coach = useMemo(() => {
    const context: CoachContext = {
      profile: data.profile ?? provisionalProfile(),
      currentWeightKg: currentWeightKg ?? 75,
      targets,
      metrics: data.metrics,
      entries: data.entries,
      sessions: data.sessions,
      program: data.program ?? undefined,
      asOf,
    };
    return buildCoachReport(context, exerciseMap, data.settings.repRange);
  }, [
    data.profile,
    data.metrics,
    data.entries,
    data.sessions,
    data.program,
    targets,
    currentWeightKg,
    exerciseMap,
    data.settings.repRange,
    asOf,
  ]);

  const progression = useMemo(
    () =>
      progressionBoard(data.sessions, {
        policy: data.settings.repRange,
        units: data.profile?.units ?? "metric",
        catalog: exerciseMap,
        asOf,
      }),
    [data.sessions, data.settings.repRange, data.profile?.units, exerciseMap, asOf],
  );

  const value = useMemo<AppState>(
    () => ({
      ready,
      data,
      foods,
      exercises,
      exerciseMap,
      targets,
      coach,
      progression,
      currentWeightKg,
      setProfile,
      updateSettings,
      addEntries,
      updateEntry,
      removeEntry,
      addCustomFood,
      rememberFacts,
      updateFact,
      forgetFact,
      markFactsUsed,
      logWater,
      logWeight,
      removeMetric,
      saveSession,
      removeSession,
      importSessions,
      setProgram,
      regenerateProgram,
      replaceAll,
      sync,
      syncEnabled,
      enableSync,
      disableSync,
      syncNow,
      resolveSyncChoice,
    }),
    [
      ready, data, foods, exercises, exerciseMap, targets, coach, progression, currentWeightKg,
      setProfile, updateSettings, addEntries, updateEntry, removeEntry, addCustomFood,
      rememberFacts, updateFact, forgetFact, markFactsUsed, logWater,
      logWeight, removeMetric, saveSession, removeSession, importSessions, setProgram,
      regenerateProgram, replaceAll, sync, syncEnabled, enableSync, disableSync, syncNow, resolveSyncChoice,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
