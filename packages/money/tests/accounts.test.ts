import { describe, expect, it } from "vitest";
import {
  accountBalance,
  liquidTotal,
  netWorth,
  netWorthSeries,
  utilisation,
} from "../src/index";
import { account, eur, settings, tx } from "./helpers";

const current = account({ id: "a1", name: "Current", openingBalance: eur(1000) });
const card = account({
  id: "a2",
  name: "Card",
  kind: "credit",
  balanceMode: "transactions",
  openingBalance: 0,
  creditLimit: eur(2000),
});
const flat = account({
  id: "a3",
  name: "Flat",
  kind: "asset",
  balanceMode: "manual",
  openingBalance: eur(200_000),
  valuations: [
    { date: "2026-01-01", value: eur(210_000) },
    { date: "2026-06-01", value: eur(215_000) },
  ],
});
const mortgage = account({
  id: "a4",
  name: "Mortgage",
  kind: "loan",
  balanceMode: "transactions",
  openingBalance: -eur(150_000),
});

const transactions = [
  tx("a1", "2026-01-10", -eur(50), "Continente"),
  tx("a1", "2026-02-05", eur(1800), "Salary"),
  tx("a2", "2026-02-06", -eur(400), "Worten"),
  tx("a4", "2026-02-08", eur(500), "Mortgage payment"),
];

const inputs = { transactions };

describe("balances", () => {
  it("adds transactions to the opening balance", () => {
    expect(accountBalance(current, inputs, "2026-02-28")).toBe(eur(2750));
  });

  it("stops at the as-of date", () => {
    expect(accountBalance(current, inputs, "2026-01-31")).toBe(eur(950));
  });

  it("takes the latest valuation for a manually valued account", () => {
    expect(accountBalance(flat, inputs, "2026-03-01")).toBe(eur(210_000));
    expect(accountBalance(flat, inputs, "2026-07-01")).toBe(eur(215_000));
    expect(accountBalance(flat, inputs, "2024-01-01")).toBe(eur(200_000));
  });

  it("counts a loan as what is still owed", () => {
    expect(accountBalance(mortgage, inputs, "2026-02-28")).toBe(-eur(149_500));
  });

  it("adds the securities to an investment account's cash", () => {
    const broker = account({
      id: "a5",
      kind: "investment",
      balanceMode: "holdings",
      openingBalance: 0,
    });
    const balance = accountBalance(
      broker,
      { transactions: [tx("a5", "2026-01-02", eur(100), "Cash in")], holdingsValueAt: () => eur(5000) },
      "2026-03-01",
    );
    expect(balance).toBe(eur(5100));
  });
});

describe("net worth", () => {
  const accounts = [current, card, flat, mortgage];

  it("splits on the sign of the balance, not the kind of account", () => {
    const worth = netWorth(accounts, inputs, settings(), "2026-02-28");
    expect(worth.assets).toBe(eur(2750) + eur(210_000));
    expect(worth.liabilities).toBe(-eur(400) - eur(149_500));
    expect(worth.total).toBe(worth.assets + worth.liabilities);
  });

  it("leaves out accounts marked as not yours", () => {
    const joint = account({ id: "a9", openingBalance: eur(9999), excludeFromNetWorth: true });
    const worth = netWorth([...accounts, joint], inputs, settings(), "2026-02-28");
    expect(worth.balances.some((b) => b.account.id === "a9")).toBe(false);
  });

  it("tracks month by month", () => {
    const series = netWorthSeries(accounts, inputs, settings(), "2026-01", "2026-02");
    expect(series).toHaveLength(2);
    expect(series[1]!.total).toBeGreaterThan(series[0]!.total);
  });

  it("counts only what can be spent as liquid", () => {
    expect(liquidTotal(accounts, inputs, settings(), "2026-02-28")).toBe(eur(2750));
  });
});

describe("credit cards", () => {
  it("reports utilisation against the limit", () => {
    expect(utilisation(card, -eur(400))).toBeCloseTo(0.2, 5);
    expect(utilisation(current, -eur(400))).toBeNull();
  });
});
