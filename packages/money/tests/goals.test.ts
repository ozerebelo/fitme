import { describe, expect, it } from "vitest";
import { goalStatus, makeGoal, projectBalance, runway, type Goal } from "../src/index";
import { eur } from "./helpers";

const goal = (patch: Partial<Goal> = {}): Goal => ({
  ...makeGoal({ name: "Emergency fund", target: eur(6000), currency: "EUR" }),
  ...patch,
});

describe("goal status", () => {
  it("mirrors the linked account rather than a number kept by hand", () => {
    const status = goalStatus(goal({ accountId: "savings" }), eur(2400), "2026-03-01");
    expect(status.saved).toBe(eur(2400));
    expect(status.remaining).toBe(eur(3600));
    expect(status.progress).toBeCloseTo(0.4, 5);
  });

  it("says what it would take to hit the date", () => {
    const status = goalStatus(
      goal({ accountId: "savings", targetDate: "2026-09-01" }),
      eur(3000),
      "2026-03-01",
    );
    expect(status.monthsToTarget).toBe(6);
    expect(status.requiredMonthly).toBe(eur(500));
  });

  it("projects the date the current plan actually lands on", () => {
    const status = goalStatus(
      goal({
        accountId: "savings",
        targetDate: "2026-06-01",
        monthlyContribution: eur(300),
      }),
      eur(3000),
      "2026-03-01",
    );
    // €3,000 to go at €300 a month is ten months, well past June.
    expect(status.projectedDate).toBe("2027-01-01");
    expect(status.onTrack).toBe(false);
  });

  it("falls back to the rate actually observed", () => {
    const saving = goal({
      contributions: [
        { id: "1", date: "2026-01-10", amount: eur(200) },
        { id: "2", date: "2026-02-10", amount: eur(200) },
        { id: "3", date: "2026-03-10", amount: eur(200) },
      ],
    });
    const status = goalStatus(saving, undefined, "2026-03-15");
    expect(status.saved).toBe(eur(600));
    expect(status.assumedMonthly).toBe(eur(200));
    expect(status.rateSource).toBe("observed");
  });

  it("knows when it is done", () => {
    const status = goalStatus(goal({ accountId: "s" }), eur(6200), "2026-03-01");
    expect(status.complete).toBe(true);
    expect(status.remaining).toBe(0);
  });
});

describe("runway", () => {
  it("measures cover against committed spending only", () => {
    const result = runway(eur(9000), eur(1500), 6);
    expect(result.months).toBe(6);
    expect(result.covered).toBe(true);
    expect(result.shortfall).toBe(0);
  });

  it("says what is still missing", () => {
    const result = runway(eur(3000), eur(1500), 6);
    expect(result.months).toBe(2);
    expect(result.shortfall).toBe(eur(6000));
  });
});

describe("projection", () => {
  it("compounds monthly and separates growth from contributions", () => {
    const series = projectBalance(eur(10_000), eur(200), 6, 12);
    const final = series[series.length - 1]!;
    expect(final.contributed).toBe(eur(12_400));
    expect(final.value).toBeGreaterThan(final.contributed);
    // A year of 6% on €10k, plus part-year growth on the contributions.
    expect(final.growth).toBeGreaterThan(eur(600));
    expect(final.growth).toBeLessThan(eur(750));
  });

  it("is flat with no return assumed", () => {
    const series = projectBalance(eur(1000), eur(100), 0, 3);
    expect(series[2]!.value).toBe(eur(1300));
    expect(series[2]!.growth).toBe(0);
  });
});
