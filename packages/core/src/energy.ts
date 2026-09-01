import type {
  ActivityLevel,
  BodyMetric,
  FoodEntry,
  Goal,
  Profile,
  Sex,
} from "./types";
import { KCAL_PER_KG_BODY_MASS, clamp, round } from "./units";
import { ageFrom, daysBetween, toDateKey } from "./date";
import { linearSlope, trendSeries } from "./analytics";

/* -------------------------------------------------------------------------- */
/*                             Resting metabolism                             */
/* -------------------------------------------------------------------------- */

/**
 * Mifflin-St Jeor. The default when body composition is unknown; it is the
 * best-validated predictive equation for the general population.
 */
export const bmrMifflinStJeor = (
  sex: Sex,
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number =>
  10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === "male" ? 5 : -161);

/**
 * Katch-McArdle, driven by lean body mass. More accurate than Mifflin at the
 * extremes of body composition, so it wins whenever body fat % is known.
 */
export const bmrKatchMcArdle = (leanMassKg: number): number =>
  370 + 21.6 * leanMassKg;

export const leanBodyMass = (weightKg: number, bodyFatPct: number): number =>
  weightKg * (1 - clamp(bodyFatPct, 3, 60) / 100);

export interface BmrResult {
  bmr: number;
  formula: "mifflin_st_jeor" | "katch_mcardle";
}

export const restingEnergy = (input: {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
  bodyFatPct?: number;
}): BmrResult => {
  if (input.bodyFatPct != null && input.bodyFatPct > 0) {
    return {
      bmr: bmrKatchMcArdle(leanBodyMass(input.weightKg, input.bodyFatPct)),
      formula: "katch_mcardle",
    };
  }
  return {
    bmr: bmrMifflinStJeor(
      input.sex,
      input.weightKg,
      input.heightCm,
      input.ageYears,
    ),
    formula: "mifflin_st_jeor",
  };
};

/* -------------------------------------------------------------------------- */
/*                            Total daily expenditure                         */
/* -------------------------------------------------------------------------- */

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Desk job, little or no exercise",
  light: "Light exercise 1–3 days a week",
  moderate: "Moderate exercise 3–5 days a week",
  active: "Hard exercise 6–7 days a week",
  very_active: "Physical job or twice-daily training",
};

export const tdeeFromActivity = (bmr: number, level: ActivityLevel): number =>
  bmr * ACTIVITY_MULTIPLIERS[level];

/* -------------------------------------------------------------------------- */
/*                           Goal rate & safety rails                         */
/* -------------------------------------------------------------------------- */

/**
 * Safe weekly rate bounds as a percentage of bodyweight.
 *
 * Losing faster than ~1 %/week reliably costs lean mass; gaining faster than
 * ~0.5 %/week is mostly fat for anyone past their first year of training.
 */
export const RATE_BOUNDS: Record<Goal, { min: number; max: number }> = {
  lose: { min: 0.25, max: 1.0 },
  maintain: { min: 0, max: 0 },
  gain: { min: 0.125, max: 0.5 },
  recomp: { min: 0, max: 0.1 },
};

/** Direction multiplier for the goal. */
export const goalSign = (goal: Goal): number =>
  goal === "lose" ? -1 : goal === "gain" ? 1 : 0;

/** Clamp the requested rate into the safe band and apply direction. */
export const resolveRate = (goal: Goal, requestedPct: number): number => {
  const bounds = RATE_BOUNDS[goal];
  const magnitude = clamp(Math.abs(requestedPct), bounds.min, bounds.max);
  return goalSign(goal) * magnitude;
};

/**
 * Absolute floor on daily intake. Below this, micronutrient adequacy becomes
 * impractical and the lean-mass cost climbs sharply. We take the stricter of a
 * flat sex-based floor and 105 % of resting metabolism.
 */
export const calorieFloor = (sex: Sex, bmr: number): number =>
  Math.max(sex === "male" ? 1500 : 1200, bmr * 1.05);

export interface EnergyPlan {
  bmr: number;
  bmrFormula: BmrResult["formula"];
  activityMultiplier: number;
  tdee: number;
  /** Signed kcal/day applied to TDEE. */
  adjustment: number;
  /** Signed %BW/week actually used, after clamping and any floor. */
  appliedRatePctPerWeek: number;
  target: number;
  floorApplied: boolean;
  adaptive: boolean;
}

