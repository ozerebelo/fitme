"use client";

import { useMemo, useState } from "react";
import { toDateKey } from "@fitme/core";
import type { Cents, Holding } from "@fitme/money";
import {
  HOLDING_KIND_LABELS,
  addMonths,
  earliestMonth,
  formatSignedPct,
  periodOf,
  portfolioSeries,
  projectBalance,
  shortMonthLabel,
} from "@fitme/money";
import { useMoney } from "@/lib/money";
import {
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  SectionTitle,
  Spinner,
} from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { CompareChart, Donut, SERIES_COLORS, StatRow } from "@/components/money/charts";
import { Money, useMoneyFormat } from "@/components/money/format";
import { AmountField } from "@/components/money/fields";
import { AccountSheet } from "@/components/money/AccountSheet";
import { HoldingSheet } from "@/components/money/HoldingSheet";

/**
 * The portfolio.
 *
 * Two numbers do the real work here and both are on the first card: the gap
 * between what it is worth and what you put in, and the annualised return that
 * accounts for *when* you put it in. A fund up 20% means very little if you only
 * bought in December, which is why the headline figure is money-weighted.
 */
export default function InvestPage() {
  const money = useMoney();
  const format = useMoneyFormat();
  const [sheet, setSheet] = useState<"none" | "holding" | "account">("none");
  const [editing, setEditing] = useState<Holding | null>(null);
  const [monthly, setMonthly] = useState<Cents | null>(null);

  const asOf = toDateKey();
  const month = periodOf(asOf, money.settings.monthStartDay).key;
  const { portfolio } = money;

  const series = useMemo(() => {
    if (money.money.holdings.length === 0) return [];
    const first = earliestMonth([], money.money.transactions, asOf);
    const from = money.money.trades.reduce(
      (earliest, trade) => (trade.date.slice(0, 7) < earliest ? trade.date.slice(0, 7) : earliest),
      first,
    );
    const start = from > addMonths(month, -23) ? from : addMonths(month, -23);
    return portfolioSeries(
      money.money.holdings,
      money.money.trades,
      money.settings,
      start,
      month,
    ).map((point) => ({
      label: shortMonthLabel(point.month, format.locale),
      a: point.value / 100,
      b: point.invested / 100,
    }));
  }, [money.money.holdings, money.money.trades, money.money.transactions, money.settings, month, asOf, format.locale]);

  const projection = useMemo(
    () =>
      projectBalance(
        portfolio.value,
        monthly ?? 0,
        money.settings.expectedReturnPct,
        120,
      ),
    [portfolio.value, monthly, money.settings.expectedReturnPct],
  );

  if (!money.ready) return <Spinner label="Loading your data" />;

  const hasInvestmentAccount = money.openAccounts.some(
    (account) => account.kind === "investment",
  );
  const inTenYears = projection[projection.length - 1];

  return (
    <div>
      <PageHeader
        title="Invest"
        subtitle={
          portfolio.oldestMark
            ? `Marked as of ${portfolio.oldestMark}`
            : "Manual marks, no price feed"
        }
        action={
          <button
            type="button"
            aria-label="Add a holding"
            onClick={() => {
              setEditing(null);
              setSheet(hasInvestmentAccount ? "holding" : "account");
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-black"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        }
      />

      <div className="space-y-4 px-4">
        {money.money.holdings.length === 0 ? (
          <EmptyState
            title="Nothing tracked yet"
            detail={
              hasInvestmentAccount
                ? "Add a holding, record what you bought, and mark the price whenever you check it. The app works out cost basis, realised gains and the return your timing actually earned."
                : "Investments live in an investment account. Add one, then add what is inside it."
            }
            action={
              <Button
                variant="primary"
                onClick={() => setSheet(hasInvestmentAccount ? "holding" : "account")}
              >
                {hasInvestmentAccount ? "Add a holding" : "Add an investment account"}
              </Button>
            }
          />
        ) : (
          <>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                Portfolio
              </p>
              <p className="tabular mt-1 text-[32px] font-semibold leading-none">
                {format.money(portfolio.value, { round: true })}
              </p>
              <p className="mt-1.5 text-sm">
                <Money
                  cents={portfolio.totalReturn}
                  tone="auto"
                  signed
                  round
                />
                <span className="text-faint">
                  {portfolio.returnPct != null
                    ? ` · ${formatSignedPct(portfolio.returnPct)} on what went in`
                    : ""}
                </span>
              </p>

              {series.length > 1 && (
                <div className="mt-4">
                  <CompareChart
                    points={series}
                    labelA="Value"
                    labelB="Money in"
                    format={(value) => format.money(Math.round(value * 100), { round: true })}
                  />
                </div>
              )}

              <div className="mt-4 border-t border-border pt-4">
                <StatRow
                  stats={[
                    {
                      label: "Annualised",
                      value:
                        portfolio.annualisedReturn != null
                          ? formatSignedPct(portfolio.annualisedReturn)
                          : "—",
                      tone:
                        portfolio.annualisedReturn == null
                          ? "flat"
                          : portfolio.annualisedReturn >= 0
                            ? "up"
                            : "down",
                      hint: "money-weighted",
                    },
                    {
                      label: "Unrealised",
                      value: format.money(portfolio.unrealised, { round: true }),
                      tone: portfolio.unrealised >= 0 ? "up" : "down",
                    },
                    {
                      label: "Realised",
                      value: format.money(portfolio.realised + portfolio.dividends, {
                        round: true,
                      }),
                      hint: "sales and dividends",
                    },
                  ]}
                />
              </div>
            </Card>

            {portfolio.byKind.length > 1 && (
              <div>
                <SectionTitle>What it is made of</SectionTitle>
                <Card>
                  <Donut
                    total={portfolio.value}
                    format={(value) => format.money(value, { round: true })}
                    slices={portfolio.byKind.map((slice, index) => ({
                      label: HOLDING_KIND_LABELS[slice.kind],
                      value: slice.value,
                      color: SERIES_COLORS[index % SERIES_COLORS.length]!,
                    }))}
                  />
                </Card>
              </div>
            )}

            <div>
              <SectionTitle>Holdings</SectionTitle>
              <Card className="p-0">
                <ul className="divide-y divide-border">
                  {[...portfolio.holdings]
                    .sort((a, b) => b.baseValue - a.baseValue)
                    .map((valuation) => (
                      <li key={valuation.holding.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(valuation.holding);
                            setSheet("holding");
                          }}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{valuation.holding.symbol}</span>
                              <span className="truncate text-xs text-faint">
                                {valuation.holding.name}
                              </span>
                            </div>
                            <div className="tabular text-xs text-faint">
                              {valuation.position.quantity} @{" "}
                              {valuation.mark.price || "—"}
                              {valuation.mark.date ? ` · ${valuation.mark.date}` : ""}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <Money
                              cents={valuation.value}
                              currency={valuation.holding.currency}
                              round
                              className="block"
                            />
                            <span
                              className={`tabular text-xs ${
                                valuation.unrealised >= 0 ? "text-ok" : "text-danger"
                              }`}
                            >
                              {valuation.returnPct != null
                                ? formatSignedPct(valuation.returnPct)
                                : "—"}
                            </span>
                          </div>
                        </button>
                      </li>
                    ))}
                </ul>
              </Card>
            </div>

            <div>
              <SectionTitle>If this keeps going</SectionTitle>
              <Card>
                <Field
                  label="Adding each month"
                  hint={`Compounded monthly at ${money.settings.expectedReturnPct}% a year — an assumption, not a forecast. Change it in Settings.`}
                >
                  <AmountField
                    value={monthly}
                    currency={money.currency}
                    onChange={setMonthly}
                    placeholder="200"
                  />
                </Field>

                {inTenYears && (
                  <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
                    {[
                      { years: 5, point: projection[59] },
                      { years: 10, point: inTenYears },
                    ].map(({ years, point }) =>
                      point ? (
                        <div key={years} className="col-span-3 flex justify-between gap-3">
                          <dt className="text-faint">In {years} years</dt>
                          <dd className="tabular text-right">
                            <span className="font-medium">
                              {format.money(point.value, { round: true })}
                            </span>
                            <span className="block text-xs text-faint">
                              {format.money(point.contributed, { round: true })} in,{" "}
                              {format.money(point.growth, { round: true })} growth
                            </span>
                          </dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                )}
              </Card>
            </div>
          </>
        )}
      </div>

      <HoldingSheet
        open={sheet === "holding"}
        editing={editing}
        onClose={() => {
          setSheet("none");
          setEditing(null);
        }}
      />
      <AccountSheet open={sheet === "account"} onClose={() => setSheet("none")} />
    </div>
  );
}
