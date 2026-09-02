/**
 * Domain types for FitMe.
 *
 * Conventions:
 *  - All masses are stored in kilograms, all lengths in centimetres, all energy
 *    in kilocalories. Imperial display is a presentation concern (see units.ts).
 *  - Dates that identify a *day* are ISO calendar dates (`YYYY-MM-DD`) in the
 *    user's local timezone. Instants are full ISO-8601 strings.
 *  - Log entries snapshot the nutrition/exercise data they were created from,
 *    so editing a food or exercise later never rewrites history.
 */

export type Sex = "male" | "female";
export type UnitSystem = "metric" | "imperial";

/** What the user is trying to do with their bodyweight. */
export type Goal = "lose" | "maintain" | "gain" | "recomp";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type Equipment =
  | "bodyweight"
  | "dumbbell"
  | "barbell"
  | "machine"
  | "cable"
  | "kettlebell"
  | "band"
  | "cardio";

export type MuscleGroup =
  | "chest"
  | "back"
  | "lats"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "forearms";

export type MovementPattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "carry"
  | "core"
  | "isolation"
  | "cardio";

export type DietPreference =
  | "none"
  | "vegetarian"
  | "vegan"
  | "pescatarian"
  | "low_carb"
  | "keto"
  | "high_carb"
  | "mediterranean";

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_TYPES: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];

/* -------------------------------------------------------------------------- */
/*                                   Profile                                  */
/* -------------------------------------------------------------------------- */

export interface Profile {
  id: string;
  name?: string;
  sex: Sex;
  /** ISO calendar date. */
  birthDate: string;
  heightCm: number;
  units: UnitSystem;
  activityLevel: ActivityLevel;
  goal: Goal;
  /**
   * Desired rate of bodyweight change, as a positive percentage of bodyweight
   * per week. Direction comes from `goal`. Clamped to safe bounds by
   * `resolveRate()` — see energy.ts.
   */
  rateOfChangePctPerWeek: number;
  trainingDaysPerWeek: number;
  sessionMinutes: number;
  experience: ExperienceLevel;
  availableEquipment: Equipment[];
  dietPreference: DietPreference;
  allergies: string[];
  /** Manual overrides. When set, they win over the calculated value. */
  calorieTargetOverride?: number;
  proteinGPerKgOverride?: number;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Nutrition                                 */
/* -------------------------------------------------------------------------- */

/** Absolute nutrient amounts. Energy in kcal, everything else in grams
 *  except sodium (mg). */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  satFat?: number;
  sodiumMg?: number;
}

export interface Serving {
  /** e.g. "medium (118 g)", "1 cup", "1 slice" */
  label: string;
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  /** Whether the base unit is solid (g) or liquid (ml). Both are stored as
   *  "grams" numerically; this only changes the unit shown to the user. */
  basis: "g" | "ml";
  /** Nutrients contained in 100 g (or 100 ml) of the food. */
  per100: Nutrients;
  servings: Serving[];
  tags: string[];
  /** True for the curated seed database, false for user-created foods. */
  verified: boolean;
  /** Set when the food came from an external source such as Open Food Facts. */
  source?: string;
  barcode?: string;
}

/** How a logged food's nutrition was determined. Surfaced in the UI so the user
 *  knows when a number is a photo estimate rather than a database lookup. */
export type NutritionSource =
  | "catalog"
  | "custom"
  | "quick_add"
  | "photo"
  | "chat";

