"use client";

import { useEffect, useMemo, useState } from "react";
import { toDateKey } from "@fitme/core";
import type { BudgetStatus, Cents } from "@fitme/money";
import { addMonths, budgetReport, formatPct, monthLabel, suggestBudget } from "@fitme/money";
import { useMoney } from "@/lib/money";
import { Badge, Button, Field, Sheet, Spinner } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { BudgetBar } from "@/components/money/charts";
import { Money, useMoneyFormat } from "@/components/money/format";
import { AmountField, CategorySelect } from "@/components/money/fields";
import {
  Empty,
  HeaderButton,
  Hero,
  Label,
  MoneyHeader,
  Note,
  Panel,
  Row,
  Rows,
  Stepper,
} from "@/components/money/ui";

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

  /**
   * An empty envelope is always red; "over pace" only starts colouring once the
   * month has enough of itself behind it. On the 2nd, every envelope with a
   * standing order in it is technically ahead of pace, and a screen of amber on
   * day two is a screen people learn to ignore.
   */
  const overallTone: "over" | "spent" | "neutral" =
    report.totals.spent >= report.totals.available && report.totals.available > 0
      ? "spent"
      : report.progress >= 0.15 &&
          report.totals.spent > Math.round(report.totals.available * report.progress * 1.08)
        ? "over"
        : "neutral";

  return (
    <div>
      <MoneyHeader
        title="Budget"
        meta={
          report.daysLeft > 0
            ? `${report.daysLeft} day${report.daysLeft === 1 ? "" : "s"} left · ${formatPct(report.progress)} through`
            : "Closed"
        }
        action={
          <HeaderButton label="Budget a category" accent onClick={() => setAdding(true)}>
            <PlusIcon className="h-[18px] w-[18px]" />
          </HeaderButton>
        }
      />

      <div className="space-y-3 px-4">
        <Stepper
          label={monthLabel(month, format.locale)}
          onPrevious={() => setMonth(addMonths(month, -1))}
          onNext={() => setMonth(addMonths(month, 1))}
        />

        {money.money.budget.lines.length === 0 ? (
          <>
            <Empty
              title="No budget yet"
              detail="A budget is a set of limits per category. Start from what you actually spent — it is a far better first guess than a number picked out of the air."
              action={
                suggestions.length > 0 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      for (const suggestion of suggestions) {
                        money.setBudgetLine(suggestion.categoryId, suggestion.limit, false);
                      }
                    }}
                  >
                    Build it from my last 3 months
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
                    Budget a category
                  </Button>
                )
              }
            />
            {suggestions.length > 0 && (
              <div>
                <Label>What that would set</Label>
                <Rows>
                  {suggestions.map((suggestion) => (
                    <Row
                      key={suggestion.categoryId}
                      primary={
                        money.categoryMap.get(suggestion.categoryId)?.name ?? suggestion.categoryId
                      }
                      secondary={`median of ${suggestion.months} month${suggestion.months === 1 ? "" : "s"}`}
                      value={
                        <span className="tabular">
                          {format.money(suggestion.limit, { round: true })}
                        </span>
                      }
                    />
                  ))}
                </Rows>
              </div>
            )}
          </>
        ) : (
          <>
            <Panel>
              <Hero
                label="Left to spend"
                value={format.money(report.totals.remaining, { round: true })}
                delta={
                  report.daysLeft > 0 && report.totals.perDay > 0
                    ? `${format.money(report.totals.perDay, { round: true })} a day`
                    : undefined
                }
              />

              <div className="mt-3">
                <BudgetBar
                  spent={report.totals.spent}
                  available={report.totals.available}
                  expected={Math.round(report.totals.available * report.progress)}
                  color="var(--color-brand)"
                  tone={overallTone}
                />
                <p className="mt-1.5 text-[11px] text-faint">
                  {format.money(report.totals.spent, { round: true })} spent of{" "}
                  {format.money(report.totals.available, { round: true })}
                </p>
              </div>

              {report.unbudgeted > 0 && (
                <div className="mt-3">
                  <Note>
                    {format.money(report.unbudgeted, { round: true })} was spent outside these
                    envelopes
                    {report.uncategorised > 0 &&
                      `, ${format.money(report.uncategorised, { round: true })} of it with no category at all`}
                    .
                  </Note>
                </div>
              )}
            </Panel>

            <div>
              <Label>Envelopes</Label>
              <div className="space-y-2">
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
    <Panel as="section" className="p-3">
      <button type="button" onClick={onEdit} className="w-full text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ background: color }}
              aria-hidden="true"
            />
            <span className="truncate text-[13px] font-medium">{name}</span>
            {line.rollover && line.carry !== 0 && (
              <Badge tone={line.carry > 0 ? "brand" : "warn"}>
                {line.carry > 0 ? "+" : ""}
                {format.money(line.carry, { round: true })}
              </Badge>
            )}
          </span>
          <span className="shrink-0 text-[13px]">
            <Money
              cents={line.remaining}
              round
              className={line.remaining < 0 ? "text-danger" : ""}
            />
            <span className="text-[11px] text-faint"> left</span>
          </span>
        </div>

        <div className="mt-2">
          <BudgetBar
            spent={line.spent}
            available={line.available}
            expected={line.expected}
            color={color}
            tone={
              line.pace === "spent"
                ? "spent"
                : line.pace === "over" && progress >= 0.15
                  ? "over"
                  : "neutral"
            }
          />
        </div>

        <div className="mt-1.5 flex justify-between gap-2 text-[11px] text-faint">
          <span>
            {format.money(line.spent, { round: true })} of{" "}
            {format.money(line.available, { round: true })}
          </span>
          <span className="truncate">
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
    </Panel>
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
