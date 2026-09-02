import type { Exercise, SetLog, UnitSystem, WorkoutSession } from "./types";
import { EXERCISE_BY_ID } from "./data/exercises";
import { exerciseHistory, isWorkingSet, setE1RM } from "./strength";
import { round } from "./units";
import { type DateKey, daysBetween, toDateKey } from "./date";

/**
 * Progressive overload tracking.
 *
 * Double progression: work up the rep range at a fixed load, then add weight
 * and drop back to the bottom. It is the progression model that keeps working
 * after linear progression stops, and it needs no 1RM testing — which is why it
 * is the right default for anyone not peaking for a meet.
 *
 * The job of this module is to answer one question for every lift, from the
 * logged history alone: *should the weight go up this session?* That question
 * has a definite answer, and having to work it out yourself between sets is the
 * main reason people sit at the same weight for months.
 */

export interface RepRangePolicy {
  /** Range for compound lifts. */
  compound: [number, number];
  /** Range for isolation work, where higher reps are usually more productive. */
  isolation: [number, number];
  /** Per-exercise ranges, which win over both. */
  overrides: Record<string, [number, number]>;
  /**
   * RPE at or below which clearing the range earns a load increase. Above it,
   * the reps were there but the effort says hold — adding weight on top of a
   * maximal set is how a stall starts.
   */
  targetRpe: number;
  /**
   * Strict double progression requires *every* working set to reach the top of
   * the range. Relaxed requires only the best set, which progresses faster and
   * stalls sooner.
   */
  requireAllSets: boolean;
}

export const DEFAULT_REP_RANGE_POLICY: RepRangePolicy = {
  compound: [6, 10],
  isolation: [10, 15],
  overrides: {},
  targetRpe: 8.5,
  requireAllSets: true,
};

export type ProgressionState =
  /** Cleared the top of the range at an acceptable effort — add load. */
  | "ready"
  /** In range; chase another rep at the same load. */
  | "building"
  /** Several sessions at the same load without clearing it. */
  | "stalled"
  /** Falling short of the bottom of the range; back off. */
  | "deload"
  /** Not enough history to say anything. */
  | "new";

export interface ProgressionStatus {
  exerciseId: string;
  exerciseName: string;
  range: [number, number];
  state: ProgressionState;
  lastDate: DateKey | null;
  daysSince: number | null;
  /** Working sets at the top load of the last session. */
  lastSets: { weightKg: number; reps: number; rpe?: number }[];
  topWeightKg: number | null;
  lastMeanRpe: number | null;
  bestE1RM: number | null;
  /** What to load next session. Null when there is nothing to go on. */
  suggestedWeightKg: number | null;
  /** Rep target to aim for at the suggested load. */
  suggestedReps: number;
  incrementKg: number;
  /** Consecutive recent sessions at the same top load. */
  sessionsAtWeight: number;
  headline: string;
  detail: string;
}

export interface AssessOptions {
  policy?: RepRangePolicy;
  units?: UnitSystem;
  catalog?: Map<string, Exercise>;
  asOf?: DateKey;
}

/** The rep range that applies to a lift: override, then compound/isolation. */
export const resolveRepRange = (
  exercise: Exercise | undefined,
  policy: RepRangePolicy,
): [number, number] => {
  if (exercise && policy.overrides[exercise.id]) return policy.overrides[exercise.id]!;
  if (!exercise) return policy.compound;
  return exercise.isCompound ? policy.compound : policy.isolation;
};

/**
 * The load steps a lift can actually be loaded in.
 *
 * A suggestion of 13.75 kg on a dumbbell lift is useless: dumbbells go 12, 14,
 * 16. Increments therefore come from the equipment, not from a single global
 * constant — `smallest` is the finest real step, `standard` the jump to take
 * when a lift has earned one.
 */
export interface LoadStep {
  smallest: number;
  standard: number;
}

const LOWER_BODY = ["quads", "hamstrings", "glutes", "calves"];

export const equipmentLoadStep = (
  exercise: Exercise | undefined,
  units: UnitSystem,
): LoadStep => {
  const isLower = !!exercise?.primary.some((m) => LOWER_BODY.includes(m));
  const equipment = exercise?.equipment ?? [];
  const has = (kind: string): boolean => equipment.includes(kind as never);
  const imperial = units === "imperial";
  const lb = (pounds: number): number => round(pounds * 0.45359237, 3);

  // Fixed dumbbells and kettlebells come in fixed sizes; nothing finer exists.
  if (has("dumbbell") && !has("barbell")) {
    return imperial ? { smallest: lb(5), standard: lb(5) } : { smallest: 2, standard: 2 };
  }
  if (has("kettlebell") && !has("barbell") && !has("dumbbell")) {
    return imperial ? { smallest: lb(8), standard: lb(8) } : { smallest: 4, standard: 4 };
  }
  if ((has("machine") || has("cable")) && !has("barbell")) {
    return imperial ? { smallest: lb(5), standard: lb(10) } : { smallest: 2.5, standard: 5 };
  }
  if (has("barbell")) {
    return imperial
      ? { smallest: lb(5), standard: lb(isLower ? 10 : 5) }
      : { smallest: 2.5, standard: isLower ? 5 : 2.5 };
  }
  // Bodyweight and bands: the step is whatever is being hung off the belt.
  return imperial ? { smallest: lb(5), standard: lb(5) } : { smallest: 2.5, standard: 2.5 };
};

