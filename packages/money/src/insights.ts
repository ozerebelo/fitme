import type { DateKey } from "@fitme/core";
import { addDays, toDateKey } from "@fitme/core";
import type {
  Account,
  BudgetPlan,
  Category,
  Cents,
  Goal,
  MoneyInsight,
  MoneySettings,
  RecurringRule,
  Transaction,
} from "./types";
import { convert, formatMoney, formatPct, sumCents } from "./money";
import {
  addMonths,
  monthKeyOf,
  monthLabel,
  periodBounds,
  periodOf,
  periodProgress,
} from "./period";
import {
  baseAmount,
  cashFlow,
  isExpense,
  spendingByCategory,
  type LedgerContext,
} from "./transactions";
import { budgetReport } from "./budget";
import { ESSENTIAL_CATEGORY_IDS } from "./data/categories";
import { accountBalance, utilisation, type BalanceInputs } from "./accounts";
import { goalStatus } from "./goals";
import { detectSubscriptions, forecast, projectCashFlow } from "./recurring";
import type { Portfolio } from "./invest";

/**
 * The money side's rule engine.
 *
 * Same contract as the training and nutrition coaches: local, deterministic,
 * and every finding carries the numbers it was derived from. A budgeting app
 * that tells you "you're spending a lot on eating out" without saying what it
 * compared against is asking to be believed rather than checked, and the first
 * time it is wrong you stop reading it.
 *
 * Findings are deliberately few. Twenty observations a month is a newsletter;
 * the three that would change a decision this week are advice.
 */

export interface MoneyContext {
  accounts: Account[];
  transactions: Transaction[];
  categories: Map<string, Category>;
  settings: MoneySettings;
  budget: BudgetPlan;
  goals: Goal[];
  recurring: RecurringRule[];
  balances: BalanceInputs;
  /** Liquid money in base currency, from `liquidTotal`. */
  liquid: Cents;
  netWorth: Cents;
  portfolio?: Portfolio;
  asOf: DateKey;
}

export interface MoneyReport {
  insights: MoneyInsight[];
  headline: string;
  /** This month's numbers, so the dashboard does not recompute them. */
  month: {
    income: Cents;
    expenses: Cents;
    net: Cents;
    savingsRate: number | null;
    essentials: Cents;
    lifestyle: Cents;
  };
  subscriptions: ReturnType<typeof detectSubscriptions>;
  monthlyEssentials: Cents;
}

const SEVERITY_ORDER: Record<MoneyInsight["severity"], number> = {
  critical: 0,
  warning: 1,
  success: 2,
  info: 3,
};

export const bySeverity = (a: MoneyInsight, b: MoneyInsight): number =>
  SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];

export const buildMoneyReport = (ctx: MoneyContext): MoneyReport => {
  const { settings, asOf } = ctx;
  const money = (cents: Cents): string =>
    formatMoney(cents, settings.baseCurrency, { locale: settings.locale, round: true });

  const ledger: LedgerContext = {
    accounts: new Map(ctx.accounts.map((account) => [account.id, account])),
    settings,
  };

  const period = periodOf(asOf, settings.monthStartDay);
  const inPeriod = ctx.transactions.filter(
    (t) => t.date >= period.start && t.date <= period.end,
  );
  const flow = cashFlow(inPeriod, ledger);
  const progress = periodProgress(period, asOf);

  const essentials = essentialSpend(inPeriod, ledger, ctx.categories);
  const lifestyle = groupSpend(inPeriod, ledger, ctx.categories, "lifestyle");
  const monthlyEssentials = averageEssentials(ctx, ledger);
  const subscriptions = detectSubscriptions(ctx.transactions, asOf);

  const insights: MoneyInsight[] = [];
  const push = (insight: MoneyInsight | null): void => {
    if (insight) insights.push(insight);
  };

  push(cashCrunch(ctx, ledger, money));
  push(budgetPace(ctx, ledger, money));
  push(categorySpike(ctx, ledger, money));
  push(savingsRateFinding(flow, settings, progress, money));
  push(runwayFinding(ctx, monthlyEssentials, money));
  push(cardUtilisation(ctx, money));
  push(uncategorisedFinding(ctx, inPeriod));
  push(subscriptionLoad(subscriptions, flow, settings, money));
  push(goalFinding(ctx, money));
  push(concentration(ctx, money));
  push(staleMarks(ctx));
  push(idleCash(ctx, monthlyEssentials, money));

  insights.sort(bySeverity);

  return {
    insights,
    headline: headlineFor(insights, flow, period.key, settings, money),
    month: {
      income: flow.income,
      expenses: flow.expenses,
      net: flow.net,
      savingsRate: flow.income > 0 ? flow.net / flow.income : null,
      essentials,
      lifestyle,
    },
    subscriptions,
    monthlyEssentials,
  };
};

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

