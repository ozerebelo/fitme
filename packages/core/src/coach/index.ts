import type {
  BodyMetric,
  CoachContext,
  DailyTargets,
  Exercise,
  FoodEntry,
  Insight,
  Profile,
  Program,
  ProgramDay,
  WorkoutSession,
} from "../types";
import { buildEnergyPlan, estimateAdaptiveTdee } from "../energy";
import { buildDailyTargets } from "../macros";
import { EXERCISE_BY_ID } from "../data/exercises";
import { exerciseHistory, suggestProgression } from "../strength";
import { type RepRangePolicy, resolveRepRange } from "../progression";
import { nextProgramDay } from "../programs";
import { weightTrend } from "../analytics";
import { toDateKey } from "../date";
import { analyseNutrition, bySeverity } from "./nutritionist";
import { analyseTraining } from "./trainer";

export { analyseNutrition } from "./nutritionist";
export { analyseTraining } from "./trainer";

/* -------------------------------------------------------------------------- */
/*                              Target resolution                             */
/* -------------------------------------------------------------------------- */

export interface ResolveTargetsInput {
  profile: Profile;
  metrics: BodyMetric[];
  entries: FoodEntry[];
  asOf?: string;
  /** Set false to force the formula estimate, e.g. for the "show your work" UI. */
  useAdaptive?: boolean;
}

/**
 * Resolve today's targets.
 *
 * Once there is enough logged data, the observed maintenance level replaces the
 * activity-multiplier estimate. That switch is the difference between an app
 * that tells you what the average person needs and one that tells you what you
 * need — so it happens automatically, but only above a confidence bar.
 */
export const resolveTargets = (input: ResolveTargetsInput): DailyTargets => {
  const asOf = input.asOf ?? toDateKey();
  const trend = weightTrend(input.metrics, { asOf });
  const latest = [...input.metrics].sort((a, b) => b.date.localeCompare(a.date))[0];
  const weightKg = trend.trendKg ?? latest?.weightKg ?? 75;
  const bodyFatPct = latest?.bodyFatPct;

  let tdeeOverride: number | undefined;
  if (input.useAdaptive !== false) {
    const adaptive = estimateAdaptiveTdee(input.entries, input.metrics, { asOf });
    if (adaptive.tdee != null && adaptive.confidence >= 0.6) {
      tdeeOverride = adaptive.tdee;
    }
  }

  const plan = buildEnergyPlan(input.profile, weightKg, { bodyFatPct, tdeeOverride, asOf });
  return buildDailyTargets(input.profile, plan, weightKg, bodyFatPct);
};

/* -------------------------------------------------------------------------- */
/*                              Session planning                              */
/* -------------------------------------------------------------------------- */

export interface PlannedSet {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  repMin: number;
  repMax: number;
  rpe: number;
  restSeconds: number;
  /** Suggested working weight, or null when there is no history to go on. */
  suggestedWeightKg: number | null;
  /** Why that weight — shown inline so the number is never a black box. */
  reason: string;
  lastTime?: { weightKg: number; reps: number; date: string };
}

export interface PlannedSession {
  day: ProgramDay;
  blocks: PlannedSet[];
  estimatedMinutes: number;
  conditioningMinutes?: number;
}

/**
 * Turn the next program day into concrete numbers, using each lift's own
 * history to decide whether today is a load increase, a rep increase, or a
 * back-off.
 */
export const planNextSession = (
  program: Program,
  sessions: WorkoutSession[],
  profile: Profile,
  catalog: Map<string, Exercise> = EXERCISE_BY_ID,
  /** When set, the user's own rep ranges override the programme's. */
  policy?: RepRangePolicy,
): PlannedSession | null => {
  const completedDayIds = sessions
    .filter((s) => s.programId === program.id && s.programDayId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => s.programDayId!);

  const day = nextProgramDay(program, completedDayIds);
  if (!day) return null;

  const blocks: PlannedSet[] = day.blocks.map((block) => {
    const exercise = catalog.get(block.exerciseId);
    const [repMin, repMax] = policy
      ? resolveRepRange(exercise, policy)
      : [block.repMin, block.repMax];
    const history = exerciseHistory(sessions, block.exerciseId);
    const isUpper = !exercise
      ? true
      : !exercise.primary.some((m) =>
          ["quads", "hamstrings", "glutes", "calves"].includes(m),
        );

    const suggestion = suggestProgression(history, {
      repMin,
      repMax,
      sets: block.sets,
      targetRpe: policy?.targetRpe ?? block.rpe,
      units: profile.units,
      isUpperBody: isUpper,
    });

    const last = history[history.length - 1];
    return {
      exerciseId: block.exerciseId,
      exerciseName: exercise?.name ?? block.exerciseId,
      sets: suggestion.sets,
      repMin,
      repMax,
      rpe: block.rpe,
      restSeconds: block.restSeconds,
      suggestedWeightKg: suggestion.action === "start" ? null : suggestion.weightKg,
      reason: suggestion.reason,
      lastTime:
        last?.topSet != null
          ? { weightKg: last.topSet.weightKg, reps: last.topSet.reps, date: last.date }
          : undefined,
    };
  });

  const estimatedMinutes = day.blocks.reduce((sum, b) => {
    const repSeconds = ((b.repMin + b.repMax) / 2) * 3;
    return sum + (b.sets * (repSeconds + b.restSeconds) + 90) / 60;
  }, 0);

  return {
    day,
    blocks,
    estimatedMinutes: Math.round(estimatedMinutes),
    conditioningMinutes: day.conditioningMinutes,
  };
};