/** Round a load to something the equipment can actually be set to. */
export const snapToEquipment = (
  kg: number,
  exercise: Exercise | undefined,
  units: UnitSystem,
): number => {
  const { smallest } = equipmentLoadStep(exercise, units);
  return round(Math.max(smallest, Math.round(kg / smallest) * smallest), 2);
};

/**
 * How much to add.
 *
 * The standard jump, unless that would be more than a tenth of the current
 * load — in which case take the finest step the equipment allows. On a 12 kg
 * dumbbell that is still 2 kg, because 13 kg dumbbells do not exist.
 */
export const progressionIncrement = (
  exercise: Exercise | undefined,
  currentLoadKg: number,
  units: UnitSystem,
): number => {
  const { smallest, standard } = equipmentLoadStep(exercise, units);
  if (currentLoadKg > 0 && standard > currentLoadKg * 0.1) return smallest;
  return standard;
};

/** The next loadable weight up from here. */
export const nextLoad = (
  exercise: Exercise | undefined,
  currentLoadKg: number,
  units: UnitSystem,
): number => {
  const increment = progressionIncrement(exercise, currentLoadKg, units);
  const snapped = snapToEquipment(currentLoadKg + increment, exercise, units);
  // Snapping must never round back down onto the weight already being used.
  return snapped > currentLoadKg
    ? snapped
    : snapToEquipment(currentLoadKg + increment * 2, exercise, units);
};

/** Sets performed at the heaviest load of a session. */
const topSets = (sets: SetLog[]): { weight: number; sets: SetLog[] } => {
  const working = sets.filter(isWorkingSet);
  if (working.length === 0) return { weight: 0, sets: [] };
  const weight = Math.max(...working.map((s) => s.weightKg));
  return { weight, sets: working.filter((s) => s.weightKg === weight) };
};

