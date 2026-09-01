import type { Equipment, Exercise, MovementPattern, MuscleGroup } from "../types";

/**
 * Seed exercise catalog.
 *
 * `aliases` deliberately carries the Strong app's exact naming convention
 * (`Movement (Equipment)`), so a one-time CSV import matches against the
 * catalog instead of creating a pile of near-duplicate custom exercises.
 */

type Row = [
  id: string,
  name: string,
  pattern: MovementPattern,
  primary: MuscleGroup[],
  secondary: MuscleGroup[],
  equipment: Equipment[],
  compound: boolean,
  extra?: Partial<Exercise>,
];

const rows: Row[] = [
  /* ------------------------------ Horizontal push ----------------------- */
  ["bench-press-barbell", "Barbell Bench Press", "horizontal_push", ["chest"], ["triceps", "shoulders"], ["barbell"], true,
    { aliases: ["Bench Press (Barbell)", "Flat Bench Press"], defaultRepRange: [5, 8], skill: 2, met: 5,
      cues: ["Shoulder blades pinned back and down", "Bar touches the lower chest", "Drive through mid-foot"] }],
  ["bench-press-dumbbell", "Dumbbell Bench Press", "horizontal_push", ["chest"], ["triceps", "shoulders"], ["dumbbell"], true,
    { aliases: ["Bench Press (Dumbbell)"], defaultRepRange: [8, 12], skill: 1 }],
  ["incline-bench-barbell", "Incline Barbell Bench Press", "horizontal_push", ["chest", "shoulders"], ["triceps"], ["barbell"], true,
    { aliases: ["Incline Bench Press (Barbell)"], defaultRepRange: [6, 10], skill: 2 }],
  ["incline-bench-dumbbell", "Incline Dumbbell Press", "horizontal_push", ["chest", "shoulders"], ["triceps"], ["dumbbell"], true,
    { aliases: ["Incline Bench Press (Dumbbell)"], defaultRepRange: [8, 12] }],
  ["chest-press-machine", "Machine Chest Press", "horizontal_push", ["chest"], ["triceps", "shoulders"], ["machine"], true,
    { aliases: ["Chest Press (Machine)", "Seated Chest Press"], defaultRepRange: [8, 12], skill: 1 }],
  ["push-up", "Push Up", "horizontal_push", ["chest"], ["triceps", "core", "shoulders"], ["bodyweight"], true,
    { aliases: ["Push Up", "Pushup"], defaultRepRange: [8, 20], skill: 1, met: 8 }],
  ["chest-fly-dumbbell", "Dumbbell Chest Fly", "isolation", ["chest"], [], ["dumbbell"], false,
    { aliases: ["Chest Fly (Dumbbell)", "Dumbbell Fly"], defaultRepRange: [10, 15] }],
  ["pec-deck", "Pec Deck", "isolation", ["chest"], [], ["machine"], false,
    { aliases: ["Chest Fly (Machine)", "Butterfly"], defaultRepRange: [10, 15] }],
  ["cable-crossover", "Cable Crossover", "isolation", ["chest"], [], ["cable"], false,
    { aliases: ["Chest Fly (Cable)", "Cable Fly"], defaultRepRange: [10, 15] }],
  ["dip-chest", "Chest Dip", "horizontal_push", ["chest"], ["triceps", "shoulders"], ["bodyweight"], true,
    { aliases: ["Chest Dip", "Dip"], defaultRepRange: [6, 12], skill: 2 }],

  /* ------------------------------ Vertical push ------------------------- */
  ["overhead-press-barbell", "Barbell Overhead Press", "vertical_push", ["shoulders"], ["triceps", "core"], ["barbell"], true,
    { aliases: ["Overhead Press (Barbell)", "Strict Press", "Military Press"], defaultRepRange: [5, 8], skill: 2,
      cues: ["Squeeze glutes to stop the lower back arching", "Head through the window at lockout"] }],
  ["overhead-press-dumbbell", "Dumbbell Shoulder Press", "vertical_push", ["shoulders"], ["triceps"], ["dumbbell"], true,
    { aliases: ["Overhead Press (Dumbbell)", "Seated Shoulder Press (Dumbbell)", "Shoulder Press (Dumbbell)"], defaultRepRange: [8, 12] }],
  ["shoulder-press-machine", "Machine Shoulder Press", "vertical_push", ["shoulders"], ["triceps"], ["machine"], true,
    { aliases: ["Shoulder Press (Machine)"], defaultRepRange: [8, 12], skill: 1 }],
  ["arnold-press", "Arnold Press", "vertical_push", ["shoulders"], ["triceps"], ["dumbbell"], true,
    { aliases: ["Arnold Press (Dumbbell)"], defaultRepRange: [8, 12] }],
  ["lateral-raise-dumbbell", "Dumbbell Lateral Raise", "isolation", ["shoulders"], [], ["dumbbell"], false,
    { aliases: ["Lateral Raise (Dumbbell)", "Side Raise"], defaultRepRange: [12, 20] }],
  ["lateral-raise-cable", "Cable Lateral Raise", "isolation", ["shoulders"], [], ["cable"], false,
    { aliases: ["Lateral Raise (Cable)"], defaultRepRange: [12, 20] }],
  ["rear-delt-fly", "Rear Delt Fly", "isolation", ["shoulders"], ["back"], ["dumbbell"], false,
    { aliases: ["Rear Delt Reverse Fly (Dumbbell)", "Reverse Fly (Dumbbell)", "Rear Delt Reverse Fly (Machine)"], defaultRepRange: [12, 20] }],
  ["face-pull", "Cable Face Pull", "isolation", ["shoulders"], ["back"], ["cable"], false,
    { aliases: ["Face Pull (Cable)", "Face Pull"], defaultRepRange: [12, 20],
      cues: ["Pull to the forehead, elbows high", "Finish with an external rotation"] }],
  ["front-raise", "Front Raise", "isolation", ["shoulders"], [], ["dumbbell"], false,
    { aliases: ["Front Raise (Dumbbell)"], defaultRepRange: [10, 15] }],

  /* ------------------------------ Vertical pull ------------------------- */
  ["pull-up", "Pull Up", "vertical_pull", ["lats", "back"], ["biceps", "forearms"], ["bodyweight"], true,
    { aliases: ["Pull Up", "Pullup", "Pull Up (Weighted)"], defaultRepRange: [5, 10], skill: 2 }],
  ["chin-up", "Chin Up", "vertical_pull", ["lats", "back"], ["biceps"], ["bodyweight"], true,
    { aliases: ["Chin Up", "Chin Up (Weighted)"], defaultRepRange: [5, 10], skill: 2 }],
  ["lat-pulldown", "Lat Pulldown", "vertical_pull", ["lats", "back"], ["biceps"], ["cable", "machine"], true,
    { aliases: ["Lat Pulldown (Cable)", "Lat Pulldown (Machine)"], defaultRepRange: [8, 12], skill: 1 }],
  ["pulldown-neutral", "Neutral Grip Pulldown", "vertical_pull", ["lats", "back"], ["biceps"], ["cable"], true,
    { aliases: ["Lat Pulldown (Neutral Grip)"], defaultRepRange: [8, 12] }],
  ["straight-arm-pulldown", "Straight Arm Pulldown", "isolation", ["lats"], [], ["cable"], false,
    { aliases: ["Straight Arm Lat Pulldown (Cable)"], defaultRepRange: [12, 15] }],

  /* ----------------------------- Horizontal pull ------------------------ */
  ["barbell-row", "Barbell Row", "horizontal_pull", ["back", "lats"], ["biceps", "hamstrings"], ["barbell"], true,
    { aliases: ["Bent Over Row (Barbell)", "Barbell Row"], defaultRepRange: [6, 10], skill: 2,
      cues: ["Hinge to about 45°", "Pull to the belly button, not the chest"] }],
  ["dumbbell-row", "Dumbbell Row", "horizontal_pull", ["back", "lats"], ["biceps"], ["dumbbell"], true,
    { aliases: ["Bent Over Row (Dumbbell)", "Dumbbell Row"], defaultRepRange: [8, 12], unilateral: true }],
  ["seated-cable-row", "Seated Cable Row", "horizontal_pull", ["back"], ["lats", "biceps"], ["cable"], true,
    { aliases: ["Seated Row (Cable)", "Seated Cable Row"], defaultRepRange: [8, 12], skill: 1 }],
  ["chest-supported-row", "Chest Supported Row", "horizontal_pull", ["back"], ["lats", "biceps"], ["machine", "dumbbell"], true,
    { aliases: ["Chest Supported Row (Machine)", "T Bar Row"], defaultRepRange: [8, 12] }],
  ["inverted-row", "Inverted Row", "horizontal_pull", ["back"], ["biceps", "core"], ["bodyweight"], true,
    { aliases: ["Inverted Row", "Bodyweight Row"], defaultRepRange: [8, 15] }],
  ["shrug", "Shrug", "isolation", ["back"], ["forearms"], ["barbell", "dumbbell"], false,
    { aliases: ["Shrug (Barbell)", "Shrug (Dumbbell)"], defaultRepRange: [10, 15] }],

  /* --------------------------------- Squat ------------------------------ */
  ["back-squat", "Barbell Back Squat", "squat", ["quads", "glutes"], ["hamstrings", "core"], ["barbell"], true,
    { aliases: ["Squat (Barbell)", "Back Squat"], defaultRepRange: [5, 8], skill: 3, met: 6,
      cues: ["Brace before you unrack", "Knees track over the toes", "Hips and chest rise together"] }],
  ["front-squat", "Front Squat", "squat", ["quads"], ["glutes", "core"], ["barbell"], true,
    { aliases: ["Front Squat (Barbell)"], defaultRepRange: [5, 8], skill: 3 }],
  ["goblet-squat", "Goblet Squat", "squat", ["quads", "glutes"], ["core"], ["dumbbell", "kettlebell"], true,
    { aliases: ["Goblet Squat (Dumbbell)", "Goblet Squat (Kettlebell)"], defaultRepRange: [8, 15], skill: 1 }],
  ["hack-squat", "Hack Squat", "squat", ["quads"], ["glutes"], ["machine"], true,
    { aliases: ["Hack Squat (Machine)"], defaultRepRange: [8, 12] }],
  ["leg-press", "Leg Press", "squat", ["quads", "glutes"], ["hamstrings"], ["machine"], true,
    { aliases: ["Leg Press (Machine)", "Leg Press"], defaultRepRange: [10, 15], skill: 1 }],
  ["bodyweight-squat", "Bodyweight Squat", "squat", ["quads", "glutes"], ["core"], ["bodyweight"], true,
    { aliases: ["Squat (Bodyweight)", "Air Squat"], defaultRepRange: [15, 30], met: 5 }],

  /* --------------------------------- Hinge ------------------------------ */
  ["deadlift", "Conventional Deadlift", "hinge", ["hamstrings", "glutes", "back"], ["quads", "forearms", "core"], ["barbell"], true,
    { aliases: ["Deadlift (Barbell)", "Deadlift"], defaultRepRange: [3, 6], skill: 3, met: 6,
      cues: ["Take the slack out of the bar first", "Push the floor away", "Lats tight, bar close to the shins"] }],
  ["romanian-deadlift", "Romanian Deadlift", "hinge", ["hamstrings", "glutes"], ["back"], ["barbell", "dumbbell"], true,
    { aliases: ["Romanian Deadlift (Barbell)", "Romanian Deadlift (Dumbbell)", "RDL"], defaultRepRange: [8, 12], skill: 2,
      cues: ["Push the hips back, do not squat it", "Stop when the hamstrings run out of stretch"] }],
  ["sumo-deadlift", "Sumo Deadlift", "hinge", ["glutes", "hamstrings"], ["quads", "back"], ["barbell"], true,
    { aliases: ["Sumo Deadlift (Barbell)"], defaultRepRange: [3, 6], skill: 3 }],
  ["hip-thrust", "Barbell Hip Thrust", "hinge", ["glutes"], ["hamstrings"], ["barbell"], true,
    { aliases: ["Hip Thrust (Barbell)", "Hip Thrust"], defaultRepRange: [8, 12], skill: 2 }],
  ["back-extension", "Back Extension", "hinge", ["hamstrings", "glutes"], ["back"], ["bodyweight", "machine"], false,
    { aliases: ["Back Extension", "Hyperextension"], defaultRepRange: [10, 20] }],
  ["kettlebell-swing", "Kettlebell Swing", "hinge", ["glutes", "hamstrings"], ["back", "core"], ["kettlebell"], true,
    { aliases: ["Kettlebell Swing"], defaultRepRange: [12, 20], skill: 2, met: 9.8 }],
  ["good-morning", "Good Morning", "hinge", ["hamstrings"], ["glutes", "back"], ["barbell"], true,
    { aliases: ["Good Morning (Barbell)"], defaultRepRange: [8, 12], skill: 3 }],

  /* --------------------------------- Lunge ------------------------------ */
  ["walking-lunge", "Walking Lunge", "lunge", ["quads", "glutes"], ["hamstrings", "core"], ["dumbbell", "bodyweight"], true,
    { aliases: ["Lunge (Dumbbell)", "Walking Lunge"], defaultRepRange: [10, 15], unilateral: true, met: 6 }],
  ["bulgarian-split-squat", "Bulgarian Split Squat", "lunge", ["quads", "glutes"], ["hamstrings"], ["dumbbell", "bodyweight"], true,
    { aliases: ["Bulgarian Split Squat", "Split Squat (Dumbbell)"], defaultRepRange: [8, 12], unilateral: true, skill: 2 }],
  ["step-up", "Step Up", "lunge", ["quads", "glutes"], [], ["dumbbell", "bodyweight"], true,
    { aliases: ["Step Up (Dumbbell)", "Step Up"], defaultRepRange: [10, 15], unilateral: true }],

  /* ------------------------------- Isolation ---------------------------- */
  ["leg-extension", "Leg Extension", "isolation", ["quads"], [], ["machine"], false,
    { aliases: ["Leg Extension (Machine)", "Leg Extension"], defaultRepRange: [12, 15] }],
  ["lying-leg-curl", "Lying Leg Curl", "isolation", ["hamstrings"], ["calves"], ["machine"], false,
    { aliases: ["Lying Leg Curl (Machine)", "Leg Curl"], defaultRepRange: [10, 15] }],
  ["seated-leg-curl", "Seated Leg Curl", "isolation", ["hamstrings"], [], ["machine"], false,
    { aliases: ["Seated Leg Curl (Machine)"], defaultRepRange: [10, 15] }],
  ["nordic-curl", "Nordic Hamstring Curl", "isolation", ["hamstrings"], [], ["bodyweight"], false,
    { aliases: ["Nordic Curl"], defaultRepRange: [5, 10], skill: 3 }],
  ["standing-calf-raise", "Standing Calf Raise", "isolation", ["calves"], [], ["machine", "bodyweight"], false,
    { aliases: ["Standing Calf Raise (Machine)", "Calf Raise"], defaultRepRange: [10, 20] }],
  ["seated-calf-raise", "Seated Calf Raise", "isolation", ["calves"], [], ["machine"], false,
    { aliases: ["Seated Calf Raise (Machine)"], defaultRepRange: [12, 20] }],
  ["hip-abduction", "Hip Abduction", "isolation", ["glutes"], [], ["machine"], false,
    { aliases: ["Hip Abduction (Machine)"], defaultRepRange: [12, 20] }],

  ["bicep-curl-dumbbell", "Dumbbell Curl", "isolation", ["biceps"], ["forearms"], ["dumbbell"], false,
    { aliases: ["Bicep Curl (Dumbbell)", "Dumbbell Curl"], defaultRepRange: [8, 12] }],
  ["bicep-curl-barbell", "Barbell Curl", "isolation", ["biceps"], ["forearms"], ["barbell"], false,
    { aliases: ["Bicep Curl (Barbell)", "EZ Bar Curl"], defaultRepRange: [8, 12] }],
  ["hammer-curl", "Hammer Curl", "isolation", ["biceps", "forearms"], [], ["dumbbell"], false,
    { aliases: ["Hammer Curl (Dumbbell)"], defaultRepRange: [10, 15] }],
  ["preacher-curl", "Preacher Curl", "isolation", ["biceps"], [], ["machine", "barbell"], false,
    { aliases: ["Preacher Curl (Barbell)", "Preacher Curl (Machine)"], defaultRepRange: [10, 15] }],
  ["cable-curl", "Cable Curl", "isolation", ["biceps"], ["forearms"], ["cable"], false,
    { aliases: ["Bicep Curl (Cable)"], defaultRepRange: [10, 15] }],

  ["triceps-pushdown", "Triceps Pushdown", "isolation", ["triceps"], [], ["cable"], false,
    { aliases: ["Triceps Pushdown (Cable)", "Triceps Pushdown", "Tricep Pushdown"], defaultRepRange: [10, 15] }],
  ["skullcrusher", "Skullcrusher", "isolation", ["triceps"], [], ["barbell", "dumbbell"], false,
    { aliases: ["Skullcrusher (Barbell)", "Lying Triceps Extension"], defaultRepRange: [8, 12] }],
  ["overhead-triceps-extension", "Overhead Triceps Extension", "isolation", ["triceps"], [], ["cable", "dumbbell"], false,
    { aliases: ["Triceps Extension (Cable)", "Overhead Triceps Extension (Dumbbell)"], defaultRepRange: [10, 15] }],
  ["triceps-dip", "Triceps Dip", "vertical_push", ["triceps"], ["chest", "shoulders"], ["bodyweight"], true,
    { aliases: ["Triceps Dip", "Bench Dip"], defaultRepRange: [8, 15] }],
  ["close-grip-bench", "Close Grip Bench Press", "horizontal_push", ["triceps"], ["chest", "shoulders"], ["barbell"], true,
    { aliases: ["Bench Press (Close Grip)", "Close Grip Bench Press (Barbell)"], defaultRepRange: [6, 10] }],

  ["wrist-curl", "Wrist Curl", "isolation", ["forearms"], [], ["dumbbell", "barbell"], false,
    { aliases: ["Wrist Curl (Dumbbell)"], defaultRepRange: [12, 20] }],
  ["farmers-carry", "Farmer's Carry", "carry", ["forearms", "core"], ["back"], ["dumbbell", "kettlebell"], true,
    { aliases: ["Farmers Walk", "Farmer's Walk"], defaultRepRange: [1, 1], met: 5 }],

  /* ---------------------------------- Core ------------------------------ */
  ["plank", "Plank", "core", ["core"], ["shoulders"], ["bodyweight"], false,
    { aliases: ["Plank"], defaultRepRange: [1, 1], met: 3.5 }],
  ["hanging-leg-raise", "Hanging Leg Raise", "core", ["core"], ["forearms"], ["bodyweight"], false,
    { aliases: ["Hanging Leg Raise", "Hanging Knee Raise"], defaultRepRange: [8, 15], skill: 2 }],
  ["cable-crunch", "Cable Crunch", "core", ["core"], [], ["cable"], false,
    { aliases: ["Cable Crunch", "Kneeling Cable Crunch"], defaultRepRange: [12, 20] }],
  ["ab-wheel", "Ab Wheel Rollout", "core", ["core"], ["lats"], ["bodyweight"], false,
    { aliases: ["Ab Wheel"], defaultRepRange: [8, 15], skill: 2 }],
  ["russian-twist", "Russian Twist", "core", ["core"], [], ["bodyweight", "dumbbell"], false,
    { aliases: ["Russian Twist"], defaultRepRange: [15, 30] }],
  ["dead-bug", "Dead Bug", "core", ["core"], [], ["bodyweight"], false,
    { aliases: ["Dead Bug"], defaultRepRange: [10, 15], skill: 1 }],
  ["pallof-press", "Pallof Press", "core", ["core"], [], ["cable", "band"], false,
    { aliases: ["Pallof Press"], defaultRepRange: [10, 15] }],

  /* --------------------------------- Cardio ----------------------------- */
  ["running", "Running", "cardio", ["quads", "calves"], ["hamstrings", "glutes"], ["cardio"], false,
    { aliases: ["Running", "Run", "Treadmill"], met: 9.8 }],
  ["walking", "Walking", "cardio", ["quads", "calves"], ["glutes"], ["cardio"], false,
    { aliases: ["Walking", "Walk"], met: 3.8 }],
  ["cycling", "Cycling", "cardio", ["quads"], ["glutes", "calves"], ["cardio"], false,
    { aliases: ["Cycling", "Bike", "Stationary Bike"], met: 7.5 }],
  ["rowing-machine", "Rowing Machine", "cardio", ["back"], ["quads", "biceps", "core"], ["cardio"], false,
    { aliases: ["Rowing Machine", "Rower", "Row (Machine)"], met: 7.0 }],
  ["elliptical", "Elliptical", "cardio", ["quads"], ["glutes"], ["cardio"], false,
    { aliases: ["Elliptical Trainer", "Elliptical"], met: 5.0 }],
  ["stair-climber", "Stair Climber", "cardio", ["quads", "glutes"], ["calves"], ["cardio"], false,
    { aliases: ["Stair Machine", "Stairmaster"], met: 9.0 }],
  ["swimming", "Swimming", "cardio", ["back", "shoulders"], ["core"], ["cardio"], false,
    { aliases: ["Swimming"], met: 8.0 }],
  ["jump-rope", "Jump Rope", "cardio", ["calves"], ["shoulders"], ["cardio"], false,
    { aliases: ["Jump Rope", "Skipping"], met: 12.3 }],
  ["hiit", "HIIT Circuit", "cardio", ["core"], ["quads", "chest"], ["cardio", "bodyweight"], false,
    { aliases: ["HIIT", "Circuit Training"], met: 10.0 }],
  ["incline-walk", "Incline Treadmill Walk", "cardio", ["glutes", "calves"], ["hamstrings"], ["cardio"], false,
    { aliases: ["Incline Walk", "Treadmill Incline"], met: 6.0 }],
];