export interface FoodEntry {
  id: string;
  /** ISO calendar date the entry belongs to. */
  date: string;
  meal: MealType;
  /** Reference into the food catalog, when the entry came from one. */
  foodId?: string;
  /** Display name, snapshotted so history survives catalog edits. */
  name: string;
  brand?: string;
  grams: number;
  servingLabel?: string;
  /** Resolved nutrients for `grams` of the food — a snapshot, not a live view. */
  nutrients: Nutrients;
  source: NutritionSource;
  /** 0..1, only meaningful for photo-derived entries. */
  confidence?: number;
  /** Small JPEG data URL of the meal photo, for the diary. */
  photoThumb?: string;
  notes?: string;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Training                                  */
/* -------------------------------------------------------------------------- */

export interface Exercise {
  id: string;
  name: string;
  aliases?: string[];
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  equipment: Equipment[];
  pattern: MovementPattern;
  isCompound: boolean;
  /** Metabolic equivalent, used to estimate the energy cost of cardio. */
  met?: number;
  unilateral?: boolean;
  defaultRepRange?: [number, number];
  /** Relative technical demand, 1 (easy) .. 3 (needs coaching). Used to keep
   *  beginners away from snatches on day one. */
  skill?: 1 | 2 | 3;
  cues?: string[];
}

export interface SetLog {
  id: string;
  exerciseId: string;
  /** Original exercise name from the source app, kept when the name could not
   *  be matched to the catalog so the user can remap it later. */
  sourceExerciseName?: string;
  weightKg: number;
  reps: number;
  /** Rate of perceived exertion, 6..10. Optional but powers fatigue tracking. */
  rpe?: number;
  isWarmup?: boolean;
  completed: boolean;
}

export type CardioIntensity = "easy" | "moderate" | "hard";

export interface CardioLog {
  id: string;
  exerciseId: string;
  minutes: number;
  intensity: CardioIntensity;
  distanceKm?: number;
  avgHeartRate?: number;
  /** Estimated energy expenditure, in kcal. */
  kcal: number;
}

/** Where a workout came from. Sessions synced from another app are treated as
 *  read-only in FitMe, because the next re-sync is authoritative. */
export type SessionSource = "fitme" | "strong" | "hevy" | "import";

export interface WorkoutSession {
  id: string;
  date: string;
  name: string;
  source?: SessionSource;
  /**
   * Stable identity for a session in its source system, derived from its
   * content. Re-importing the same export must not create duplicates, so this
   * is the dedup key — see `importers/strong.ts`.
   */
  externalId?: string;
  importedAt?: string;
  startedAt: string;
  endedAt?: string;
  sets: SetLog[];
  cardio: CardioLog[];
  /** Links the session back to the program day it was generated from. */
  programId?: string;
  programDayId?: string;
  notes?: string;
  /** Subjective 1..5 session rating, used by the fatigue heuristics. */
  feel?: 1 | 2 | 3 | 4 | 5;
}

/* -------------------------------------------------------------------------- */
/*                                  Programs                                  */
/* -------------------------------------------------------------------------- */

export type SplitKind =
  | "full_body"
  | "upper_lower"
  | "push_pull_legs"
  | "arnold"
  | "bro_split";

export interface ProgramExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  /** Target RPE for the working sets. */
  rpe: number;
  restSeconds: number;
  notes?: string;
}

export interface ProgramDay {
  id: string;
  dayIndex: number;
  name: string;
  focus: MuscleGroup[];
  blocks: ProgramExercise[];
  /** Optional finisher, e.g. 10 minutes of moderate cardio. */
  conditioningMinutes?: number;
}

export interface Program {
  id: string;
  name: string;
  split: SplitKind;
  daysPerWeek: number;
  goal: Goal;
  experience: ExperienceLevel;
  days: ProgramDay[];
  /** Human-readable explanation of why this program looks the way it does. */
  rationale: string[];
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                                Body metrics                                */
/* -------------------------------------------------------------------------- */

export interface BodyMetric {
  id: string;
  date: string;
  weightKg: number;
  bodyFatPct?: number;
  waistCm?: number;
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  restingHeartRate?: number;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Coaching                                  */
/* -------------------------------------------------------------------------- */

export type InsightSeverity = "critical" | "warning" | "info" | "success";
export type InsightDomain = "nutrition" | "training" | "recovery" | "adherence";

export interface Insight {
  id: string;
  domain: InsightDomain;
  severity: InsightSeverity;
  title: string;
  /** One or two sentences explaining what was observed. */
  detail: string;
  /** The concrete thing to do about it. */
  action?: string;
  /** The numbers the insight was derived from, for the "show your work" panel. */
  evidence?: Record<string, string | number>;
}

/** Everything the coach needs to reason about a user, in one object. */
export interface CoachContext {
  profile: Profile;
  currentWeightKg: number;
  targets: DailyTargets;
  metrics: BodyMetric[];
  entries: FoodEntry[];
  sessions: WorkoutSession[];
  program?: Program;
  /** ISO date the analysis is being run for. Defaults to today. */
  asOf: string;
}

/* -------------------------------------------------------------------------- */
/*                              Derived targets                               */
/* -------------------------------------------------------------------------- */

export interface DailyTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  waterMl: number;
  /** The intermediate values, kept so the UI can explain the number. */
  breakdown: {
    bmr: number;
    tdee: number;
    activityMultiplier: number;
    /** Signed kcal/day applied to TDEE to hit the goal. */
    adjustment: number;
    /** The rate actually used after clamping, %BW/week (signed). */
    appliedRatePctPerWeek: number;
    /** Which BMR formula was used. */
    bmrFormula: "mifflin_st_jeor" | "katch_mcardle";
    /** True when a safety floor overrode the requested deficit. */
    floorApplied: boolean;
    proteinGPerKg: number;
    /** True when the TDEE came from observed energy balance rather than the
     *  activity-multiplier estimate. */
    adaptive: boolean;
  };
}
