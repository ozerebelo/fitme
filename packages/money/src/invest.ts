import type { DateKey } from "@fitme/core";
import { cryptoId, daysBetween, toDateKey } from "@fitme/core";
import type {
  Cents,
  Holding,
  HoldingKind,
  MoneySettings,
  MonthKey,
  Trade,
} from "./types";
import { convert, roundCents, sumCents, toCents } from "./money";
import { monthEnd, monthRange } from "./period";

/**
 * Portfolio valuation and returns.
 *
 * No price feed. Prices are marks you enter, because this app has to work with
 * no network and because a broker's number pasted in once a week is more honest
 * than a quote of unknown age presented as live. Everything downstream —
 * value, unrealised gain, the growth chart — carries the date of the mark it
 * used, so a stale portfolio looks stale rather than wrong.
 *
 * Cost basis is FIFO: first lot in is the first sold. That is the rule
 * Portuguese capital-gains reporting uses, and average cost would quietly give
 * a different realised gain on every partial sale.
 */

export const HOLDING_KIND_LABELS: Record<HoldingKind, string> = {
  etf: "ETF",
  stock: "Stock",
  fund: "Fund",
  bond: "Bond",
  crypto: "Crypto",
  commodity: "Commodity",
  other: "Other",
};

/** Quantities are floats; anything under this is nothing. */
const DUST = 1e-9;

export const makeHolding = (input: {
  accountId: string;
  symbol: string;
  name: string;
  kind: HoldingKind;
  currency: string;
}): Holding => ({
  id: cryptoId(),
  accountId: input.accountId,
  symbol: input.symbol.trim().toUpperCase(),
  name: input.name.trim(),
  kind: input.kind,
  currency: input.currency.toUpperCase(),
  prices: [],
  createdAt: new Date().toISOString(),
});

export const makeTrade = (input: {
  holdingId: string;
  date?: DateKey;
  kind: Trade["kind"];
  quantity?: number;
  price?: number;
  fee?: Cents;
  /** Override the derived cash movement — a foreign-currency fill, say. */
  cash?: Cents;
  currency?: string;
  note?: string;
}): Trade => {
  const quantity = input.quantity ?? 0;
  const price = input.price ?? 0;
  const fee = Math.abs(input.fee ?? 0);
  const currency = input.currency ?? "EUR";
  const gross = toCents(quantity * price, currency);

  const cash =
    input.cash ??
    (input.kind === "buy"
      ? -(gross + fee)
      : input.kind === "sell"
        ? gross - fee
        : input.kind === "fee"
          ? -fee
          : input.kind === "dividend"
            ? gross - fee
            : 0);

  return {
    id: cryptoId(),
    holdingId: input.holdingId,
    date: input.date ?? toDateKey(),
    kind: input.kind,
    quantity,
    price,
    fee,
    cash,
    note: input.note,
    createdAt: new Date().toISOString(),
  };
};

/* -------------------------------------------------------------------------- */
/*                                   Prices                                   */
/* -------------------------------------------------------------------------- */

export interface Mark {
  price: number;
  date: DateKey | null;
  source: "mark" | "trade" | "none";
}

/**
 * The price to value a holding at on a date.
 *
 * A mark you entered wins; failing that, the last price you actually traded at,
 * which is a real number even if it is old. `source` and `date` travel with it
 * so the UI can say which — a position last marked in March should not look
 * like a live quote.
 */
export const markAt = (
  holding: Holding,
  trades: Trade[],
  asOf: DateKey = toDateKey(),
): Mark => {
  let best: { price: number; date: DateKey } | null = null;
  for (const point of holding.prices) {
    if (point.date <= asOf && (!best || point.date >= best.date)) {
      best = { price: point.price, date: point.date };
    }
  }
  if (best) return { price: best.price, date: best.date, source: "mark" };

  let lastTrade: Trade | null = null;
  for (const trade of trades) {
    if (trade.holdingId !== holding.id) continue;
    if (trade.date > asOf || trade.price <= 0) continue;
    if (!lastTrade || trade.date >= lastTrade.date) lastTrade = trade;
  }
  if (lastTrade) return { price: lastTrade.price, date: lastTrade.date, source: "trade" };

  return { price: 0, date: null, source: "none" };
};

