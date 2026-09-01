import type {
  CardioLog,
  Exercise,
  MuscleGroup,
  SetLog,
  WorkoutSession,
} from "../types";
import { type CsvRow, parseCsv, pick, toNumber } from "../csv";
import {
  EXERCISES,
  buildNameIndex,
  exerciseTokenKey,
  normalizeExerciseName,
} from "../data/exercises";
import { kcalFromMet } from "../energy";
import { lbToKg, round } from "../units";
import { cryptoId } from "../nutrition";

/**
 * Importer for the Strong app's CSV export
 * (Strong → Settings → Export Data → Export Workout Data).
 *
 * Strong has no public API, so this file is the whole integration surface. It
 * is written to be run more than once safely: sessions carry a stable
 * `externalId` derived from their source timestamp, so re-importing the same
 * export — or a newer export that still contains old workouts — adds only what
 * is genuinely new.
 *
 * Known header variants handled:
 *   Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps,
 *   Distance, Seconds, Notes, Workout Notes, RPE
 * and the older layout that carries explicit `Weight Unit` / `Distance Unit`
 * columns. Delimiters may be commas or semicolons.
 */

export type WeightUnit = "kg" | "lb";

export interface StrongImportOptions {
  /** Unit the Weight column is expressed in, when the file does not say. */
  weightUnit?: WeightUnit;
  /** Bodyweight used to estimate the energy cost of cardio rows. */
  bodyWeightKg?: number;
  /** Exercise catalog to match against. */
  exercises?: Exercise[];
  /** Session externalIds already stored, so re-imports stay idempotent. */
  existingExternalIds?: Iterable<string>;
}

export interface UnmatchedExercise {
  sourceName: string;
  /** The placeholder exercise created for it. */
  exerciseId: string;
  setCount: number;
}

export interface StrongImportResult {
  sessions: WorkoutSession[];
  /** Exercises invented for names not in the catalog, ready to be persisted. */
  newExercises: Exercise[];
  unmatched: UnmatchedExercise[];
  stats: {
    rowsParsed: number;
    rowsSkipped: number;
    sessionsFound: number;
    sessionsNew: number;
    sessionsDuplicate: number;
    setsImported: number;
    cardioImported: number;
    dateRange: { from: string; to: string } | null;
    detectedUnit: WeightUnit;
  };
  warnings: string[];
}

/* -------------------------------------------------------------------------- */
/*                              Date handling                                 */
/* -------------------------------------------------------------------------- */

/**
 * Strong writes `YYYY-MM-DD HH:MM:SS`, but older builds and some locales emit
 * other shapes. Parse defensively and keep the raw string as identity.
 */
const parseStrongDate = (raw: string): { key: string; iso: string } | null => {
  const value = raw.trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (iso) {
    const [, y, m, d, hh, mm, ss] = iso;
    return {
      key: `${y}-${m}-${d}`,
      iso: new Date(
        Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss ?? "0"),
      ).toISOString(),
    };
  }

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return {
      key: `${y}-${m}-${d}`,
      iso: new Date(Number(y), Number(m) - 1, Number(d)).toISOString(),
    };
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const pad = (n: number): string => String(n).padStart(2, "0");
    return {
      key: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
      iso: parsed.toISOString(),
    };
  }
  return null;
};

/** `1h 5min`, `45min`, `1h` → minutes. */
export const parseStrongDuration = (raw: string): number => {
  if (!raw) return 0;
  const hours = raw.match(/(\d+)\s*h/i);
  const minutes = raw.match(/(\d+)\s*m/i);
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  if (total > 0) return total;
  const bare = Number.parseFloat(raw);
  return Number.isFinite(bare) ? bare : 0;
};

/* -------------------------------------------------------------------------- */
/*                            Exercise name matching                          */
/* -------------------------------------------------------------------------- */

