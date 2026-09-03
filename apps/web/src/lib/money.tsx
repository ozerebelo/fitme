"use client";

import { useCallback, useMemo } from "react";
import type { DateKey } from "@fitme/core";
import { cryptoId, toDateKey } from "@fitme/core";
import type {
  Account,
  AccountBalance,
  AccountInput,
  BalanceInputs,
  Category,
  CategoryRule,
  Cents,
  DueOccurrence,
  Goal,
  Holding,
  LedgerContext,
  MoneyData,
  MoneyReport,
  MoneySettings,
  MonthKey,
  Portfolio,
  PricePoint,
  RecurringRule,
  Trade,
  Transaction,
} from "@fitme/money";
import {
  accountBalances,
  allCategories,
  buildMoneyReport,
  buildPortfolio,
  categoryIndex,
  dueOccurrences,
  effectiveRules,
  learnRule,
  liquidTotal,
  makeAccount,
  makeTransfer,
  markAt,
  netWorth,
  periodOf,
  positionAt,
  toCents,
  transactionFor,
  type NetWorth,
} from "@fitme/money";
import { useApp } from "./state";

/**
 * The money side's view of the app state.
 *
 * Reads come from one place — the document held by `AppProvider` — and every
 * write goes back through `updateMoney`, so the debounce, the journal and sync
 * apply to a logged coffee exactly as they do to a logged set. Nothing here
 * keeps its own copy of anything.
 */

export interface MoneyApi {
  ready: boolean;
  money: MoneyData;
  settings: MoneySettings;
  currency: string;

  accounts: Account[];
  /** Everything not archived — what the pickers offer. */
  openAccounts: Account[];
  accountMap: Map<string, Account>;
  categories: Category[];
  categoryMap: Map<string, Category>;
  /** Seed rules plus everything taught, ready for matching. */
  rules: CategoryRule[];

  ledger: LedgerContext;
  balanceInputs: BalanceInputs;
  balances: AccountBalance[];
  worth: NetWorth;
  liquid: Cents;
  portfolio: Portfolio;
  report: MoneyReport;
  /** Recurring payments that have fallen due and not been posted. */
  due: DueOccurrence[];
  /** The budgeting month `today` falls in. */
  currentMonth: MonthKey;
  /** Import identities already on file, so a re-import can be recognised. */
  knownExternalIds: Set<string>;

  updateSettings: (patch: Partial<MoneySettings>) => void;
  setRate: (code: string, rate: number) => void;

  addAccount: (input: AccountInput) => Account;
  updateAccount: (account: Account) => void;
  setArchived: (id: string, archived: boolean) => void;
  /** Removes the account and everything logged against it. */
  deleteAccount: (id: string) => void;
  setValuation: (accountId: string, date: DateKey, value: Cents) => void;

  addTransactions: (transactions: Transaction[]) => void;
  updateTransaction: (transaction: Transaction) => void;
  removeTransaction: (id: string) => void;
  /** Both legs, so a transfer is never half-deleted. */
  removeTransfer: (transferId: string) => void;
  transfer: (input: {
    fromAccountId: string;
    toAccountId: string;
    amount: Cents;
    receivedAmount?: Cents;
    date?: DateKey;
    note?: string;
  }) => void;
  /** Set a category and teach the rules, so the next one files itself. */
  categorise: (transactionId: string, categoryId: string | null, learn?: boolean) => void;

  addCategory: (category: Category) => void;
  removeRule: (id: string) => void;

  setBudgetLine: (categoryId: string, limit: Cents, rollover: boolean) => void;
  removeBudgetLine: (categoryId: string) => void;
  setBudgetOverride: (month: MonthKey, categoryId: string, limit: Cents | null) => void;

  addGoal: (goal: Goal) => void;
  updateGoal: (goal: Goal) => void;
  removeGoal: (id: string) => void;
  contribute: (goalId: string, amount: Cents, date?: DateKey) => void;