/* -------------------------------------------------------------------------- */
/*                                  Position                                  */
/* -------------------------------------------------------------------------- */

interface Lot {
  quantity: number;
  /** Per unit, in minor units of the holding's currency, including fees. */
  unitCost: number;
  date: DateKey;
}

export interface Position {
  quantity: number;
  /** What the units still held cost, fees included. */
  costBasis: Cents;
  /** Gains and losses crystallised by sales, net of the fees on them. */
  realised: Cents;
  dividends: Cents;
  fees: Cents;
  /** Cash put in less cash taken out. Negative means you are ahead on cash. */
  netInvested: Cents;
  lots: Lot[];
}

/**
 * Walk the trades in date order and apply them to a FIFO lot book.
 *
 * Splits are the subtle one: they change the number of units and the cost per
 * unit, and must leave the total cost alone. Getting that wrong turns a
 * two-for-one into a 100% paper loss.
 */
export const positionAt = (
  holdingId: string,
  trades: Trade[],
  currency: string,
  asOf: DateKey = toDateKey(),
): Position => {
  const relevant = trades
    .filter((trade) => trade.holdingId === holdingId && trade.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const lots: Lot[] = [];
  let realised = 0;
  let dividends = 0;
  let fees = 0;
  let netInvested = 0;

  for (const trade of relevant) {
    fees += trade.fee;
    netInvested -= trade.cash;

    switch (trade.kind) {
      case "buy": {
        if (trade.quantity <= DUST) break;
        const cost = toCents(trade.quantity * trade.price, currency) + trade.fee;
        lots.push({
          quantity: trade.quantity,
          unitCost: cost / trade.quantity,
          date: trade.date,
        });
        break;
      }
      case "sell": {
        let remaining = trade.quantity;
        let cost = 0;
        while (remaining > DUST && lots.length > 0) {
          const lot = lots[0]!;
          const taken = Math.min(lot.quantity, remaining);
          cost += taken * lot.unitCost;
          lot.quantity -= taken;
          remaining -= taken;
          if (lot.quantity <= DUST) lots.shift();
        }
        const proceeds = toCents(trade.quantity * trade.price, currency) - trade.fee;
        realised += proceeds - roundCents(cost);
        break;
      }
      case "dividend": {
        dividends += trade.cash;
        break;
      }
      case "fee": {
        // A custody or platform fee is a real loss even though nothing was sold.
        realised += trade.cash;
        break;
      }
      case "split": {
        const ratio = trade.quantity;
        if (ratio > 0) {
          for (const lot of lots) {
            lot.quantity *= ratio;
            lot.unitCost /= ratio;
          }
        }
        break;
      }
    }
  }

  const quantity = lots.reduce((total, lot) => total + lot.quantity, 0);
  const costBasis = roundCents(
    lots.reduce((total, lot) => total + lot.quantity * lot.unitCost, 0),
  );

  return {
    quantity: quantity < DUST ? 0 : quantity,
    costBasis,
    realised,
    dividends,
    fees,
    netInvested,
    lots,
  };
};

/* -------------------------------------------------------------------------- */
/*                                 Valuation                                  */
/* -------------------------------------------------------------------------- */

export interface HoldingValuation {
  holding: Holding;
  position: Position;
  mark: Mark;
  /** In the holding's currency. */
  value: Cents;
  /** In the base currency — the only figure that may be added to another. */
  baseValue: Cents;
  baseCost: Cents;
  unrealised: Cents;
  /** Unrealised plus realised plus dividends, in base currency. */
  totalReturn: Cents;
  /** Total return over what was put in. Null when nothing was. */
  returnPct: number | null;
  /** Share of the portfolio, 0–1. */
  weight: number;
}

export const valueHolding = (
  holding: Holding,
  trades: Trade[],
  settings: MoneySettings,
  asOf: DateKey = toDateKey(),
): HoldingValuation => {
  const position = positionAt(holding.id, trades, holding.currency, asOf);
  const mark = markAt(holding, trades, asOf);
  const value = toCents(position.quantity * mark.price, holding.currency);
  const unrealised = value - position.costBasis;
  const totalReturn = unrealised + position.realised + position.dividends;
  const invested = position.costBasis + Math.max(0, position.netInvested);

  return {
    holding,
    position,
    mark,
    value,
    baseValue: convert(value, holding.currency, settings),
    baseCost: convert(position.costBasis, holding.currency, settings),
    unrealised: convert(unrealised, holding.currency, settings),
    totalReturn: convert(totalReturn, holding.currency, settings),
    returnPct: invested > 0 ? totalReturn / invested : null,
    weight: 0,
  };
};

export interface Portfolio {
  holdings: HoldingValuation[];
  /** Base currency throughout. */
  value: Cents;
  cost: Cents;
  unrealised: Cents;
  realised: Cents;
  dividends: Cents;
  fees: Cents;
  invested: Cents;
  totalReturn: Cents;
  returnPct: number | null;
  /** Money-weighted annual return across every cash flow. Null if undefined. */
  annualisedReturn: number | null;
  byKind: { kind: HoldingKind; value: Cents; weight: number }[];
  /** Market value per investment account, for the balance sheet. */
  byAccount: Map<string, Cents>;
  /** The oldest mark still in use, so the UI can say how stale this is. */
  oldestMark: DateKey | null;
}

export const buildPortfolio = (
  holdings: Holding[],
  trades: Trade[],
  settings: MoneySettings,
  asOf: DateKey = toDateKey(),
): Portfolio => {
  const valuations = holdings.map((holding) =>
    valueHolding(holding, trades, settings, asOf),
  );
  const value = sumCents(valuations.map((v) => v.baseValue));
  for (const valuation of valuations) {
    valuation.weight = value > 0 ? valuation.baseValue / value : 0;
  }

  const cost = sumCents(valuations.map((v) => v.baseCost));
  const realised = sumCents(
    valuations.map((v) => convert(v.position.realised, v.holding.currency, settings)),
  );
  const dividends = sumCents(
    valuations.map((v) => convert(v.position.dividends, v.holding.currency, settings)),
  );
  const fees = sumCents(
    valuations.map((v) => convert(v.position.fees, v.holding.currency, settings)),
  );
  const invested = sumCents(
    valuations.map((v) =>
      convert(Math.max(0, v.position.netInvested), v.holding.currency, settings),
    ),
  );
  const unrealised = value - cost;
  const totalReturn = unrealised + realised + dividends;

  const byKindMap = new Map<HoldingKind, Cents>();
  for (const valuation of valuations) {
    if (valuation.baseValue === 0) continue;
    byKindMap.set(
      valuation.holding.kind,
      (byKindMap.get(valuation.holding.kind) ?? 0) + valuation.baseValue,
    );
  }

  const byAccount = new Map<string, Cents>();
  for (const valuation of valuations) {
    byAccount.set(
      valuation.holding.accountId,
      (byAccount.get(valuation.holding.accountId) ?? 0) + valuation.value,
    );
  }

  const marks = valuations
    .filter((v) => v.position.quantity > 0 && v.mark.date)
    .map((v) => v.mark.date as DateKey);

  return {
    holdings: valuations,
    value,
    cost,
    unrealised,
    realised,
    dividends,
    fees,
    invested,
    totalReturn,
    returnPct: invested > 0 ? totalReturn / invested : null,
    annualisedReturn: xirr(portfolioCashFlows(holdings, trades, settings, value, asOf)),
    byKind: [...byKindMap.entries()]
      .map(([kind, kindValue]) => ({
        kind,
        value: kindValue,
        weight: value > 0 ? kindValue / value : 0,
      }))
      .sort((a, b) => b.value - a.value),
    byAccount,
    oldestMark: marks.length ? marks.reduce((a, b) => (a < b ? a : b)) : null,
  };
};

/* -------------------------------------------------------------------------- */
/*                                  Returns                                   */
/* -------------------------------------------------------------------------- */

export interface CashFlowPoint {
  date: DateKey;
  amount: Cents;
}

/**
 * The cash flows a return is measured over: what left your pocket, what came
 * back, and the portfolio's present value as a final inflow.
 */
export const portfolioCashFlows = (
  holdings: Holding[],
  trades: Trade[],
  settings: MoneySettings,
  currentValue: Cents,
  asOf: DateKey = toDateKey(),
): CashFlowPoint[] => {
  const currencyOf = new Map(holdings.map((h) => [h.id, h.currency]));
  const flows: CashFlowPoint[] = [];

  for (const trade of trades) {
    if (trade.date > asOf) continue;
    const currency = currencyOf.get(trade.holdingId);
    if (!currency || trade.cash === 0) continue;
    flows.push({ date: trade.date, amount: convert(trade.cash, currency, settings) });
  }
  if (currentValue !== 0) flows.push({ date: asOf, amount: currentValue });
  return flows.sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Money-weighted annual return (XIRR).
 *
 * The rate that makes the flows net to zero. This is the return that answers
 * "how did *I* do", because it accounts for when the money went in — a fund up
 * 20% helps very little if you only bought in December.
 *
 * Solved by bisection rather than Newton: irregular personal cash flows produce
 * NPV curves that send Newton off to infinity, and 200 halvings of a bracketed
 * range are both fast enough and incapable of diverging.
 */
export const xirr = (
  flows: CashFlowPoint[],
  guessLow = -0.999,
  guessHigh = 10,
): number | null => {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const start = sorted[0]!.date;
  const hasOut = sorted.some((f) => f.amount < 0);
  const hasIn = sorted.some((f) => f.amount > 0);
  if (!hasOut || !hasIn) return null;

  const npv = (rate: number): number =>
    sorted.reduce((total, flow) => {
      const years = daysBetween(start, flow.date) / 365;
      return total + flow.amount / (1 + rate) ** years;
    }, 0);

  let low = guessLow;
  let high = guessHigh;
  let npvLow = npv(low);
  const npvHigh = npv(high);
  if (!Number.isFinite(npvLow) || !Number.isFinite(npvHigh)) return null;
  // No sign change in the bracket means no rate explains these flows.
  if (npvLow * npvHigh > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const value = npv(mid);
    if (Math.abs(value) < 0.5 || high - low < 1e-7) return round4(mid);
    if (value * npvLow > 0) {
      low = mid;
      npvLow = value;
    } else {
      high = mid;
    }
  }
  return round4((low + high) / 2);
};

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;

/* -------------------------------------------------------------------------- */
/*                               Growth over time                             */
/* -------------------------------------------------------------------------- */

export interface PortfolioPoint {
  month: MonthKey;
  value: Cents;
  /** What had been put in by then — the line the value is judged against. */
  invested: Cents;
}

/**
 * Value and money-in at the close of each month.
 *
 * Both lines matter and neither is enough alone: a portfolio that doubled
 * because you kept paying into it has not grown, and the gap between the two
 * lines is the only part that is actually return.
 */
export const portfolioSeries = (
  holdings: Holding[],
  trades: Trade[],
  settings: MoneySettings,
  from: MonthKey,
  to: MonthKey,
): PortfolioPoint[] =>
  monthRange(from, to).map((month) => {
    const asOf = monthEnd(month);
    let value = 0;
    let invested = 0;
    for (const holding of holdings) {
      const position = positionAt(holding.id, trades, holding.currency, asOf);
      const mark = markAt(holding, trades, asOf);
      value += convert(
        toCents(position.quantity * mark.price, holding.currency),
        holding.currency,
        settings,
      );
      invested += convert(
        Math.max(0, position.netInvested),
        holding.currency,
        settings,
      );
    }
    return { month, value, invested };
  });
