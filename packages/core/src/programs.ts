import type {
  Equipment,
  Exercise,
  ExperienceLevel,
  Goal,
  MovementPattern,
  MuscleGroup,
  Profile,
  Program,
  ProgramDay,
  ProgramExercise,
  SplitKind,
} from "./types";
import { EXERCISES } from "./data/exercises";
import { cryptoId } from "./nutrition";

/* -------------------------------------------------------------------------- */
/*                              Split selection                               */
/* -------------------------------------------------------------------------- */

/**
 * Pick a split from training frequency and experience.
 *
 * The governing principle is frequency per muscle: each muscle wants to be
 * trained roughly twice a week. That makes full body correct at low frequency
 * and only makes body-part splits defensible once you are training 5+ days.
 */
export const chooseSplit = (
  daysPerWeek: number,
  experience: ExperienceLevel,
): SplitKind => {
  if (daysPerWeek <= 2) return "full_body";
  if (daysPerWeek === 3) return experience === "advanced" ? "push_pull_legs" : "full_body";
  if (daysPerWeek === 4) return "upper_lower";
  return "push_pull_legs";
};

export const SPLIT_LABELS: Record<SplitKind, string> = {
  full_body: "Full Body",
  upper_lower: "Upper / Lower",
  push_pull_legs: "Push / Pull / Legs",
  arnold: "Arnold Split",
  bro_split: "Body Part Split",
};

/* -------------------------------------------------------------------------- */
/*                              Day blueprints                                */
/* -------------------------------------------------------------------------- */

type SlotRole = "primary" | "secondary" | "accessory" | "core";

interface Slot {
  role: SlotRole;
  patterns: MovementPattern[];
  /** Restrict to exercises hitting one of these muscles, when set. */
  muscles?: MuscleGroup[];
}

const P = (patterns: MovementPattern[], muscles?: MuscleGroup[]): Slot => ({
  role: "primary",
  patterns,
  ...(muscles ? { muscles } : {}),
});
const S = (patterns: MovementPattern[], muscles?: MuscleGroup[]): Slot => ({
  role: "secondary",
  patterns,
  ...(muscles ? { muscles } : {}),
});
const A = (muscles: MuscleGroup[]): Slot => ({
  role: "accessory",
  patterns: ["isolation"],
  muscles,
});
const CORE: Slot = { role: "core", patterns: ["core"] };

interface DayBlueprint {
  name: string;
  focus: MuscleGroup[];
  slots: Slot[];
}

const FULL_BODY_A: DayBlueprint = {
  name: "Full Body A",
  focus: ["quads", "chest", "back"],
  slots: [P(["squat"]), P(["horizontal_push"]), P(["horizontal_pull"]), S(["hinge"]), A(["shoulders"]), A(["biceps"]), CORE],
};
const FULL_BODY_B: DayBlueprint = {
  name: "Full Body B",
  focus: ["hamstrings", "shoulders", "lats"],
  slots: [P(["hinge"]), P(["vertical_push"]), P(["vertical_pull"]), S(["lunge"]), A(["triceps"]), A(["calves"]), CORE],
};
const FULL_BODY_C: DayBlueprint = {
  name: "Full Body C",
  focus: ["glutes", "chest", "back"],
  slots: [P(["lunge", "squat"]), P(["horizontal_push"]), P(["vertical_pull"]), S(["hinge"]), A(["shoulders"]), A(["triceps"]), CORE],
};

const UPPER_A: DayBlueprint = {
  name: "Upper A",
  focus: ["chest", "back", "shoulders"],
  slots: [P(["horizontal_push"]), P(["horizontal_pull"]), S(["vertical_push"]), S(["vertical_pull"]), A(["shoulders"]), A(["biceps"]), A(["triceps"])],
};
const UPPER_B: DayBlueprint = {
  name: "Upper B",
  focus: ["lats", "shoulders", "chest"],
  slots: [P(["vertical_push"]), P(["vertical_pull"]), S(["horizontal_push"]), S(["horizontal_pull"]), A(["shoulders"]), A(["triceps"]), A(["biceps"])],
};
const LOWER_A: DayBlueprint = {
  name: "Lower A",
  focus: ["quads", "glutes"],
  slots: [P(["squat"]), S(["hinge"]), S(["lunge"]), A(["quads"]), A(["hamstrings"]), A(["calves"]), CORE],
};
const LOWER_B: DayBlueprint = {
  name: "Lower B",
  focus: ["hamstrings", "glutes"],
  slots: [P(["hinge"]), S(["squat"]), S(["lunge"]), A(["hamstrings"]), A(["glutes"]), A(["calves"]), CORE],
};

