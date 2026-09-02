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
  Profile,
  Program,
  WorkoutSession,
} from "@fitme/core";
import {
  EXERCISES,
  FOODS,
  buildCoachReport,
  findConflictingFact,
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
  saveData,
  stamp,
  writeJournal,
} from "./store";
import { idbSet } from "./idb";

interface AppState {
  ready: boolean;
  data: AppData;
  /** Seed catalog plus anything the user has added. */
  foods: Food[];
  exercises: Exercise[];
  exerciseMap: Map<string, Exercise>;
  targets: DailyTargets;
  coach: ReturnType<typeof buildCoachReport>;
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

  useEffect(() => {
    let cancelled = false;
    void loadData().then((loaded) => {
      if (cancelled) return;
      setData(loaded);
      hydrated.current = true;
      setReady(true);
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
      const snapshot = stamp(dataRef.current);
      writeJournal(snapshot);
      void idbSet(STORAGE_KEY, snapshot);
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
    setData((current) => updater(current));
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

  const replaceAll = useCallback((next: AppData) => {
    hydrated.current = true;
    setData(next);
    void saveData(next);
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
    return buildCoachReport(context, exerciseMap);
  }, [
    data.profile,
    data.metrics,
    data.entries,
    data.sessions,
    data.program,
    targets,
    currentWeightKg,
    exerciseMap,
    asOf,
  ]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      data,
      foods,
      exercises,
      exerciseMap,
      targets,
      coach,
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
    }),
    [
      ready, data, foods, exercises, exerciseMap, targets, coach, currentWeightKg,
      setProfile, updateSettings, addEntries, updateEntry, removeEntry, addCustomFood,
      rememberFacts, updateFact, forgetFact, markFactsUsed, logWater,
      logWeight, removeMetric, saveSession, removeSession, importSessions, setProgram,
      regenerateProgram, replaceAll,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