const groupSpend = (
  transactions: Transaction[],
  ledger: LedgerContext,
  categories: Map<string, Category>,
  group: Category["group"],
): Cents =>
  sumCents(
    transactions
      .filter(
        (t) =>
          isExpense(t) &&
          t.categoryId != null &&
          categories.get(t.categoryId)?.group === group,
      )
      .map((t) => -baseAmount(t, ledger)),
  );

const essentialSpend = (
  transactions: Transaction[],
  ledger: LedgerContext,
  categories: Map<string, Category>,
): Cents =>
  sumCents(
    transactions
      .filter(
        (t) =>
          isExpense(t) &&
          t.categoryId != null &&
          (ESSENTIAL_CATEGORY_IDS.has(t.categoryId) ||
            categories.get(t.categoryId)?.group === "essentials"),
      )
      .map((t) => -baseAmount(t, ledger)),
  );

/**
 * Committed spending per month, averaged over the last three complete ones.
 *
 * The current month is excluded on purpose: on the 4th it would report a
 * quarter of the truth and make the runway look four times longer than it is.
 */
const averageEssentials = (ctx: MoneyContext, ledger: LedgerContext): Cents => {
  const current = periodOf(ctx.asOf, ctx.settings.monthStartDay).key;
  const months = [1, 2, 3].map((back) =>
    periodBounds(addMonths(current, -back), ctx.settings.monthStartDay),
  );

  const totals = months.map((period) =>
    essentialSpend(
      ctx.transactions.filter((t) => t.date >= period.start && t.date <= period.end),
      ledger,
      ctx.categories,
    ),
  );
  const observed = totals.filter((total) => total > 0);
  if (observed.length === 0) return 0;
  return Math.round(sumCents(observed) / observed.length);
};

const categoryName = (ctx: MoneyContext, id: string | null): string =>
  (id ? ctx.categories.get(id)?.name : null) ?? "Uncategorised";

/* -------------------------------------------------------------------------- */
/*                                  Findings                                  */
/* -------------------------------------------------------------------------- */

/**
 * Will the committed payments clear?
 *
 * The most urgent question the app can answer, and the one a balance on its own
 * gets wrong: what matters is not today's number but the lowest point between
 * now and the end of the month, once the rent and the direct debits have gone.
 */
const cashCrunch = (
  ctx: MoneyContext,
  _ledger: LedgerContext,
  money: (cents: Cents) => string,
): MoneyInsight | null => {
  const horizon = addDays(ctx.asOf, 30);
  const entries = forecast(ctx.recurring, addDays(ctx.asOf, 1), horizon);
  if (entries.length === 0) return null;

  const { low, closing } = projectCashFlow(
    ctx.liquid,
    entries,
    addDays(ctx.asOf, 1),
    horizon,
  );
  if (!low) return null;

  const committed = sumCents(entries.filter((e) => e.amount < 0).map((e) => -e.amount));

  if (low.balance < 0) {
    return {
      id: "cash-crunch",
      domain: "cashflow",
      severity: "critical",
      title: `Short by ${money(-low.balance)} on ${low.date}`,
      detail: `The standing payments due in the next 30 days come to ${money(committed)}, which is more than the ${money(ctx.liquid)} you have available. The account goes negative on ${low.date}.`,
      action: "Move money in before that date, or push one of the payments.",
      evidence: {
        "Liquid now": money(ctx.liquid),
        "Committed, 30 days": money(committed),
        "Lowest point": money(low.balance),
        "On": low.date,
      },
    };
  }

  if (low.balance < committed * 0.15) {
    return {
      id: "cash-tight",
      domain: "cashflow",
      severity: "warning",
      title: `Tight around ${low.date}`,
      detail: `After the payments due before then, the balance dips to ${money(low.balance)}. It recovers to ${money(closing)} by the end of the month.`,
      evidence: {
        "Liquid now": money(ctx.liquid),
        "Committed, 30 days": money(committed),
        "Lowest point": money(low.balance),
      },
    };
  }
  return null;
};