/* -------------------------------------------------------------------------- */
/*                                Full report                                 */
/* -------------------------------------------------------------------------- */

export interface CoachReport {
  insights: Insight[];
  nutrition: Insight[];
  training: Insight[];
  targets: DailyTargets;
  /** One-line summary for the dashboard. */
  headline: string;
  plannedSession: PlannedSession | null;
}

export const buildCoachReport = (
  ctx: CoachContext,
  catalog: Map<string, Exercise> = EXERCISE_BY_ID,
  policy?: RepRangePolicy,
): CoachReport => {
  const nutrition = analyseNutrition(ctx);
  const training = analyseTraining(ctx, catalog, policy);
  const insights = [...nutrition, ...training].sort(bySeverity);

  const plannedSession = ctx.program
    ? planNextSession(ctx.program, ctx.sessions, ctx.profile, catalog, policy)
    : null;

  return {
    insights,
    nutrition,
    training,
    targets: ctx.targets,
    headline: buildHeadline(insights, ctx),
    plannedSession,
  };
};

const buildHeadline = (insights: Insight[], ctx: CoachContext): string => {
  const critical = insights.find((i) => i.severity === "critical");
  if (critical) return critical.title;
  const warning = insights.find((i) => i.severity === "warning");
  if (warning) return warning.title;
  const success = insights.find((i) => i.severity === "success");
  if (success) return success.title;
  return ctx.profile.goal === "lose"
    ? "On plan — keep logging"
    : "On plan — keep training";
};

/**
 * Compact, token-efficient snapshot of the user's real data, for seeding an
 * LLM conversation. Deliberately numbers-only: the model should reason about
 * the user's actual situation rather than invent a generic answer.
 */
export const buildCoachBriefing = (report: CoachReport, ctx: CoachContext): string => {
  const { profile, targets } = ctx;
  const trend = weightTrend(ctx.metrics, { asOf: ctx.asOf });
  const lines: string[] = [];

  lines.push(`Goal: ${profile.goal}. Experience: ${profile.experience}. Trains ${profile.trainingDaysPerWeek}x/week, ${profile.sessionMinutes} min sessions.`);
  lines.push(`Equipment: ${profile.availableEquipment.join(", ") || "bodyweight only"}.`);
  if (profile.dietPreference !== "none") lines.push(`Diet preference: ${profile.dietPreference}.`);
  if (profile.allergies.length) lines.push(`Avoids: ${profile.allergies.join(", ")}.`);

  lines.push(
    `Targets: ${targets.kcal} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat.` +
      ` (BMR ${targets.breakdown.bmr}, TDEE ${targets.breakdown.tdee}${targets.breakdown.adaptive ? ", measured from their own energy balance" : ", estimated from activity level"}.)`,
  );

  if (trend.trendKg != null) {
    lines.push(
      `Trend weight ${trend.trendKg} kg, moving ${trend.kgPerWeek >= 0 ? "+" : ""}${trend.kgPerWeek} kg/week over ${trend.spanDays} days.`,
    );
  }

  if (report.insights.length) {
    lines.push("Current findings from their data:");
    for (const i of report.insights.slice(0, 8)) {
      lines.push(`- [${i.severity}] ${i.title}: ${i.detail}`);
    }
  }

  if (report.plannedSession) {
    const s = report.plannedSession;
    lines.push(
      `Next session (${s.day.name}, ~${s.estimatedMinutes} min): ` +
        s.blocks
          .map(
            (b) =>
              `${b.exerciseName} ${b.sets}x${b.repMin}-${b.repMax}` +
              (b.suggestedWeightKg ? ` @ ${b.suggestedWeightKg}kg` : ""),
          )
          .join("; "),
    );
  }

  return lines.join("\n");
};
