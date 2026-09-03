import { describe, expect, it } from "vitest";
import {
  buildPortfolio,
  makeHolding,
  makeTrade,
  markAt,
  portfolioSeries,
  positionAt,
  xirr,
  type Holding,
  type Trade,
} from "../src/index";
import { eur, settings } from "./helpers";

const holding = (patch: Partial<Holding> = {}): Holding => ({
  ...makeHolding({
    accountId: "broker",
    symbol: "VWCE",
    name: "Vanguard FTSE All-World",
    kind: "etf",
    currency: "EUR",
  }),
  id: "h1",
  ...patch,
});

const trade = (patch: Partial<Trade> & { kind: Trade["kind"] }): Trade => ({
  ...makeTrade({ holdingId: "h1", ...patch }),
  ...patch,
  createdAt: `${patch.date ?? "2026-01-01"}T10:00:00.000Z`,
});

describe("FIFO positions", () => {
  const trades: Trade[] = [
    trade({ kind: "buy", date: "2025-01-10", quantity: 10, price: 100, fee: eur(5) }),
    trade({ kind: "buy", date: "2025-06-10", quantity: 10, price: 120, fee: eur(5) }),
  ];

  it("holds the units and their cost", () => {
    const position = positionAt("h1", trades, "EUR", "2026-01-01");
    expect(position.quantity).toBe(20);
    // €1,000 + €1,200 plus €10 of commission.
    expect(position.costBasis).toBe(eur(2210));
  });

  it("sells the oldest lot first", () => {
    const withSale = [
      ...trades,
      trade({ kind: "sell", date: "2025-09-01", quantity: 10, price: 150, fee: eur(5) }),
    ];
    const position = positionAt("h1", withSale, "EUR", "2026-01-01");
    expect(position.quantity).toBe(10);
    // Proceeds €1,500 − €5 fee, against the €1,005 first lot.
    expect(position.realised).toBe(eur(490));
    // What is left is the second lot, at its own cost.
    expect(position.costBasis).toBe(eur(1205));
  });

  it("splits units without inventing a loss", () => {
    const withSplit = [
      trade({ kind: "buy", date: "2025-01-10", quantity: 10, price: 100, fee: 0 }),
      trade({ kind: "split", date: "2025-07-01", quantity: 2, price: 0, fee: 0 }),
    ];
    const position = positionAt("h1", withSplit, "EUR", "2026-01-01");
    expect(position.quantity).toBe(20);
    expect(position.costBasis).toBe(eur(1000));
  });

  it("counts a platform fee as a loss even with nothing sold", () => {
    const withFee = [
      trade({ kind: "buy", date: "2025-01-10", quantity: 1, price: 100, fee: 0 }),
      trade({ kind: "fee", date: "2025-12-31", quantity: 0, price: 0, fee: eur(12) }),
    ];
    expect(positionAt("h1", withFee, "EUR", "2026-01-01").realised).toBe(-eur(12));
  });

  it("ignores trades after the as-of date", () => {
    expect(positionAt("h1", trades, "EUR", "2025-03-01").quantity).toBe(10);
  });
});

describe("marks", () => {
  it("prefers a price you entered", () => {
    const h = holding({ prices: [{ date: "2026-01-31", price: 132.4 }] });
    const mark = markAt(h, [], "2026-02-15");
    expect(mark).toEqual({ price: 132.4, date: "2026-01-31", source: "mark" });
  });

  it("falls back to the last traded price, and says so", () => {
    const mark = markAt(holding(), [
      trade({ kind: "buy", date: "2025-06-10", quantity: 1, price: 120 }),
    ], "2026-02-15");
    expect(mark.source).toBe("trade");
    expect(mark.price).toBe(120);
  });

  it("does not use a mark from the future", () => {
    const h = holding({
      prices: [
        { date: "2026-01-31", price: 130 },
        { date: "2026-03-31", price: 150 },
      ],
    });
    expect(markAt(h, [], "2026-02-15").price).toBe(130);
  });
});

describe("portfolio", () => {
  const h = holding({ prices: [{ date: "2026-02-01", price: 130 }] });
  const trades = [
    trade({ kind: "buy", date: "2025-01-10", quantity: 10, price: 100, fee: eur(5) }),
    trade({ kind: "dividend", date: "2025-12-20", quantity: 20, price: 1, fee: 0 }),
  ];

  it("values the position and separates the parts of the return", () => {
    const portfolio = buildPortfolio([h], trades, settings(), "2026-02-15");
    expect(portfolio.value).toBe(eur(1300));
    expect(portfolio.cost).toBe(eur(1005));
    expect(portfolio.unrealised).toBe(eur(295));
    expect(portfolio.dividends).toBe(eur(20));
    expect(portfolio.totalReturn).toBe(eur(315));
  });

  it("annualises what the timing of the money actually earned", () => {
    const portfolio = buildPortfolio([h], trades, settings(), "2026-02-15");
    // ~€1,005 in for ~13 months, worth €1,300 plus €20 of dividends.
    expect(portfolio.annualisedReturn).not.toBeNull();
    expect(portfolio.annualisedReturn!).toBeGreaterThan(0.2);
    expect(portfolio.annualisedReturn!).toBeLessThan(0.35);
  });

  it("tracks value against money-in month by month", () => {
    const series = portfolioSeries([h], trades, settings(), "2025-01", "2026-02");
    expect(series[0]!.invested).toBe(eur(1005));
    expect(series[0]!.value).toBe(eur(1000));
    expect(series[series.length - 1]!.value).toBe(eur(1300));
  });
});

describe("xirr", () => {
  it("returns the rate that makes a simple doubling add up", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
    expect(rate).toBeCloseTo(0.1, 2);
  });

  it("is undefined when nothing ever came back", () => {
    expect(
      xirr([
        { date: "2025-01-01", amount: -1000 },
        { date: "2026-01-01", amount: -500 },
      ]),
    ).toBeNull();
    expect(xirr([{ date: "2025-01-01", amount: -1000 }])).toBeNull();
  });

  it("handles a loss", () => {
    const rate = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 700 },
    ]);
    expect(rate).toBeCloseTo(-0.3, 2);
  });
});
