import {
  DEFAULT_SETTINGS,
  makeAccount,
  makeTransaction,
  type Account,
  type LedgerContext,
  type MoneySettings,
  type Transaction,
} from "../src/index";

export const settings = (patch: Partial<MoneySettings> = {}): MoneySettings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
  locale: "en-GB",
});

export const account = (patch: Partial<Account> = {}): Account => ({
  ...makeAccount({ name: "Current", kind: "current", currency: "EUR" }),
  openedOn: "2025-01-01",
  ...patch,
});

export const ledger = (
  accounts: Account[],
  overrides: Partial<MoneySettings> = {},
): LedgerContext => ({
  accounts: new Map(accounts.map((a) => [a.id, a])),
  settings: settings(overrides),
});

export const tx = (
  accountId: string,
  date: string,
  amount: number,
  payee = "Something",
  categoryId: string | null = null,
): Transaction => ({
  ...makeTransaction({ accountId, date, amount, payee, categoryId }),
  createdAt: `${date}T12:00:00.000Z`,
});

/** €12.34 as cents, so the tests read like the amounts they describe. */
export const eur = (major: number): number => Math.round(major * 100);
