"use client";

import { useEffect, useMemo, useState } from "react";
import { toDateKey } from "@fitme/core";
import type { BudgetStatus, Cents } from "@fitme/money";
import {
  addMonths,
  budgetReport,
  formatPct,
  monthLabel,
  suggestBudget,
} from "@fitme/money";
import { useMoney } from "@/lib/money";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  SectionTitle,
  Sheet,
  Spinner,
} from "@/components/ui";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@/components/icons";
import { BudgetBar } from "@/components/money/charts";
import { Money, useMoneyFormat } from "@/components/money/format";
import { AmountField, CategorySelect } from "@/components/money/fields";

/**
 * Envelopes, with the two numbers that make them work: what is left, and what
 * that is per day. "€180 of €400" is a fact; "€12 a day for the next nine days"
 * is a decision someone can act on at the till.
 */
export default function BudgetPage() {
  const money = useMoney();
  const format = useMoneyFormat();
  const [month, setMonth] = useState(money.currentMonth);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const report = useMemo(
    () =>
      budgetReport(
        money.money.budget,
        money.money.transactions,
        money.ledger,
        month,
        toDateKey(),
        money.settings.monthStartDay,
      ),
    [money.money.budget, money.money.transactions, money.ledger, month, money.settings.monthStartDay],
  );

  const suggestions = useMemo(
    () =>
      money.money.budget.lines.length === 0
        ? suggestBudget(
            money.money.transactions,
            money.ledger,
            month,
            3,
            money.settings.monthStartDay,
          ).slice(0, 8)
        : [],
    [money.money.budget.lines.length, money.money.transactions, money.ledger, month, money.settings.monthStartDay],
  );

  if (!money.ready) return <Spinner label="Loading your data" />;

  const overallTone: "over" | "spent" | "neutral" =
    report.totals.spent >= report.totals.available && report.totals.available > 0
      ? "spent"
      : report.totals.spent > Math.round(report.totals.available * report.progress * 1.08)
        ? "over"
        : "neutral";

  return (
    <div>
      <PageHeader
        title="Budget"
        subtitle={
          report.daysLeft > 0
            ? `${report.daysLeft} day${report.daysLeft === 1 ? "" : "s"} left in this one`
            : "Closed"
        }
        action={
          <button
            type="button"
            aria-label="Budget a category"
            onClick={() => setAdding(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-black"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
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
            onClick={() => setMonth(addMonths(month, 1))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        {money.money.budget.lines.length === 0 ? (
          <>
            <EmptyState
              title="No budget yet"
              detail="A budget is a set of limits per category. Start from what you actually spent — it is a far better first guess than a number picked out of the air."
              action={
                suggestions.length > 0 ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      for (const suggestion of suggestions) {
                        money.setBudgetLine(suggestion.categoryId, suggestion.limit, false);
                      }
                    }}
                  >
                    Build it from my last 3 months
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => setAdding(true)}>
                    Budget a category
                  </Button>
                )
              }
            />
            {suggestions.length > 0 && (
              <Card>
                <SectionTitle>What that would set</SectionTitle>
                <ul className="divide-y divide-border">
                  {suggestions.map((suggestion) => (
                    <li
                      key={suggestion.categoryId}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span className="truncate">
                        {money.categoryMap.get(suggestion.categoryId)?.name ?? suggestion.categoryId}
                      </span>
                      <span className="tabular text-muted">
                        {format.money(suggestion.limit, { round: true })}
                        <span className="ml-2 text-xs text-faint">
                          median of {suggestion.months}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        ) : (
          <>
            <Card>
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                    Left to spend
                  </p>
                  <p className="tabular mt-1 text-[32px] font-semibold leading-none">
                    {format.money(report.totals.remaining, { round: true })}
                  </p>
                </div>
                {report.daysLeft > 0 && report.totals.perDay > 0 && (
                  <span className="tabular text-sm text-muted">
                    {format.money(report.totals.perDay, { round: true })} a day
                  </span>
                )}
              </div>

              <div className="mt-4">
                <BudgetBar
                  spent={report.totals.spent}
                  available={report.totals.available}
                  expected={Math.round(report.totals.available * report.progress)}
                  color="var(--color-brand)"
                  tone={overallTone}
                />
                <div className="mt-2 flex justify-between text-xs text-faint">
                  <span>
                    {format.money(report.totals.spent, { round: true })} spent of{" "}
                    {format.money(report.totals.available, { round: true })}
                  </span>
                  <span>{formatPct(report.progress)} through the month</span>
                </div>
              </div>

              {report.unbudgeted > 0 && (
                <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
                  {format.money(report.unbudgeted, { round: true })} was spent outside these
                  envelopes
                  {report.uncategorised > 0 &&
                    `, ${format.money(report.uncategorised, { round: true })} of it with no category at all`}
                  .
                </p>
              )}
            </Card>

            <div>
              <SectionTitle>Envelopes</SectionTitle>
              <div className="space-y-3">
                {report.lines.map((line) => (
                  <BudgetRow
                    key={line.categoryId}
                    line={line}
                    progress={report.progress}
                    name={money.categoryMap.get(line.categoryId)?.name ?? line.categoryId}
                    color={money.categoryMap.get(line.categoryId)?.color ?? "var(--color-brand)"}
                    onEdit={() => setEditing(line.categoryId)}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <BudgetLineSheet
        open={adding || editing != null}
        categoryId={editing}
        month={month}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

const BudgetRow = ({
  line,
  progress,
  name,
  color,
  onEdit,
}: {
  line: BudgetStatus;
  progress: number;
  name: string;
  color: string;
  onEdit: () => void;
}) => {
  const format = useMoneyFormat();
  return (
    <Card as="section">
      <button type="button" onClick={onEdit} className="w-full text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: color }}
              aria-hidden="true"
            />
            <span className="truncate font-medium">{name}</span>
            {line.rollover && line.carry !== 0 && (
              <Badge tone={line.carry > 0 ? "brand" : "warn"}>
                {line.carry > 0 ? "+" : ""}
                {format.money(line.carry, { round: true })} carried
              </Badge>
            )}
          </span>
          <span className="tabular shrink-0 text-sm">
            <Money cents={line.remaining} round />
            <span className="text-faint"> left</span>
          </span>
        </div>

        <div className="mt-2.5">
          <BudgetBar
            spent={line.spent}
            available={line.available}
            expected={line.expected}
            color={color}
            tone={line.pace === "spent" ? "spent" : line.pace === "over" ? "over" : "neutral"}
          />
        </div>

        <div className="mt-2 flex justify-between text-xs text-faint">
          <span>
            {format.money(line.spent, { round: true })} of{" "}
            {format.money(line.available, { round: true })}
          </span>
          <span>
            {line.pace === "spent"
              ? "Envelope empty"
              : line.pace === "over" && progress >= 0.15
                ? `On track for ${format.money(line.projected, { round: true })}`
                : line.perDay > 0
                  ? `${format.money(line.perDay, { round: true })} a day left`
                  : "On pace"}
          </span>
        </div>
      </button>
    </Card>
  );
};

/** Setting a limit, and — separately — changing it for one month only. */
const BudgetLineSheet = ({
  open,
  categoryId,
  month,
  onClose,
}: {
  open: boolean;
  categoryId: string | null;
  month: string;
  onClose: () => void;
}) => {
  const money = useMoney();
  const format = useMoneyFormat();
  const existing = money.money.budget.lines.find((line) => line.categoryId === categoryId);

  const [selected, setSelected] = useState<string | null>(categoryId);
  const [limit, setLimit] = useState<Cents | null>(existing?.limit ?? null);
  const [rollover, setRollover] = useState(existing?.rollover ?? false);
  const [override, setOverride] = useState<Cents | null>(
    categoryId ? (money.money.budget.overrides[month]?.[categoryId] ?? null) : null,
  );

  useEffect(() => {
    if (!open) return;
    const line = money.money.budget.lines.find((entry) => entry.categoryId === categoryId);
    setSelected(categoryId);
    setLimit(line?.limit ?? null);
    setRollover(line?.rollover ?? false);
    setOverride(categoryId ? (money.money.budget.overrides[month]?.[categoryId] ?? null) : null);
  }, [open, categoryId, month, money.money.budget]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={categoryId ? "Edit envelope" : "Budget a category"}
      footer={
        <div className="flex gap-2">
          {categoryId && (
            <Button
              variant="danger"
              onClick={() => {
                money.removeBudgetLine(categoryId);
                onClose();
              }}
            >
              Remove
            </Button>
          )}
          <Button
            variant="primary"
            full
            disabled={!selected || limit == null}
            onClick={() => {
              if (!selected || limit == null) return;
              money.setBudgetLine(selected, limit, rollover);
              money.setBudgetOverride(month, selected, override);
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!categoryId && (
          <Field label="Category">
            <CategorySelect
              value={selected}
              categories={money.categories}
              onChange={setSelected}
              kind="expense"
              allowNone={false}
            />
          </Field>
        )}

        <Field label="Monthly limit">
          <AmountField value={limit} currency={money.currency} onChange={setLimit} autoFocus />
        </Field>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={rollover}
            onChange={(event) => setRollover(event.target.checked)}
            className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]"
          />
          <span>
            Carry the difference into next month
            <span className="mt-0.5 block text-xs leading-relaxed text-faint">
              Right for the irregular ones — clothes, the car, presents. Wrong for rent,
              where the limit is the bill.
            </span>
          </span>
        </label>

        <Field
          label={`Just for ${monthLabel(month, format.locale)}`}
          hint="A different limit for this month only. December is not an ordinary month."
        >
          <AmountField value={override} currency={money.currency} onChange={setOverride} />
        </Field>
      </div>
    </Sheet>
  );
};
