import type { DateKey } from "@fitme/core";
import { cryptoId, toDateKey } from "@fitme/core";
import type {
  Account,
  Category,
  Cents,
  LineItem,
  MoneySettings,
  MonthKey,
  Transaction,
} from "./types";
import { convert, sumCents } from "./money";
import { monthKeyOf, monthRange, type Period } from "./period";
import { normalisePayee } from "./rules";

/**
 * Reading the ledger.
 *
 * Everything here is a pure view over a flat transaction list. Totals are
 * returned in the base currency, because a total that mixes euros and dollars
 * is not a total; individual rows keep the currency they were entered in.
 */

export interface LedgerContext {
  accounts: Map<string, Account>;
  settings: MoneySettings;
}

export const transactionCurrency = (
  transaction: Transaction,
  ctx: LedgerContext,
): string => ctx.accounts.get(transaction.accountId)?.currency ?? ctx.settings.baseCurrency;

/** The amount, converted into the base currency. */
export const baseAmount = (transaction: Transaction, ctx: LedgerContext): Cents =>
  convert(transaction.amount, transactionCurrency(transaction, ctx), ctx.settings);

/* -------------------------------------------------------------------------- */
/*                                  Creation                                  */
/* -------------------------------------------------------------------------- */

export interface TransactionInput {
  accountId: string;
  date?: DateKey;
  amount: Cents;
  payee: string;
  categoryId?: string | null;
  note?: string;
  tags?: string[];
  items?: LineItem[];
  receiptThumb?: string;
  externalId?: string;
  recurrenceId?: string;
  transferId?: string;
  pending?: boolean;
}

export const makeTransaction = (input: TransactionInput): Transaction => ({
  id: cryptoId(),
  accountId: input.accountId,
  date: input.date ?? toDateKey(),
  amount: Math.round(input.amount),
  payee: input.payee.trim(),
  categoryId: input.categoryId ?? null,
  note: input.note,
  tags: input.tags,
  items: input.items,
  receiptThumb: input.receiptThumb,
  externalId: input.externalId,
  recurrenceId: input.recurrenceId,
  transferId: input.transferId,
  pending: input.pending,
  createdAt: new Date().toISOString(),
});

export const makeLineItem = (
  name: string,
  quantity: number,
  unitPrice: Cents,
  categoryId?: string | null,
): LineItem => ({
  id: cryptoId(),
  name: name.trim(),
  quantity,
  unitPrice,
  total: Math.round(unitPrice * quantity),
  categoryId: categoryId ?? null,
});

/**
 * A transfer is two ordinary transactions that know about each other.
 *
 * Modelling it as one row with two account ids would be smaller, but every
 * balance, filter and export would then need a special case, and the day the
 * two sides differ — a fee on the way out, a different currency on the way in —
 * the single row cannot express it. Two legs can.
 */
export const makeTransfer = (input: {
  fromAccountId: string;
  toAccountId: string;
  /** Positive: what leaves the source account. */
  amount: Cents;
  /** What lands, when the accounts differ in currency. Defaults to `amount`. */
  receivedAmount?: Cents;
  date?: DateKey;
  note?: string;
  payee?: string;
}): [Transaction, Transaction] => {
  const transferId = cryptoId();
  const date = input.date ?? toDateKey();
  const magnitude = Math.abs(Math.round(input.amount));
  const received = Math.abs(Math.round(input.receivedAmount ?? magnitude));
  const payee = input.payee ?? "Transfer";

  return [
    makeTransaction({
      accountId: input.fromAccountId,
      date,
      amount: -magnitude,
      payee,
      note: input.note,
      transferId,
    }),
    makeTransaction({
      accountId: input.toAccountId,
      date,
      amount: received,
      payee,
      note: input.note,
      transferId,
    }),
  ];
};

/* -------------------------------------------------------------------------- */
/*                                Classification                              */
/* -------------------------------------------------------------------------- */

export const isTransfer = (transaction: Transaction): boolean => !!transaction.transferId;

/** Money spent: out of an account, and not merely moved to another one. */
export const isExpense = (transaction: Transaction): boolean =>
  !isTransfer(transaction) && transaction.amount < 0;

