import type { DateKey } from "@fitme/core";

/**
 * Money is stored in integer minor units — cents, pence — and never as a
 * float. `0.1 + 0.2` is the oldest bug in finance software, and a budget that
 * is out by a cent a month is a budget nobody trusts. Everything in this
 * package takes and returns `Cents`; the only place a decimal appears is at the
 * edges, in parsing and formatting.
 */
export type Cents = number;

/** ISO 4217, uppercase. */
export type CurrencyCode = string;

/** `YYYY-MM`. Budgets, reports and net-worth series are keyed by month. */
export type MonthKey = string;

/* -------------------------------------------------------------------------- */
/*                                  Accounts                                  */
/* -------------------------------------------------------------------------- */

export type AccountKind =
  | "current"
  | "savings"
  | "cash"
  | "credit"
  | "investment"
  | "loan"
  | "asset";

/**
 * Where an account's balance comes from.
 *
 * - `transactions` — opening balance plus everything logged against it. Current
 *   accounts, cards, cash.
 * - `manual` — you say what it is worth and when. A flat, a car, a pension you
 *   can only read once a quarter.
 * - `holdings` — the sum of the securities held in it, marked at their latest
 *   price, plus any uninvested cash logged against it.
 */
export type BalanceMode = "transactions" | "manual" | "holdings";

/** A point-in-time valuation of a manually valued account. */
export interface Valuation {
  date: DateKey;
  value: Cents;
}

