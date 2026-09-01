import type { CoachContext, Insight } from "../types";
import { KCAL_PER_KG_BODY_MASS, round } from "../units";
import { adherence, impliedKgPerWeek, weightTrend } from "../analytics";
import { buildEnergyPlan, estimateAdaptiveTdee } from "../energy";
import { daysBetween, lastNDays } from "../date";

const insight = (
  id: string,
  severity: Insight["severity"],
  title: string,
  detail: string,
  action?: string,
  evidence?: Insight["evidence"],
): Insight => ({ id, domain: "nutrition", severity, title, detail, action, evidence });

/**
 * The nutritionist.
 *
 * Its central job is reconciling three numbers that people usually look at in
 * isolation: what the calculator says you should eat, what you actually ate,
 * and what your bodyweight did about it. When those disagree, the scale is
 * right and the calculator is wrong — and that is the insight worth surfacing.
 */
export const analyseNutrition = (ctx: CoachContext): Insight[] => {
  const out: Insight[] = [];
  const { profile, targets, entries, metrics, asOf } = ctx;

  const stats = adherence(entries, { kcal: targets.kcal, protein: targets.protein }, { asOf, windowDays: 14 });
  const trend = weightTrend(metrics, { asOf, windowDays: 56 });
  const adaptive = estimateAdaptiveTdee(entries, metrics, { asOf, windowDays: 28 });

  /* ------------------------------- Logging -------------------------------- */

  if (stats.daysLogged === 0) {
    return [
      insight(
        "no-data",
        "info",
        "Nothing logged yet",
        "There is no food data to work with, so every number on this page is still a population-average estimate rather than a picture of you.",
        "Log everything you eat for seven days — even roughly. That is enough for me to start calibrating your real maintenance calories.",
      ),
    ];
  }

  if (stats.loggingRate < 0.6) {
    out.push(
      insight(
        "logging-gaps",
        "warning",
        "Too many missing days to trust the numbers",
        `You logged ${stats.daysLogged} of the last ${stats.daysConsidered} days. Partial logging almost always reads as a bigger deficit than you are actually in, because the forgotten days are rarely the small ones.`,
        "Aim for five fully logged days a week. Consistency beats precision — a rough estimate logged is worth more than an exact number skipped.",
        { daysLogged: stats.daysLogged, daysConsidered: stats.daysConsidered },
      ),
    );
  } else if (stats.currentStreak >= 7) {
    out.push(
      insight(
        "logging-streak",
        "success",
        `${stats.currentStreak}-day logging streak`,
        "Consistent logging is what makes everything else on this page meaningful. Your targets are now based on your data, not on averages.",
        undefined,
        { streak: stats.currentStreak },
      ),
    );
  }

  /* -------------------- Target vs. reality reconciliation ----------------- */

  if (adaptive.tdee != null && adaptive.confidence >= 0.5) {
    // Compare against the *formula* estimate, not against `targets`, which may
    // already have adopted the adaptive number.
    const referenceWeight = trend.trendKg ?? ctx.currentWeightKg;
    const formulaTdee = buildEnergyPlan(profile, referenceWeight, { asOf }).tdee;
    const gap = adaptive.tdee - formulaTdee;

    if (targets.breakdown.adaptive) {
      out.push(
        insight(
          "tdee-calibrated",
          "success",
          "Your targets are calibrated to you, not to a formula",
          `Measured from your own intake and weight trend, maintenance is ${adaptive.tdee} kcal — the textbook estimate for someone your size and activity level was ${formulaTdee}. Your daily target is built on the measured number.`,
          undefined,
          { observedTdee: adaptive.tdee, formulaTdee, confidence: adaptive.confidence },
        ),
      );
    } else if (Math.abs(gap) >= 150) {
      const direction = gap < 0 ? "lower" : "higher";
      const suggestedTarget = Math.round(adaptive.tdee + targets.breakdown.adjustment);
      out.push(
        insight(
          "adaptive-tdee",
          "warning",
          `Your real maintenance looks ${direction} than the estimate`,
          `The formula puts your maintenance at ${formulaTdee} kcal. Your actual intake and weight trend over the last ${adaptive.daysAnalysed} days imply ${adaptive.tdee} kcal — a gap of ${Math.abs(Math.round(gap))} kcal a day. ${adaptive.reason}`,
          `Move your daily target to about ${suggestedTarget} kcal. A formula is a starting guess; your own energy balance is a measurement.`,
          {
            formulaTdee,
            observedTdee: adaptive.tdee,
            confidence: adaptive.confidence,
            daysLogged: adaptive.daysLogged,
          },
        ),
      );
    } else {
      out.push(
        insight(
          "tdee-confirmed",
          "success",
          "Your calorie target checks out",
          `Measured against your own weight trend, maintenance comes out at ${adaptive.tdee} kcal — within ${Math.abs(Math.round(gap))} kcal of the estimate. The target you are working to is the right one.`,
          undefined,
          { observedTdee: adaptive.tdee, confidence: adaptive.confidence },
        ),
      );
    }
  }

  /* ------------------------- Rate of change check ------------------------- */

  if (trend.trendKg != null && trend.spanDays >= 14) {
    const pct = trend.pctPerWeek;
    const goal = profile.goal;

    if (goal === "lose") {
      if (pct > -0.05 && pct < 0.15) {
        const expected = impliedKgPerWeek(stats.meanKcalDelta);
        out.push(
          insight(
            "loss-stalled",
            "warning",
            "Weight has stopped moving",
            `Trend weight has been flat for ${trend.spanDays} days (${round(trend.kgPerWeek, 2)} kg/week) while you have been averaging ${stats.meanKcal} kcal. A stall at a genuine deficit is almost always one of three things: portions creeping up, unlogged extras, or metabolic adaptation after a long diet.`,
            "Tighten logging for one week — weigh everything, including oils and drinks. If the stall survives an honest week, drop 150–200 kcal or add ~2,000 steps a day.",
            { kgPerWeek: trend.kgPerWeek, meanKcal: stats.meanKcal, expectedKgPerWeek: round(expected, 2) },
          ),
        );
      } else if (pct < -1.2) {
        out.push(
          insight(
            "loss-too-fast",
            "critical",
            "You are losing weight too fast",
            `Trend weight is falling ${Math.abs(round(pct, 2))} % of bodyweight a week. Past about 1 %, an increasing share of what you lose is muscle rather than fat, and training performance usually falls off a cliff within a fortnight.`,
            `Raise intake by roughly ${Math.round((Math.abs(pct) - 0.8) / 100 * (trend.trendKg ?? 80) * KCAL_PER_KG_BODY_MASS / 7)} kcal a day and make sure you are hitting your protein target.`,
            { pctPerWeek: pct, kgPerWeek: trend.kgPerWeek },
          ),
        );
      } else if (pct <= -0.2) {
        out.push(
          insight(
            "loss-on-track",
            "success",
            "Fat loss is tracking nicely",
            `Down ${Math.abs(round(trend.kgPerWeek, 2))} kg a week (${Math.abs(round(pct, 2))} % of bodyweight) — squarely in the range where you keep muscle and keep training hard.`,
            "Change nothing. This is the pace you want.",
            { kgPerWeek: trend.kgPerWeek, pctPerWeek: pct },
          ),
        );
      }
    }

    if (goal === "gain") {
      if (pct > 0.75) {
        out.push(
          insight(
            "gain-too-fast",
            "warning",
            "You are gaining faster than you can build",
            `Trend weight is up ${round(pct, 2)} % of bodyweight a week. Muscle simply cannot be built that quickly past your first year of training — the surplus beyond about 0.5 %/week is going on as fat.`,
            "Pull the surplus back by 200–300 kcal a day. A slower gain means a shorter cut later.",
            { pctPerWeek: pct },
          ),
        );
      } else if (pct < 0.05) {
        out.push(
          insight(
            "gain-stalled",
            "warning",
            "Not gaining",
            `Trend weight has moved ${round(trend.kgPerWeek, 2)} kg a week over ${trend.spanDays} days while you averaged ${stats.meanKcal} kcal. You are eating at maintenance, not in a surplus.`,
            "Add 250 kcal a day and re-check in two weeks. Liquid calories are the easiest way to add them without killing your appetite.",
            { kgPerWeek: trend.kgPerWeek, meanKcal: stats.meanKcal },
          ),
        );
      }
    }
  }

  /* -------------------------------- Protein ------------------------------- */

  if (stats.proteinHitRate < 0.5 && stats.daysLogged >= 5) {
    const shortfall = Math.round(targets.protein - stats.meanProtein);
    out.push(
      insight(
        "protein-low",
        profile.goal === "lose" ? "critical" : "warning",
        "Protein is the gap",
        `You are averaging ${stats.meanProtein} g against a ${targets.protein} g target — about ${shortfall} g short, and you hit the target on only ${Math.round(stats.proteinHitRate * 100)} % of logged days.${profile.goal === "lose" ? " In a deficit this is the single thing most likely to cost you muscle." : ""}`,
        `Add roughly ${shortfall} g: that is one scoop of whey and a pot of Greek yogurt, or an extra 150 g of chicken. Front-load it at breakfast — that is where almost everyone's shortfall actually is.`,
        { meanProtein: stats.meanProtein, target: targets.protein, hitRate: stats.proteinHitRate },
      ),
    );
  } else if (stats.proteinHitRate >= 0.8 && stats.daysLogged >= 5) {
    out.push(
      insight(
        "protein-good",
        "success",
        "Protein is dialled in",
        `You hit your protein target on ${Math.round(stats.proteinHitRate * 100)} % of logged days. This is the habit that protects your training results in a deficit and drives them in a surplus.`,
        undefined,
        { hitRate: stats.proteinHitRate },
      ),
    );
  }

  /* --------------------------------- Fibre -------------------------------- */

  const fiberDays = lastNDays(14, asOf);
  const fiberTotals = entries
    .filter((e) => fiberDays.includes(e.date))
    .reduce((sum, e) => sum + (e.nutrients.fiber ?? 0), 0);
  const meanFiber = stats.daysLogged ? fiberTotals / stats.daysLogged : 0;
  if (stats.daysLogged >= 5 && meanFiber < targets.fiber * 0.6) {
    out.push(
      insight(
        "fiber-low",
        "info",
        "Fibre is running low",
        `About ${Math.round(meanFiber)} g a day against a ${targets.fiber} g target. Beyond the gut-health argument, fibre is the cheapest satiety you can buy — it is why a 300 kcal bowl of oats holds you and a 300 kcal pastry does not.`,
        "Add a portion of vegetables to two meals, and swap one refined carb for its wholegrain version.",
        { meanFiber: Math.round(meanFiber), target: targets.fiber },
      ),
    );
  }

  /* ----------------------------- Weekend swing ---------------------------- */

  if (stats.weekendSwing > 400 && stats.daysLogged >= 8) {
    const weeklyCost = Math.round((stats.weekendSwing * 2) / 7);
    out.push(
      insight(
        "weekend-swing",
        "warning",
        "Weekends are undoing the week",
        `You eat ${Math.round(stats.weekendSwing)} kcal more on weekend days than weekdays. Averaged over the week that is ${weeklyCost} kcal a day — often the entire deficit you built Monday to Friday.`,
        "Do not try to be perfect on Saturday. Either bank 100–150 kcal a day during the week to spend at the weekend, or pick one meal out rather than two whole days off.",
        { weekendSwing: Math.round(stats.weekendSwing), dailyCost: weeklyCost },
      ),
    );
  }

  /* ------------------------------ Diet break ------------------------------ */

  if (profile.goal === "lose" && metrics.length >= 2) {
    const first = metrics.reduce((a, b) => (a.date < b.date ? a : b));
    const weeksDieting = daysBetween(first.date, asOf) / 7;
    if (weeksDieting >= 12) {
      out.push(
        insight(
          "diet-break",
          "info",
          `${Math.round(weeksDieting)} weeks in a deficit`,
          "Long uninterrupted diets grind down adherence, training output and hormones roughly in that order. Planned breaks are not a loss of discipline; they are what makes the next block work.",
          "Take one to two weeks at maintenance calories. Weight will jump a kilo on glycogen and water — that is not fat, and it comes back off within days of resuming.",
          { weeksDieting: Math.round(weeksDieting) },
        ),
      );
    }
  }

  /* ---------------------------- Chronic undereating ----------------------- */

  if (stats.daysLogged >= 7 && stats.meanKcal < targets.kcal * 0.8) {
    out.push(
      insight(
        "undereating",
        "warning",
        "You are eating well under target",
        `Averaging ${stats.meanKcal} kcal against a ${targets.kcal} kcal target. Either meals are going unlogged, or you are dieting harder than the plan asks — and the plan already has the deficit built in.`,
        "Eat to the target. A deficit you can hold for months beats one you abandon in three weeks.",
        { meanKcal: stats.meanKcal, target: targets.kcal },
      ),
    );
  }

  return out.sort(bySeverity);
};

const SEVERITY_ORDER: Record<Insight["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
};

export const bySeverity = (a: Insight, b: Insight): number =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
