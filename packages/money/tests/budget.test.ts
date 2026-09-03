import { describe, expect, it } from "vitest";
import { budgetReport, suggestBudget, type BudgetPlan } from "../src/index";
import { account, eur, ledger, tx } from "./helpers";

const a = account({ id: "a1" });
const ctx = ledger([a]);

const plan: BudgetPlan = {
  startMonth: "2026-01",
  lines: [
    { categoryId: "groceries", limit: eur(400), rollover: false },
    { categoryId: "clothing", limit: eur(100), rollover: true },
  ],
  overrides: { "2026-03": { groceries: eur(500) } },
};

describe("budget report", () => {
  it("compares spending against the pace of the month", () => {
    const report = budgetReport(
      plan,
      [tx("a1", "2026-04-01", -eur(300), "Continente", "groceries")],
      ctx,
      "2026-04",
      "2026-04-10",
    );
    const groceries = report.lines.find((line) => line.categoryId === "groceries")!;
    expect(groceries.spent).toBe(eur(300));
    expect(groceries.remaining).toBe(eur(100));
    // A third of the way in with three quarters spent is over pace, and the
    // projection says where that finishes.
    expect(groceries.pace).toBe("over");
    expect(groceries.projected).toBe(eur(900));
  });

  it("uses the month's override when there is one", () => {
    const report = budgetReport(plan, [], ctx, "2026-03", "2026-03-15");
    expect(report.lines.find((line) => line.categoryId === "groceries")?.limit).toBe(eur(500));
  });

  it("carries an unspent rollover envelope forward", () => {
    const spent = [
      tx("a1", "2026-01-15", -eur(20), "Zara", "clothing"),
      tx("a1", "2026-02-15", -eur(30), "Zara", "clothing"),
    ];
    const report = budgetReport(plan, spent, ctx, "2026-03", "2026-03-10");
    const clothing = report.lines.find((line) => line.categoryId === "clothing")!;
    // 100 − 20 in January, then (100 + 80) − 30 in February.
    expect(clothing.carry).toBe(eur(150));
    expect(clothing.available).toBe(eur(250));
  });

  it("carries an overspend forward too", () => {
    const spent = [tx("a1", "2026-01-15", -eur(250), "Zara", "clothing")];
    const report = budgetReport(plan, spent, ctx, "2026-02", "2026-02-10");
    expect(report.lines.find((line) => line.categoryId === "clothing")?.carry).toBe(-eur(150));
  });

  it("does not carry anything into a non-rollover category", () => {
    const report = budgetReport(plan, [], ctx, "2026-06", "2026-06-10");
    expect(report.lines.find((line) => line.categoryId === "groceries")?.carry).toBe(0);
  });

  it("nets a refund off the month rather than counting it as income", () => {
    const report = budgetReport(
      plan,
      [
        tx("a1", "2026-04-02", -eur(100), "Continente", "groceries"),
        tx("a1", "2026-04-03", eur(30), "Continente refund", "groceries"),
      ],
      ctx,
      "2026-04",
      "2026-04-20",
    );
    expect(report.lines.find((line) => line.categoryId === "groceries")?.spent).toBe(eur(70));
  });

  it("separates spending that is outside the budget from spending with no category", () => {
    const report = budgetReport(
      plan,
      [
        tx("a1", "2026-04-02", -eur(40), "Cinema", "entertainment"),
        tx("a1", "2026-04-03", -eur(15), "Unknown", null),
      ],
      ctx,
      "2026-04",
      "2026-04-20",
    );
    expect(report.unbudgeted).toBe(eur(55));
    expect(report.uncategorised).toBe(eur(15));
  });

  it("ignores transfers entirely", () => {
    const transfer = { ...tx("a1", "2026-04-02", -eur(500), "To savings", "savings"), transferId: "t1" };
    const report = budgetReport(plan, [transfer], ctx, "2026-04", "2026-04-20");
    expect(report.unbudgeted).toBe(0);
  });

  it("leaves a per-day allowance that empties with the envelope", () => {
    const report = budgetReport(
      plan,
      [tx("a1", "2026-04-01", -eur(400), "Continente", "groceries")],
      ctx,
      "2026-04",
      "2026-04-20",
    );
    const groceries = report.lines.find((line) => line.categoryId === "groceries")!;
    expect(groceries.pace).toBe("spent");
    expect(groceries.perDay).toBe(0);
  });
});

describe("suggested budget", () => {
  it("proposes the median month, rounded to something memorable", () => {
    const history = [
      tx("a1", "2026-01-05", -eur(310), "Continente", "groceries"),
      tx("a1", "2026-02-05", -eur(327), "Continente", "groceries"),
      // A month with a party in it should not drag the whole budget up.
      tx("a1", "2026-03-05", -eur(900), "Continente", "groceries"),
    ];
    const [suggestion] = suggestBudget(history, ctx, "2026-03", 3);
    expect(suggestion?.categoryId).toBe("groceries");
    expect(suggestion?.limit).toBe(eur(350));
    expect(suggestion?.months).toBe(3);
  });
});