/**
 * Turn a profile + current weight into a daily calorie target.
 *
 * `tdeeOverride` lets an observed (adaptive) TDEE replace the multiplier
 * estimate once there is enough logged data to trust it.
 */
export const buildEnergyPlan = (
  profile: Profile,
  weightKg: number,
  opts: { bodyFatPct?: number; tdeeOverride?: number; asOf?: string } = {},
): EnergyPlan => {
  const ageYears = ageFrom(profile.birthDate, opts.asOf ?? toDateKey());
  const { bmr, formula } = restingEnergy({
    sex: profile.sex,
    weightKg,
    heightCm: profile.heightCm,
    ageYears,
    bodyFatPct: opts.bodyFatPct,
  });

  const multiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel];
  const estimatedTdee = tdeeFromActivity(bmr, profile.activityLevel);
  const adaptive = opts.tdeeOverride != null && opts.tdeeOverride > 0;
  const tdee = adaptive ? (opts.tdeeOverride as number) : estimatedTdee;

  const ratePct = resolveRate(profile.goal, profile.rateOfChangePctPerWeek);
  const kgPerWeek = (ratePct / 100) * weightKg;
  let adjustment = (kgPerWeek * KCAL_PER_KG_BODY_MASS) / 7;

  // Never take more than 25 % of maintenance out in one go, however aggressive
  // the requested rate. Surpluses are capped at 20 % to limit fat gain.
  const maxDeficit = tdee * 0.25;
  const maxSurplus = tdee * 0.2;
  adjustment = clamp(adjustment, -maxDeficit, maxSurplus);

  const floor = calorieFloor(profile.sex, bmr);
  let target = tdee + adjustment;
  let floorApplied = false;
  if (target < floor) {
    target = floor;
    adjustment = target - tdee;
    floorApplied = true;
  }

  const appliedRatePctPerWeek =
    weightKg > 0
      ? ((adjustment * 7) / KCAL_PER_KG_BODY_MASS / weightKg) * 100
      : 0;

  return {
    bmr: round(bmr),
    bmrFormula: formula,
    activityMultiplier: multiplier,
    tdee: round(tdee),
    adjustment: round(adjustment),
    appliedRatePctPerWeek: round(appliedRatePctPerWeek, 3),
    target: round(profile.calorieTargetOverride ?? target),
    floorApplied,
    adaptive,
  };
};

/* -------------------------------------------------------------------------- */
/*                                Adaptive TDEE                               */
/* -------------------------------------------------------------------------- */

export interface AdaptiveTdeeResult {
  /** kcal/day, or null when there is not enough data. */
  tdee: number | null;
  /** 0..1. Below ~0.5 the UI should present this as a hint, not a fact. */
  confidence: number;
  daysAnalysed: number;
  daysLogged: number;
  meanIntake: number;
  /** Observed change in *trend* weight over the window, kg. */
  weightChangeKg: number;
  reason: string;
}

/**
 * Back-calculate maintenance calories from what actually happened.
 *
 * Energy balance says: intake − expenditure = stored energy. So over a window
 * long enough for water weight to wash out,
 *
 *     TDEE ≈ mean daily intake − (Δ trend weight × 7700 / days)
 *
 * This is the single most valuable number a tracking app can produce, because
 * it replaces a population-average guess with the user's own physiology —
 * including NEAT adaptation, which is exactly what makes textbook targets
 * stop working after a few weeks of dieting.
 *
 * We deliberately use *smoothed* weight at both ends: raw scale readings swing
 * by ±1.5 kg on food and sodium alone, which would swamp the signal.
 */
