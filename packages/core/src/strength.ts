import type {
  Exercise,
  MuscleGroup,
  SetLog,
  UnitSystem,
  WorkoutSession,
} from "./types";
import { clamp, loadIncrement, round, snapLoad } from "./units";
import { type DateKey } from "./date";
import { linearSlope, mean } from "./analytics";

/* -------------------------------------------------------------------------- */
/*                              One-rep maximum                               */
/* -------------------------------------------------------------------------- */

/** Epley: linear in reps, tends to read slightly high at low rep counts. */
export const epley1RM = (weightKg: number, reps: number): number =>
  reps <= 1 ? weightKg : weightKg * (1 + reps / 30);

/** Brzycki: reads slightly low above ~10 reps, and blows up as reps → 37. */
export const brzycki1RM = (weightKg: number, reps: number): number =>
  reps <= 1 ? weightKg : weightKg * (36 / (37 - Math.min(reps, 36)));

/**
 * Estimated 1RM, averaging the two formulas where they are both trustworthy.
 * Above 12 reps the estimate is dominated by muscular endurance rather than
 * maximal strength, so we return null rather than a confident wrong number.
 */
export const estimate1RM = (weightKg: number, reps: number): number | null => {
  if (weightKg <= 0 || reps <= 0 || reps > 12) return null;
  if (reps === 1) return weightKg;
  return round((epley1RM(weightKg, reps) + brzycki1RM(weightKg, reps)) / 2, 1);
};

/**
 * Percentage of 1RM implied by a reps-at-RPE pairing.
 *
 * RPE 10 means no reps left in reserve; RPE 8 means two. The table is the
 * commonly used RPE/RIR chart, indexed [reps][RIR].
 */
const RPE_TABLE: Record<number, number[]> = {
  //        RIR 0    1     2     3     4
  1: [1.0, 0.955, 0.922, 0.892, 0.863],
  2: [0.955, 0.922, 0.892, 0.863, 0.837],
  3: [0.922, 0.892, 0.863, 0.837, 0.811],
  4: [0.892, 0.863, 0.837, 0.811, 0.786],
  5: [0.863, 0.837, 0.811, 0.786, 0.762],
  6: [0.837, 0.811, 0.786, 0.762, 0.739],
  7: [0.811, 0.786, 0.762, 0.739, 0.707],
  8: [0.786, 0.762, 0.739, 0.707, 0.68],
  9: [0.762, 0.739, 0.707, 0.68, 0.653],
  10: [0.739, 0.707, 0.68, 0.653, 0.626],
  11: [0.707, 0.68, 0.653, 0.626, 0.599],
  12: [0.68, 0.653, 0.626, 0.599, 0.572],
};

export const percentOf1RM = (reps: number, rpe: number): number | null => {
  const row = RPE_TABLE[Math.round(clamp(reps, 1, 12))];
  if (!row) return null;
  const rir = Math.round(clamp(10 - rpe, 0, 4));
  return row[rir] ?? null;
};

/** 1RM implied by a set taken to a known RPE — more accurate than reps alone. */
export const estimate1RMFromRpe = (
  weightKg: number,
  reps: number,
  rpe: number,
): number | null => {
  const pct = percentOf1RM(reps, rpe);
  if (!pct || pct <= 0) return null;
  return round(weightKg / pct, 1);
};

/** Best available e1RM for a set, preferring the RPE-aware estimate. */
export const setE1RM = (set: SetLog): number | null => {
  if (set.isWarmup || !set.completed) return null;
  if (set.rpe != null) return estimate1RMFromRpe(set.weightKg, set.reps, set.rpe);
  return estimate1RM(set.weightKg, set.reps);
};

/** Load to use for a target rep count at a target RPE, given an e1RM. */
export const workingLoad = (
  e1rm: number,
  reps: number,
  rpe: number,
  units: UnitSystem,
): number | null => {
  const pct = percentOf1RM(reps, rpe);
  if (!pct) return null;
  return snapLoad(e1rm * pct, units);
};

/* -------------------------------------------------------------------------- */
/*                                   Volume                                   */
/* -------------------------------------------------------------------------- */

export const isWorkingSet = (s: SetLog): boolean =>
  s.completed && !s.isWarmup && s.reps > 0;

/** Tonnage: Σ weight × reps. The crude but useful measure of work done. */
export const volumeLoad = (sets: SetLog[]): number =>
  sets.filter(isWorkingSet).reduce((sum, s) => sum + s.weightKg * s.reps, 0);

/**
 * Weekly hard sets per muscle group — the metric that actually governs
 * hypertrophy. A set counts fully for the muscles it primarily trains and half
 * for those it assists.
 */
