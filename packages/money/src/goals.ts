import type { DateKey } from "@fitme/core";
import { cryptoId, toDateKey } from "@fitme/core";
import type { Cents, Goal } from "./types";
import { sumCents } from "./money";
import { addMonths, addMonthsToDate, monthKeyOf, monthsBetween } from "./period";

/**
 * Savings goals.
 *
 * A goal is a question — "will this happen, and when?" — so the numbers here
 * are the two answers to it: what you would have to put aside each month to
 * hit the date, and what date you actually reach at the rate you are going.
 * Showing only a progress bar is the thing that makes savings apps decorative.
 */

export const makeGoal = (input: {
  name: string;
  target: Cents;
  currency: string;
  targetDate?: DateKey;
  accountId?: string;
  monthlyContribution?: Cents;
  note?: string;
}): Goal => ({
  id: cryptoId(),
  name: input.name.trim(),
  target: Math.max(0, Math.round(input.target)),
  targetDate: input.targetDate,
  accountId: input.accountId,
  contributions: [],
  monthlyContribution: input.monthlyContribution,
  currency: input.currency.toUpperCase(),
  note: input.note,
  createdAt: new Date().toISOString(),
});

/** What has been put aside: the linked account's balance, or the contributions. */
export const goalSaved = (
  goal: Goal,
  linkedBalance?: Cents,
  asOf: DateKey = toDateKey(),
): Cents => {
  if (goal.accountId && linkedBalance != null) return linkedBalance;
  return sumCents(
    goal.contributions.filter((c) => c.date <= asOf).map((c) => c.amount),
  );
};

/** Average of the months that have contributions, not of the calendar. */
export const observedMonthlyRate = (
  goal: Goal,
  months = 6,
  asOf: DateKey = toDateKey(),
): Cents => {
  const from = addMonths(monthKeyOf(asOf), -(months - 1));
  const recent = goal.contributions.filter((c) => monthKeyOf(c.date) >= from);
  if (recent.length === 0) return 0;
  const distinctMonths = new Set(recent.map((c) => monthKeyOf(c.date))).size;
  return Math.round(sumCents(recent.map((c) => c.amount)) / Math.max(1, distinctMonths));
};

export interface GoalStatus {
  goal: Goal;
  saved: Cents;
  remaining: Cents;
  /** 0–1, capped at 1 for the bar; `saved` still shows the overshoot. */
  progress: number;
  complete: boolean;
  /** Whole months until the target date, 0 if it has passed or is unset. */
  monthsToTarget: number | null;
  /** What you would have to save monthly to hit the date. Null without one. */
  requiredMonthly: Cents | null;
  /** The rate the projection used, and where it came from. */
  assumedMonthly: Cents;
  rateSource: "planned" | "observed" | "none";
  /** When it completes at the assumed rate. Null if the rate is zero. */
  projectedDate: DateKey | null;
  /** True when the projection lands on or before the target date. */
  onTrack: boolean | null;
}

export const goalStatus = (
  goal: Goal,
  linkedBalance?: Cents,
  asOf: DateKey = toDateKey(),
): GoalStatus => {
  const saved = goalSaved(goal, linkedBalance, asOf);
  const remaining = Math.max(0, goal.target - saved);
  const complete = goal.target > 0 && saved >= goal.target;

  const monthsToTarget = goal.targetDate
    ? Math.max(0, monthsBetween(monthKeyOf(asOf), monthKeyOf(goal.targetDate)))
    : null;

  const requiredMonthly =
    monthsToTarget == null
      ? null
      : monthsToTarget <= 0
        ? remaining
        : Math.ceil(remaining / monthsToTarget);

  const observed = observedMonthlyRate(goal, 6, asOf);
  const assumedMonthly = goal.monthlyContribution ?? observed;
  const rateSource: GoalStatus["rateSource"] =
    goal.monthlyContribution != null ? "planned" : observed > 0 ? "observed" : "none";

  const monthsNeeded =
    assumedMonthly > 0 ? Math.ceil(remaining / assumedMonthly) : null;
  const projectedDate =
    complete || remaining === 0
      ? asOf
      : monthsNeeded != null
        ? addMonthsToDate(asOf, monthsNeeded)
        : null;

  return {
    goal,
    saved,
    remaining,
    progress: goal.target > 0 ? Math.min(1, saved / goal.target) : 0,
    complete,
    monthsToTarget,
    requiredMonthly,
    assumedMonthly,
    rateSource,
    projectedDate,
    onTrack:
      goal.targetDate == null
        ? null
        : projectedDate == null
          ? false
          : projectedDate <= goal.targetDate,
  };
};

/* -------------------------------------------------------------------------- */
/*                              Emergency fund                                */
/* -------------------------------------------------------------------------- */

export interface Runway {
  /** Liquid money, in base currency. */
  liquid: Cents;
  /** Committed monthly spending it has to cover. */
  monthlyEssentials: Cents;
  /** How many months it covers. Infinity when nothing is committed. */
  months: number;
  target: number;
  covered: boolean;
  /** What is still missing to reach the target. */
  shortfall: Cents;
}

/**
 * How long the liquid money lasts if the income stops.
 *
 * Deliberately measured against essential spending only. Answering it with
 * total spending flatters nobody: if the income stopped you would not keep
 * paying for the wine club, and a fund sized for that is a fund nobody can
 * ever finish building.
 */
export const runway = (
  liquid: Cents,
  monthlyEssentials: Cents,
  targetMonths: number,
): Runway => {
  const months = monthlyEssentials > 0 ? liquid / monthlyEssentials : Infinity;
  return {
    liquid,
    monthlyEssentials,
    months,
    target: targetMonths,
    covered: months >= targetMonths,
    shortfall: Math.max(0, Math.round(monthlyEssentials * targetMonths) - liquid),
  };
};

/**
 * Compound a balance forward at a fixed annual rate with a monthly top-up.
 *
 * Used for both "what will this savings account be worth" and the portfolio
 * projection. Monthly compounding, contribution at the end of the month —
 * the conservative of the two conventions, and the one a bank statement
 * actually matches.
 */
export const projectBalance = (
  present: Cents,
  monthlyContribution: Cents,
  annualRatePct: number,
  months: number,
): { month: number; value: Cents; contributed: Cents; growth: Cents }[] => {
  const monthlyRate = annualRatePct / 100 / 12;
  const out: { month: number; value: Cents; contributed: Cents; growth: Cents }[] = [];
  let value = present;
  let contributed = present;

  for (let month = 1; month <= months; month++) {
    value = value * (1 + monthlyRate) + monthlyContribution;
    contributed += monthlyContribution;
    out.push({
      month,
      value: Math.round(value),
      contributed,
      growth: Math.round(value) - contributed,
    });
  }
  return out;
};