const PUSH: DayBlueprint = {
  name: "Push",
  focus: ["chest", "shoulders", "triceps"],
  slots: [P(["horizontal_push"]), S(["vertical_push"]), S(["horizontal_push"]), A(["shoulders"]), A(["chest"]), A(["triceps"]), A(["triceps"])],
};
const PULL: DayBlueprint = {
  name: "Pull",
  focus: ["back", "lats", "biceps"],
  slots: [P(["vertical_pull"]), P(["horizontal_pull"]), S(["horizontal_pull"]), A(["shoulders"]), A(["lats"]), A(["biceps"]), A(["biceps"])],
};
const LEGS: DayBlueprint = {
  name: "Legs",
  focus: ["quads", "hamstrings", "glutes"],
  slots: [P(["squat"]), P(["hinge"]), S(["lunge"]), A(["quads"]), A(["hamstrings"]), A(["calves"]), CORE],
};

const BLUEPRINTS: Record<SplitKind, (days: number) => DayBlueprint[]> = {
  full_body: (days) => [FULL_BODY_A, FULL_BODY_B, FULL_BODY_C].slice(0, Math.max(1, Math.min(days, 3))),
  upper_lower: (days) =>
    days >= 4 ? [UPPER_A, LOWER_A, UPPER_B, LOWER_B] : [UPPER_A, LOWER_A],
  push_pull_legs: (days) => {
    if (days >= 6) return [PUSH, PULL, LEGS, PUSH, PULL, LEGS];
    if (days === 5) return [PUSH, PULL, LEGS, UPPER_A, LOWER_A];
    return [PUSH, PULL, LEGS];
  },
  arnold: () => [PUSH, PULL, LEGS],
  bro_split: () => [PUSH, PULL, LEGS],
};

/* -------------------------------------------------------------------------- */
/*                             Set & rep schemes                              */
/* -------------------------------------------------------------------------- */

interface Prescription {
  sets: number;
  repMin: number;
  repMax: number;
  rpe: number;
  restSeconds: number;
}

/**
 * Prescription by goal, role and experience.
 *
 * Rep range matters far less than proximity to failure and total hard sets, so
 * the ranges here are broad on purpose. Compounds get lower reps and longer
 * rest because they are limited by systemic fatigue, not local fatigue.
 */
const prescribe = (
  role: SlotRole,
  goal: Goal,
  experience: ExperienceLevel,
): Prescription => {
  const strengthBias = goal === "gain" || goal === "maintain";
  const setBonus = experience === "advanced" ? 1 : experience === "beginner" ? -1 : 0;

  switch (role) {
    case "primary":
      return {
        sets: Math.max(2, 4 + setBonus),
        repMin: strengthBias ? 5 : 6,
        repMax: strengthBias ? 8 : 10,
        rpe: 8,
        restSeconds: 180,
      };
    case "secondary":
      return {
        sets: Math.max(2, 3 + setBonus),
        repMin: 8,
        repMax: 12,
        rpe: 8.5,
        restSeconds: 120,
      };
    case "accessory":
      return {
        sets: Math.max(2, 3 + setBonus),
        repMin: 10,
        repMax: 15,
        rpe: 9,
        restSeconds: 75,
      };
    case "core":
      return { sets: 3, repMin: 10, repMax: 20, rpe: 8, restSeconds: 60 };
  }
};

/** Technical ceiling by experience — no snatch-grip anything on week one. */
const skillCeiling = (experience: ExperienceLevel): number =>
  experience === "beginner" ? 2 : 3;

/* -------------------------------------------------------------------------- */
/*                            Exercise selection                              */
/* -------------------------------------------------------------------------- */

const hasEquipment = (exercise: Exercise, available: Equipment[]): boolean =>
  exercise.equipment.some((e) => available.includes(e));

/** Deterministic pseudo-random, so a given profile always gets the same plan. */
const seededOrder = <T,>(items: T[], seed: number): T[] => {
  let state = seed || 1;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return items
    .map((item) => ({ item, k: next() }))
    .sort((a, b) => a.k - b.k)
    .map((r) => r.item);
};

const hashString = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

interface SelectionContext {
  available: Equipment[];
  experience: ExperienceLevel;
  usedInDay: Set<string>;
  usedInProgram: Map<string, number>;
  pool: Exercise[];
  seed: number;
  /** The muscles this day is built around. */
  focus: MuscleGroup[];
}

