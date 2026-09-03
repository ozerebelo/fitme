import { toDateKey } from "@fitme/core";
import type { MoneyData, MoneySettings } from "./types";
import { DEFAULT_SETTINGS } from "./money";
import { emptyPlan } from "./budget";
import { monthKeyOf } from "./period";

/**
 * The stored money document.
 *
 * It lives inside the app's single state document, which is what makes sync,
 * export and the durability journal apply to it for free — there is one blob,
 * one timestamp and one comparison, and the money side did not have to invent
 * its own.
 *
 * `migrate` is deliberately forgiving in the same way the outer one is: a
 * ledger is not something to lose because a field was added later.
 */

export const emptyMoneyData = (): MoneyData => ({
  accounts: [],
  transactions: [],
  categories: [],
  budget: emptyPlan(monthKeyOf(toDateKey())),
  goals: [],
  holdings: [],
  trades: [],
  recurring: [],
  rules: [],
  settings: { ...DEFAULT_SETTINGS },
});

export const migrateMoneyData = (raw: unknown): MoneyData => {
  const base = emptyMoneyData();
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<MoneyData>;

  const settings: MoneySettings = {
    ...DEFAULT_SETTINGS,
    ...(data.settings ?? {}),
    rates: { ...(data.settings?.rates ?? {}) },
  };

  return {
    accounts: data.accounts ?? [],
    transactions: data.transactions ?? [],
    categories: data.categories ?? [],
    budget: {
      ...base.budget,
      ...(data.budget ?? {}),
      lines: data.budget?.lines ?? [],
      overrides: data.budget?.overrides ?? {},
    },
    goals: data.goals ?? [],
    holdings: data.holdings ?? [],
    trades: data.trades ?? [],
    recurring: data.recurring ?? [],
    rules: data.rules ?? [],
    settings,
  };
};

/** Has anything actually been set up here? Drives the empty states. */
export const hasMoneyData = (data: MoneyData): boolean =>
  data.accounts.length > 0 || data.transactions.length > 0;