export const EXERCISES: Exercise[] = rows.map(
  ([id, name, pattern, primary, secondary, equipment, isCompound, extra]) => ({
    id,
    name,
    pattern,
    primary,
    secondary,
    equipment,
    isCompound,
    skill: 1,
    ...extra,
  }),
);

export const EXERCISE_BY_ID: Map<string, Exercise> = new Map(
  EXERCISES.map((e) => [e.id, e]),
);

export const CARDIO_EXERCISES: Exercise[] = EXERCISES.filter(
  (e) => e.pattern === "cardio",
);

export const RESISTANCE_EXERCISES: Exercise[] = EXERCISES.filter(
  (e) => e.pattern !== "cardio",
);

/** Build the lookup used by name-matching (import, search, voice entry). */
export const buildNameIndex = (
  exercises: Exercise[] = EXERCISES,
): Map<string, Exercise> => {
  const index = new Map<string, Exercise>();
  for (const e of exercises) {
    index.set(normalizeExerciseName(e.name), e);
    for (const alias of e.aliases ?? []) {
      const key = normalizeExerciseName(alias);
      if (!index.has(key)) index.set(key, e);
    }
  }
  return index;
};

/**
 * Normalise an exercise name for matching: casefold, strip punctuation, and
 * collapse whitespace. `Bench Press (Barbell)` and `barbell bench press` both
 * reduce to comparable token sets.
 */
export const normalizeExerciseName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[()\-_/,.]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Order-insensitive token key, so "Bench Press (Barbell)" ≈ "Barbell Bench Press". */
export const exerciseTokenKey = (name: string): string =>
  normalizeExerciseName(name).split(" ").filter(Boolean).sort().join(" ");
