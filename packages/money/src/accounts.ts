import type { DateKey } from "@fitme/core";
import { cryptoId, toDateKey } from "@fitme/core";
import type {
  Account,
  AccountKind,
  BalanceMode,
  Cents,
  CurrencyCode,
  MoneySettings,
  MonthKey,
  Transaction,
} from "./types";
import { convert, sumCents } from "./money";
import { monthEnd, monthKeyOf, monthRange } from "./period";

/**
 * Balances and net worth.
 *
 * One sign convention holds throughout: a balance is what you hold, so a card
 * you owe €400 on is −400 and a mortgage is minus the principal outstanding.
 * Net worth is then a sum, not a case analysis, and there is no second place
 * for a sign error to hide.
 */

export const DEFAULT_BALANCE_MODE: Record<AccountKind, BalanceMode> = {
  current: "transactions",
  savings: "transactions",
  cash: "transactions",
  credit: "transactions",
  investment: "holdings",
  loan: "transactions",
  asset: "manual",
};

export const LIABILITY_KINDS = new Set<AccountKind>(["credit", "loan"]);

/** Accounts you could spend from this week. The base of the runway figure. */
export const LIQUID_KINDS = new Set<AccountKind>(["current", "savings", "cash"]);

export interface AccountInput {
  name: string;
  kind: AccountKind;
  currency: CurrencyCode;
  institution?: string;
  openingBalance?: Cents;
  openedOn?: DateKey;
  creditLimit?: Cents;
  interestRatePct?: number;
  balanceMode?: BalanceMode;
}

export const makeAccount = (input: AccountInput): Account => {
  const now = new Date().toISOString();
  return {
    id: cryptoId(),
    name: input.name.trim(),
    institution: input.institution?.trim(),
    kind: input.kind,
    balanceMode: input.balanceMode ?? DEFAULT_BALANCE_MODE[input.kind],
    currency: input.currency.toUpperCase(),
    openingBalance: input.openingBalance ?? 0,
    openedOn: input.openedOn ?? toDateKey(),
    valuations: [],
    creditLimit: input.creditLimit,
    interestRatePct: input.interestRatePct,
    createdAt: now,
    updatedAt: now,
  };
};

/* -------------------------------------------------------------------------- */
/*                                  Balances                                  */
/* -------------------------------------------------------------------------- */

export interface BalanceInputs {
  transactions: Transaction[];
  /**
   * Market value of an investment account at a date, in the account's currency.
   *
   * Passed in rather than computed here: valuing a portfolio is the investment
   * module's job, and this one has no business knowing what a lot is.
   */
  holdingsValueAt?: (accountId: string, date: DateKey) => Cents;
}

/** Latest valuation on or before `asOf`; the opening balance if there is none. */
const manualBalance = (account: Account, asOf: DateKey): Cents => {
  let value = account.openingBalance;
  for (const valuation of account.valuations) {
    if (valuation.date <= asOf) value = valuation.value;
  }
  return value;
};

export const accountBalance = (
  account: Account,
  inputs: BalanceInputs,
  asOf: DateKey = toDateKey(),
): Cents => {
  if (account.balanceMode === "manual") return manualBalance(account, asOf);

  const cash = sumCents(
    inputs.transactions
      .filter((t) => t.accountId === account.id && t.date <= asOf)
      .map((t) => t.amount),
  );

  if (account.balanceMode === "holdings") {
    // Cash logged against a broker account is real money sitting uninvested;
    // the securities are valued separately and the two are added.
    const securities = inputs.holdingsValueAt?.(account.id, asOf) ?? 0;
    return account.openingBalance + cash + securities;
  }

  return account.openingBalance + cash;
};

export interface AccountBalance {
  account: Account;
  /** In the account's own currency. */
  balance: Cents;
  /** Converted into the base currency, for the totals. */
  base: Cents;
}

export const accountBalances = (
  accounts: Account[],
  inputs: BalanceInputs,
  settings: MoneySettings,
  asOf: DateKey = toDateKey(),
): AccountBalance[] =>
  accounts.map((account) => {
    const balance = accountBalance(account, inputs, asOf);
    return { account, balance, base: convert(balance, account.currency, settings) };
  });

/* -------------------------------------------------------------------------- */
/*                                 Net worth                                  */
/* -------------------------------------------------------------------------- */

export interface NetWorth {
  assets: Cents;
  liabilities: Cents;
  total: Cents;
  balances: AccountBalance[];
}

/**
 * Assets and liabilities are split on the sign of the balance, not on the kind
 * of account. A current account €200 overdrawn is a liability that week, and
 * a mortgage you have overpaid is an asset; classifying by kind would report
 * both backwards.
 */
export const netWorth = (
  accounts: Account[],
  inputs: BalanceInputs,
  settings: MoneySettings,
  asOf: DateKey = toDateKey(),
): NetWorth => {
  const balances = accountBalances(
    accounts.filter((a) => !a.excludeFromNetWorth),
    inputs,
    settings,
    asOf,
  );
  const assets = sumCents(balances.filter((b) => b.base > 0).map((b) => b.base));
  const liabilities = sumCents(balances.filter((b) => b.base < 0).map((b) => b.base));
  return { assets, liabilities, total: assets + liabilities, balances };
};

export interface NetWorthPoint {
  month: MonthKey;
  assets: Cents;
  liabilities: Cents;
  total: Cents;
}

/** Net worth at the close of each month in the range. */
export const netWorthSeries = (
  accounts: Account[],
  inputs: BalanceInputs,
  settings: MoneySettings,
  from: MonthKey,
  to: MonthKey,
): NetWorthPoint[] =>
  monthRange(from, to).map((month) => {
    const { assets, liabilities, total } = netWorth(
      accounts,
      inputs,
      settings,
      monthEnd(month),
    );
    return { month, assets, liabilities, total };
  });

/**
 * The earliest month worth charting: the oldest thing on file, or this month.
 * Charting from an account's opening date rather than from the first
 * transaction keeps a long-dormant account from starting the series at zero.
 */
export const earliestMonth = (
  accounts: Account[],
  transactions: Transaction[],
  asOf: DateKey = toDateKey(),
): MonthKey => {
  const dates = [
    ...accounts.map((a) => a.openedOn),
    ...transactions.map((t) => t.date),
  ].filter(Boolean);
  const earliest = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : asOf;
  return monthKeyOf(earliest);
};

/** Liquid, in base currency — what you could actually reach this week. */
export const liquidTotal = (
  accounts: Account[],
  inputs: BalanceInputs,
  settings: MoneySettings,
  asOf: DateKey = toDateKey(),
): Cents =>
  sumCents(
    accountBalances(
      accounts.filter((a) => LIQUID_KINDS.has(a.kind) && !a.excludeFromNetWorth),
      inputs,
      settings,
      asOf,
    ).map((b) => b.base),
  );

/** How much of a card's limit is used, 0–1. Null when there is no limit set. */
export const utilisation = (account: Account, balance: Cents): number | null => {
  if (account.kind !== "credit" || !account.creditLimit || account.creditLimit <= 0) {
    return null;
  }
  return Math.max(0, -balance) / account.creditLimit;
};

export const activeAccounts = (accounts: Account[]): Account[] =>
  accounts.filter((account) => !account.archived);

export const accountIndex = (accounts: Account[]): Map<string, Account> =>
  new Map(accounts.map((account) => [account.id, account]));