export const estimateAdaptiveTdee = (
  entries: FoodEntry[],
  metrics: BodyMetric[],
  opts: { windowDays?: number; asOf?: string; minLoggedDays?: number } = {},
): AdaptiveTdeeResult => {
  const windowDays = opts.windowDays ?? 28;
  const minLoggedDays = opts.minLoggedDays ?? 14;
  const asOf = opts.asOf ?? toDateKey();
  const start = new Date(asOf);
  start.setDate(start.getDate() - (windowDays - 1));
  const startKey = toDateKey(start);

  const empty = (reason: string, daysLogged = 0): AdaptiveTdeeResult => ({
    tdee: null,
    confidence: 0,
    daysAnalysed: windowDays,
    daysLogged,
    meanIntake: 0,
    weightChangeKg: 0,
    reason,
  });

  // Daily intake totals, ignoring days with implausibly little logged —
  // a day with one apple on it is a day the user forgot, not a fast.
  const byDay = new Map<string, number>();
  for (const e of entries) {
    if (e.date < startKey || e.date > asOf) continue;
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.nutrients.kcal);
  }
  const loggedDays = [...byDay.entries()].filter(([, kcal]) => kcal >= 800);
  if (loggedDays.length < minLoggedDays) {
    return empty(
      `Needs at least ${minLoggedDays} fully logged days in the window; found ${loggedDays.length}.`,
      loggedDays.length,
    );
  }
  const meanIntake =
    loggedDays.reduce((s, [, kcal]) => s + kcal, 0) / loggedDays.length;

  // Smoothed weight at both ends of the window.
  const weights = metrics
    .filter((m) => m.date >= startKey && m.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (weights.length < 2) {
    return empty("Needs at least two weigh-ins in the window.", loggedDays.length);
  }
  const first = weights[0]!;
  const last = weights[weights.length - 1]!;
  const spanDays = daysBetween(first.date, last.date);
  if (spanDays < 10) {
    return empty(
      "Weigh-ins need to span at least 10 days for the trend to mean anything.",
      loggedDays.length,
    );
  }

  const smoothed = trendSeries(weights.map((w) => w.weightKg));
  // Slope over the smoothed series is more robust than endpoint subtraction.
  const perReading = linearSlope(smoothed);
  const readingsPerDay = (weights.length - 1) / spanDays;
  const kgPerDay = perReading * readingsPerDay;
  const weightChangeKg = kgPerDay * spanDays;

  const tdee = meanIntake - kgPerDay * KCAL_PER_KG_BODY_MASS;

  // Confidence grows with logging density and observation length, and falls
  // apart if the arithmetic produces something physiologically absurd.
  const density = loggedDays.length / windowDays;
  const lengthFactor = clamp(spanDays / 28, 0, 1);
  let confidence = clamp(density * 0.6 + lengthFactor * 0.4, 0, 1);
  if (tdee < 1000 || tdee > 6000) confidence = 0;

  if (confidence === 0) {
    return empty(
      "The numbers imply an implausible maintenance level — usually a sign of under-logging.",
      loggedDays.length,
    );
  }

  return {
    tdee: round(tdee),
    confidence: round(confidence, 2),
    daysAnalysed: windowDays,
    daysLogged: loggedDays.length,
    meanIntake: round(meanIntake),
    weightChangeKg: round(weightChangeKg, 2),
    reason: `Averaged ${round(meanIntake)} kcal across ${loggedDays.length} logged days while trend weight moved ${round(weightChangeKg, 2)} kg over ${spanDays} days.`,
  };
};

/* -------------------------------------------------------------------------- */
/*                             Exercise energy cost                           */
/* -------------------------------------------------------------------------- */

/**
 * The standard MET equation: 1 MET is roughly 3.5 ml O₂/kg/min, and a litre of
 * oxygen releases about 5 kcal.
 */
export const kcalFromMet = (
  met: number,
  weightKg: number,
  minutes: number,
): number => (met * 3.5 * weightKg) / 200 * minutes;

/** Intensity nudges the catalogue MET value up or down. */
export const INTENSITY_MET_FACTOR = {
  easy: 0.8,
  moderate: 1,
  hard: 1.25,
} as const;

/**
 * Energy cost of resistance training, estimated from working-set count.
 * Lifting burns far less than people assume — roughly 5–8 kcal/min including
 * rest — so we keep this conservative on purpose.
 */
export const kcalFromLifting = (
  workingSets: number,
  weightKg: number,
): number => {
  const minutes = workingSets * 2.5; // set plus its rest period
  return kcalFromMet(4.5, weightKg, minutes);
};