const budgetPace = (
  ctx: MoneyContext,
  ledger: LedgerContext,
  money: (cents: Cents) => string,
): MoneyInsight | null => {
  if (ctx.budget.lines.length === 0) return null;
  const month = periodOf(ctx.asOf, ctx.settings.monthStartDay).key;
  const report = budgetReport(
    ctx.budget,
    ctx.transactions,
    ledger,
    month,
    ctx.asOf,
    ctx.settings.monthStartDay,
  );

  const overrunning = report.lines
    .filter((line) => line.available > 0 && line.projected > line.available * 1.1)
    .sort((a, b) => b.projected - b.available - (a.projected - a.available));

  if (overrunning.length === 0) {
    if (report.progress > 0.6 && report.totals.remaining > 0) {
      return {
        id: "budget-on-track",
        domain: "budget",
        severity: "success",
        title: `On budget with ${report.daysLeft} days to go`,
        detail: `${money(report.totals.spent)} of ${money(report.totals.available)} spent — ${money(report.totals.perDay)} a day is still available.`,
        evidence: {
          Spent: money(report.totals.spent),
          Available: money(report.totals.available),
          "Per day left": money(report.totals.perDay),
        },
      };
    }
    return null;
  }

  const worst = overrunning[0]!;
  const over = worst.projected - worst.available;
  return {
    id: `budget-over-${worst.categoryId}`,
    domain: "budget",
    severity: overrunning.length > 2 || over > worst.available * 0.4 ? "warning" : "info",
    title: `${categoryName(ctx, worst.categoryId)} is running over`,
    detail: `${money(worst.spent)} of ${money(worst.available)} is gone ${formatPct(report.progress)} of the way through the month. At this rate it finishes at ${money(worst.projected)}${overrunning.length > 1 ? `, and ${overrunning.length - 1} other ${overrunning.length === 2 ? "category is" : "categories are"} on the same path` : ""}.`,
    action:
      worst.remaining > 0
        ? `Keep it under ${money(worst.perDay)} a day for the rest of the month.`
        : "The envelope is empty — anything more comes from somewhere else.",
    evidence: {
      Spent: money(worst.spent),
      Budget: money(worst.available),
      "Expected by now": money(worst.expected),
      Projected: money(worst.projected),
    },
  };
};

/**
 * A category well above its own recent normal.
 *
 * Compared against the median of the last three months rather than the mean,
 * and only reported once the month is far enough along for the comparison to be
 * fair — otherwise the rent leaving on the 1st is a 300% spike every month.
 */
const categorySpike = (
  ctx: MoneyContext,
  ledger: LedgerContext,
  money: (cents: Cents) => string,
): MoneyInsight | null => {
  const current = periodOf(ctx.asOf, ctx.settings.monthStartDay);
  const progress = periodProgress(current, ctx.asOf);
  if (progress < 0.4) return null;

  const now = new Map(
    spendingByCategory(
      ctx.transactions.filter((t) => t.date >= current.start && t.date <= current.end),
      ledger,
    ).map((row) => [row.categoryId, row.total]),
  );

  const history = [1, 2, 3].map((back) => {
    const period = periodBounds(
      addMonths(current.key, -back),
      ctx.settings.monthStartDay,
    );
    return new Map(
      spendingByCategory(
        ctx.transactions.filter((t) => t.date >= period.start && t.date <= period.end),
        ledger,
      ).map((row) => [row.categoryId, row.total]),
    );
  });
  if (history.every((month) => month.size === 0)) return null;

  let worst: { categoryId: string; spent: Cents; usual: Cents } | null = null;
  for (const [categoryId, spent] of now) {
    if (!categoryId || spent < 5000) continue;
    const past = history.map((month) => month.get(categoryId) ?? 0).sort((a, b) => a - b);
    const usual = past[1] ?? 0;
    if (usual <= 0) continue;
    if (spent < usual * 1.3 || spent - usual < 3000) continue;
    if (!worst || spent - usual > worst.spent - worst.usual) {
      worst = { categoryId, spent, usual };
    }
  }
  if (!worst) return null;

  const delta = worst.spent - worst.usual;
  return {
    id: `spike-${worst.categoryId}`,
    domain: "spending",
    severity: delta > worst.usual ? "warning" : "info",
    title: `${categoryName(ctx, worst.categoryId)} is up ${money(delta)} on your usual`,
    detail: `${money(worst.spent)} this month against a typical ${money(worst.usual)} over the last three. The month is ${formatPct(progress)} done.`,
    evidence: {
      "This month": money(worst.spent),
      "Usual month": money(worst.usual),
      Difference: money(delta),
    },
  };
};

