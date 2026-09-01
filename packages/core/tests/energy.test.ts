import { describe, expect, it } from "vitest";
import {
  ACTIVITY_MULTIPLIERS,
  bmrKatchMcArdle,
  bmrMifflinStJeor,
  buildEnergyPlan,
  calorieFloor,
  estimateAdaptiveTdee,
  kcalFromMet,
  leanBodyMass,
  resolveRate,
  restingEnergy,
} from "../src/index";
import { daysEnding, makeEntry, makeMetric, makeProfile } from "./helpers";

describe("resting energy", () => {
  it("matches the published Mifflin-St Jeor values", () => {
    // 80 kg, 180 cm, 30 y male: 800 + 1125 - 150 + 5
    expect(bmrMifflinStJeor("male", 80, 180, 30)).toBeCloseTo(1780, 5);
    // 65 kg, 165 cm, 30 y female: 650 + 1031.25 - 150 - 161
    expect(bmrMifflinStJeor("female", 65, 165, 30)).toBeCloseTo(1370.25, 5);
  });

  it("computes Katch-McArdle from lean mass", () => {
    expect(leanBodyMass(100, 20)).toBeCloseTo(80, 5);
    expect(bmrKatchMcArdle(80)).toBeCloseTo(370 + 21.6 * 80, 5);
  });

  it("prefers Katch-McArdle when body fat is known", () => {
    expect(restingEnergy({ sex: "male", weightKg: 80, heightCm: 180, ageYears: 30 }).formula)
      .toBe("mifflin_st_jeor");
    expect(
      restingEnergy({ sex: "male", weightKg: 80, heightCm: 180, ageYears: 30, bodyFatPct: 15 })
        .formula,
    ).toBe("katch_mcardle");
  });
});

describe("goal rates", () => {
  it("clamps to safe bounds and applies direction", () => {
    expect(resolveRate("lose", 3)).toBe(-1);
    expect(resolveRate("lose", 0.05)).toBe(-0.25);
    expect(resolveRate("gain", 2)).toBe(0.5);
    expect(resolveRate("maintain", 1)).toBe(0);
  });
});

describe("energy plan", () => {
  const profile = makeProfile();

  it("applies a deficit proportional to bodyweight", () => {
    const plan = buildEnergyPlan(profile, 80, { asOf: "2024-01-01" });
    expect(plan.tdee).toBeCloseTo(plan.bmr * ACTIVITY_MULTIPLIERS.moderate, 0);
    expect(plan.adjustment).toBeLessThan(0);
    expect(plan.target).toBeLessThan(plan.tdee);
    // 0.5 %/week of 80 kg = 0.4 kg = 3080 kcal/week ≈ 440/day
    expect(Math.abs(plan.adjustment)).toBeCloseTo(440, -1);
  });

  it("never cuts more than a quarter of maintenance", () => {
    const aggressive = makeProfile({ goal: "lose", rateOfChangePctPerWeek: 1 });
    const plan = buildEnergyPlan(aggressive, 150, { asOf: "2024-01-01" });
    expect(Math.abs(plan.adjustment)).toBeLessThanOrEqual(plan.tdee * 0.25 + 1);
  });

  it("respects the absolute calorie floor for small, aggressive dieters", () => {
    const small = makeProfile({
      sex: "female",
      heightCm: 155,
      activityLevel: "sedentary",
      goal: "lose",
      rateOfChangePctPerWeek: 1,
    });
    const plan = buildEnergyPlan(small, 50, { asOf: "2024-01-01" });
    expect(plan.target).toBeGreaterThanOrEqual(calorieFloor("female", plan.bmr) - 1);
    expect(plan.floorApplied).toBe(true);
  });

  it("uses an observed TDEE when one is supplied", () => {
    const plan = buildEnergyPlan(profile, 80, { tdeeOverride: 2200, asOf: "2024-01-01" });
    expect(plan.tdee).toBe(2200);
    expect(plan.adaptive).toBe(true);
  });

  it("honours a manual calorie override", () => {
    const overridden = makeProfile({ calorieTargetOverride: 1900 });
    expect(buildEnergyPlan(overridden, 80, { asOf: "2024-01-01" }).target).toBe(1900);
  });
});

describe("adaptive TDEE", () => {
  it("refuses to guess without enough logged days", () => {
    const days = daysEnding(28);
    const entries = days.slice(0, 5).map((d) => makeEntry(d, 2000));
    const metrics = [makeMetric(days[0]!, 80), makeMetric(days[27]!, 79)];
    const result = estimateAdaptiveTdee(entries, metrics, { asOf: days[27] });
    expect(result.tdee).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("ignores days with implausibly little food logged", () => {
    const days = daysEnding(28);
    const entries = days.map((d, i) => makeEntry(d, i % 2 === 0 ? 2000 : 200));
    const metrics = days.map((d, i) => makeMetric(d, 80 - i * (2 / 27)));
    const result = estimateAdaptiveTdee(entries, metrics, { asOf: days[27] });
    // Only the 14 plausible days count, and they all read 2000 kcal.
    expect(result.daysLogged).toBe(14);
    expect(result.meanIntake).toBe(2000);
  });

  it("recovers maintenance from intake and the weight trend", () => {
    const days = daysEnding(28);
    // 2000 kcal a day while losing 2 kg over 27 days.
    const entries = days.map((d) => makeEntry(d, 2000));
    const metrics = days.map((d, i) => makeMetric(d, 80 - (2 * i) / 27));
    const result = estimateAdaptiveTdee(entries, metrics, { asOf: days[27] });

    expect(result.daysLogged).toBe(28);
    expect(result.meanIntake).toBe(2000);
    expect(result.weightChangeKg).toBeLessThan(0);
    // True answer is 2000 + (2/27)*7700 ≈ 2570; EMA lag attenuates it slightly.
    expect(result.tdee).toBeGreaterThan(2350);
    expect(result.tdee).toBeLessThan(2600);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("rejects physiologically absurd results", () => {
    const days = daysEnding(28);
    // Claims 1200 kcal a day while gaining 5 kg — someone is not logging.
    const entries = days.map((d) => makeEntry(d, 1200));
    const metrics = days.map((d, i) => makeMetric(d, 80 + (5 * i) / 27));
    const result = estimateAdaptiveTdee(entries, metrics, { asOf: days[27] });
    expect(result.tdee).toBeNull();
  });
});

describe("exercise energy", () => {
  it("applies the MET equation", () => {
    // 10 MET, 80 kg, 30 min
    expect(kcalFromMet(10, 80, 30)).toBeCloseTo((10 * 3.5 * 80) / 200 * 30, 5);
  });
});
