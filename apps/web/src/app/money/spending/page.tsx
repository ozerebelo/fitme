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
  spendingByCategory,
  topPayees,
} from "@fitme/money";
import { useMoney } from "@/lib/money";
import { CategoryBars } from "@/components/money/charts";
import { Button, Spinner, TextInput } from "@/components/ui";
import { PlusIcon, ReceiptIcon, UploadIcon } from "@/components/icons";
import { Money, useMoneyFormat } from "@/components/money/format";
import { CategorySelect } from "@/components/money/fields";
import {
  Empty,
  FilterChip,
  HeaderButton,
  Label,
  MoneyHeader,
  Panel,
  Row,
  Rows,
  Stepper,
  Swatch,
} from "@/components/money/ui";
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

  const payees = useMemo(() => topPayees(visible, money.ledger, 5), [visible, money.ledger]);

  if (!money.ready) return <Spinner label="Loading your data" />;

  if (money.accounts.length === 0) {
    return (
      <div>
        <MoneyHeader title="Spending" />
        <div className="px-4">
          <Empty
            title="No accounts yet"
            detail="Spending is logged against an account, so add one first."
            action={
              <Button variant="primary" size="sm" onClick={() => setSheet("add")}>
                Add an account
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const spentThisMonth = byCategory.reduce((total, row) => total + row.total, 0);

  return (
    <div>
      <MoneyHeader
        title="Spending"
        meta={`${format.money(spentThisMonth, { round: true })} out · ${visible.length} transactions`}
        action={
          <>
            <HeaderButton label="Import a statement" onClick={() => setSheet("import")}>
              <UploadIcon className="h-[18px] w-[18px]" />
            </HeaderButton>
            <HeaderButton label="Add a transaction" accent onClick={() => setSheet("add")}>
              <PlusIcon className="h-[18px] w-[18px]" />
            </HeaderButton>
          </>
        }
      />

      <div className="space-y-3 px-4">
        <Stepper
          label={monthLabel(month, format.locale)}
          onPrevious={() => setMonth(addMonths(month, -1))}
          onNext={() => setMonth(addMonths(month, 1))}
          nextDisabled={isCurrentMonth}
        />

        <div className="space-y-2">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search payee, note or item"
            aria-label="Search"
            className="py-2.5"
          />
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            <FilterChip
              selected={onlyUncategorised}
              onClick={() => setOnlyUncategorised((current) => !current)}
            >
              Uncategorised{uncategorisedCount > 0 ? ` ${uncategorisedCount}` : ""}
            </FilterChip>
            <FilterChip selected={!accountId} onClick={() => setAccountId("")}>
              All accounts
            </FilterChip>
            {money.openAccounts.map((account) => (
              <FilterChip
                key={account.id}
                selected={accountId === account.id}
                onClick={() => setAccountId(accountId === account.id ? "" : account.id)}
              >
                {account.name}
              </FilterChip>
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
          <Empty
            title="Nothing here"
            detail={
              query || categoryId || onlyUncategorised
                ? "No transactions match those filters this month."
                : "Add one by hand, describe it in a line, photograph a receipt, or import a statement."
            }
            action={
              <Button variant="primary" size="sm" onClick={() => setSheet("add")}>
                Add a transaction
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {days.map((day) => (
              <div key={day.date}>
                <Label
                  action={
                    <Money cents={day.net} tone="muted" signed round className="text-[11px]" />
                  }
                >
                  {formatDayLabel(day.date, toDateKey())}
                </Label>
                <Rows>
                  {day.transactions.map((transaction) => {
                    const category = transaction.categoryId
                      ? money.categoryMap.get(transaction.categoryId)
                      : null;
                    const account = money.accountMap.get(transaction.accountId);
                    return (
                      <Row
                        key={transaction.id}
                        onClick={() => {
                          setEditing(transaction);
                          setSheet("edit");
                        }}
                        leading={<Swatch color={category?.color ?? "var(--color-border)"} />}
                        primary={
                          <span className="flex items-center gap-1.5">
                            <span className="truncate">{transaction.payee}</span>
                            {transaction.items && transaction.items.length > 0 && (
                              <ReceiptIcon className="h-3 w-3 shrink-0 text-faint" />
                            )}
                          </span>
                        }
                        secondary={[
                          category?.name ??
                            (transaction.transferId ? "Transfer" : "Uncategorised"),
                          account?.name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        value={
                          <Money
                            cents={transaction.amount}
                            currency={account?.currency}
                            tone={transaction.transferId ? "muted" : "auto"}
                            signed
                            trim
                          />
                        }
                      />
                    );
                  })}
                </Rows>
              </div>
            ))}
          </div>
        )}

        {byCategory.length > 0 && (
          <div>
            <Label>Where it went</Label>
            <Panel>
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
            </Panel>
          </div>
        )}

        {payees.length > 0 && (
          <div>
            <Label>Most spent with</Label>
            <Rows>
              {payees.map((payee) => (
                <Row
                  key={payee.payee}
                  primary={payee.payee}
                  secondary={`${payee.count} transaction${payee.count === 1 ? "" : "s"}`}
                  value={<Money cents={payee.total} trim />}
                />
              ))}
            </Rows>
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