export const isIncome = (transaction: Transaction): boolean =>
  !isTransfer(transaction) && transaction.amount > 0;

/* -------------------------------------------------------------------------- */
/*                                  Filtering                                 */
/* -------------------------------------------------------------------------- */

export interface TransactionFilter {
  accountIds?: string[];
  categoryIds?: string[];
  from?: DateKey;
  to?: DateKey;
  /** Matched against payee, note and the line items. */
  query?: string;
  /** "expense" | "income" | "transfer" | "all" */
  direction?: "expense" | "income" | "transfer" | "all";
  uncategorisedOnly?: boolean;
  tag?: string;
  minAmount?: Cents;
  maxAmount?: Cents;
}

export const filterTransactions = (
  transactions: Transaction[],
  filter: TransactionFilter,
): Transaction[] => {
  const query = filter.query ? normalisePayee(filter.query) : "";

  return transactions.filter((transaction) => {
    if (filter.from && transaction.date < filter.from) return false;
    if (filter.to && transaction.date > filter.to) return false;
    if (filter.accountIds?.length && !filter.accountIds.includes(transaction.accountId)) {
      return false;
    }
    if (filter.categoryIds?.length) {
      if (!transaction.categoryId || !filter.categoryIds.includes(transaction.categoryId)) {
        return false;
      }
    }
    if (filter.uncategorisedOnly && (transaction.categoryId || isTransfer(transaction))) {
      return false;
    }
    if (filter.tag && !transaction.tags?.includes(filter.tag)) return false;
    if (filter.direction && filter.direction !== "all") {
      if (filter.direction === "expense" && !isExpense(transaction)) return false;
      if (filter.direction === "income" && !isIncome(transaction)) return false;
      if (filter.direction === "transfer" && !isTransfer(transaction)) return false;
    }
    const magnitude = Math.abs(transaction.amount);
    if (filter.minAmount != null && magnitude < filter.minAmount) return false;
    if (filter.maxAmount != null && magnitude > filter.maxAmount) return false;

    if (query) {
      const haystack = normalisePayee(
        [
          transaction.payee,
          transaction.note ?? "",
          ...(transaction.items?.map((item) => item.name) ?? []),
        ].join(" "),
      );
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
};

/** Newest first, and within a day the most recently entered first. */
export const sortTransactions = (transactions: Transaction[]): Transaction[] =>
  [...transactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

export interface DayGroup {
  date: DateKey;
  transactions: Transaction[];
  /** Net for the day, in base currency. */
  net: Cents;
}

export const groupByDate = (
  transactions: Transaction[],
  ctx: LedgerContext,
): DayGroup[] => {
  const map = new Map<DateKey, Transaction[]>();
  for (const transaction of sortTransactions(transactions)) {
    const bucket = map.get(transaction.date);
    if (bucket) bucket.push(transaction);
    else map.set(transaction.date, [transaction]);
  }
  return [...map.entries()].map(([date, items]) => ({
    date,
    transactions: items,
    net: sumCents(items.map((item) => baseAmount(item, ctx))),
  }));
};

/* -------------------------------------------------------------------------- */
/*                                   Totals                                   */
/* -------------------------------------------------------------------------- */

export interface CashFlow {
  income: Cents;
  /** Positive number: what went out. */
  expenses: Cents;
  net: Cents;
}

export const cashFlow = (transactions: Transaction[], ctx: LedgerContext): CashFlow => {
  let income = 0;
  let expenses = 0;
  for (const transaction of transactions) {
    if (isTransfer(transaction)) continue;
    const amount = baseAmount(transaction, ctx);
    if (amount > 0) income += amount;
    else expenses -= amount;
  }
  return { income, expenses, net: income - expenses };
};

export interface CategoryTotal {
  categoryId: string | null;
  /** Positive for spending, negative for income received into the category. */
  total: Cents;
  count: number;
  share: number;
}

/**
 * Spending by category, largest first.
 *
 * Income is not folded in and negated — a category that took €50 in refunds and
 * spent €300 should read as €250 of spending, which is what summing the signed
 * amounts gives, and that is the number a budget is judged against.
 */
export const spendingByCategory = (
  transactions: Transaction[],
  ctx: LedgerContext,
): CategoryTotal[] => {
  const totals = new Map<string | null, { total: Cents; count: number }>();
  for (const transaction of transactions) {
    if (isTransfer(transaction)) continue;
    const key = transaction.categoryId;
    const current = totals.get(key) ?? { total: 0, count: 0 };
    current.total -= baseAmount(transaction, ctx);
    current.count += 1;
    totals.set(key, current);
  }

  const rows = [...totals.entries()]
    .map(([categoryId, value]) => ({ categoryId, ...value, share: 0 }))
    .filter((row) => row.total !== 0);

  const spent = sumCents(rows.filter((row) => row.total > 0).map((row) => row.total));
  for (const row of rows) row.share = spent > 0 ? row.total / spent : 0;

  return rows.sort((a, b) => b.total - a.total);
};

export interface PayeeTotal {
  payee: string;
  total: Cents;
  count: number;
}

export const topPayees = (
  transactions: Transaction[],
  ctx: LedgerContext,
  limit = 8,
): PayeeTotal[] => {
  const totals = new Map<string, PayeeTotal>();
  for (const transaction of transactions) {
    if (!isExpense(transaction)) continue;
    // Grouped on the normalised name, so case and accents do not split a payee
    // in two, but the label is the name as it was actually written. Deliberately
    // not fuzzy beyond that: merging `CONTINENTE 4515` with `CONTINENTE ONLINE`
    // would also merge two unrelated shops that share a first word.
    const key = normalisePayee(transaction.payee) || transaction.payee;
    const current = totals.get(key) ?? { payee: transaction.payee, total: 0, count: 0 };
    current.total -= baseAmount(transaction, ctx);
    current.count += 1;
    totals.set(key, current);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, limit);
};

export interface MonthlyFlow extends CashFlow {
  month: MonthKey;
}

export const monthlyFlow = (
  transactions: Transaction[],
  ctx: LedgerContext,
  from: MonthKey,
  to: MonthKey,
): MonthlyFlow[] => {
  const buckets = new Map<MonthKey, Transaction[]>();
  for (const transaction of transactions) {
    const month = monthKeyOf(transaction.date);
    const bucket = buckets.get(month);
    if (bucket) bucket.push(transaction);
    else buckets.set(month, [transaction]);
  }
  return monthRange(from, to).map((month) => ({
    month,
    ...cashFlow(buckets.get(month) ?? [], ctx),
  }));
};

/** Cumulative spend, day by day — the line a budget's pace is read against. */
export const cumulativeSpend = (
  transactions: Transaction[],
  ctx: LedgerContext,
  period: Period,
): { date: DateKey; spent: Cents }[] => {
  const daily = new Map<DateKey, Cents>();
  for (const transaction of transactions) {
    if (!isExpense(transaction)) continue;
    if (transaction.date < period.start || transaction.date > period.end) continue;
    daily.set(
      transaction.date,
      (daily.get(transaction.date) ?? 0) - baseAmount(transaction, ctx),
    );
  }

  const out: { date: DateKey; spent: Cents }[] = [];
  let running = 0;
  const [year, month, day] = period.start.split("-").map(Number);
  const cursor = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  for (let i = 0; i < period.days; i++) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    running += daily.get(key) ?? 0;
    out.push({ date: key, spent: running });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

/** Spending split by category group — the essentials / lifestyle ratio. */
export const spendingByGroup = (
  transactions: Transaction[],
  ctx: LedgerContext,
  categories: Map<string, Category>,
): Record<Category["group"] | "uncategorised", Cents> => {
  const totals = {
    essentials: 0,
    lifestyle: 0,
    financial: 0,
    income: 0,
    uncategorised: 0,
  };
  for (const transaction of transactions) {
    if (!isExpense(transaction)) continue;
    const amount = -baseAmount(transaction, ctx);
    const group = transaction.categoryId
      ? categories.get(transaction.categoryId)?.group
      : undefined;
    if (group) totals[group] += amount;
    else totals.uncategorised += amount;
  }
  return totals;
};