const savingsRateFinding = (
  flow: { income: Cents; expenses: Cents; net: Cents },
  settings: MoneySettings,
  progress: number,
  money: (cents: Cents) => string,
): MoneyInsight | null => {
  // Before the income has landed, a savings rate is a division by an accident.
  if (flow.income <= 0 || progress < 0.5) return null;
  const rate = flow.net / flow.income;
  const target = settings.savingsRateTarget;

  if (rate >= target) {
    return {
      id: "savings-rate-good",
      domain: "saving",
      severity: "success",
      title: `Keeping ${formatPct(rate)} of what came in`,
      detail: `${money(flow.income)} in, ${money(flow.expenses)} out — ${money(flow.net)} kept, against a target of ${formatPct(target)}.`,
      evidence: {
        Income: money(flow.income),
        Spending: money(flow.expenses),
        Kept: money(flow.net),
        Target: formatPct(target),
      },
    };
  }

  return {
    id: "savings-rate-low",
    domain: "saving",
    severity: rate < 0 ? "warning" : "info",
    title:
      rate < 0
        ? `Spending more than came in this month`
        : `Saving ${formatPct(rate)}, short of ${formatPct(target)}`,
    detail:
      rate < 0
        ? `${money(flow.expenses)} out against ${money(flow.income)} in. The difference is coming from savings or from credit.`
        : `${money(flow.net)} of ${money(flow.income)} kept. Hitting ${formatPct(target)} means finding ${money(Math.round(flow.income * target) - flow.net)} more.`,
    evidence: {
      Income: money(flow.income),
      Spending: money(flow.expenses),
      Kept: money(flow.net),
      Target: formatPct(target),
    },
  };
};

const runwayFinding = (
  ctx: MoneyContext,
  monthlyEssentials: Cents,
  money: (cents: Cents) => string,
): MoneyInsight | null => {
  if (monthlyEssentials <= 0) return null;
  const months = ctx.liquid / monthlyEssentials;
  const target = ctx.settings.emergencyFundMonths;

  if (months >= target) {
    return {
      id: "runway-ok",
      domain: "saving",
      severity: "success",
      title: `${months.toFixed(1)} months of cover`,
      detail: `${money(ctx.liquid)} liquid against ${money(monthlyEssentials)} of committed spending a month.`,
      evidence: {
        Liquid: money(ctx.liquid),
        "Essentials / month": money(monthlyEssentials),
        Target: `${target} months`,
      },
    };
  }

  const shortfall = Math.round(monthlyEssentials * target) - ctx.liquid;
  return {
    id: "runway-short",
    domain: "saving",
    severity: months < 1 ? "critical" : months < 3 ? "warning" : "info",
    title: `${months.toFixed(1)} months of cover`,
    detail: `${money(ctx.liquid)} liquid covers ${months.toFixed(1)} months of the ${money(monthlyEssentials)} you commit each month. A ${target}-month fund would be ${money(shortfall)} more.`,
    action: "Fund the emergency pot before anything else — it is what stops a bad month becoming debt.",
    evidence: {
      Liquid: money(ctx.liquid),
      "Essentials / month": money(monthlyEssentials),
      "Still needed": money(shortfall),
    },
  };
};

