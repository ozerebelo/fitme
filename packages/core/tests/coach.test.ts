import { describe, expect, it } from "vitest";
import type { CoachContext, Insight } from "../src/index";
import {
  adherence,
  analyseNutrition,
  analyseTraining,
  buildCoachBriefing,
  buildCoachReport,
  ema,
  generateProgram,
  linearSlope,
  planNextSession,
  resolveTargets,
  weightTrend,
} from "../src/index";
import { daysEnding, makeEntry, makeMetric, makeProfile, makeSession, makeSet } from "./helpers";

const days = daysEnding(30);
const today = days[days.length - 1]!;

const context = (overrides: Partial<CoachContext> = {}): CoachContext => {
  const profile = overrides.profile ?? makeProfile();
  const metrics = overrides.metrics ?? [];
  const entries = overrides.entries ?? [];
  return {
    profile,
    currentWeightKg: 80,
    targets: resolveTargets({ profile, metrics, entries, asOf: today }),
    metrics,
    entries,
    sessions: [],
    asOf: today,
    ...overrides,
  };
};

const has = (insights: Insight[], id: string): boolean => insights.some((i) => i.id === id);

describe("analytics", () => {
  it("smooths a noisy weight series", () => {
    const noisy = [80, 82, 79, 81, 78, 80, 79];
    const smoothed = ema(noisy);
    expect(Math.max(...smoothed) - Math.min(...smoothed)).toBeLessThan(
      Math.max(...noisy) - Math.min(...noisy),
    );
  });

  it("measures the slope of a trend", () => {
    expect(linearSlope([1, 2, 3, 4])).toBeCloseTo(1, 5);
    expect(linearSlope([4, 3, 2, 1])).toBeCloseTo(-1, 5);
    expect(linearSlope([5, 5, 5])).toBe(0);
  });

  it("reports weekly rate of change from the trend line", () => {
    const metrics = days.map((d, i) => makeMetric(d, 80 - i * 0.05));
    const trend = weightTrend(metrics, { asOf: today });
    expect(trend.kgPerWeek).toBeLessThan(0);
    expect(trend.trendKg).not.toBeNull();
    expect(trend.points).toHaveLength(30);
  });

  it("separates weekday from weekend intake", () => {
    const entries = days.map((d) => makeEntry(d, [6, 0].includes(new Date(d).getDay()) ? 3000 : 2000));
    const stats = adherence(entries, { kcal: 2000, protein: 150 }, { asOf: today, windowDays: 14 });
    expect(stats.weekendSwing).toBeGreaterThan(500);
    expect(stats.currentStreak).toBeGreaterThan(0);
  });
});

describe("the nutritionist", () => {
  it("says so when there is nothing to analyse", () => {
    const insights = analyseNutrition(context());
    expect(insights).toHaveLength(1);
    expect(insights[0]!.id).toBe("no-data");
  });

  it("flags patchy logging", () => {
    const entries = days.slice(-4).map((d) => makeEntry(d, 2000));
    expect(has(analyseNutrition(context({ entries })), "logging-gaps")).toBe(true);
  });

  it("calls out a stall in a deficit", () => {
    const entries = days.map((d) => makeEntry(d, 1800));
    const metrics = days.map((d) => makeMetric(d, 80));
    const insights = analyseNutrition(context({ entries, metrics }));
    expect(has(insights, "loss-stalled")).toBe(true);
  });

  it("warns when weight is coming off too fast", () => {
    const entries = days.map((d) => makeEntry(d, 1400));
    const metrics = days.map((d, i) => makeMetric(d, 80 - i * 0.2));
    const insights = analyseNutrition(context({ entries, metrics }));
    const critical = insights.find((i) => i.id === "loss-too-fast");
    expect(critical?.severity).toBe("critical");
  });

  it("recognises a healthy rate of loss", () => {
    const entries = days.map((d) => makeEntry(d, 2000));
    const metrics = days.map((d, i) => makeMetric(d, 80 - i * 0.06));
    expect(has(analyseNutrition(context({ entries, metrics })), "loss-on-track")).toBe(true);
  });

  it("reports when targets have been calibrated to measured maintenance", () => {
    // Eats 2000 while barely losing: real maintenance is well under the estimate.
    const entries = days.map((d) => makeEntry(d, 2000));
    const metrics = days.map((d, i) => makeMetric(d, 80 - i * 0.005));
    const ctx = context({ entries, metrics });
    expect(ctx.targets.breakdown.adaptive).toBe(true);
    const calibrated = analyseNutrition(ctx).find((i) => i.id === "tdee-calibrated");
    expect(calibrated).toBeDefined();
    expect(calibrated!.detail).toMatch(/textbook estimate/);
  });

  it("recommends a new target when the formula is still in charge", () => {
    const entries = days.map((d) => makeEntry(d, 2000));
    const metrics = days.map((d, i) => makeMetric(d, 80 - i * 0.005));
    const profile = makeProfile();
    // Targets built without adaptation, as they are before the confidence bar is met.
    const targets = resolveTargets({ profile, metrics, entries, asOf: today, useAdaptive: false });
    const insights = analyseNutrition({ ...context({ profile, entries, metrics }), targets });
    const adaptive = insights.find((i) => i.id === "adaptive-tdee");
    expect(adaptive).toBeDefined();
    expect(adaptive!.action).toMatch(/Move your daily target/);
  });

  it("chases protein when it is short", () => {
    const entries = days.map((d) =>
      makeEntry(d, 2000, { nutrients: { kcal: 2000, protein: 40, carbs: 250, fat: 70, fiber: 25 } }),
    );
    const insights = analyseNutrition(context({ entries }));
    expect(has(insights, "protein-low")).toBe(true);
  });

  it("names the weekend as the problem when it is", () => {
    const entries = days.map((d) => makeEntry(d, [6, 0].includes(new Date(d).getDay()) ? 3500 : 1800));
    expect(has(analyseNutrition(context({ entries })), "weekend-swing")).toBe(true);
  });

  it("suggests a diet break after a long deficit", () => {
    const long = daysEnding(120);
    const entries = long.slice(-30).map((d) => makeEntry(d, 1800));
    const metrics = long.filter((_, i) => i % 3 === 0).map((d, i) => makeMetric(d, 90 - i * 0.2));
    const insights = analyseNutrition({
      ...context({ entries, metrics }),
      asOf: long[long.length - 1]!,
    });
    expect(has(insights, "diet-break")).toBe(true);
  });
});

