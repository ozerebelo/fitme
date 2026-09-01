import type { DailyTargets, DietPreference, Goal, Profile } from "./types";
import { clamp, round } from "./units";
import { type EnergyPlan } from "./energy";

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9, alcohol: 7 } as const;

/* -------------------------------------------------------------------------- */
/*                                  Protein                                   */
/* -------------------------------------------------------------------------- */

/**
 * Protein target in g per kg of *reference* mass (lean mass when body fat is
 * known, otherwise total bodyweight).
 *
 * The evidence converges on 1.6 g/kg bodyweight as the point where further
 * protein stops adding to muscle protein synthesis in trained lifters. Two
 * situations push it higher: an energy deficit (protein is the main lever
 * protecting lean mass when calories are scarce) and higher training age.
 */
export const proteinPerKg = (
  goal: Goal,
  hasBodyFat: boolean,
  trains: boolean,
): number => {
  // Lean-mass-referenced targets run higher than bodyweight-referenced ones,
  // because the denominator is smaller.
  const base = hasBodyFat
    ? { lose: 2.4, maintain: 2.0, gain: 2.0, recomp: 2.4 }
    : { lose: 2.0, maintain: 1.6, gain: 1.6, recomp: 2.0 };
  const value = base[goal];
  return trains ? value : value * 0.85;
};

/* -------------------------------------------------------------------------- */
/*                            Fat / carb splitting                            */
/* -------------------------------------------------------------------------- */

/**
 * Share of calories from fat, before the floor is applied. Diet preference is
 * mostly a fat/carb preference — protein stays where the evidence puts it.
 */
const FAT_SHARE: Record<DietPreference, number> = {
  none: 0.28,
  vegetarian: 0.28,
  vegan: 0.25,
  pescatarian: 0.3,
  low_carb: 0.45,
  keto: 0.7,
  high_carb: 0.2,
  mediterranean: 0.35,
};

/**
 * Hard floor on fat intake. Below roughly 0.5 g/kg you start compromising
 * fat-soluble vitamin absorption and sex hormone production.
 */
export const FAT_FLOOR_G_PER_KG = 0.5;

/** Fibre scales with intake: ~14 g per 1000 kcal is the standard recommendation. */
export const fiberTarget = (kcal: number): number =>
  round(clamp((kcal / 1000) * 14, 18, 60));

/**
 * Baseline hydration, plus a training allowance. Approximate by design —
 * thirst and urine colour beat any formula.
 */
export const waterTarget = (weightKg: number, trainingMinutes: number): number =>
  Math.round(weightKg * 33 + (trainingMinutes / 60) * 500);

/* -------------------------------------------------------------------------- */
/*                              Target assembly                               */
/* -------------------------------------------------------------------------- */

export interface MacroInput {
  kcal: number;
  weightKg: number;
  bodyFatPct?: number;
  goal: Goal;
  diet: DietPreference;
  trains: boolean;
  proteinGPerKgOverride?: number;
}

export interface MacroTargets {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  proteinGPerKg: number;
  /** True when protein or fat had to be trimmed to fit the calorie budget. */
  compressed: boolean;
}

/**
 * Split a calorie target into macronutrients.
 *
 * Order of precedence when calories are tight: protein is set first and
 * defended, fat is allowed down to its floor, and carbohydrate absorbs whatever
 * is left. Only if that still does not fit do we start trimming protein.
 */
export const buildMacroTargets = (input: MacroInput): MacroTargets => {
  const hasBodyFat = input.bodyFatPct != null && input.bodyFatPct > 0;
  const referenceMass = hasBodyFat
    ? input.weightKg * (1 - clamp(input.bodyFatPct!, 3, 60) / 100)
    : input.weightKg;

  const gPerKg =
    input.proteinGPerKgOverride ??
    proteinPerKg(input.goal, hasBodyFat, input.trains);

  let protein = referenceMass * gPerKg;
  let compressed = false;

  // Cap protein at 40 % of calories — beyond that it crowds out the fuel that
  // actually powers training, without adding anything.
  const proteinCap = (input.kcal * 0.4) / KCAL_PER_G.protein;
  if (protein > proteinCap) {
    protein = proteinCap;
    compressed = true;
  }

  const fatFloor = input.weightKg * FAT_FLOOR_G_PER_KG;
  let fat = (input.kcal * FAT_SHARE[input.diet]) / KCAL_PER_G.fat;
  fat = Math.max(fat, fatFloor);

  let remaining =
    input.kcal - protein * KCAL_PER_G.protein - fat * KCAL_PER_G.fat;

  if (remaining < 0) {
    // Give fat back down to its floor first.
    const overshootG = -remaining / KCAL_PER_G.fat;
    const reducible = Math.max(0, fat - fatFloor);
    const cut = Math.min(overshootG, reducible);
    fat -= cut;
    remaining += cut * KCAL_PER_G.fat;
    compressed = true;
  }

  if (remaining < 0) {
    // Still short: trim protein, but never below 1.2 g/kg of reference mass.
    const proteinFloor = referenceMass * 1.2;
    const overshootG = -remaining / KCAL_PER_G.protein;
    const reducible = Math.max(0, protein - proteinFloor);
    const cut = Math.min(overshootG, reducible);
    protein -= cut;
    remaining += cut * KCAL_PER_G.protein;
    compressed = true;
  }

  const carbs = Math.max(0, remaining / KCAL_PER_G.carbs);

  return {
    protein: round(protein),
    carbs: round(carbs),
    fat: round(fat),
    fiber: fiberTarget(input.kcal),
    proteinGPerKg: round(gPerKg, 2),
    compressed,
  };
};

/** Compose the energy plan and the macro split into the object the UI renders. */
export const buildDailyTargets = (
  profile: Profile,
  plan: EnergyPlan,
  weightKg: number,
  bodyFatPct?: number,
): DailyTargets => {
  const macros = buildMacroTargets({
    kcal: plan.target,
    weightKg,
    bodyFatPct,
    goal: profile.goal,
    diet: profile.dietPreference,
    trains: profile.trainingDaysPerWeek > 0,
    proteinGPerKgOverride: profile.proteinGPerKgOverride,
  });

  return {
    kcal: plan.target,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    fiber: macros.fiber,
    waterMl: waterTarget(
      weightKg,
      (profile.trainingDaysPerWeek * profile.sessionMinutes) / 7,
    ),
    breakdown: {
      bmr: plan.bmr,
      tdee: plan.tdee,
      activityMultiplier: plan.activityMultiplier,
      adjustment: plan.adjustment,
      appliedRatePctPerWeek: plan.appliedRatePctPerWeek,
      bmrFormula: plan.bmrFormula,
      floorApplied: plan.floorApplied,
      proteinGPerKg: macros.proteinGPerKg,
      adaptive: plan.adaptive,
    },
  };
};

/** kcal implied by a macro triple — used to sanity-check user overrides. */
export const kcalFromMacros = (m: {
  protein: number;
  carbs: number;
  fat: number;
}): number =>
  m.protein * KCAL_PER_G.protein +
  m.carbs * KCAL_PER_G.carbs +
  m.fat * KCAL_PER_G.fat;