export interface Account {
  id: string;
  name: string;
  /** Bank or broker. Free text — this is a personal ledger, not an integration. */
  institution?: string;
  kind: AccountKind;
  /** How its balance is arrived at. Set from the kind, changeable afterwards. */
  balanceMode: BalanceMode;
  currency: CurrencyCode;
  /**
   * What the account held on `openedOn`, before any logged transaction.
   * Signed like every other balance: a loan opens negative.
   */
  openingBalance: Cents;
  openedOn: DateKey;
  /** Newest last. Only meaningful for `manual` accounts. */
  valuations: Valuation[];
  /** Credit cards: the limit, so utilisation can be shown. Positive. */
  creditLimit?: Cents;
  /** Savings APY or loan APR, as a percentage. Drives growth projections. */
  interestRatePct?: number;
  /** Hidden from the pickers and the totals, without losing its history. */
  archived?: boolean;
  /** For an account you track but do not consider yours (a joint pot, say). */
  excludeFromNetWorth?: boolean;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*                                Transactions                                */
/* -------------------------------------------------------------------------- */

/** One line of a receipt. The detail behind a single supermarket total. */
export interface LineItem {
  id: string;
  name: string;
  quantity: number;
  /** Per unit, in the transaction's currency. */
  unitPrice: Cents;
  total: Cents;
  categoryId?: string | null;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: DateKey;
  /**
   * Signed minor units in the account's currency. Negative is money leaving.
   *
   * One sign convention runs through the whole package: a balance is what you
   * hold (positive) or owe (negative), and a transaction moves it. That is why
   * a credit-card purchase and a cash purchase are both negative, and why a
   * mortgage account sits at minus the outstanding principal.
   */
  amount: Cents;
  payee: string;
  categoryId: string | null;
  note?: string;
  tags?: string[];
  /** Both legs of a transfer carry this. Transfers are neither income nor spend. */
  transferId?: string;
  /** Set when posted from a recurring rule, so the rule can find its history. */
  recurrenceId?: string;
  /**
   * Stable identity from an import. Re-importing the same statement is a no-op
   * because this is the identity, not the row order.
   */
  externalId?: string;
  /** Itemised purchase, from a receipt photo or typed in by hand. */
  items?: LineItem[];
  /** Small data URL of the receipt, kept with the transaction. */
  receiptThumb?: string;
  /** Authorised but not yet settled — counted in the balance, flagged in the UI. */
  pending?: boolean;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                                 Categories                                 */
/* -------------------------------------------------------------------------- */

/**
 * Category groups exist to answer one question the individual categories
 * cannot: how much of your spending is committed and how much is discretionary.
 * That ratio is what the runway and savings-rate findings are built on.
 */
export type CategoryGroup = "essentials" | "lifestyle" | "financial" | "income";

export interface Category {
  id: string;
  name: string;
  /** Portuguese name, so imported statements and typed input resolve locally. */
  namePt: string;
  group: CategoryGroup;
  kind: "expense" | "income";
  /** Data-mark colour for the charts. */
  color: string;
  /** False for the ones people add themselves. */
  seed?: boolean;
  archived?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                  Budgets                                   */
/* -------------------------------------------------------------------------- */

export interface BudgetLine {
  categoryId: string;
  /** The ordinary monthly limit. */
  limit: Cents;
  /**
   * Carry what you did not spend into next month, and what you overspent too.
   * Right for irregular categories (clothes, car); wrong for rent, where the
   * limit is the bill.
   */
  rollover: boolean;
}

export interface BudgetPlan {
  lines: BudgetLine[];
  /**
   * Per-month overrides, keyed `YYYY-MM` then category. December is not an
   * ordinary month and pretending otherwise makes the whole budget a fiction.
   */
  overrides: Record<MonthKey, Record<string, Cents>>;
  /** When the plan started. Rollover is accumulated from here, not from ever. */
  startMonth: MonthKey;
}

/* -------------------------------------------------------------------------- */
/*                               Savings goals                                */
/* -------------------------------------------------------------------------- */

export interface Goal {
  id: string;
  name: string;
  target: Cents;
  /** When you want it by. Optional — some pots have no deadline. */
  targetDate?: DateKey;
  /**
   * Progress mirrors this account's balance when set; otherwise the goal is
   * funded by its own contributions. Mirroring is the honest default: a pot you
   * update by hand drifts from the money that is actually there.
   */
  accountId?: string;
  contributions: { id: string; date: DateKey; amount: Cents }[];
  /** What you plan to put in each month, for the projection. */
  monthlyContribution?: Cents;
  currency: CurrencyCode;
  note?: string;
  archived?: boolean;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                                Investments                                 */
/* -------------------------------------------------------------------------- */

export type HoldingKind =
  | "etf"
  | "stock"
  | "fund"
  | "bond"
  | "crypto"
  | "commodity"
  | "other";

/** A manually recorded mark. No price feed — this is an offline-first app. */
export interface PricePoint {
  date: DateKey;
  /** Per unit, in the holding's currency. A float: prices are not money yet. */
  price: number;
}

export interface Holding {
  id: string;
  accountId: string;
  /** Ticker or ISIN if you have one; the name carries the meaning either way. */
  symbol: string;
  name: string;
  kind: HoldingKind;
  currency: CurrencyCode;
  /** Newest last. */
  prices: PricePoint[];
  createdAt: string;
}

export type TradeKind = "buy" | "sell" | "dividend" | "fee" | "split";

export interface Trade {
  id: string;
  holdingId: string;
  date: DateKey;
  kind: TradeKind;
  /** Units bought or sold; for a split, the ratio (2 = two-for-one). */
  quantity: number;
  /** Per unit, at the trade. Zero for dividends, fees and splits. */
  price: number;
  /** Commission and stamp duty. Always a positive number. */
  fee: Cents;
  /**
   * Cash that actually moved, signed from your side: a buy is negative, a sale
   * and a dividend positive. Derived on entry, stored because the arithmetic of
   * a foreign-currency trade is not always price × quantity.
   */
  cash: Cents;
  note?: string;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                            Recurring and rules                             */
/* -------------------------------------------------------------------------- */

export type Frequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export interface RecurringRule {
  id: string;
  name: string;
  accountId: string;
  categoryId: string | null;
  /** Signed, like a transaction: rent is negative, salary positive. */
  amount: Cents;
  frequency: Frequency;
  /** The first occurrence. Every later one is derived from it. */
  anchorDate: DateKey;
  endDate?: DateKey;
  /** Post without asking. Off by default: a bill that did not leave is a lie. */
  autoPost: boolean;
  /** Latest occurrence already turned into a transaction. */
  lastPostedDate?: DateKey;
  active: boolean;
  note?: string;
  createdAt: string;
}

/**
 * A payee-matching rule. Learned by categorising an import, or seeded from the
 * merchant list — the two are the same mechanism, and both are editable.
 */
export interface CategoryRule {
  id: string;
  /** Lowercased substring matched against the payee. */
  match: string;
  categoryId: string;
  source: "seed" | "learned" | "user";
  hits: number;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Settings                                  */
/* -------------------------------------------------------------------------- */

export interface MoneySettings {
  /** Everything is totalled and reported in this currency. */
  baseCurrency: CurrencyCode;
  /**
   * Units of `baseCurrency` per unit of the keyed currency, entered by hand.
   *
   * There is no rate feed, and inventing one would mean either a network
   * dependency in an offline-first app or a stale number presented as live. A
   * rate you typed and dated is at least a rate you know the age of.
   */
  rates: Record<CurrencyCode, { rate: number; asOf: DateKey }>;
  /** Locale used to format amounts. Defaults to the browser's. */
  locale?: string;
  /** The day the month rolls over for budgeting. 1 unless you are paid on the 25th. */
  monthStartDay: number;
  /** Income kept, as a fraction — the target the savings-rate finding judges. */
  savingsRateTarget: number;
  /** Months of essential spending the emergency fund should cover. */
  emergencyFundMonths: number;
  /** Long-run nominal return assumed by the portfolio projection, as a percent. */
  expectedReturnPct: number;
  /** Hide amounts on screen — for using the app in public. */
  privacyMode?: boolean;
}

/* -------------------------------------------------------------------------- */
/*                              The document                                  */
/* -------------------------------------------------------------------------- */

/** Everything the money side stores. One object, so it syncs and exports whole. */
export interface MoneyData {
  accounts: Account[];
  transactions: Transaction[];
  /** User-created categories. The seed catalog is code, not data. */
  categories: Category[];
  budget: BudgetPlan;
  goals: Goal[];
  holdings: Holding[];
  trades: Trade[];
  recurring: RecurringRule[];
  rules: CategoryRule[];
  settings: MoneySettings;
}

/* -------------------------------------------------------------------------- */
/*                                  Insights                                  */
/* -------------------------------------------------------------------------- */

export type MoneyDomain = "spending" | "budget" | "saving" | "investing" | "cashflow";

export type InsightSeverity = "critical" | "warning" | "info" | "success";

export interface MoneyInsight {
  id: string;
  domain: MoneyDomain;
  severity: InsightSeverity;
  title: string;
  detail: string;
  action?: string;
  /** The numbers it came from. An insight you cannot interrogate is a horoscope. */
  evidence?: Record<string, string | number>;
}
