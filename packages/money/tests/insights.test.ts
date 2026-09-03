import { describe, expect, it } from "vitest";
import {
  buildMoneyReport,
  categoryIndex,
  makeRule,
  makeTransfer,
  spendingByCategory,
  topPayees,
  type MoneyContext,
} from "../src/index";
import { account, eur, ledger, settings, tx } from "./helpers";

const current = account({ id: "a1", openingBalance: eur(2000) });
const categories = categoryIndex();

const context = (patch: Partial<MoneyContext> = {}): MoneyContext => ({
  accounts: [current],
  transactions: [],
  categories,
  settings: settings(),
  budget: { startMonth: "2026-01", lines: [], overrides: {} },
  goals: [],
  recurring: [],
  balances: { transactions: patch.transactions ?? [] },
  liquid: eur(2000),
  netWorth: eur(2000),
  asOf: "2026-03-20",
  ...patch,
});

const findings = (ctx: MoneyContext): string[] =>
  buildMoneyReport(ctx).insights.map((insight) => insight.id);

describe("money report", () => {
  it("says nothing about an empty ledger", () => {
    const report = buildMoneyReport(context());
    expect(report.insights).toEqual([]);
    expect(report.headline).toContain("Nothing logged");
  });

  it("totals the month and works out what was kept", () => {
    const transactions = [
      tx("a1", "2026-03-01", eur(2000), "Salary", "salary"),
      tx("a1", "2026-03-05", -eur(750), "Renda", "housing"),
      tx("a1", "2026-03-08", -eur(250), "Continente", "groceries"),
    ];
    const report = buildMoneyReport(context({ transactions }));
    expect(report.month.income).toBe(eur(2000));
    expect(report.month.expenses).toBe(eur(1000));
    expect(report.month.savingsRate).toBeCloseTo(0.5, 5);
    expect(report.month.essentials).toBe(eur(1000));
  });

  it("does not count a transfer as either income or spending", () => {
    const [out, into] = makeTransfer({
      fromAccountId: "a1",
      toAccountId: "a2",
      amount: eur(500),
      date: "2026-03-10",
    });
    const report = buildMoneyReport(context({ transactions: [out, into] }));
    expect(report.month.income).toBe(0);
    expect(report.month.expenses).toBe(0);
  });

  it("warns when the committed payments will not clear", () => {
    const ctx = context({
      liquid: eur(400),
      recurring: [
        makeRule({
          name: "Renda",
          accountId: "a1",
          amount: -eur(750),
          frequency: "monthly",
          anchorDate: "2026-03-05",
        }),
      ],
    });
    const report = buildMoneyReport(ctx);
    const crunch = report.insights.find((insight) => insight.id === "cash-crunch");
    expect(crunch?.severity).toBe("critical");
    expect(crunch?.evidence?.["Lowest point"]).toBeDefined();
  });

  it("flags a category well above its own recent normal", () => {
    const usual = ["2025-12", "2026-01", "2026-02"].map((month) =>
      tx("a1", `${month}-10`, -eur(100), "Restaurante", "dining"),
    );
    const ctx = context({
      transactions: [...usual, tx("a1", "2026-03-10", -eur(400), "Restaurante", "dining")],
    });
    expect(findings(ctx)).toContain("spike-dining");
  });

  it("does not call the first week of a month a spike", () => {
    const usual = ["2025-12", "2026-01", "2026-02"].map((month) =>
      tx("a1", `${month}-10`, -eur(100), "Restaurante", "dining"),
    );
    const ctx = context({
      transactions: [...usual, tx("a1", "2026-03-02", -eur(400), "Restaurante", "dining")],
      asOf: "2026-03-03",
    });
    expect(findings(ctx)).not.toContain("spike-dining");
  });

  it("counts the standing payments it can find", () => {
    const netflix = ["2025-12-14", "2026-01-14", "2026-02-14", "2026-03-14"].map((date) =>
      tx("a1", date, -eur(13.49), "NETFLIX.COM", "subscriptions"),
    );
    const spotify = ["2025-12-20", "2026-01-20", "2026-02-20", "2026-03-20"].map((date) =>
      tx("a1", date, -eur(6.99), "SPOTIFY", "subscriptions"),
    );
    const report = buildMoneyReport(context({ transactions: [...netflix, ...spotify] }));
    expect(report.subscriptions).toHaveLength(2);
    expect(report.insights.some((insight) => insight.id === "subscriptions")).toBe(true);
  });

  it("nags about uncategorised spending, because everything else depends on it", () => {
    const transactions = Array.from({ length: 8 }, (_, i) =>
      tx("a1", `2026-03-0${i + 1}`, -eur(20), "Something", i < 6 ? null : "groceries"),
    );
    expect(findings(context({ transactions }))).toContain("uncategorised");
  });

  it("reports cover in months against committed spending", () => {
    const history = ["2025-12", "2026-01", "2026-02"].flatMap((month) => [
      tx("a1", `${month}-05`, -eur(750), "Renda", "housing"),
      tx("a1", `${month}-10`, -eur(250), "Continente", "groceries"),
    ]);
    const report = buildMoneyReport(context({ transactions: history, liquid: eur(1000) }));
    const finding = report.insights.find((insight) => insight.id === "runway-short");
    expect(report.monthlyEssentials).toBe(eur(1000));
    expect(finding?.severity).toBe("warning");
    expect(finding?.title).toContain("1.0 months");
  });

  it("puts the most urgent finding in the headline", () => {
    const ctx = context({
      liquid: eur(100),
      recurring: [
        makeRule({
          name: "Renda",
          accountId: "a1",
          amount: -eur(750),
          frequency: "monthly",
          anchorDate: "2026-03-05",
        }),
      ],
    });
    expect(buildMoneyReport(ctx).headline).toContain("Short by");
  });
});

describe("breakdowns", () => {
  const transactions = [
    tx("a1", "2026-03-01", -eur(50), "CONTINENTE 4515", "groceries"),
    tx("a1", "2026-03-02", -eur(30), "Continente Online", "groceries"),
    tx("a1", "2026-03-03", eur(10), "Continente refund", "groceries"),
    tx("a1", "2026-03-04", -eur(40), "Restaurante", "dining"),
  ];
  const ctx = ledger([current]);

  it("nets refunds off the category rather than calling them income", () => {
    const [top] = spendingByCategory(transactions, ctx);
    expect(top?.categoryId).toBe("groceries");
    expect(top?.total).toBe(eur(70));
  });

  it("groups a payee written in different cases, and leaves distinct ones apart", () => {
    const mixedCase = [
      tx("a1", "2026-03-01", -eur(50), "CONTINENTE 4515", "groceries"),
      tx("a1", "2026-03-05", -eur(20), "continente 4515", "groceries"),
      tx("a1", "2026-03-06", -eur(30), "Continente Online", "groceries"),
    ];
    const rows = topPayees(mixedCase, ctx);
    expect(rows[0]).toMatchObject({ payee: "CONTINENTE 4515", total: eur(70), count: 2 });
    expect(rows[1]?.payee).toBe("Continente Online");
  });
});
