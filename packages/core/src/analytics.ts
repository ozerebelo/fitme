import type { BodyMetric, FoodEntry, Nutrients, WorkoutSession } from "./types";
import { KCAL_PER_KG_BODY_MASS, round } from "./units";
import { type DateKey, daysBetween, isWeekend, lastNDays, toDateKey } from "./date";

/* -------------------------------------------------------------------------- */
/*                              Series smoothing                              */
/* -------------------------------------------------------------------------- */

/**
 * Exponential moving average. Bodyweight swings ±1–2 kg on glycogen, sodium and
 * gut contents; the EMA is the "trend weight" that actually tracks fat mass.
 * alpha = 2/(N+1) mirrors the familiar N-period moving average.
 */
export const ema = (values: number[], periods = 10): number[] => {
  if (values.length === 0) return [];
  const alpha = 2 / (periods + 1);
  const out: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    out.push(alpha * values[i]! + (1 - alpha) * out[i - 1]!);
  }
  return out;
};

/** Convenience alias used across the coaching code. */
export const trendSeries = (values: number[]): number[] => ema(values, 10);

/** Least-squares slope per index step. Returns 0 for degenerate input. */
export const linearSlope = (values: number[]): number => {
  const n = values.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (values[i]! - meanY);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
};

export const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;

export const stdDev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(
    values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1),
  );
};

/* -------------------------------------------------------------------------- */
/*                              Weight trend                                  */
/* -------------------------------------------------------------------------- */

export interface WeightTrend {
  /** Smoothed current weight — the number worth reacting to. */
  trendKg: number | null;
  /** Most recent raw scale reading. */
  latestKg: number | null;
  /** Signed kg/week from the smoothed series. */
  kgPerWeek: number;
  pctPerWeek: number;
  /** How many days the readings span. */
  spanDays: number;
  points: { date: DateKey; raw: number; trend: number }[];
}

export const weightTrend = (
  metrics: BodyMetric[],
  opts: { windowDays?: number; asOf?: DateKey } = {},
): WeightTrend => {
  const asOf = opts.asOf ?? toDateKey();
  const windowDays = opts.windowDays ?? 90;
  const cutoff = lastNDays(windowDays, asOf)[0]!;
  const rows = metrics
    .filter((m) => m.date >= cutoff && m.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length === 0) {
    return {
      trendKg: null,
      latestKg: null,
      kgPerWeek: 0,
      pctPerWeek: 0,
      spanDays: 0,
      points: [],
    };
  }

  const smoothed = ema(rows.map((r) => r.weightKg));
  const points = rows.map((r, i) => ({
    date: r.date,
    raw: r.weightKg,
    trend: round(smoothed[i]!, 2),
  }));

  const spanDays = daysBetween(rows[0]!.date, rows[rows.length - 1]!.date);
  let kgPerWeek = 0;
  if (rows.length >= 2 && spanDays > 0) {
    const perReading = linearSlope(smoothed);
    const readingsPerDay = (rows.length - 1) / spanDays;
    kgPerWeek = perReading * readingsPerDay * 7;
  }

  const trendKg = smoothed[smoothed.length - 1]!;
  return {
    trendKg: round(trendKg, 2),
    latestKg: rows[rows.length - 1]!.weightKg,
    kgPerWeek: round(kgPerWeek, 3),
    pctPerWeek: trendKg > 0 ? round((kgPerWeek / trendKg) * 100, 3) : 0,
    spanDays,
    points,
  };
};

/* -------------------------------------------------------------------------- */
/*                             Nutrition rollups                              */
/* -------------------------------------------------------------------------- */

export const EMPTY_NUTRIENTS: Nutrients = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  satFat: 0,
  sodiumMg: 0,
};

export const addNutrients = (a: Nutrients, b: Nutrients): Nutrients => ({
  kcal: a.kcal + b.kcal,
  protein: a.protein + b.protein,
  carbs: a.carbs + b.carbs,
  fat: a.fat + b.fat,
  fiber: (a.fiber ?? 0) + (b.fiber ?? 0),
  sugar: (a.sugar ?? 0) + (b.sugar ?? 0),
  satFat: (a.satFat ?? 0) + (b.satFat ?? 0),
  sodiumMg: (a.sodiumMg ?? 0) + (b.sodiumMg ?? 0),
});

export const scaleNutrients = (n: Nutrients, factor: number): Nutrients => ({
  kcal: n.kcal * factor,
  protein: n.protein * factor,
  carbs: n.carbs * factor,
  fat: n.fat * factor,
  fiber: (n.fiber ?? 0) * factor,
  sugar: (n.sugar ?? 0) * factor,
  satFat: (n.satFat ?? 0) * factor,
  sodiumMg: (n.sodiumMg ?? 0) * factor,
});