const cardUtilisation = (
  ctx: MoneyContext,
  money: (cents: Cents) => string,
): MoneyInsight | null => {
  let worst: { account: Account; used: number; balance: Cents } | null = null;

  for (const account of ctx.accounts) {
    if (account.kind !== "credit" || account.archived) continue;
    const balance = accountBalance(account, ctx.balances, ctx.asOf);
    const used = utilisation(account, balance);
    if (used == null) continue;
    if (!worst || used > worst.used) worst = { account, used, balance };
  }
  if (!worst || worst.used < 0.5) return null;

  return {
    id: `card-${worst.account.id}`,
    domain: "cashflow",
    severity: worst.used >= 0.8 ? "warning" : "info",
    title: `${worst.account.name} is ${formatPct(worst.used)} used`,
    detail: `${money(convert(-worst.balance, worst.account.currency, ctx.settings))} outstanding against a ${money(convert(worst.account.creditLimit ?? 0, worst.account.currency, ctx.settings))} limit.`,
    evidence: {
      Outstanding: money(convert(-worst.balance, worst.account.currency, ctx.settings)),
      Limit: money(convert(worst.account.creditLimit ?? 0, worst.account.currency, ctx.settings)),
      Used: formatPct(worst.used),
    },
  };
};

/**
 * Uncategorised spending is the quiet killer: every other number on the page is
 * only as true as the share of the month that has been filed.
 */
const uncategorisedFinding = (
  ctx: MoneyContext,
  inPeriod: Transaction[],
): MoneyInsight | null => {
  const spending = inPeriod.filter(isExpense);
  if (spending.length < 5) return null;
  const missing = spending.filter((t) => !t.categoryId);
  const share = missing.length / spending.length;
  if (share < 0.2) return null;

  return {
    id: "uncategorised",
    domain: "spending",
    severity: share > 0.5 ? "warning" : "info",
    title: `${missing.length} transactions still uncategorised`,
    detail: `${formatPct(share)} of this month's spending has no category, so the budget and the breakdown are both reporting less than actually happened.`,
    action: "Categorise them once and the rules will recognise those payees next time.",
    evidence: {
      Uncategorised: missing.length,
      "This month": spending.length,
    },
  };
};

const subscriptionLoad = (
  subscriptions: ReturnType<typeof detectSubscriptions>,
  flow: { income: Cents },
  settings: MoneySettings,
  money: (cents: Cents) => string,
): MoneyInsight | null => {
  if (subscriptions.length < 2) return null;
  const monthly = sumCents(subscriptions.map((s) => s.monthlyCost));
  if (monthly <= 0) return null;

  const share = flow.income > 0 ? monthly / flow.income : null;
  const biggest = subscriptions[0]!;

  return {
    id: "subscriptions",
    domain: "spending",
    severity: share != null && share > 0.15 ? "warning" : "info",
    title: `${subscriptions.length} standing payments, ${money(monthly)} a month`,
    detail: `That is ${money(monthly * 12)} a year${share != null ? `, ${formatPct(share)} of what comes in` : ""}. The largest is ${biggest.payee} at ${money(biggest.monthlyCost)} a month.`,
    action: "Anything on that list you have not used this month is a decision, not a bill.",
    evidence: {
      Count: subscriptions.length,
      "Per month": money(monthly),
      "Per year": money(monthly * 12),
      Largest: `${biggest.payee} — ${money(biggest.monthlyCost)}`,
    },
  };
};

const goalFinding = (
  ctx: MoneyContext,
  money: (cents: Cents) => string,
): MoneyInsight | null => {
  const active = ctx.goals.filter((goal) => !goal.archived);
  if (active.length === 0) return null;

  for (const goal of active) {
    const linked = goal.accountId
      ? ctx.accounts.find((account) => account.id === goal.accountId)
      : undefined;
    const balance = linked
      ? convert(
          accountBalance(linked, ctx.balances, ctx.asOf),
          linked.currency,
          ctx.settings,
        )
      : undefined;
    const status = goalStatus(goal, balance, ctx.asOf);

    if (status.complete) {
      return {
        id: `goal-done-${goal.id}`,
        domain: "saving",
        severity: "success",
        title: `${goal.name} is funded`,
        detail: `${money(status.saved)} against a target of ${money(goal.target)}.`,
      };
    }
    if (status.onTrack === false && status.requiredMonthly != null) {
      return {
        id: `goal-behind-${goal.id}`,
        domain: "saving",
        severity: "warning",
        title: `${goal.name} needs ${money(status.requiredMonthly)} a month`,
        detail: `${money(status.saved)} of ${money(goal.target)} saved. At ${money(status.assumedMonthly)} a month it lands ${status.projectedDate ?? "never"}, after the ${goal.targetDate} you set.`,
        evidence: {
          Saved: money(status.saved),
          Target: money(goal.target),
          "Needed monthly": money(status.requiredMonthly),
          "Current rate": money(status.assumedMonthly),
        },
      };
    }
  }
  return null;
};

