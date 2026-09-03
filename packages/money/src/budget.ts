import type { DateKey } from "@fitme/core";
import { toDateKey } from "@fitme/core";
import type { BudgetLine, BudgetPlan, Cents, MonthKey, Transaction } from "./types";
import { sumCents } from "./money";
import {
  addMonths,
  daysLeftInPeriod,
  monthsBetween,
  periodBounds,
  periodOf,
  periodProgress,
  type Period,
} from "./period";
import {
  baseAmount,
  isExpense,
  type LedgerContext,
} from "./transactions";

/**
 * Envelope budgeting, with the two things that make it survive contact with a
 * real month: rollover, and pace.
 *
 * Rollover is what stops an irregular category — clothes, the car, presents —
 * from being either permanently over or permanently unused. Pace is what turns
 * "€180 of €400 spent" into an actual decision: on the 6th that is a problem,
 * on the 26th it is not, and the number people need is the one that says which.
 */

export const emptyPlan = (startMonth: MonthKey): BudgetPlan => ({
  lines: [],
  overrides: {},
  startMonth,
});

/** This month's limit for a category: the override if there is one, else the plan. */
export const limitFor = (
  plan: BudgetPlan,
  month: MonthKey,
  categoryId: string,
): Cents => {
  const override = plan.overrides[month]?.[categoryId];
  if (override != null) return override;
  return plan.lines.find((line) => line.categoryId === categoryId)?.limit ?? 0;
};

/** Spending in one category over one period, in base currency. Never negative. */
export const spentIn = (
  transactions: Transaction[],
  ctx: LedgerContext,
  period: Period,
  categoryId: string,
): Cents =>
  sumCents(
    transactions
      .filter(
        (t) =>
          t.categoryId === categoryId &&
          t.date >= period.start &&
          t.date <= period.end &&
          !t.transferId,
      )
      // Signed sum, so a refund reduces the month's spending rather than
      // counting as income against a budget it was never part of.
      .map((t) => -baseAmount(t, ctx)),
  );

/**
 * What a rollover category has banked from earlier months.
 *
 * Accumulated from the plan's start month, not from the beginning of the
 * ledger: importing three years of statements should not hand you a €4,000
 * clothing envelope on day one.
 */
export const carriedInto = (
  plan: BudgetPlan,
  transactions: Transaction[],
  ctx: LedgerContext,
  line: BudgetLine,
  month: MonthKey,
  startDay = 1,
): Cents => {
  if (!line.rollover) return 0;
  const span = monthsBetween(plan.startMonth, month);
  if (span <= 0) return 0;

  let carry = 0;
  for (let i = 0; i < span; i++) {
    const key = addMonths(plan.startMonth, i);
    const period = periodBounds(key, startDay);
    const limit = limitFor(plan, key, line.categoryId) + carry;
    carry = limit - spentIn(transactions, ctx, period, line.categoryId);
  }
  return carry;
};

export type Pace = "under" | "on" | "over" | "spent";

export interface BudgetStatus {
  categoryId: string;
  /** This month's limit, before rollover. */
  limit: Cents;
  /** Banked from earlier months. Negative if the category is in the red. */
  carry: Cents;
  /** limit + carry — what is actually spendable this month. */
  available: Cents;
  spent: Cents;
  remaining: Cents;
  /** Spent as a fraction of available. Over 1 is over budget. */
  used: number;
  /** Where you would be if you spent evenly through the month. */
  expected: Cents;
  pace: Pace;
  /** End-of-month spend if the current rate holds. */
  projected: Cents;
  /** What is left to spend per remaining day. Zero once the envelope is empty. */
  perDay: Cents;
  rollover: boolean;
}

export interface BudgetReport {
  month: MonthKey;
  period: Period;
  progress: number;
  daysLeft: number;
  lines: BudgetStatus[];
  totals: {
    limit: Cents;
    available: Cents;
    spent: Cents;
    remaining: Cents;
    projected: Cents;
    perDay: Cents;
  };
  /** Spending that fell outside every budgeted category. */
  unbudgeted: Cents;
  /** Spending with no category at all — the number that erodes trust in a budget. */
  uncategorised: Cents;
}