/** Keyword → muscle heuristics, so an unmatched name still feeds analytics. */
const MUSCLE_KEYWORDS: [RegExp, MuscleGroup[]][] = [
  [/curl/i, ["biceps"]],
  [/tricep|pushdown|skull|dip/i, ["triceps"]],
  [/bench|chest|fly|pec/i, ["chest"]],
  [/squat|leg press|leg extension|lunge|step up/i, ["quads", "glutes"]],
  [/deadlift|rdl|romanian|good morning|leg curl|hamstring/i, ["hamstrings", "glutes"]],
  [/hip thrust|glute/i, ["glutes"]],
  [/row|pulldown|pull up|pull-up|chin|lat /i, ["back", "lats"]],
  [/shoulder|press|raise|delt|shrug/i, ["shoulders"]],
  [/calf|calve/i, ["calves"]],
  [/ab |abs|crunch|plank|core|oblique/i, ["core"]],
  [/wrist|forearm|grip/i, ["forearms"]],
];

const guessMuscles = (name: string): MuscleGroup[] => {
  for (const [pattern, muscles] of MUSCLE_KEYWORDS) {
    if (pattern.test(name)) return muscles;
  }
  return ["core"];
};

const slugify = (name: string): string =>
  normalizeExerciseName(name).replace(/ /g, "-").slice(0, 48) || "exercise";

interface Matcher {
  match(name: string): Exercise | null;
}

/**
 * Three-stage matching: exact normalised name or alias, then order-insensitive
 * token match (so `Bench Press (Barbell)` finds `Barbell Bench Press`), then a
 * token-overlap score for near misses like `Lat Pulldown - Wide Grip`.
 */
