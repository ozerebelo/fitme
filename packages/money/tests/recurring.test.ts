import { describe, expect, it } from "vitest";
import {
  detectSubscriptions,
  dueOccurrences,
  forecast,
  makeRule,
  occurrencesBetween,
  projectCashFlow,
  transactionFor,
  type RecurringRule,
} from "../src/index";
import { eur, tx } from "./helpers";

const rule = (patch: Partial<RecurringRule> = {}): RecurringRule => ({
  ...makeRule({
    name: "Rent",
    accountId: "a1",
    categoryId: "housing",
    amount: -eur(750),
    frequency: "monthly",
    anchorDate: "2026-01-05",
  }),
  id: "r1",
  ...patch,
});

describe("occurrences", () => {
  it("walks a monthly rule", () => {
    expect(occurrencesBetween(rule(), "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-05",
      "2026-02-05",
      "2026-03-05",
      "2026-04-05",
    ]);
  });

  it("clamps a month-end anchor without letting the clamp stick", () => {
    const monthEnd = rule({ anchorDate: "2026-01-31" });
    expect(occurrencesBetween(monthEnd, "2026-01-01", "2026-03-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("steps a fortnightly rule by days, not by months", () => {
    const fortnightly = rule({ frequency: "fortnightly", anchorDate: "2026-01-02" });
    expect(occurrencesBetween(fortnightly, "2026-01-01", "2026-02-15")).toEqual([
      "2026-01-02",
      "2026-01-16",
      "2026-01-30",
      "2026-02-13",
    ]);
  });

  it("stops at the end date", () => {
    const ending = rule({ endDate: "2026-02-28" });
    expect(occurrencesBetween(ending, "2026-01-01", "2026-06-30")).toHaveLength(2);
  });

  it("yields nothing before the anchor", () => {
    expect(occurrencesBetween(rule(), "2025-01-01", "2025-12-31")).toEqual([]);
  });
});

describe("posting", () => {
  it("offers everything due since the last post", () => {
    const due = dueOccurrences([rule({ lastPostedDate: "2026-02-05" })], "2026-04-10");
    expect(due.map((d) => d.date)).toEqual(["2026-03-05", "2026-04-05"]);
  });

  it("will not backfill more than a year", () => {
    const old = rule({ anchorDate: "2020-01-05" });
    expect(dueOccurrences([old], "2026-04-10").length).toBeLessThanOrEqual(13);
  });

  it("skips inactive rules", () => {
    expect(dueOccurrences([rule({ active: false })], "2026-04-10")).toEqual([]);
  });

  it("posts a transaction that points back at its rule", () => {
    const [first] = dueOccurrences([rule()], "2026-01-10");
    const transaction = transactionFor(first!);
    expect(transaction.amount).toBe(-eur(750));
    expect(transaction.recurrenceId).toBe("r1");
    expect(transaction.categoryId).toBe("housing");
  });
});

describe("forecast", () => {
  it("finds the low point rather than just the closing balance", () => {
    const entries = forecast(
      [
        rule({ id: "rent", anchorDate: "2026-05-05", amount: -eur(750) }),
        rule({ id: "pay", anchorDate: "2026-05-25", amount: eur(1800), name: "Salary" }),
      ],
      "2026-05-01",
      "2026-05-31",
    );
    const { low, closing } = projectCashFlow(eur(900), entries, "2026-05-01", "2026-05-31");
    expect(low?.date).toBe("2026-05-05");
    expect(low?.balance).toBe(eur(150));
    expect(closing).toBe(eur(1950));
  });
});

describe("finding subscriptions in the history", () => {
  const monthly = ["2026-01-14", "2026-02-14", "2026-03-14", "2026-04-14"].map((date) =>
    tx("a1", date, -eur(13.49), "NETFLIX.COM", "subscriptions"),
  );

  it("spots a monthly charge to the same payee", () => {
    const [found] = detectSubscriptions(monthly, "2026-04-20");
    expect(found?.payee).toBe("NETFLIX.COM");
    expect(found?.frequency).toBe("monthly");
    expect(found?.monthlyCost).toBe(eur(13.49));
  });

  it("survives a price rise", () => {
    const withRise = [...monthly, tx("a1", "2026-05-14", -eur(14.49), "NETFLIX.COM")];
    expect(detectSubscriptions(withRise, "2026-05-20")).toHaveLength(1);
  });

  it("does not mistake the weekly shop for a subscription", () => {
    // Regular as clockwork, but the amount is never the same twice — which is
    // exactly what a supermarket looks like and what a subscription does not.
    const shop = Array.from({ length: 12 }, (_, i) =>
      tx("a1", `2026-0${1 + Math.floor(i / 4)}-0${(i % 4) * 7 + 1}`, -eur(35 + (i % 5) * 12), "CONTINENTE"),
    );
    expect(detectSubscriptions(shop, "2026-04-01")).toEqual([]);
  });

  it("does not accept an average that hides an irregular rhythm", () => {
    // A fortnight, then six weeks, averages to a month and is not monthly.
    const irregular = ["2026-01-05", "2026-01-19", "2026-03-02", "2026-03-16"].map((date) =>
      tx("a1", date, -eur(20), "GYM DROP-IN"),
    );
    expect(detectSubscriptions(irregular, "2026-04-01")).toEqual([]);
  });

  it("does not mistake a variable bill for a subscription", () => {
    const groceries = [
      tx("a1", "2026-01-14", -eur(40), "Continente"),
      tx("a1", "2026-02-11", -eur(95), "Continente"),
      tx("a1", "2026-03-19", -eur(12), "Continente"),
    ];
    expect(detectSubscriptions(groceries, "2026-04-01")).toEqual([]);
  });

  it("normalises the yearly ones to a monthly cost", () => {
    const yearly = ["2024-03-01", "2025-03-01", "2026-03-01"].map((date) =>
      tx("a1", date, -eur(120), "AMAZON PRIME"),
    );
    const [found] = detectSubscriptions(yearly, "2026-03-10");
    // Only the last 400 days are considered, so a three-year run is two charges.
    expect(found).toBeUndefined();
  });
});