export const setsPerMuscle = (
  sessions: WorkoutSession[],
  catalog: Map<string, Exercise>,
): Record<MuscleGroup, number> => {
  const totals = {} as Record<MuscleGroup, number>;
  for (const session of sessions) {
    for (const set of session.sets) {
      if (!isWorkingSet(set)) continue;
      const ex = catalog.get(set.exerciseId);
      if (!ex) continue;
      for (const m of ex.primary) totals[m] = (totals[m] ?? 0) + 1;
      for (const m of ex.secondary) totals[m] = (totals[m] ?? 0) + 0.5;
    }
  }
  return totals;
};

/**
 * Volume landmarks, in hard sets per muscle per week.
 *
 * MEV — minimum effective volume, below which you are maintaining at best.
 * MAV — the productive range most people grow in.
 * MRV — maximum recoverable volume; past this, more sets means less progress.
 */
export interface VolumeLandmarks {
  mev: number;
  mavLow: number;
  mavHigh: number;
  mrv: number;
}

export const VOLUME_LANDMARKS: Record<MuscleGroup, VolumeLandmarks> = {
  chest: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 22 },
  back: { mev: 10, mavLow: 14, mavHigh: 22, mrv: 25 },
  lats: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 22 },
  shoulders: { mev: 8, mavLow: 12, mavHigh: 20, mrv: 24 },
  biceps: { mev: 6, mavLow: 10, mavHigh: 18, mrv: 20 },
  triceps: { mev: 6, mavLow: 10, mavHigh: 18, mrv: 20 },
  quads: { mev: 8, mavLow: 12, mavHigh: 18, mrv: 20 },
  hamstrings: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  glutes: { mev: 4, mavLow: 8, mavHigh: 16, mrv: 18 },
  calves: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 20 },
  core: { mev: 4, mavLow: 8, mavHigh: 16, mrv: 20 },
  forearms: { mev: 2, mavLow: 6, mavHigh: 12, mrv: 16 },
};

export type VolumeVerdict = "under" | "maintaining" | "optimal" | "high" | "excessive";

export const classifyVolume = (
  muscle: MuscleGroup,
  weeklySets: number,
): VolumeVerdict => {
  const l = VOLUME_LANDMARKS[muscle];
  if (weeklySets < l.mev * 0.5) return "under";
  if (weeklySets < l.mev) return "maintaining";
  if (weeklySets <= l.mavHigh) return "optimal";
  if (weeklySets <= l.mrv) return "high";
  return "excessive";
};

/* -------------------------------------------------------------------------- */
/*                             Exercise history                               */
/* -------------------------------------------------------------------------- */

export interface ExerciseSessionSummary {
  date: DateKey;
  sessionId: string;
  sets: SetLog[];
  topSet: SetLog | null;
  bestE1RM: number | null;
  volumeLoad: number;
  meanRpe: number | null;
}

/** Per-session history for one exercise, oldest first. */
export const exerciseHistory = (
  sessions: WorkoutSession[],
  exerciseId: string,
): ExerciseSessionSummary[] => {
  const summaries: ExerciseSessionSummary[] = [];

  for (const session of sessions) {
    const sets = session.sets.filter(
      (s) => s.exerciseId === exerciseId && isWorkingSet(s),
    );
    if (sets.length === 0) continue;

    let topSet: SetLog | null = null;
    let bestE1RM: number | null = null;
    for (const s of sets) {
      const e = setE1RM(s);
      if (e != null && (bestE1RM == null || e > bestE1RM)) {
        bestE1RM = e;
        topSet = s;
      }
    }
    // No usable e1RM (very high rep sets): fall back to the heaviest set.
    if (!topSet) {
      topSet = sets.reduce((a, b) => (b.weightKg > a.weightKg ? b : a), sets[0]!);
    }

    const rpes = sets.filter((s) => s.rpe != null).map((s) => s.rpe!);
    summaries.push({
      date: session.date,
      sessionId: session.id,
      sets,
      topSet,
      bestE1RM,
      volumeLoad: volumeLoad(sets),
      meanRpe: rpes.length ? round(mean(rpes), 1) : null,
    });
  }

  return summaries.sort((a, b) => a.date.localeCompare(b.date));
};

/** The most recent completed working sets for an exercise, for prefilling. */
export const lastPerformance = (
  sessions: WorkoutSession[],
  exerciseId: string,
): ExerciseSessionSummary | null => {
  const history = exerciseHistory(sessions, exerciseId);
  return history.length ? history[history.length - 1]! : null;
};

/* -------------------------------------------------------------------------- */
/*                             Personal records                               */
/* -------------------------------------------------------------------------- */