  addHolding: (holding: Holding) => void;
  updateHolding: (holding: Holding) => void;
  removeHolding: (id: string) => void;
  addTrade: (trade: Trade) => void;
  removeTrade: (id: string) => void;
  markPrice: (holdingId: string, point: PricePoint) => void;

  addRecurring: (rule: RecurringRule) => void;
  updateRecurring: (rule: RecurringRule) => void;
  removeRecurring: (id: string) => void;
  /** Turn due occurrences into transactions and advance the rules. */
  postDue: (occurrences: DueOccurrence[]) => void;
}

export const useMoney = (): MoneyApi => {
  const { ready, data, updateMoney } = useApp();
  const money = data.money;
  const asOf = toDateKey();

  /* ------------------------------- Derived ------------------------------- */

  const accounts = money.accounts;
  const openAccounts = useMemo(
    () => accounts.filter((account) => !account.archived),
    [accounts],
  );
  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const categories = useMemo(() => allCategories(money.categories), [money.categories]);
  const categoryMap = useMemo(() => categoryIndex(money.categories), [money.categories]);
  const rules = useMemo(() => effectiveRules(money.rules), [money.rules]);

  const ledger = useMemo<LedgerContext>(
    () => ({ accounts: accountMap, settings: money.settings }),
    [accountMap, money.settings],
  );

  const portfolio = useMemo(
    () => buildPortfolio(money.holdings, money.trades, money.settings, asOf),
    [money.holdings, money.trades, money.settings, asOf],
  );

  /**
   * Valuing an investment account at an arbitrary past date is the one
   * expensive lookup on this page — the net-worth chart asks for it once per
   * account per month — so the answers are cached for the life of the memo.
   */
  const balanceInputs = useMemo<BalanceInputs>(() => {
    const cache = new Map<string, Cents>();
    return {
      transactions: money.transactions,
      holdingsValueAt: (accountId, date) => {
        const key = `${accountId}|${date}`;
        const hit = cache.get(key);
        if (hit != null) return hit;
        let total = 0;
        for (const holding of money.holdings) {
          if (holding.accountId !== accountId) continue;
          const position = positionAt(holding.id, money.trades, holding.currency, date);
          if (position.quantity <= 0) continue;
          total += toCents(
            position.quantity * markAt(holding, money.trades, date).price,
            holding.currency,
          );
        }
        cache.set(key, total);
        return total;
      },
    };
  }, [money.transactions, money.holdings, money.trades]);

  const balances = useMemo(
    () => accountBalances(accounts, balanceInputs, money.settings, asOf),
    [accounts, balanceInputs, money.settings, asOf],
  );

  const worth = useMemo(
    () => netWorth(accounts, balanceInputs, money.settings, asOf),
    [accounts, balanceInputs, money.settings, asOf],
  );

  const liquid = useMemo(
    () => liquidTotal(accounts, balanceInputs, money.settings, asOf),
    [accounts, balanceInputs, money.settings, asOf],
  );

  const report = useMemo(
    () =>
      buildMoneyReport({
        accounts,
        transactions: money.transactions,
        categories: categoryMap,
        settings: money.settings,
        budget: money.budget,
        goals: money.goals,
        recurring: money.recurring,
        balances: balanceInputs,
        liquid,
        netWorth: worth.total,
        portfolio,
        asOf,
      }),
    [
      accounts,
      money.transactions,
      categoryMap,
      money.settings,
      money.budget,
      money.goals,
      money.recurring,
      balanceInputs,
      liquid,
      worth.total,
      portfolio,
      asOf,
    ],
  );

  const due = useMemo(
    () => dueOccurrences(money.recurring, asOf),
    [money.recurring, asOf],
  );

  const knownExternalIds = useMemo(
    () =>
      new Set(
        money.transactions
          .map((transaction) => transaction.externalId)
          .filter((id): id is string => !!id),
      ),
    [money.transactions],
  );

  const currentMonth = periodOf(asOf, money.settings.monthStartDay).key;

  /* -------------------------------- Writes ------------------------------- */

  const updateSettings = useCallback(
    (patch: Partial<MoneySettings>) => {
      updateMoney((current) => ({
        ...current,
        settings: { ...current.settings, ...patch },
      }));
    },
    [updateMoney],
  );

  const setRate = useCallback(
    (code: string, rate: number) => {
      updateMoney((current) => ({
        ...current,
        settings: {
          ...current.settings,
          rates: {
            ...current.settings.rates,
            [code.toUpperCase()]: { rate, asOf: toDateKey() },
          },
        },
      }));
    },
    [updateMoney],
  );

  const addAccount = useCallback(
    (input: AccountInput) => {
      const account = makeAccount(input);
      updateMoney((current) => ({ ...current, accounts: [...current.accounts, account] }));
      return account;
    },
    [updateMoney],
  );

  const updateAccount = useCallback(
    (account: Account) => {
      updateMoney((current) => ({
        ...current,
        accounts: current.accounts.map((existing) =>
          existing.id === account.id
            ? { ...account, updatedAt: new Date().toISOString() }
            : existing,
        ),
      }));
    },
    [updateMoney],
  );

  const setArchived = useCallback(
    (id: string, archived: boolean) => {
      updateMoney((current) => ({
        ...current,
        accounts: current.accounts.map((account) =>
          account.id === id ? { ...account, archived } : account,
        ),
      }));
    },
    [updateMoney],
  );

  const deleteAccount = useCallback(
    (id: string) => {
      updateMoney((current) => {
        const holdingIds = new Set(
          current.holdings.filter((h) => h.accountId === id).map((h) => h.id),
        );
        return {
          ...current,
          accounts: current.accounts.filter((account) => account.id !== id),
          transactions: current.transactions.filter((t) => t.accountId !== id),
          holdings: current.holdings.filter((h) => h.accountId !== id),
          trades: current.trades.filter((t) => !holdingIds.has(t.holdingId)),
          recurring: current.recurring.filter((rule) => rule.accountId !== id),
          goals: current.goals.map((goal) =>
            goal.accountId === id ? { ...goal, accountId: undefined } : goal,
          ),
        };
      });
    },
    [updateMoney],
  );

  const setValuation = useCallback(
    (accountId: string, date: DateKey, value: Cents) => {
      updateMoney((current) => ({
        ...current,
        accounts: current.accounts.map((account) =>
          account.id === accountId
            ? {
                ...account,
                // One valuation per day: correcting today's figure replaces it.
                valuations: [
                  ...account.valuations.filter((v) => v.date !== date),
                  { date, value },
                ].sort((a, b) => a.date.localeCompare(b.date)),
                updatedAt: new Date().toISOString(),
              }
            : account,
        ),
      }));
    },
    [updateMoney],
  );

  const addTransactions = useCallback(
    (transactions: Transaction[]) => {
      if (transactions.length === 0) return;
      updateMoney((current) => ({
        ...current,
        transactions: [...current.transactions, ...transactions],
      }));
    },
    [updateMoney],
  );

  const updateTransaction = useCallback(
    (transaction: Transaction) => {
      updateMoney((current) => ({
        ...current,
        transactions: current.transactions.map((existing) =>
          existing.id === transaction.id ? transaction : existing,
        ),
      }));
    },
    [updateMoney],
  );

  const removeTransaction = useCallback(
    (id: string) => {
      updateMoney((current) => ({
        ...current,
        transactions: current.transactions.filter((t) => t.id !== id),
      }));
    },
    [updateMoney],
  );

  const removeTransfer = useCallback(
    (transferId: string) => {
      updateMoney((current) => ({
        ...current,
        transactions: current.transactions.filter((t) => t.transferId !== transferId),
      }));
    },
    [updateMoney],
  );

  const transfer = useCallback(
    (input: {
      fromAccountId: string;
      toAccountId: string;
      amount: Cents;
      receivedAmount?: Cents;
      date?: DateKey;
      note?: string;
    }) => {
      const legs = makeTransfer(input);
      updateMoney((current) => ({
        ...current,
        transactions: [...current.transactions, ...legs],
      }));
    },
    [updateMoney],
  );

  const categorise = useCallback(
    (transactionId: string, categoryId: string | null, learn = true) => {
      updateMoney((current) => {
        const target = current.transactions.find((t) => t.id === transactionId);
        if (!target) return current;
        return {
          ...current,
          transactions: current.transactions.map((t) =>
            t.id === transactionId ? { ...t, categoryId } : t,
          ),
          // Filing something teaches the rule that files the next one. Only on
          // a real category — "uncategorised" is not a lesson.
          rules:
            learn && categoryId
              ? learnRule(current.rules, target.payee, categoryId)
              : current.rules,
        };
      });
    },
    [updateMoney],
  );

  const addCategory = useCallback(
    (category: Category) => {
      updateMoney((current) => ({
        ...current,
        categories: [...current.categories, category],
      }));
    },
    [updateMoney],
  );

  const removeRule = useCallback(
    (id: string) => {
      updateMoney((current) => ({
        ...current,
        rules: current.rules.filter((rule) => rule.id !== id),
      }));
    },
    [updateMoney],
  );

  const setBudgetLine = useCallback(
    (categoryId: string, limit: Cents, rollover: boolean) => {
      updateMoney((current) => {
        const exists = current.budget.lines.some((line) => line.categoryId === categoryId);
        return {
          ...current,
          budget: {
            ...current.budget,
            lines: exists
              ? current.budget.lines.map((line) =>
                  line.categoryId === categoryId ? { categoryId, limit, rollover } : line,
                )
              : [...current.budget.lines, { categoryId, limit, rollover }],
          },
        };
      });
    },
    [updateMoney],
  );

  const removeBudgetLine = useCallback(
    (categoryId: string) => {
      updateMoney((current) => ({
        ...current,
        budget: {
          ...current.budget,
          lines: current.budget.lines.filter((line) => line.categoryId !== categoryId),
        },
      }));
    },
    [updateMoney],
  );

  const setBudgetOverride = useCallback(
    (month: MonthKey, categoryId: string, limit: Cents | null) => {
      updateMoney((current) => {
        const forMonth = { ...(current.budget.overrides[month] ?? {}) };
        if (limit == null) delete forMonth[categoryId];
        else forMonth[categoryId] = limit;

        const overrides = { ...current.budget.overrides };
        if (Object.keys(forMonth).length === 0) delete overrides[month];
        else overrides[month] = forMonth;

        return { ...current, budget: { ...current.budget, overrides } };
      });
    },
    [updateMoney],
  );

  const addGoal = useCallback(
    (goal: Goal) => {
      updateMoney((current) => ({ ...current, goals: [...current.goals, goal] }));
    },
    [updateMoney],
  );

  const updateGoal = useCallback(
    (goal: Goal) => {
      updateMoney((current) => ({
        ...current,
        goals: current.goals.map((existing) => (existing.id === goal.id ? goal : existing)),
      }));
    },
    [updateMoney],
  );

  const removeGoal = useCallback(
    (id: string) => {
      updateMoney((current) => ({
        ...current,
        goals: current.goals.filter((goal) => goal.id !== id),
      }));
    },
    [updateMoney],
  );

  const contribute = useCallback(
    (goalId: string, amount: Cents, date: DateKey = toDateKey()) => {
      updateMoney((current) => ({
        ...current,
        goals: current.goals.map((goal) =>
          goal.id === goalId
            ? {
                ...goal,
                contributions: [
                  ...goal.contributions,
                  { id: cryptoId(), date, amount },
                ],
              }
            : goal,
        ),
      }));
    },
    [updateMoney],
  );

  const addHolding = useCallback(
    (holding: Holding) => {
      updateMoney((current) => ({ ...current, holdings: [...current.holdings, holding] }));
    },
    [updateMoney],
  );

  const updateHolding = useCallback(
    (holding: Holding) => {
      updateMoney((current) => ({
        ...current,
        holdings: current.holdings.map((existing) =>
          existing.id === holding.id ? holding : existing,
        ),
      }));
    },
    [updateMoney],
  );

  const removeHolding = useCallback(
    (id: string) => {
      updateMoney((current) => ({
        ...current,
        holdings: current.holdings.filter((holding) => holding.id !== id),
        trades: current.trades.filter((trade) => trade.holdingId !== id),
      }));
    },
    [updateMoney],
  );

  const addTrade = useCallback(
    (trade: Trade) => {
      updateMoney((current) => ({ ...current, trades: [...current.trades, trade] }));
    },
    [updateMoney],
  );

  const removeTrade = useCallback(
    (id: string) => {
      updateMoney((current) => ({
        ...current,
        trades: current.trades.filter((trade) => trade.id !== id),
      }));
    },
    [updateMoney],
  );

  const markPrice = useCallback(
    (holdingId: string, point: PricePoint) => {
      updateMoney((current) => ({
        ...current,
        holdings: current.holdings.map((holding) =>
          holding.id === holdingId
            ? {
                ...holding,
                prices: [
                  ...holding.prices.filter((existing) => existing.date !== point.date),
                  point,
                ].sort((a, b) => a.date.localeCompare(b.date)),
              }
            : holding,
        ),
      }));
    },
    [updateMoney],
  );

  const addRecurring = useCallback(
    (rule: RecurringRule) => {
      updateMoney((current) => ({ ...current, recurring: [...current.recurring, rule] }));
    },
    [updateMoney],
  );

  const updateRecurring = useCallback(
    (rule: RecurringRule) => {
      updateMoney((current) => ({
        ...current,
        recurring: current.recurring.map((existing) =>
          existing.id === rule.id ? rule : existing,
        ),
      }));
    },
    [updateMoney],
  );

  const removeRecurring = useCallback(
    (id: string) => {
      updateMoney((current) => ({
        ...current,
        recurring: current.recurring.filter((rule) => rule.id !== id),
      }));
    },
    [updateMoney],
  );

  const postDue = useCallback(
    (occurrences: DueOccurrence[]) => {
      if (occurrences.length === 0) return;
      updateMoney((current) => {
        const latest = new Map<string, DateKey>();
        for (const occurrence of occurrences) {
          const previous = latest.get(occurrence.rule.id);
          if (!previous || occurrence.date > previous) {
            latest.set(occurrence.rule.id, occurrence.date);
          }
        }
        return {
          ...current,
          transactions: [...current.transactions, ...occurrences.map(transactionFor)],
          recurring: current.recurring.map((rule) => {
            const posted = latest.get(rule.id);
            return posted ? { ...rule, lastPostedDate: posted } : rule;
          }),
        };
      });
    },
    [updateMoney],
  );

  return {
    ready,
    money,
    settings: money.settings,
    currency: money.settings.baseCurrency,
    accounts,
    openAccounts,
    accountMap,
    categories,
    categoryMap,
    rules,
    ledger,
    balanceInputs,
    balances,
    worth,
    liquid,
    portfolio,
    report,
    due,
    currentMonth,
    knownExternalIds,
    updateSettings,
    setRate,
    addAccount,
    updateAccount,
    setArchived,
    deleteAccount,
    setValuation,
    addTransactions,
    updateTransaction,
    removeTransaction,
    removeTransfer,
    transfer,
    categorise,
    addCategory,
    removeRule,
    setBudgetLine,
    removeBudgetLine,
    setBudgetOverride,
    addGoal,
    updateGoal,
    removeGoal,
    contribute,
    addHolding,
    updateHolding,
    removeHolding,
    addTrade,
    removeTrade,
    markPrice,
    addRecurring,
    updateRecurring,
    removeRecurring,
    postDue,
  };
};
