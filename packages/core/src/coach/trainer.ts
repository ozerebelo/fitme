import type { CoachContext, Exercise, Insight, MuscleGroup } from "../types";
import {
  VOLUME_LANDMARKS,
  classifyVolume,
  exerciseHistory,
  isWorkingSet,
  personalRecords,
  rpeCreep,
  setsPerMuscle,
  volumeLoad,
} from "../strength";
import { EXERCISE_BY_ID } from "../data/exercises";
import { linearSlope, mean, sessionsInRange } from "../analytics";
import { lastNDays } from "../date";
import { type RepRangePolicy, readyToProgress } from "../progression";
import { round } from "../units";
import { bySeverity } from "./nutritionist";

const insight = (
  id: string,
  severity: Insight["severity"],
  title: string,
  detail: string,
  action?: string,
  evidence?: Insight["evidence"],
): Insight => ({ id, domain: "training", severity, title, detail, action, evidence });

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "chest",
  back: "back",
  lats: "lats",
  shoulders: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  core: "core",
  forearms: "forearms",
};

/**
 * The personal trainer.
 *
 * Everything here reduces to four questions: are you training often enough,
 * is the volume per muscle in the productive range, is the load going up over
 * time, and is fatigue outrunning recovery.
 */
export const analyseTraining = (
  ctx: CoachContext,
  catalog: Map<string, Exercise> = EXERCISE_BY_ID,
  policy?: RepRangePolicy,
): Insight[] => {
  const out: Insight[] = [];
  const { profile, sessions, asOf } = ctx;

  const last7 = lastNDays(7, asOf);
  const last28 = lastNDays(28, asOf);
  const week = sessionsInRange(sessions, last7);
  const month = sessionsInRange(sessions, last28);

  /* ------------------------------ No data --------------------------------- */

  if (sessions.length === 0) {
    return [
      insight(
        "no-training-data",
        "info",
        "No sessions logged yet",
        "Once you log a few workouts I can track volume per muscle group, spot stalls before you feel them, and tell you exactly what weight to put on the bar next time.",
        "Start your first session from the Train tab, or import your history if you have been training elsewhere.",
      ),
    ];
  }

  /* ---------------------------- Frequency --------------------------------- */

  const plannedPerWeek = profile.trainingDaysPerWeek;
  const monthlyWeeks = 4;
  const sessionsPerWeek = month.length / monthlyWeeks;

  if (week.length === 0) {
    out.push(
      insight(
        "no-sessions-week",
        "warning",
        "Nothing logged this week",
        "Seven days without a session. Detraining takes longer to set in than people fear — you will not have lost anything yet — but the habit is the fragile part, not the muscle.",
        "Get one session in, even a short one. Two main lifts is enough to keep the thread.",
      ),
    );
  } else if (plannedPerWeek > 0 && sessionsPerWeek < plannedPerWeek * 0.6 && month.length >= 3) {
    out.push(
      insight(
        "frequency-low",
        "warning",
        "Training less often than the plan assumes",
        `You have averaged ${round(sessionsPerWeek, 1)} sessions a week over the last month against a plan built for ${plannedPerWeek}. The plan spreads volume across those days, so missing them leaves several muscles under their minimum effective volume.`,
        `Either commit to ${plannedPerWeek} days or rebuild the plan around ${Math.max(1, Math.round(sessionsPerWeek))} — a smaller plan you finish beats a bigger one you do not.`,
        { actual: round(sessionsPerWeek, 1), planned: plannedPerWeek },
      ),
    );
  }

  /* ------------------------------ Volume ---------------------------------- */

  const weeklySets = setsPerMuscle(week, catalog);
  const monthlyAvg = setsPerMuscle(month, catalog);

  const under: string[] = [];
  const over: string[] = [];
  for (const muscle of Object.keys(VOLUME_LANDMARKS) as MuscleGroup[]) {
    // Average over the month is a fairer read than a single week.
    const avg = (monthlyAvg[muscle] ?? 0) / monthlyWeeks;
    if (month.length < 4) continue;
    const verdict = classifyVolume(muscle, avg);
    // Forearms and core get trained indirectly; do not nag about them.
    if (muscle === "forearms" || muscle === "core") continue;
    if (verdict === "under" || verdict === "maintaining") under.push(MUSCLE_LABELS[muscle]);
    if (verdict === "excessive") over.push(MUSCLE_LABELS[muscle]);
  }

  if (under.length > 0) {
    const list = under.slice(0, 3).join(", ");
    out.push(
      insight(
        "volume-under",
        "warning",
        `Under-trained: ${list}`,
        `Averaged over the last four weeks, your ${list} ${under.length === 1 ? "is" : "are"} below the minimum weekly hard sets needed to grow. Below that line you are maintaining at best, regardless of how hard the sets feel.`,
        `Add 3–4 sets a week for ${under[0]}. That is one extra exercise, or one extra set on what you already do.`,
        { underTrained: under.join(", ") },
      ),
    );
  }

  if (over.length > 0) {
    out.push(
      insight(
        "volume-over",
        "warning",
        `Probably too much: ${over.join(", ")}`,
        `Your weekly sets for ${over.join(" and ")} sit above the range most people can recover from. Past that point extra sets add fatigue without adding stimulus, and they steal recovery from everything else.`,
        "Cut 20–30 % of the sets for a fortnight and watch what happens to your loads. Most people go up.",
        { overTrained: over.join(", ") },
      ),
    );
  }

  /* --------------------------- Push / pull balance ------------------------ */

  const pushSets =
    (monthlyAvg.chest ?? 0) + (monthlyAvg.shoulders ?? 0) + (monthlyAvg.triceps ?? 0);
  const pullSets =
    (monthlyAvg.back ?? 0) + (monthlyAvg.lats ?? 0) + (monthlyAvg.biceps ?? 0);
  const pushPullRatio = pullSets > 0 ? pushSets / pullSets : Number.POSITIVE_INFINITY;
  if (month.length >= 6 && pushSets > 0 && pushPullRatio > 1.4) {
    out.push(
      insight(
        "push-pull-imbalance",
        "info",
        "Pushing a lot more than you pull",
        pullSets === 0
          ? `About ${Math.round(pushSets)} pushing sets over the last month and no pulling work at all. Sustained, that pulls the shoulders forward and is one of the more common routes into shoulder pain in lifters.`
          : `Roughly ${Math.round(pushSets)} pushing sets against ${Math.round(pullSets)} pulling sets over the last month. Sustained, that ratio pulls the shoulders forward and is one of the more common routes into shoulder pain in lifters.`,
        "Match them, or bias slightly toward pulling. An extra row or face-pull set is the cheapest insurance in the gym.",
        { pushSets: Math.round(pushSets), pullSets: Math.round(pullSets) },
      ),
    );
  }

  /* ---------------------------- Progression ------------------------------- */

  const trackedIds = new Set<string>();
  for (const session of month) {
    for (const set of session.sets) if (isWorkingSet(set)) trackedIds.add(set.exerciseId);
  }

  const stalled: string[] = [];
  const progressing: { name: string; gain: number }[] = [];

  for (const exerciseId of trackedIds) {
    const history = exerciseHistory(sessions, exerciseId);
    if (history.length < 4) continue;
    const recent = history.slice(-4);
    const e1rms = recent.map((h) => h.bestE1RM).filter((v): v is number => v != null);
    if (e1rms.length < 3) continue;

    const name = catalog.get(exerciseId)?.name ?? exerciseId;
    const slope = linearSlope(e1rms);
    const first = e1rms[0]!;
    const pctChange = first > 0 ? ((e1rms[e1rms.length - 1]! - first) / first) * 100 : 0;

    if (slope <= 0 && pctChange < 1) stalled.push(name);
    else if (pctChange > 2.5) progressing.push({ name, gain: round(pctChange, 1) });
  }

  if (stalled.length > 0) {
    out.push(
      insight(
        "lifts-stalled",
        "warning",
        `Stalled: ${stalled.slice(0, 3).join(", ")}`,
        `Estimated 1RM on ${stalled.length === 1 ? "this lift has" : "these lifts have"} been flat or falling across your last four sessions. A stall is information, not failure — it usually means fatigue has accumulated faster than fitness.`,
        `Take one deload week at about 90 % of current loads, then rebuild. If it stalls again at the same weight, the fix is volume or technique, not willpower${ctx.profile.goal === "lose" ? " — and note that strength gains are genuinely hard to come by in a deficit" : ""}.`,
        { stalled: stalled.join(", ") },
      ),
    );
  }

  if (progressing.length > 0) {
    const best = progressing.sort((a, b) => b.gain - a.gain)[0]!;
    out.push(
      insight(
        "lifts-progressing",
        "success",
        `${best.name} is up ${best.gain} %`,
        `Estimated 1RM on ${progressing.length === 1 ? "your " + best.name : `${progressing.length} lifts, led by your ${best.name},`} has climbed over your last four sessions. This is the signal that matters — everything else is noise around it.`,
        undefined,
        { exercise: best.name, gainPct: best.gain },
      ),
    );
  }

  /* ------------------------------- Fatigue -------------------------------- */

  const creeping: string[] = [];
  for (const exerciseId of trackedIds) {
    const history = exerciseHistory(sessions, exerciseId);
    const creep = rpeCreep(history);
    if (creep.creeping) creeping.push(catalog.get(exerciseId)?.name ?? exerciseId);
  }
  if (creeping.length >= 2) {
    out.push(
      insight(
        "rpe-creep",
        "warning",
        "The same weights are feeling harder",
        `RPE is climbing on ${creeping.slice(0, 3).join(", ")} without the loads going up. That pattern is the earliest reliable sign that recovery is falling behind training — it shows up well before performance actually drops.`,
        `Take a deload week now rather than in three weeks' time when it is forced on you.${ctx.profile.goal === "lose" ? " Check sleep and protein too; a deficit shrinks the recovery budget." : " Check sleep first — it is the cheapest fix."}`,
        { exercises: creeping.join(", ") },
      ),
    );
  }

  /* ------------------------ Sessions getting shorter ---------------------- */

  if (month.length >= 6) {
    const volumes = [...month]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => volumeLoad(s.sets));
    const slope = linearSlope(volumes);
    const avg = mean(volumes);
    if (avg > 0 && slope < -avg * 0.04) {
      out.push(
        insight(
          "volume-declining",
          "info",
          "Sessions are getting shorter",
          "Total work per session has been trending down over the last month. Sometimes that is a deliberate deload; more often it is sessions quietly getting cut short.",
          "If it is not deliberate, protect the first two exercises of each session and let the accessories go instead.",
          { slope: round(slope) },
        ),
      );
    }
  }

  /* --------------------------- Ready to load up --------------------------- */

  const ready = readyToProgress(sessions, {
    catalog,
    units: profile.units,
    asOf,
    ...(policy ? { policy } : {}),
  });
  if (ready.length > 0) {
    const names = ready.slice(0, 3).map((r) => r.exerciseName);
    out.push(
      insight(
        "ready-to-progress",
        "info",
        `${ready.length} ${ready.length === 1 ? "lift is" : "lifts are"} ready to go up`,
        `${names.join(", ")}${ready.length > 3 ? ` and ${ready.length - 3} more` : ""} cleared the top of their rep range at a manageable effort last session. Leaving the weight there now is the most common way a good programme quietly turns into maintenance.`,
        ready
          .slice(0, 3)
          .map((r) => `${r.exerciseName} → ${Math.round((r.suggestedWeightKg ?? 0) * 10) / 10} kg`)
          .join(" · "),
        { ready: ready.length },
      ),
    );
  }

  /* ------------------------------ Recent PRs ------------------------------ */

  const prs = personalRecords(sessions);
  const recentPrs = [...prs.values()].filter(
    (pr) => pr.bestE1RMDate != null && last28.includes(pr.bestE1RMDate),
  );
  if (recentPrs.length > 0) {
    const names = recentPrs
      .slice(0, 3)
      .map((pr) => catalog.get(pr.exerciseId)?.name ?? pr.exerciseId);
    out.push(
      insight(
        "recent-prs",
        "success",
        `${recentPrs.length} personal record${recentPrs.length === 1 ? "" : "s"} this month`,
        `New bests on ${names.join(", ")}${recentPrs.length > 3 ? " and others" : ""}.`,
        undefined,
        { count: recentPrs.length },
      ),
    );
  }

  return out.sort(bySeverity);
};
