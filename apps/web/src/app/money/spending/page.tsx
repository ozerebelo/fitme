"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDayLabel, toDateKey } from "@fitme/core";
import type { Transaction } from "@fitme/money";
import {
  addMonths,
  filterTransactions,
  groupByDate,
  monthLabel,
  periodBounds,
  periodOf,
  spendingByCategory,
  topPayees,
} from "@fitme/money";
import { useMoney } from "@/lib/money";
import { CategoryBars } from "@/components/money/charts";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  PageHeader,
  SectionTitle,
  Spinner,
  TextInput,
} from "@/components/ui";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  ReceiptIcon,
  UploadIcon,
} from "@/components/icons";
import { Money, useMoneyFormat } from "@/components/money/format";
import { CategorySelect } from "@/components/money/fields";
import { TransactionSheet } from "@/components/money/TransactionSheet";
import { ImportSheet } from "@/components/money/ImportSheet";

/**
 * The ledger.
 *
 * A month at a time, because that is the unit a budget is judged in and the
 * unit people think in. The filters sit in one row above the list, and the
 * uncategorised count is one of them — filing what the rules could not place is
 * the single most useful minute anyone spends in here.
 */
function Spending() {
  const money = useMoney();
  const format = useMoneyFormat();
  const params = useSearchParams();

  const [month, setMonth] = useState(money.currentMonth);
  const [query, setQuery] = useState("");
  const [accountId, setAccountId] = useState(params.get("account") ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [onlyUncategorised, setOnlyUncategorised] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [sheet, setSheet] = useState<"none" | "add" | "edit" | "import">("none");

  const period = periodBounds(month, money.settings.monthStartDay);
  const isCurrentMonth = month === money.currentMonth;

  const visible = useMemo(
    () =>
      filterTransactions(money.money.transactions, {
        from: period.start,
        to: period.end,
        query: query || undefined,
        accountIds: accountId ? [accountId] : undefined,
        categoryIds: categoryId ? [categoryId] : undefined,
        uncategorisedOnly: onlyUncategorised || undefined,
      }),
    [money.money.transactions, period.start, period.end, query, accountId, categoryId, onlyUncategorised],
  );

  const days = useMemo(() => groupByDate(visible, money.ledger), [visible, money.ledger]);

  const uncategorisedCount = useMemo(
    () =>
      filterTransactions(money.money.transactions, {
        from: period.start,
        to: period.end,
        uncategorisedOnly: true,
        direction: "expense",
      }).length,
    [money.money.transactions, period.start, period.end],
  );

  const byCategory = useMemo(
    () => spendingByCategory(visible, money.ledger).filter((row) => row.total > 0).slice(0, 8),
    [visible, money.ledger],
  );

  const payees = useMemo(
    () => topPayees(visible, money.ledger, 5),
    [visible, money.ledger],
  );

  if (!money.ready) return <Spinner label="Loading your data" />;

  if (money.accounts.length === 0) {
    return (
      <div>
        <PageHeader title="Spending" />
        <div className="px-4">
          <EmptyState
            title="No accounts yet"
            detail="Spending is logged against an account, so add one first."
            action={<Button variant="primary" onClick={() => setSheet("add")}>Add an account</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Spending"
        subtitle={`${period.start} to ${period.end}`}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Import a statement"
              onClick={() => setSheet("import")}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted hover:text-text"
            >
              <UploadIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Add a transaction"
              onClick={() => setSheet("add")}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-black"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
        }
      />

      <div className="space-y-4 px-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface p-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(month, -1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium">{monthLabel(month, format.locale)}</span>
          <button
            type="button"
            aria-label="Next month"
            disabled={isCurrentMonth}
            onClick={() => setMonth(addMonths(month, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search payee, note or item"
            aria-label="Search"
          />
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <Chip
              selected={onlyUncategorised}
              onClick={() => setOnlyUncategorised((current) => !current)}
            >
              Uncategorised{uncategorisedCount > 0 ? ` (${uncategorisedCount})` : ""}
            </Chip>
            <Chip selected={!accountId} onClick={() => setAccountId("")}>
              All accounts
            </Chip>
            {money.openAccounts.map((account) => (
              <Chip
                key={account.id}
                selected={accountId === account.id}
                onClick={() => setAccountId(accountId === account.id ? "" : account.id)}
              >
                {account.name}
              </Chip>
            ))}
          </div>
          <CategorySelect
            value={categoryId}
            categories={money.categories}
            onChange={setCategoryId}
            noneLabel="All categories"
            allowNone
          />
        </div>

        {days.length === 0 ? (
          <EmptyState
            title="Nothing here"
            detail={
              query || categoryId || onlyUncategorised
                ? "No transactions match those filters this month."
                : "Add one by hand, describe it in a line, photograph a receipt, or import a statement."
            }
            action={
              <Button variant="primary" onClick={() => setSheet("add")}>
                Add a transaction
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            {days.map((day) => (
              <div key={day.date}>
                <div className="flex items-baseline justify-between px-1 pb-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-faint">
                    {formatDayLabel(day.date, toDateKey())}
                  </span>
                  <Money cents={day.net} tone="muted" signed round className="text-xs" />
                </div>
                <Card className="p-0">
                  <ul className="divide-y divide-border">
                    {day.transactions.map((transaction) => {
                      const category = transaction.categoryId
                        ? money.categoryMap.get(transaction.categoryId)
                        : null;
                      const account = money.accountMap.get(transaction.accountId);
                      return (
                        <li key={transaction.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(transaction);
                              setSheet("edit");
                            }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                          >
                            <span
                              className="h-8 w-1 shrink-0 rounded-full"
                              style={{ background: category?.color ?? "var(--color-border)" }}
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate font-medium">{transaction.payee}</span>
                                {transaction.items && transaction.items.length > 0 && (
                                  <ReceiptIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
                                )}
                              </span>
                              <span className="block truncate text-xs text-faint">
                                {category?.name ?? (transaction.transferId ? "Transfer" : "Uncategorised")}
                                {account ? ` · ${account.name}` : ""}
                              </span>
                            </span>
                            <Money
                              cents={transaction.amount}
                              currency={account?.currency}
                              tone={transaction.transferId ? "muted" : "auto"}
                              signed
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </div>
            ))}
          </div>
        )}

        {byCategory.length > 0 && (
          <div>
            <SectionTitle>Where it went</SectionTitle>
            <Card>
              <CategoryBars
                format={(value) => format.money(value, { round: true })}
                data={byCategory.map((row) => {
                  const category = row.categoryId
                    ? money.categoryMap.get(row.categoryId)
                    : null;
                  return {
                    label: category?.name ?? "Uncategorised",
                    value: row.total,
                    share: row.share,
                    color: category?.color ?? "var(--color-faint)",
                  };
                })}
              />
            </Card>
          </div>
        )}

        {payees.length > 0 && (
          <div>
            <SectionTitle>Most spent with</SectionTitle>
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {payees.map((payee) => (
                  <li
                    key={payee.payee}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{payee.payee}</div>
                      <div className="text-xs text-faint">
                        {payee.count} transaction{payee.count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <Money cents={payee.total} round />
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>

      <TransactionSheet
        open={sheet === "add"}
        onClose={() => setSheet("none")}
        defaultAccountId={accountId || undefined}
      />
      <TransactionSheet
        open={sheet === "edit"}
        editing={editing}
        onClose={() => {
          setSheet("none");
          setEditing(null);
        }}
      />
      <ImportSheet
        open={sheet === "import"}
        onClose={() => setSheet("none")}
        defaultAccountId={accountId || undefined}
      />
    </div>
  );
}

export default function SpendingPage() {
  return (
    <Suspense fallback={<Spinner label="Loading" />}>
      <Spending />
    </Suspense>
  );
}