const pickExercise = (slot: Slot, ctx: SelectionContext): Exercise | null => {
  const ceiling = skillCeiling(ctx.experience);
  const candidates = ctx.pool.filter((e) => {
    if (e.pattern === "cardio") return false;
    if (ctx.usedInDay.has(e.id)) return false;
    if (!slot.patterns.includes(e.pattern)) return false;
    if (!hasEquipment(e, ctx.available)) return false;
    if ((e.skill ?? 1) > ceiling) return false;
    if (slot.muscles && !slot.muscles.some((m) => e.primary.includes(m))) return false;
    // Primary slots want the big compound lifts.
    if (slot.role === "primary" && !e.isCompound) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  const ordered = seededOrder(candidates, ctx.seed + hashString(slot.patterns.join()));

  // Does this exercise primarily train what the day is for? A close-grip bench
  // press is a legitimate horizontal press, but it is a triceps lift, and it
  // has no business being the first movement of a chest day.
  const onFocus = (exercise: Exercise): number =>
    exercise.primary.some((m) => ctx.focus.includes(m)) ? 0 : 1;

  ordered.sort((a, b) => {
    if (slot.role === "primary" || slot.role === "secondary") {
      const fa = onFocus(a);
      const fb = onFocus(b);
      if (fa !== fb) return fa - fb;
    }
    // Then prefer what has been used least across the program, so a week does
    // not become four variations of the same movement.
    const ua = ctx.usedInProgram.get(a.id) ?? 0;
    const ub = ctx.usedInProgram.get(b.id) ?? 0;
    if (ua !== ub) return ua - ub;
    if (slot.role === "primary") {
      // Barbell first for primaries: the loading curve is the whole point.
      const wa = a.equipment.includes("barbell") ? 0 : 1;
      const wb = b.equipment.includes("barbell") ? 0 : 1;
      if (wa !== wb) return wa - wb;
    }
    return 0;
  });

  return ordered[0] ?? null;
};

/* -------------------------------------------------------------------------- */
/*                              Time budgeting                                */
/* -------------------------------------------------------------------------- */

/** Rough wall-clock cost of a block: work time plus rest, plus setup. */
export const blockMinutes = (block: ProgramExercise): number => {
  const repSeconds = ((block.repMin + block.repMax) / 2) * 3;
  const perSet = repSeconds + block.restSeconds;
  return (block.sets * perSet + 90) / 60;
};

export const sessionMinutes = (blocks: ProgramExercise[]): number =>
  Math.round(blocks.reduce((sum, b) => sum + blockMinutes(b), 0));

/**
 * Trim a session to fit the time available. Accessories go first, then
 * secondary volume; the primary lifts are the last thing to be cut, because
 * they are what actually drives the adaptation.
 */
const fitToTime = (
  blocks: { block: ProgramExercise; role: SlotRole }[],
  budgetMinutes: number,
): ProgramExercise[] => {
  const working = [...blocks];
  const order: SlotRole[] = ["core", "accessory", "secondary"];

  for (const role of order) {
    while (
      sessionMinutes(working.map((w) => w.block)) > budgetMinutes &&
      working.some((w) => w.role === role)
    ) {
      const idx = working.map((w) => w.role).lastIndexOf(role);
      working.splice(idx, 1);
    }
  }

  // Still over budget: shave a set off the biggest blocks rather than dropping
  // a main lift entirely.
  let guard = 0;
  while (sessionMinutes(working.map((w) => w.block)) > budgetMinutes && guard++ < 20) {
    const target = working
      .filter((w) => w.block.sets > 2)
      .sort((a, b) => blockMinutes(b.block) - blockMinutes(a.block))[0];
    if (!target) break;
    target.block.sets -= 1;
  }

  return working.map((w) => w.block);
};

/* -------------------------------------------------------------------------- */
/*                              Program assembly                              */
/* -------------------------------------------------------------------------- */

export interface GenerateProgramOptions {
  exercises?: Exercise[];
  /** Overrides the profile's day count, e.g. when previewing alternatives. */
  daysPerWeek?: number;
  splitOverride?: SplitKind;
}

export const generateProgram = (
  profile: Profile,
  opts: GenerateProgramOptions = {},
): Program => {
  const pool = opts.exercises ?? EXERCISES;
  const daysPerWeek = Math.max(1, Math.min(opts.daysPerWeek ?? profile.trainingDaysPerWeek, 6));
  const split = opts.splitOverride ?? chooseSplit(daysPerWeek, profile.experience);
  const blueprints = BLUEPRINTS[split](daysPerWeek).slice(0, daysPerWeek);

  const available = profile.availableEquipment.length
    ? profile.availableEquipment
    : (["bodyweight"] as Equipment[]);
  const seed = hashString(profile.id || "fitme");
  const usedInProgram = new Map<string, number>();

  const days: ProgramDay[] = blueprints.map((blueprint, dayIndex) => {
    const usedInDay = new Set<string>();
    const chosen: { block: ProgramExercise; role: SlotRole }[] = [];

    for (const slot of blueprint.slots) {
      const ctx: SelectionContext = {
        available,
        experience: profile.experience,
        usedInDay,
        usedInProgram,
        pool,
        seed: seed + dayIndex * 31,
        focus: blueprint.focus,
      };
      let exercise = pickExercise(slot, ctx);

      // A primary slot with nothing compound available falls back to any
      // exercise matching the pattern rather than leaving a hole in the day.
      if (!exercise && slot.role === "primary") {
        exercise = pickExercise({ ...slot, role: "secondary" }, ctx);
      }
      if (!exercise) continue;

      usedInDay.add(exercise.id);
      usedInProgram.set(exercise.id, (usedInProgram.get(exercise.id) ?? 0) + 1);

      const rx = prescribe(slot.role, profile.goal, profile.experience);
      const range = exercise.defaultRepRange;
      chosen.push({
        role: slot.role,
        block: {
          exerciseId: exercise.id,
          sets: rx.sets,
          // Respect the exercise's own sensible range where it is narrower.
          repMin: range ? Math.max(rx.repMin, range[0]) : rx.repMin,
          repMax: range ? Math.max(rx.repMax, range[0] + 2) : rx.repMax,
          rpe: rx.rpe,
          restSeconds: rx.restSeconds,
        },
      });
    }

    const blocks = fitToTime(chosen, profile.sessionMinutes);

    // A cut gets conditioning on the end; it raises expenditure without
    // eating into the recovery budget that protects lean mass.
    const conditioning =
      profile.goal === "lose" || profile.goal === "recomp"
        ? Math.max(0, Math.min(20, profile.sessionMinutes - sessionMinutes(blocks)))
        : 0;

    return {
      id: cryptoId(),
      dayIndex,
      name: blueprint.name,
      focus: blueprint.focus,
      blocks,
      conditioningMinutes: conditioning >= 10 ? conditioning : undefined,
    };
  });

  return {
    id: cryptoId(),
    name: `${SPLIT_LABELS[split]} · ${daysPerWeek} days`,
    split,
    daysPerWeek,
    goal: profile.goal,
    experience: profile.experience,
    days,
    rationale: buildRationale(profile, split, daysPerWeek),
    createdAt: new Date().toISOString(),
  };
};

const buildRationale = (
  profile: Profile,
  split: SplitKind,
  daysPerWeek: number,
): string[] => {
  const lines: string[] = [];

  lines.push(
    `${SPLIT_LABELS[split]} across ${daysPerWeek} ${daysPerWeek === 1 ? "day" : "days"} a week — this hits every muscle group about twice a week, which is where the evidence for growth is strongest.`,
  );

  if (profile.goal === "lose") {
    lines.push(
      "You are in a deficit, so training is here to *keep* muscle, not add it. Loads stay heavy and volume stays moderate; the calorie deficit does the fat loss, not the workout.",
    );
  } else if (profile.goal === "gain") {
    lines.push(
      "You are in a surplus, so volume is the priority and the compounds get the longest rest periods. Expect the main lifts to move up almost every week at first.",
    );
  } else if (profile.goal === "recomp") {
    lines.push(
      "Recomposition is slow by nature. Protein and progressive overload matter more here than anything else on this page — hold calories near maintenance and let the training drive the change.",
    );
  } else {
    lines.push(
      "Maintenance training: enough volume to hold what you have, with room to push the main lifts when you feel good.",
    );
  }

  if (profile.experience === "beginner") {
    lines.push(
      "Exercises are limited to movements you can learn safely without a coach watching. Technical lifts unlock as you build a base.",
    );
  }

  const equipment = profile.availableEquipment;
  if (equipment.length && !equipment.includes("barbell")) {
    lines.push(
      "No barbell available, so the main lifts are the heaviest dumbbell and machine options — progression comes from reps and load on those instead.",
    );
  }

  lines.push(
    `Sessions are built to fit roughly ${profile.sessionMinutes} minutes. Accessories are trimmed first when time is short; the first two exercises of each day are the ones that matter.`,
  );

  return lines;
};

/** Which program day to suggest today, given what has already been done. */
export const nextProgramDay = (
  program: Program,
  completedDayIds: string[],
): ProgramDay | null => {
  if (program.days.length === 0) return null;
  const lastCompleted = [...completedDayIds].reverse().find((id) =>
    program.days.some((d) => d.id === id),
  );
  if (!lastCompleted) return program.days[0]!;
  const lastIndex = program.days.findIndex((d) => d.id === lastCompleted);
  return program.days[(lastIndex + 1) % program.days.length]!;
};