export const roundNutrients = (n: Nutrients): Nutrients => ({
  kcal: Math.round(n.kcal),
  protein: round(n.protein, 1),
  carbs: round(n.carbs, 1),
  fat: round(n.fat, 1),
  fiber: round(n.fiber ?? 0, 1),
  sugar: round(n.sugar ?? 0, 1),
  satFat: round(n.satFat ?? 0, 1),
  sodiumMg: Math.round(n.sodiumMg ?? 0),
});

export const sumEntries = (entries: FoodEntry[]): Nutrients =>
  entries.reduce((acc, e) => addNutrients(acc, e.nutrients), EMPTY_NUTRIENTS);

export interface DayNutrition {
  date: DateKey;
  totals: Nutrients;
  entryCount: number;
  /** A day is "logged" once it has a plausible amount of food on it. */
  logged: boolean;
}

export const dailyNutrition = (
  entries: FoodEntry[],
  days: DateKey[],
): DayNutrition[] => {
  const byDay = new Map<DateKey, FoodEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }
  return days.map((date) => {
    const dayEntries = byDay.get(date) ?? [];
    const totals = sumEntries(dayEntries);
    return {
      date,
      totals,
      entryCount: dayEntries.length,
      logged: totals.kcal >= 800,
    };
  });
};

export interface AdherenceSummary {
  daysConsidered: number;
  daysLogged: number;
  loggingRate: number;
  meanKcal: number;
  meanProtein: number;
  /** Mean signed difference from the calorie target across logged days. */
  meanKcalDelta: number;
  /** Share of logged days within ±10 % of the calorie target. */
  onTargetRate: number;
  proteinHitRate: number;
  /** Mean intake on weekend days minus weekdays. Big positives explain stalls. */
  weekendSwing: number;
  currentStreak: number;
}

export const adherence = (
  entries: FoodEntry[],
  targets: { kcal: number; protein: number },
  opts: { windowDays?: number; asOf?: DateKey } = {},
): AdherenceSummary => {
  const days = lastNDays(opts.windowDays ?? 14, opts.asOf ?? toDateKey());
  const rows = dailyNutrition(entries, days);
  const logged = rows.filter((r) => r.logged);

  const weekdayKcal = logged.filter((r) => !isWeekend(r.date)).map((r) => r.totals.kcal);
  const weekendKcal = logged.filter((r) => isWeekend(r.date)).map((r) => r.totals.kcal);

  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i]!.logged) streak++;
    else break;
  }

  const within = logged.filter(
    (r) => Math.abs(r.totals.kcal - targets.kcal) <= targets.kcal * 0.1,
  ).length;
  const proteinHits = logged.filter(
    (r) => r.totals.protein >= targets.protein * 0.9,
  ).length;

  return {
    daysConsidered: days.length,
    daysLogged: logged.length,
    loggingRate: days.length ? round(logged.length / days.length, 2) : 0,
    meanKcal: round(mean(logged.map((r) => r.totals.kcal))),
    meanProtein: round(mean(logged.map((r) => r.totals.protein))),
    meanKcalDelta: round(mean(logged.map((r) => r.totals.kcal - targets.kcal))),
    onTargetRate: logged.length ? round(within / logged.length, 2) : 0,
    proteinHitRate: logged.length ? round(proteinHits / logged.length, 2) : 0,
    weekendSwing:
      weekendKcal.length && weekdayKcal.length
        ? round(mean(weekendKcal) - mean(weekdayKcal))
        : 0,
    currentStreak: streak,
  };
};

/* -------------------------------------------------------------------------- */
/*                              Energy balance                                */
/* -------------------------------------------------------------------------- */

/** Expected weekly weight change implied by a mean daily calorie delta. */
export const impliedKgPerWeek = (kcalDeltaPerDay: number): number =>
  (kcalDeltaPerDay * 7) / KCAL_PER_KG_BODY_MASS;

/* -------------------------------------------------------------------------- */
/*                              Training rollups                              */
/* -------------------------------------------------------------------------- */

export const sessionsInRange = (
  sessions: WorkoutSession[],
  days: DateKey[],
): WorkoutSession[] => {
  const set = new Set(days);
  return sessions.filter((s) => set.has(s.date));
};

/** Calories burned from logged cardio in a set of sessions. */
export const cardioKcal = (sessions: WorkoutSession[]): number =>
  sessions.reduce(
    (sum, s) => sum + s.cardio.reduce((c, e) => c + e.kcal, 0),
    0,
  );