export interface PersonalRecord {
  exerciseId: string;
  /** Heaviest weight moved for at least one rep. */
  maxWeightKg: number;
  maxWeightReps: number;
  maxWeightDate: DateKey;
  /** Best estimated 1RM. */
  bestE1RM: number | null;
  bestE1RMDate: DateKey | null;
  /** Best single-set volume (weight × reps). */
  bestSetVolume: number;
  bestSetVolumeDate: DateKey | null;
}

export const personalRecords = (
  sessions: WorkoutSession[],
): Map<string, PersonalRecord> => {
  const prs = new Map<string, PersonalRecord>();
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const session of ordered) {
    for (const set of session.sets) {
      if (!isWorkingSet(set)) continue;
      const current = prs.get(set.exerciseId);
      const e1rm = setE1RM(set);
      const setVolume = set.weightKg * set.reps;
      if (!current) {
        prs.set(set.exerciseId, {
          exerciseId: set.exerciseId,
          maxWeightKg: set.weightKg,
          maxWeightReps: set.reps,
          maxWeightDate: session.date,
          bestE1RM: e1rm,
          bestE1RMDate: e1rm != null ? session.date : null,
          bestSetVolume: setVolume,
          bestSetVolumeDate: session.date,
        });
        continue;
      }
      if (set.weightKg > current.maxWeightKg) {
        current.maxWeightKg = set.weightKg;
        current.maxWeightReps = set.reps;
        current.maxWeightDate = session.date;
      }
      if (e1rm != null && (current.bestE1RM == null || e1rm > current.bestE1RM)) {
        current.bestE1RM = e1rm;
        current.bestE1RMDate = session.date;
      }
      if (setVolume > current.bestSetVolume) {
        current.bestSetVolume = setVolume;
        current.bestSetVolumeDate = session.date;
      }
    }
  }
  return prs;
};

export type PrKind = "weight" | "e1rm" | "volume";

/**
 * Which records a set would break, given the records standing before it.
 *
 * A lift with no history sets a baseline rather than a record — badging the
 * first set you ever log as a PR devalues the badge for the sets that earn it.
 */
export const prsBrokenBy = (
  set: SetLog,
  existing: PersonalRecord | undefined,
): PrKind[] => {
  if (!isWorkingSet(set)) return [];
  if (!existing) return [];
  const broken: PrKind[] = [];
  if (set.weightKg > existing.maxWeightKg) broken.push("weight");
  const e1rm = setE1RM(set);
  if (e1rm != null && (existing.bestE1RM == null || e1rm > existing.bestE1RM)) {
    broken.push("e1rm");
  }
  if (set.weightKg * set.reps > existing.bestSetVolume) broken.push("volume");
  return broken;
};

/* -------------------------------------------------------------------------- */
/*                            Progression engine                              */
/* -------------------------------------------------------------------------- */

export type ProgressionAction =
  | "increase_load"
  | "add_reps"
  | "hold"
  | "deload"
  | "start";

export interface ProgressionSuggestion {
  action: ProgressionAction;
  weightKg: number;
  reps: number;
  sets: number;
  reason: string;
}

/**
 * Double progression: work up the rep range at a fixed load, then add weight
 * and drop back to the bottom of the range.
 *
 * This is the progression model that keeps working when linear progression
 * stops, and it needs no 1RM testing — which is why it is the default for
 * everyone who is not peaking for a meet.
 */