export const budgetReport = (
  plan: BudgetPlan,
  transactions: Transaction[],
  ctx: LedgerContext,
  month: MonthKey,
  asOf: DateKey = toDateKey(),
  startDay = 1,
): BudgetReport => {
  const period = periodBounds(month, startDay);
  const progress = periodProgress(period, asOf);
  const daysLeft = Math.max(0, daysLeftInPeriod(period, asOf) + (asOf <= period.end ? 1 : 0));

  const lines = plan.lines.map<BudgetStatus>((line) => {
    const limit = limitFor(plan, month, line.categoryId);
    const carry = carriedInto(plan, transactions, ctx, line, month, startDay);
    const available = limit + carry;
    const spent = spentIn(transactions, ctx, period, line.categoryId);
    const remaining = available - spent;
    const expected = Math.round(available * progress);

    // Projection needs a few days of the month to mean anything; before that it
    // says more about which day the rent left than about the month ahead.
    const projected =
      progress >= 0.15 ? Math.round(spent / progress) : Math.max(spent, available);

    return {
      categoryId: line.categoryId,
      limit,
      carry,
      available,
      spent,
      remaining,
      used: available > 0 ? spent / available : spent > 0 ? Infinity : 0,
      expected,
      pace: paceOf(spent, expected, available),
      projected,
      perDay: remaining > 0 && daysLeft > 0 ? Math.floor(remaining / daysLeft) : 0,
      rollover: line.rollover,
    };
  });

  const budgeted = new Set(plan.lines.map((line) => line.categoryId));
  let unbudgeted = 0;
  let uncategorised = 0;
  for (const transaction of transactions) {
    if (!isExpense(transaction)) continue;
    if (transaction.date < period.start || transaction.date > period.end) continue;
    const amount = -baseAmount(transaction, ctx);
    if (!transaction.categoryId) {
      uncategorised += amount;
      unbudgeted += amount;
    } else if (!budgeted.has(transaction.categoryId)) {
      unbudgeted += amount;
    }
  }

  const totals = {
    limit: sumCents(lines.map((line) => line.limit)),
    available: sumCents(lines.map((line) => line.available)),
    spent: sumCents(lines.map((line) => line.spent)),
    remaining: 0,
    projected: sumCents(lines.map((line) => line.projected)),
    perDay: 0,
  };
  totals.remaining = totals.available - totals.spent;
  totals.perDay =
    totals.remaining > 0 && daysLeft > 0 ? Math.floor(totals.remaining / daysLeft) : 0;

  return {
    month,
    period,
    progress,
    daysLeft,
    lines: lines.sort((a, b) => b.used - a.used),
    totals,
    unbudgeted,
    uncategorised,
  };
};

/**
 * Ahead, on track, or over.
 *
 * The 8% band around the straight line is there because nobody spends evenly
 * and a budget that shouts on day three is a budget that gets ignored.
 */
const paceOf = (spent: Cents, expected: Cents, available: Cents): Pace => {
  if (available > 0 && spent >= available) return "spent";
  const tolerance = Math.max(Math.round(available * 0.08), 500);
  if (spent > expected + tolerance) return "over";
  if (spent < expected - tolerance) return "under";
  return "on";
};

/* -------------------------------------------------------------------------- */
/*                            Building a first budget                         */
/* -------------------------------------------------------------------------- */

export interface BudgetSuggestion {
  categoryId: string;
  /** Median of the months observed, rounded up to something memorable. */
  limit: Cents;
  months: number;
  observed: Cents[];
}

/**
 * Propose limits from what actually happened.
 *
 * The median rather than the mean, because one holiday or one boiler is enough
 * to make an average nonsense, and rounded up to a round number: a budget of
 * €327 is a spreadsheet, a budget of €350 is a decision someone can hold.
 */
export const suggestBudget = (
  transactions: Transaction[],
  ctx: LedgerContext,
  endMonth: MonthKey,
  months = 3,
  startDay = 1,
): BudgetSuggestion[] => {
  const periods = Array.from({ length: months }, (_, i) =>
    periodBounds(addMonths(endMonth, -(months - 1 - i)), startDay),
  );

  const byCategory = new Map<string, Cents[]>();
  for (const period of periods) {
    const monthTotals = new Map<string, Cents>();
    for (const transaction of transactions) {
      if (!isExpense(transaction) || !transaction.categoryId) continue;
      if (transaction.date < period.start || transaction.date > period.end) continue;
      monthTotals.set(
        transaction.categoryId,
        (monthTotals.get(transaction.categoryId) ?? 0) - baseAmount(transaction, ctx),
      );
    }
    for (const [categoryId, total] of monthTotals) {
      const list = byCategory.get(categoryId) ?? [];
      list.push(total);
      byCategory.set(categoryId, list);
    }
  }

  return [...byCategory.entries()]
    .map(([categoryId, observed]) => {
      const sorted = [...observed].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0
          ? Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
          : (sorted[middle] ?? 0);
      return {
        categoryId,
        limit: roundUpToNice(median),
        months: observed.length,
        observed,
      };
    })
    .filter((suggestion) => suggestion.limit > 0)
    .sort((a, b) => b.limit - a.limit);
};

/** Round to something a person would actually write down. */
const roundUpToNice = (cents: Cents): Cents => {
  if (cents <= 0) return 0;
  const major = cents / 100;
  const step = major < 50 ? 5 : major < 200 ? 10 : major < 1000 ? 25 : 100;
  return Math.ceil(major / step) * step * 100;
};

/** The period a date belongs to under this budget's month-start day. */
export const budgetPeriodOf = (date: DateKey, startDay = 1): Period =>
  periodOf(date, startDay);