describe("the trainer", () => {
  it("says so when nothing has been logged", () => {
    const insights = analyseTraining(context());
    expect(insights[0]!.id).toBe("no-training-data");
  });

  it("notices a week with no sessions", () => {
    const sessions = [makeSession(days[0]!, [makeSet("back-squat", 100, 5)])];
    expect(has(analyseTraining(context({ sessions })), "no-sessions-week")).toBe(true);
  });

  it("flags muscles below their minimum effective volume", () => {
    // Four weeks of nothing but bench press.
    const sessions = days
      .filter((_, i) => i % 3 === 0)
      .map((d) => makeSession(d, [makeSet("bench-press-barbell", 80, 8)]));
    const insights = analyseTraining(context({ sessions }));
    const under = insights.find((i) => i.id === "volume-under");
    expect(under).toBeDefined();
    expect(under!.detail).toMatch(/quads|back|hamstrings/);
  });

  it("spots a stalled lift", () => {
    const sessions = days
      .filter((_, i) => i % 4 === 0)
      .map((d) => makeSession(d, [makeSet("bench-press-barbell", 100, 5, { rpe: 9 })]));
    expect(has(analyseTraining(context({ sessions })), "lifts-stalled")).toBe(true);
  });

  it("celebrates a lift that is moving", () => {
    const sessions = days
      .filter((_, i) => i % 4 === 0)
      .map((d, i) => makeSession(d, [makeSet("bench-press-barbell", 90 + i * 5, 5, { rpe: 8 })]));
    const insights = analyseTraining(context({ sessions }));
    expect(has(insights, "lifts-progressing")).toBe(true);
    expect(has(insights, "recent-prs")).toBe(true);
  });

  it("flags a push-heavy programme", () => {
    const sessions = days
      .filter((_, i) => i % 2 === 0)
      .map((d) =>
        makeSession(d, [
          makeSet("bench-press-barbell", 80, 8),
          makeSet("bench-press-barbell", 80, 8),
          makeSet("overhead-press-dumbbell", 20, 10),
          makeSet("triceps-pushdown", 30, 12),
        ]),
      );
    expect(has(analyseTraining(context({ sessions })), "push-pull-imbalance")).toBe(true);
  });
});

describe("session planning", () => {
  it("turns the next program day into concrete numbers", () => {
    const profile = makeProfile();
    const program = generateProgram(profile);
    const firstExercise = program.days[0]!.blocks[0]!.exerciseId;
    // Comfortably clearing the top of the prescribed rep range on every set.
    const sessions = [
      makeSession(
        days[10]!,
        Array.from({ length: 5 }, () => makeSet(firstExercise, 80, 15, { rpe: 6 })),
      ),
    ];

    const planned = planNextSession(program, sessions, profile)!;
    expect(planned.day.id).toBe(program.days[0]!.id);
    expect(planned.blocks[0]!.suggestedWeightKg).toBeGreaterThan(80);
    expect(planned.blocks[0]!.reason).toBeTruthy();
    expect(planned.blocks[0]!.lastTime?.weightKg).toBe(80);
    expect(planned.estimatedMinutes).toBeGreaterThan(0);
  });

  it("leaves the weight open for a lift with no history", () => {
    const profile = makeProfile();
    const program = generateProgram(profile);
    const planned = planNextSession(program, [], profile)!;
    expect(planned.blocks[0]!.suggestedWeightKg).toBeNull();
  });
});

describe("the full report", () => {
  it("composes both domains and picks a headline", () => {
    const entries = days.map((d) => makeEntry(d, 2000));
    const metrics = days.map((d, i) => makeMetric(d, 80 - i * 0.06));
    const profile = makeProfile();
    const program = generateProgram(profile);
    const ctx = context({ profile, entries, metrics, program });

    const report = buildCoachReport(ctx);
    expect(report.insights.length).toBeGreaterThan(0);
    expect(report.headline).toBeTruthy();
    expect(report.plannedSession).not.toBeNull();
    // Critical and warning findings sort above the good news.
    const severities = report.insights.map((i) => i.severity);
    expect(severities.indexOf("success")).toBeGreaterThanOrEqual(
      severities.lastIndexOf("warning"),
    );
  });

  it("produces a briefing containing the real numbers", () => {
    const entries = days.map((d) => makeEntry(d, 2000));
    const metrics = days.map((d, i) => makeMetric(d, 80 - i * 0.06));
    const ctx = context({ entries, metrics });
    const briefing = buildCoachBriefing(buildCoachReport(ctx), ctx);
    expect(briefing).toMatch(/Targets:/);
    expect(briefing).toMatch(/Trend weight/);
    expect(briefing).toMatch(/kcal/);
  });
});