export const assessProgression = (
  sessions: WorkoutSession[],
  exerciseId: string,
  opts: AssessOptions = {},
): ProgressionStatus => {
  const policy = opts.policy ?? DEFAULT_REP_RANGE_POLICY;
  const units = opts.units ?? "metric";
  const catalog = opts.catalog ?? EXERCISE_BY_ID;
  const asOf = opts.asOf ?? toDateKey();

  const exercise = catalog.get(exerciseId);
  const name = exercise?.name ?? exerciseId;
  const range = resolveRepRange(exercise, policy);
  const [repMin, repMax] = range;

  const history = exerciseHistory(sessions, exerciseId);

  const base: ProgressionStatus = {
    exerciseId,
    exerciseName: name,
    range,
    state: "new",
    lastDate: null,
    daysSince: null,
    lastSets: [],
    topWeightKg: null,
    lastMeanRpe: null,
    bestE1RM: null,
    suggestedWeightKg: null,
    suggestedReps: repMax,
    incrementKg: progressionIncrement(exercise, 0, units),
    sessionsAtWeight: 0,
    headline: "No history yet",
    detail: `Log a session and this will tell you exactly when to add weight. Aim for ${repMin}–${repMax} reps.`,
  };

  if (history.length === 0) return base;

  const last = history[history.length - 1]!;
  const { weight: topWeight, sets: setsAtTop } = topSets(last.sets);
  if (setsAtTop.length === 0) return base;

  const repsAtTop = setsAtTop.map((s) => s.reps);
  const minReps = Math.min(...repsAtTop);
  const maxReps = Math.max(...repsAtTop);
  const meanRpe = last.meanRpe;

  // How long has this load been sitting there?
  let sessionsAtWeight = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (topSets(history[i]!.sets).weight === topWeight) sessionsAtWeight++;
    else break;
  }

  const increment = progressionIncrement(exercise, topWeight, units);
  const effortOk = meanRpe == null || meanRpe <= policy.targetRpe;
  const cleared = policy.requireAllSets ? minReps >= repMax : maxReps >= repMax;

  const status: ProgressionStatus = {
    ...base,
    state: "building",
    lastDate: last.date,
    daysSince: daysBetween(last.date, asOf),
    lastSets: setsAtTop.map((s) => ({ weightKg: s.weightKg, reps: s.reps, rpe: s.rpe })),
    topWeightKg: topWeight,
    lastMeanRpe: meanRpe,
    bestE1RM: last.bestE1RM,
    incrementKg: increment,
    sessionsAtWeight,
    suggestedWeightKg: topWeight,
    suggestedReps: Math.min(minReps + 1, repMax),
    headline: "",
    detail: "",
  };

  const repsText = repsAtTop.join(", ");
  const loadText = `${round(topWeight, 1)} kg`;

  /* ------------------------------ Ready to go up ------------------------- */
  if (cleared && effortOk) {
    const next = nextLoad(exercise, topWeight, units);
    return {
      ...status,
      state: "ready",
      suggestedWeightKg: next,
      suggestedReps: repMin,
      headline: `Add weight — go to ${round(next, 1)} kg`,
      detail:
        `Last session you hit ${repsText} at ${loadText}` +
        (meanRpe != null ? `, averaging RPE ${meanRpe}` : "") +
        `. That is the top of your ${repMin}–${repMax} range, so the load goes up and the reps reset to ${repMin}.`,
    };
  }

  /* --------------------- Cleared the reps but it was maximal -------------- */
  if (cleared && !effortOk) {
    return {
      ...status,
      state: "building",
      suggestedWeightKg: topWeight,
      suggestedReps: repMax,
      headline: `Repeat ${loadText}`,
      detail: `You got ${repsText} at ${loadText}, but at RPE ${meanRpe} that was close to maximal. Own this weight at a lower effort before adding to it — adding load on top of a grinder is how a stall starts.`,
    };
  }

  /* -------------------------------- Deload -------------------------------- */
  if (minReps < repMin) {
    const previous = history[history.length - 2];
    const previousShort =
      previous != null && Math.min(...topSets(previous.sets).sets.map((s) => s.reps)) < repMin;
    if (previousShort) {
      const backoff = snapToEquipment(topWeight * 0.9, exercise, units);
      return {
        ...status,
        state: "deload",
        suggestedWeightKg: backoff,
        suggestedReps: repMin,
        headline: `Back off to ${round(backoff, 1)} kg`,
        detail: `Two sessions running you have come in under ${repMin} reps at ${loadText}. Drop about 10 % and rebuild the rep range — you will pass the old number within a couple of sessions.`,
      };
    }
    return {
      ...status,
      state: "building",
      suggestedWeightKg: topWeight,
      suggestedReps: repMin,
      headline: `Hold ${loadText}`,
      detail: `You got ${repsText}, short of the ${repMin}-rep floor. Stay here until every set clears ${repMin}.`,
    };
  }

  /* -------------------------------- Stalled ------------------------------- */
  if (sessionsAtWeight >= 3) {
    return {
      ...status,
      state: "stalled",
      suggestedWeightKg: topWeight,
      suggestedReps: Math.min(minReps + 1, repMax),
      headline: `${sessionsAtWeight} sessions at ${loadText}`,
      detail: `Still ${repsText} against a ${repMax}-rep target. If the next session does not move, drop 10 % for a week and build back — fatigue, not effort, is usually what is in the way.`,
    };
  }

  /* ------------------------------- Building ------------------------------- */
  const target = Math.min(minReps + 1, repMax);
  return {
    ...status,
    state: "building",
    suggestedWeightKg: topWeight,
    suggestedReps: target,
    headline: `Chase ${target} reps at ${loadText}`,
    detail:
      `Last session: ${repsText} at ${loadText}` +
      (meanRpe != null ? ` at RPE ${meanRpe}` : "") +
      `. Stay here until every set reaches ${repMax}, then the weight goes up ${round(increment, 1)} kg.`,
  };
};

const STATE_ORDER: Record<ProgressionState, number> = {
  ready: 0,
  stalled: 1,
  deload: 2,
  building: 3,
  new: 4,
};

export interface BoardOptions extends AssessOptions {
  /** Only consider lifts trained within this many days. */
  windowDays?: number;
}

/**
 * Every lift trained recently, with what to do about it — readiness first.
 * This is the answer to "what should go up today?" across the whole programme.
 */
export const progressionBoard = (
  sessions: WorkoutSession[],
  opts: BoardOptions = {},
): ProgressionStatus[] => {
  const asOf = opts.asOf ?? toDateKey();
  const windowDays = opts.windowDays ?? 42;

  const recent = new Set<string>();
  for (const session of sessions) {
    if (daysBetween(session.date, asOf) > windowDays) continue;
    for (const set of session.sets) if (isWorkingSet(set)) recent.add(set.exerciseId);
  }

  return [...recent]
    .map((id) => assessProgression(sessions, id, { ...opts, asOf }))
    .sort((a, b) => {
      const order = STATE_ORDER[a.state] - STATE_ORDER[b.state];
      if (order !== 0) return order;
      // Within a state, the lift trained longest ago is the one due next.
      return (b.daysSince ?? 0) - (a.daysSince ?? 0);
    });
};

/** Convenience: the lifts that have earned a load increase. */
export const readyToProgress = (
  sessions: WorkoutSession[],
  opts: BoardOptions = {},
): ProgressionStatus[] => progressionBoard(sessions, opts).filter((s) => s.state === "ready");

/** Best estimated 1RM trend for a lift, for the progression detail view. */
export const e1rmSeries = (
  sessions: WorkoutSession[],
  exerciseId: string,
): { date: DateKey; e1rm: number }[] =>
  exerciseHistory(sessions, exerciseId)
    .map((entry) => ({
      date: entry.date,
      e1rm: entry.bestE1RM ?? Math.max(0, ...entry.sets.map((s) => setE1RM(s) ?? 0)),
    }))
    .filter((point) => point.e1rm > 0);