const concentration = (
  ctx: MoneyContext,
  money: (cents: Cents) => string,
): MoneyInsight | null => {
  const portfolio = ctx.portfolio;
  if (!portfolio || portfolio.value <= 0) return null;

  const largest = [...portfolio.holdings].sort((a, b) => b.baseValue - a.baseValue)[0];
  if (!largest || largest.weight < 0.4) return null;
  // A single broad-market fund at 90% is a portfolio, not a concentration risk.
  if (largest.holding.kind === "etf" || largest.holding.kind === "fund") return null;

  return {
    id: `concentration-${largest.holding.id}`,
    domain: "investing",
    severity: largest.weight > 0.6 ? "warning" : "info",
    title: `${largest.holding.symbol} is ${formatPct(largest.weight)} of the portfolio`,
    detail: `${money(largest.baseValue)} of ${money(portfolio.value)} sits in one position. A single company moving 30% moves your whole portfolio ${formatPct(largest.weight * 0.3)}.`,
    evidence: {
      Position: money(largest.baseValue),
      Portfolio: money(portfolio.value),
      Weight: formatPct(largest.weight),
    },
  };
};

const staleMarks = (ctx: MoneyContext): MoneyInsight | null => {
  const portfolio = ctx.portfolio;
  if (!portfolio || portfolio.value <= 0 || !portfolio.oldestMark) return null;
  const cutoff = addDays(ctx.asOf, -45);
  if (portfolio.oldestMark >= cutoff) return null;

  return {
    id: "stale-marks",
    domain: "investing",
    severity: "info",
    title: "Some prices are out of date",
    detail: `The oldest price on file is from ${portfolio.oldestMark}, so the portfolio value and every return derived from it are as old as that.`,
    action: "Update the marks from your broker.",
    evidence: { "Oldest mark": portfolio.oldestMark },
  };
};

/**
 * Cash beyond a generous emergency fund, with nothing invested.
 *
 * Not advice about what to buy — the app has no business having an opinion on
 * that — but the observation itself is worth making, because inflation is a
 * cost that does not appear on any statement.
 */
const idleCash = (
  ctx: MoneyContext,
  monthlyEssentials: Cents,
  money: (cents: Cents) => string,
): MoneyInsight | null => {
  if (monthlyEssentials <= 0) return null;
  const months = ctx.liquid / monthlyEssentials;
  if (months < ctx.settings.emergencyFundMonths * 2) return null;
  const invested = ctx.portfolio?.value ?? 0;
  if (invested > ctx.liquid) return null;

  const excess = ctx.liquid - Math.round(monthlyEssentials * ctx.settings.emergencyFundMonths);
  return {
    id: "idle-cash",
    domain: "investing",
    severity: "info",
    title: `${money(excess)} sitting beyond the emergency fund`,
    detail: `Liquid savings cover ${months.toFixed(1)} months against a ${ctx.settings.emergencyFundMonths}-month target. At 2% inflation that surplus loses about ${money(Math.round(excess * 0.02))} of purchasing power a year.`,
    evidence: {
      Liquid: money(ctx.liquid),
      "Emergency target": money(Math.round(monthlyEssentials * ctx.settings.emergencyFundMonths)),
      Surplus: money(excess),
    },
  };
};

const headlineFor = (
  insights: MoneyInsight[],
  flow: { income: Cents; expenses: Cents; net: Cents },
  month: string,
  settings: MoneySettings,
  money: (cents: Cents) => string,
): string => {
  const first = insights.find((insight) => insight.severity !== "info");
  if (first) return first.title;
  if (flow.income === 0 && flow.expenses === 0) {
    return `Nothing logged yet for ${monthLabel(month, settings.locale)}`;
  }
  return flow.net >= 0
    ? `${money(flow.net)} kept so far this month`
    : `${money(-flow.net)} more spent than earned this month`;
};

/** Current month key under the user's month-start day. */
export const activeMonth = (settings: MoneySettings, asOf: DateKey = toDateKey()): string =>
  periodOf(asOf, settings.monthStartDay).key ?? monthKeyOf(asOf);
