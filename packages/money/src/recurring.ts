import type { DateKey } from "@fitme/core";
import { addDays, cryptoId, daysBetween, toDateKey } from "@fitme/core";
import type { Cents, Frequency, RecurringRule, Transaction } from "./types";
import { addMonthsToDate } from "./period";
import { makeTransaction } from "./transactions";
import { normalisePayee } from "./rules";

/**
 * Standing orders, subscriptions and the salary.
 *
 * Two jobs: post the ones that have come due, and tell you what is still to
 * come this month. The second is the one that changes behaviour — a balance
 * that looks healthy on the 3rd is a different number once the rent, the loan
 * and the insurance are subtracted from it, and that is exactly the week people
 * decide whether they can afford something.
 *
 * Occurrences are always counted from the anchor date rather than stepped from
 * the last one, so a rule anchored on the 31st is the 28th in February and the
 * 31st again in March instead of quietly migrating to the 28th for good.
 */

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: "Weekly",
  fortnightly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

/** Roughly how many of these fall in a month — for "what does this cost me". */
export const PER_MONTH: Record<Frequency, number> = {
  weekly: 52 / 12,
  fortnightly: 26 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

export const makeRule = (input: {
  name: string;
  accountId: string;
  categoryId?: string | null;
  amount: Cents;
  frequency: Frequency;
  anchorDate?: DateKey;
  endDate?: DateKey;
  autoPost?: boolean;
  note?: string;
}): RecurringRule => ({
  id: cryptoId(),
  name: input.name.trim(),
  accountId: input.accountId,
  categoryId: input.categoryId ?? null,
  amount: Math.round(input.amount),
  frequency: input.frequency,
  anchorDate: input.anchorDate ?? toDateKey(),
  endDate: input.endDate,
  autoPost: input.autoPost ?? false,
  active: true,
  note: input.note,
  createdAt: new Date().toISOString(),
});

/** The n-th occurrence of a rule, counting the anchor as zero. */
export const occurrence = (rule: RecurringRule, index: number): DateKey => {
  switch (rule.frequency) {
    case "weekly":
      return addDays(rule.anchorDate, 7 * index);
    case "fortnightly":
      return addDays(rule.anchorDate, 14 * index);
    case "monthly":
      return addMonthsToDate(rule.anchorDate, index);
    case "quarterly":
      return addMonthsToDate(rule.anchorDate, 3 * index);
    case "yearly":
      return addMonthsToDate(rule.anchorDate, 12 * index);
  }
};

/** Cheap lower bound on the index for a date, so long ranges stay fast. */
const indexFor = (rule: RecurringRule, date: DateKey): number => {
  const days = daysBetween(rule.anchorDate, date);
  switch (rule.frequency) {
    case "weekly":
      return Math.floor(days / 7);
    case "fortnightly":
      return Math.floor(days / 14);
    case "monthly":
      return Math.floor(days / 31);
    case "quarterly":
      return Math.floor(days / 92);
    case "yearly":
      return Math.floor(days / 366);
  }
};

export const occurrencesBetween = (
  rule: RecurringRule,
  from: DateKey,
  to: DateKey,
): DateKey[] => {
  if (to < rule.anchorDate) return [];
  const out: DateKey[] = [];
  let index = Math.max(0, indexFor(rule, from));

  // Bounded so a corrupt anchor cannot spin here forever.
  for (let guard = 0; guard < 5000; guard++) {
    const date = occurrence(rule, index);
    if (date > to) break;
    if (rule.endDate && date > rule.endDate) break;
    if (date >= from) out.push(date);
    index++;
  }
  return out;
};

export const nextOccurrence = (
  rule: RecurringRule,
  after: DateKey = toDateKey(),
): DateKey | null => {
  const [next] = occurrencesBetween(rule, after, addDays(after, 400));
  return next ?? null;
};

/* -------------------------------------------------------------------------- */
/*                                  Posting                                   */
/* -------------------------------------------------------------------------- */

export interface DueOccurrence {
  rule: RecurringRule;
  date: DateKey;
}

/**
 * Occurrences that have fallen due and not yet been posted.
 *
 * Bounded to a year back: linking an account with a two-year-old rule on it
 * should not offer to post twenty-four rents into your history.
 */
export const dueOccurrences = (
  rules: RecurringRule[],
  asOf: DateKey = toDateKey(),
): DueOccurrence[] => {
  const floor = addDays(asOf, -365);
  const out: DueOccurrence[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;
    const from = rule.lastPostedDate
      ? addDays(rule.lastPostedDate, 1)
      : rule.anchorDate;
    const start = from > floor ? from : floor;
    for (const date of occurrencesBetween(rule, start, asOf)) {
      out.push({ rule, date });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
};

export const transactionFor = (due: DueOccurrence): Transaction =>
  makeTransaction({
    accountId: due.rule.accountId,
    date: due.date,
    amount: due.rule.amount,
    payee: due.rule.name,
    categoryId: due.rule.categoryId,
    note: due.rule.note,
    recurrenceId: due.rule.id,
  });

/* -------------------------------------------------------------------------- */
/*                                  Forecast                                  */
/* -------------------------------------------------------------------------- */

export interface ForecastEntry {
  date: DateKey;
  amount: Cents;
  ruleId: string;
  name: string;
  categoryId: string | null;
  accountId: string;
}

export const forecast = (
  rules: RecurringRule[],
  from: DateKey,
  to: DateKey,
): ForecastEntry[] => {
  const out: ForecastEntry[] = [];
  for (const rule of rules) {
    if (!rule.active) continue;
    for (const date of occurrencesBetween(rule, from, to)) {
      out.push({
        date,
        amount: rule.amount,
        ruleId: rule.id,
        name: rule.name,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
};

export interface ForecastPoint {
  date: DateKey;
  balance: Cents;
  /** What is committed on this exact day, if anything. */
  entries: ForecastEntry[];
}

/**
 * A running balance forward through the committed payments.
 *
 * The useful output is not the end figure but the lowest point — the day the
 * account is thinnest is the constraint on everything else, and it is almost
 * never the last day of the month.
 */
export const projectCashFlow = (
  openingBalance: Cents,
  entries: ForecastEntry[],
  from: DateKey,
  to: DateKey,
): { points: ForecastPoint[]; low: ForecastPoint | null; closing: Cents } => {
  const byDate = new Map<DateKey, ForecastEntry[]>();
  for (const entry of entries) {
    const bucket = byDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  const points: ForecastPoint[] = [];
  let balance = openingBalance;
  let low: ForecastPoint | null = null;
  const span = Math.max(0, daysBetween(from, to));

  for (let i = 0; i <= span; i++) {
    const date = addDays(from, i);
    const dayEntries = byDate.get(date) ?? [];
    for (const entry of dayEntries) balance += entry.amount;
    const point: ForecastPoint = { date, balance, entries: dayEntries };
    points.push(point);
    if (!low || balance < low.balance) low = point;
  }

  return { points, low, closing: balance };
};

/* -------------------------------------------------------------------------- */
/*                          Finding them in the history                       */
/* -------------------------------------------------------------------------- */

export interface DetectedSubscription {
  payee: string;
  /** Positive: what it costs each time. */
  amount: Cents;
  frequency: Frequency;
  occurrences: number;
  lastDate: DateKey;
  categoryId: string | null;
  /** Cost per month, whatever the cadence — the number worth totalling. */
  monthlyCost: Cents;
}

/**
 * Find the standing payments already in the history.
 *
 * People do not know what they are subscribed to; that is the entire business
 * model of subscriptions. Three or more charges to the same payee, of near
 * enough the same amount, at a near enough regular interval is the signal —
 * and the tolerance on the amount matters, because Netflix raises its price and
 * a rule that demands an exact match would lose the trail every time it does.
 */
export const detectSubscriptions = (
  transactions: Transaction[],
  asOf: DateKey = toDateKey(),
): DetectedSubscription[] => {
  const byPayee = new Map<string, Transaction[]>();
  const floor = addDays(asOf, -400);

  for (const transaction of transactions) {
    if (transaction.amount >= 0 || transaction.transferId) continue;
    if (transaction.date < floor || transaction.date > asOf) continue;
    const key = normalisePayee(transaction.payee);
    if (!key) continue;
    const bucket = byPayee.get(key);
    if (bucket) bucket.push(transaction);
    else byPayee.set(key, [transaction]);
  }

  const found: DetectedSubscription[] = [];

  for (const group of byPayee.values()) {
    if (group.length < 3) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));

    const amounts = sorted.map((t) => Math.abs(t.amount));
    const median = amounts.slice().sort((a, b) => a - b)[Math.floor(amounts.length / 2)] ?? 0;
    if (median <= 0) continue;
    // Within 15% of the median, so a price rise or a currency wobble does not
    // break the series — but *most* of them have to be, or the weekly shop
    // qualifies as a subscription, which is the failure mode that makes this
    // list useless.
    const consistent = amounts.filter((a) => Math.abs(a - median) <= median * 0.15);
    if (consistent.length < Math.max(3, Math.ceil(sorted.length * 0.7))) continue;

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1]!.date, sorted[i]!.date));
    }
    const averageGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const frequency = frequencyFromGap(averageGap);
    if (!frequency) continue;
    // And the rhythm has to hold throughout: an average of thirty days can be
    // made of a fortnight and six weeks, which is not a standing payment.
    if (!gaps.every((gap) => frequencyFromGap(gap) === frequency)) continue;

    const last = sorted[sorted.length - 1]!;
    found.push({
      payee: last.payee,
      amount: median,
      frequency,
      occurrences: sorted.length,
      lastDate: last.date,
      categoryId: last.categoryId,
      monthlyCost: Math.round(median * PER_MONTH[frequency]),
    });
  }

  return found.sort((a, b) => b.monthlyCost - a.monthlyCost);
};

const frequencyFromGap = (days: number): Frequency | null => {
  if (days >= 6 && days <= 8) return "weekly";
  if (days >= 13 && days <= 16) return "fortnightly";
  if (days >= 26 && days <= 35) return "monthly";
  if (days >= 85 && days <= 96) return "quarterly";
  if (days >= 355 && days <= 375) return "yearly";
  return null;
};