export const createExerciseMatcher = (exercises: Exercise[]): Matcher => {
  const byName = buildNameIndex(exercises);
  const byTokens = new Map<string, Exercise>();
  for (const e of exercises) {
    const keys = [e.name, ...(e.aliases ?? [])].map(exerciseTokenKey);
    for (const key of keys) if (!byTokens.has(key)) byTokens.set(key, e);
  }

  return {
    match(name: string): Exercise | null {
      const normalized = normalizeExerciseName(name);
      const exact = byName.get(normalized);
      if (exact) return exact;

      const tokens = byTokens.get(exerciseTokenKey(name));
      if (tokens) return tokens;

      const queryTokens = new Set(normalized.split(" ").filter(Boolean));
      if (queryTokens.size === 0) return null;

      let best: Exercise | null = null;
      let bestScore = 0;
      for (const candidate of exercises) {
        for (const label of [candidate.name, ...(candidate.aliases ?? [])]) {
          const candidateTokens = normalizeExerciseName(label).split(" ").filter(Boolean);
          if (candidateTokens.length === 0) continue;
          const overlap = candidateTokens.filter((t) => queryTokens.has(t)).length;
          // Jaccard-ish: reward overlap, penalise size mismatch in both directions.
          const score =
            overlap / (candidateTokens.length + queryTokens.size - overlap);
          if (score > bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
      }
      // 0.7 keeps "Incline Bench Press" from collapsing into "Bench Press".
      return bestScore >= 0.7 ? best : null;
    },
  };
};

/* -------------------------------------------------------------------------- */
/*                                Row handling                                */
/* -------------------------------------------------------------------------- */

/** Rows Strong emits that are not sets. */
const isNonSetRow = (setOrder: string): boolean =>
  /^(rest timer|note)/i.test(setOrder.trim());

const isWarmupRow = (setOrder: string): boolean =>
  /^w/i.test(setOrder.trim()) && !/^workout/i.test(setOrder.trim());

/**
 * Decide the weight unit when the file does not carry one.
 *
 * Strong exports in whatever unit the app is set to. Heuristic: barbell work
 * logged in pounds produces a lot of values that are multiples of 5 and above
 * 150, which is rare in kilograms for most lifters. This is only a default —
 * the import UI shows it and lets the user flip it before committing.
 */
export const guessWeightUnit = (weights: number[]): WeightUnit => {
  const lifted = weights.filter((w) => w > 0);
  if (lifted.length < 5) return "kg";
  const heavy = lifted.filter((w) => w > 150).length / lifted.length;
  const multiplesOfFive = lifted.filter((w) => Math.abs(w % 5) < 1e-6).length / lifted.length;
  const fractional = lifted.filter((w) => Math.abs(w % 1) > 1e-6).length / lifted.length;
  if (heavy > 0.2 && multiplesOfFive > 0.7 && fractional < 0.1) return "lb";
  return "kg";
};

/* -------------------------------------------------------------------------- */
/*                                  Import                                    */
/* -------------------------------------------------------------------------- */

export const importStrongCsv = (
  csvText: string,
  opts: StrongImportOptions = {},
): StrongImportResult => {
  const warnings: string[] = [];
  const rows = parseCsv(csvText);

  if (rows.length === 0) {
    return emptyResult("The file has no rows. Make sure you exported workout data, not measurements.");
  }

  const first = rows[0]!;
  if (!pick(first, "Exercise Name", "Exercise") || !pick(first, "Date")) {
    return emptyResult(
      "This does not look like a Strong export — expected `Date` and `Exercise Name` columns. In Strong, go to Settings → Export Data → Export Workout Data.",
    );
  }

  const catalog = opts.exercises ?? EXERCISES;
  const matcher = createExerciseMatcher(catalog);
  const existing = new Set(opts.existingExternalIds ?? []);
  const bodyWeightKg = opts.bodyWeightKg ?? 75;

  // Resolve the weight unit once, from the file or by inference.
  const fileUnit = pick(first, "Weight Unit").toLowerCase();
  const rawWeights = rows.map((r) => toNumber(pick(r, "Weight", "Weight (kg)", "Weight (lbs)")));
  const detectedUnit: WeightUnit =
    opts.weightUnit ??
    (fileUnit.startsWith("lb") ? "lb" : fileUnit.startsWith("kg") ? "kg" : guessWeightUnit(rawWeights));
  const toKg = (value: number): number =>
    detectedUnit === "lb" ? round(lbToKg(value), 2) : value;

  interface Draft {
    externalId: string;
    date: string;
    startedAt: string;
    name: string;
    durationMinutes: number;
    notes: string;
    sets: SetLog[];
    cardio: CardioLog[];
  }

  const drafts = new Map<string, Draft>();
  const newExercises = new Map<string, Exercise>();
  const unmatched = new Map<string, UnmatchedExercise>();
  let rowsSkipped = 0;

  for (const row of rows) {
    const rawDate = pick(row, "Date");
    const parsedDate = parseStrongDate(rawDate);
    const exerciseName = pick(row, "Exercise Name", "Exercise").trim();
    const setOrder = pick(row, "Set Order", "Set");

    if (!parsedDate || !exerciseName || isNonSetRow(setOrder)) {
      rowsSkipped++;
      continue;
    }

    const workoutName = pick(row, "Workout Name", "Workout") || "Workout";
    // Strong cannot start two workouts at the same instant, so the timestamp
    // is a stable identity even across re-exports.
    const externalId = `strong:${rawDate}:${workoutName}`;

    let draft = drafts.get(externalId);
    if (!draft) {
      draft = {
        externalId,
        date: parsedDate.key,
        startedAt: parsedDate.iso,
        name: workoutName,
        durationMinutes: parseStrongDuration(pick(row, "Duration", "Workout Duration")),
        notes: pick(row, "Workout Notes"),
        sets: [],
        cardio: [],
      };
      drafts.set(externalId, draft);
    }

    // Resolve the exercise, inventing a placeholder when the name is unknown.
    let exercise = matcher.match(exerciseName);
    if (!exercise) {
      const id = `strong-${slugify(exerciseName)}`;
      exercise =
        newExercises.get(id) ??
        ({
          id,
          name: exerciseName,
          aliases: [exerciseName],
          primary: guessMuscles(exerciseName),
          secondary: [],
          equipment: ["machine"],
          pattern: "isolation",
          isCompound: false,
          skill: 1,
        } satisfies Exercise);
      newExercises.set(id, exercise);

      const record = unmatched.get(exerciseName) ?? {
        sourceName: exerciseName,
        exerciseId: id,
        setCount: 0,
      };
      record.setCount++;
      unmatched.set(exerciseName, record);
    }

    const weight = toKg(toNumber(pick(row, "Weight", "Weight (kg)", "Weight (lbs)")));
    const reps = Math.round(toNumber(pick(row, "Reps")));
    const seconds = toNumber(pick(row, "Seconds", "Duration (s)"));
    const distance = toNumber(pick(row, "Distance", "Distance (km)"));
    const rpeValue = toNumber(pick(row, "RPE"));

    const isCardio =
      exercise.pattern === "cardio" || (reps === 0 && seconds > 0 && weight === 0);

    if (isCardio) {
      const minutes = seconds > 0 ? seconds / 60 : 0;
      if (minutes <= 0) {
        rowsSkipped++;
        continue;
      }
      draft.cardio.push({
        id: cryptoId(),
        exerciseId: exercise.id,
        minutes: round(minutes, 1),
        intensity: "moderate",
        distanceKm: distance > 0 ? round(distance, 2) : undefined,
        kcal: Math.round(kcalFromMet(exercise.met ?? 6, bodyWeightKg, minutes)),
      });
      continue;
    }

    if (reps <= 0) {
      rowsSkipped++;
      continue;
    }

    draft.sets.push({
      id: cryptoId(),
      exerciseId: exercise.id,
      sourceExerciseName: exerciseName,
      weightKg: weight,
      reps,
      rpe: rpeValue >= 5 && rpeValue <= 10 ? rpeValue : undefined,
      isWarmup: isWarmupRow(setOrder) || undefined,
      completed: true,
    });
  }

  const all = [...drafts.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const fresh = all.filter((d) => !existing.has(d.externalId));
  const duplicates = all.length - fresh.length;

  const sessions: WorkoutSession[] = fresh
    .filter((d) => d.sets.length > 0 || d.cardio.length > 0)
    .map((d) => {
      const endedAt =
        d.durationMinutes > 0
          ? new Date(new Date(d.startedAt).getTime() + d.durationMinutes * 60_000).toISOString()
          : undefined;
      return {
        id: cryptoId(),
        date: d.date,
        name: d.name,
        source: "strong",
        externalId: d.externalId,
        importedAt: new Date().toISOString(),
        startedAt: d.startedAt,
        endedAt,
        sets: d.sets,
        cardio: d.cardio,
        notes: d.notes || undefined,
      } satisfies WorkoutSession;
    });

  if (unmatched.size > 0) {
    warnings.push(
      `${unmatched.size} exercise ${unmatched.size === 1 ? "name was" : "names were"} not in the catalog. They have been kept under their original names so no history is lost, with muscle groups inferred from the name.`,
    );
  }
  if (!opts.weightUnit && !fileUnit) {
    warnings.push(
      `The export does not record a weight unit, so it was read as ${detectedUnit === "kg" ? "kilograms" : "pounds"}. Check a familiar lift below before importing.`,
    );
  }

  const dates = sessions.map((s) => s.date).sort();

  return {
    sessions,
    newExercises: [...newExercises.values()],
    unmatched: [...unmatched.values()].sort((a, b) => b.setCount - a.setCount),
    stats: {
      rowsParsed: rows.length,
      rowsSkipped,
      sessionsFound: all.length,
      sessionsNew: sessions.length,
      sessionsDuplicate: duplicates,
      setsImported: sessions.reduce((n, s) => n + s.sets.length, 0),
      cardioImported: sessions.reduce((n, s) => n + s.cardio.length, 0),
      dateRange: dates.length ? { from: dates[0]!, to: dates[dates.length - 1]! } : null,
      detectedUnit,
    },
    warnings,
  };
};

const emptyResult = (warning: string): StrongImportResult => ({
  sessions: [],
  newExercises: [],
  unmatched: [],
  stats: {
    rowsParsed: 0,
    rowsSkipped: 0,
    sessionsFound: 0,
    sessionsNew: 0,
    sessionsDuplicate: 0,
    setsImported: 0,
    cardioImported: 0,
    dateRange: null,
    detectedUnit: "kg",
  },
  warnings: [warning],
});

/** Re-read a `CsvRow` list, exposed for tests and for previewing raw content. */
export const parseStrongRows = (csvText: string): CsvRow[] => parseCsv(csvText);