export const suggestProgression = (
  history: ExerciseSessionSummary[],
  opts: {
    repMin: number;
    repMax: number;
    sets: number;
    targetRpe: number;
    units: UnitSystem;
    isUpperBody: boolean;
  },
): ProgressionSuggestion => {
  const increment = loadIncrement(opts.units, opts.isUpperBody ? "upper" : "lower");

  if (history.length === 0) {
    return {
      action: "start",
      weightKg: 0,
      reps: opts.repMax,
      sets: opts.sets,
      reason:
        "First time logging this lift. Pick a weight you could do about two more reps with, and we will calibrate from there.",
    };
  }

  const last = history[history.length - 1]!;
  const workSets = last.sets;
  const topWeight = Math.max(...workSets.map((s) => s.weightKg));
  const setsAtTop = workSets.filter((s) => s.weightKg === topWeight);
  const minRepsAtTop = Math.min(...setsAtTop.map((s) => s.reps));
  const rpe = last.meanRpe;

  // Three sessions of flat or falling e1RM with RPE at or above target is a
  // stall, not a bad day. Deload rather than grinding into it.
  if (history.length >= 3) {
    const recent = history.slice(-3);
    const e1rms = recent
      .map((h) => h.bestE1RM)
      .filter((v): v is number => v != null);
    if (e1rms.length === 3 && linearSlope(e1rms) <= 0) {
      const rpes = recent.map((h) => h.meanRpe).filter((v): v is number => v != null);
      if (rpes.length >= 2 && mean(rpes) >= opts.targetRpe) {
        return {
          action: "deload",
          weightKg: snapLoad(topWeight * 0.9, opts.units),
          reps: opts.repMax,
          sets: opts.sets,
          reason:
            "Three sessions without progress at a high RPE. Drop 10 % for a week to shed fatigue, then build back — you will pass the old number within two sessions.",
        };
      }
    }
  }

  // Cleared the top of the rep range on every set, and it was not maximal.
  if (
    setsAtTop.length >= opts.sets &&
    minRepsAtTop >= opts.repMax &&
    (rpe == null || rpe <= opts.targetRpe)
  ) {
    return {
      action: "increase_load",
      weightKg: snapLoad(topWeight + increment, opts.units),
      reps: opts.repMin,
      sets: opts.sets,
      reason: `You hit ${opts.repMax} reps on every set at RPE ${rpe ?? "—"}. Add ${round(increment, 1)} kg and restart at ${opts.repMin} reps.`,
    };
  }

  // Fell short of the bottom of the range twice running: the weight is too
  // heavy for the prescribed volume.
  if (history.length >= 2) {
    const prev = history[history.length - 2]!;
    const prevMin = Math.min(...prev.sets.map((s) => s.reps));
    if (minRepsAtTop < opts.repMin && prevMin < opts.repMin) {
      return {
        action: "deload",
        weightKg: snapLoad(topWeight * 0.9, opts.units),
        reps: opts.repMin,
        sets: opts.sets,
        reason: `Two sessions below ${opts.repMin} reps. Back off 10 % and rebuild the rep range before adding load again.`,
      };
    }
  }

  return {
    action: "add_reps",
    weightKg: topWeight,
    reps: Math.min(minRepsAtTop + 1, opts.repMax),
    sets: opts.sets,
    reason: `Stay at ${round(topWeight, 1)} kg and chase ${Math.min(minRepsAtTop + 1, opts.repMax)} reps on every set. Load goes up once you own the top of the range.`,
  };
};

/* -------------------------------------------------------------------------- */
/*                                Plate maths                                 */
/* -------------------------------------------------------------------------- */

export const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

export interface PlateSolution {
  /** Plates for ONE side of the bar, heaviest first. */
  perSide: number[];
  barKg: number;
  achievedKg: number;
  /** How far off the requested load we landed. */
  errorKg: number;
}

/** Greedy plate loading. Greedy is exact for standard plate sets. */
export const platesFor = (
  targetKg: number,
  opts: { barKg?: number; plates?: number[] } = {},
): PlateSolution => {
  const barKg = opts.barKg ?? 20;
  const plates = opts.plates ?? KG_PLATES;
  const perSide: number[] = [];
  let remaining = (targetKg - barKg) / 2;
  if (remaining <= 0) {
    return { perSide, barKg, achievedKg: barKg, errorKg: barKg - targetKg };
  }
  for (const plate of plates) {
    while (remaining >= plate - 1e-9) {
      perSide.push(plate);
      remaining -= plate;
    }
  }
  const achieved = barKg + perSide.reduce((s, p) => s + p, 0) * 2;
  return {
    perSide,
    barKg,
    achievedKg: round(achieved, 2),
    errorKg: round(achieved - targetKg, 2),
  };
};

/* -------------------------------------------------------------------------- */
/*                             Fatigue heuristics                             */
/* -------------------------------------------------------------------------- */

/**
 * RPE creep: the same loads feeling progressively harder is the earliest
 * reliable signal that recovery is falling behind training.
 */
export const rpeCreep = (
  history: ExerciseSessionSummary[],
  lookback = 4,
): { creeping: boolean; rpeSlope: number; loadSlope: number } => {
  const recent = history.slice(-lookback);
  const rpes = recent.map((h) => h.meanRpe).filter((v): v is number => v != null);
  const loads = recent
    .map((h) => h.topSet?.weightKg)
    .filter((v): v is number => v != null);
  if (rpes.length < 3 || loads.length < 3) {
    return { creeping: false, rpeSlope: 0, loadSlope: 0 };
  }
  const rpeSlope = linearSlope(rpes);
  const loadSlope = linearSlope(loads);
  return {
    creeping: rpeSlope > 0.15 && loadSlope <= 0,
    rpeSlope: round(rpeSlope, 3),
    loadSlope: round(loadSlope, 3),
  };
};
