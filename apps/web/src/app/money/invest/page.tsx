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
import { Button, Field, Spinner } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { CompareChart, Donut, SERIES_COLORS } from "@/components/money/charts";
import { Money, useMoneyFormat } from "@/components/money/format";
import { AmountField } from "@/components/money/fields";
import {
  Empty,
  Figures,
  HeaderButton,
  Hero,
  Label,
  MoneyHeader,
  Panel,
  Row,
  Rows,
} from "@/components/money/ui";
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
    () => projectBalance(portfolio.value, monthly ?? 0, money.settings.expectedReturnPct, 120),
    [portfolio.value, monthly, money.settings.expectedReturnPct],
  );

  if (!money.ready) return <Spinner label="Loading your data" />;

  const hasInvestmentAccount = money.openAccounts.some(
    (account) => account.kind === "investment",
  );
  const horizons = [
    { years: 5, point: projection[59] },
    { years: 10, point: projection[119] },
  ];

  return (
    <div>
      <MoneyHeader
        title="Invest"
        meta={
          portfolio.oldestMark
            ? `Marked as of ${portfolio.oldestMark}`
            : "Manual marks, no price feed"
        }
        action={
          <HeaderButton
            label="Add a holding"
            accent
            onClick={() => {
              setEditing(null);
              setSheet(hasInvestmentAccount ? "holding" : "account");
            }}
          >
            <PlusIcon className="h-[18px] w-[18px]" />
          </HeaderButton>
        }
      />

      <div className="space-y-3 px-4">
        {money.money.holdings.length === 0 ? (
          <Empty
            title="Nothing tracked yet"
            detail={
              hasInvestmentAccount
                ? "Add a holding, record what you bought, and mark the price whenever you check it. The app works out cost basis, realised gains and the return your timing actually earned."
                : "Investments live in an investment account. Add one, then add what is inside it."
            }
            action={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setSheet(hasInvestmentAccount ? "holding" : "account")}
              >
                {hasInvestmentAccount ? "Add a holding" : "Add an investment account"}
              </Button>
            }
          />
        ) : (
          <>
            <Panel>
              <Hero
                label="Portfolio"
                value={format.money(portfolio.value, { round: true })}
                delta={
                  portfolio.returnPct != null
                    ? `${format.money(portfolio.totalReturn, { signed: true, round: true })} · ${formatSignedPct(portfolio.returnPct)}`
                    : format.money(portfolio.totalReturn, { signed: true, round: true })
                }
                deltaTone={portfolio.totalReturn >= 0 ? "up" : "down"}
              />

              {series.length > 1 && (
                <div className="mt-3">
                  <CompareChart
                    points={series}
                    height={140}
                    labelA="Value"
                    labelB="Money in"
                    format={(value) => format.money(Math.round(value * 100), { round: true })}
                  />
                </div>
              )}

              <div className="mt-3 border-t border-border pt-3">
                <Figures
                  items={[
                    {
                      label: "Annualised",
                      value:
                        portfolio.annualisedReturn != null
                          ? formatSignedPct(portfolio.annualisedReturn)
                          : "—",
                      tone:
                        portfolio.annualisedReturn == null
                          ? undefined
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
                      hint: "sales, dividends",
                    },
                  ]}
                />
              </div>
            </Panel>

            {portfolio.byKind.length > 1 && (
              <div>
                <Label>What it is made of</Label>
                <Panel>
                  <Donut
                    size={128}
                    total={portfolio.value}
                    format={(value) => format.money(value, { round: true })}
                    slices={portfolio.byKind.map((slice, index) => ({
                      label: HOLDING_KIND_LABELS[slice.kind],
                      value: slice.value,
                      color: SERIES_COLORS[index % SERIES_COLORS.length]!,
                    }))}
                  />
                </Panel>
              </div>
            )}

            <div>
              <Label>Holdings</Label>
              <Rows>
                {[...portfolio.holdings]
                  .sort((a, b) => b.baseValue - a.baseValue)
                  .map((valuation) => (
                    <Row
                      key={valuation.holding.id}
                      onClick={() => {
                        setEditing(valuation.holding);
                        setSheet("holding");
                      }}
                      primary={
                        <span className="flex items-baseline gap-1.5">
                          <span>{valuation.holding.symbol}</span>
                          <span className="truncate text-[11px] font-normal text-faint">
                            {valuation.holding.name}
                          </span>
                        </span>
                      }
                      secondary={`${valuation.position.quantity} @ ${valuation.mark.price || "—"}${
                        valuation.mark.date ? ` · ${valuation.mark.date}` : ""
                      }`}
                      value={
                        <Money
                          cents={valuation.value}
                          currency={valuation.holding.currency}
                          trim
                        />
                      }
                      aside={
                        <span className={valuation.unrealised >= 0 ? "text-ok" : "text-danger"}>
                          {valuation.returnPct != null
                            ? formatSignedPct(valuation.returnPct)
                            : "—"}
                        </span>
                      }
                    />
                  ))}
              </Rows>
            </div>

            <div>
              <Label>If this keeps going</Label>
              <Panel>
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

                <dl className="mt-3 space-y-2 border-t border-border pt-3">
                  {horizons.map(({ years, point }) =>
                    point ? (
                      <div key={years} className="flex items-baseline justify-between gap-3">
                        <dt className="text-[12px] text-faint">In {years} years</dt>
                        <dd className="tabular text-right">
                          <span className="text-[13px] font-medium">
                            {format.money(point.value, { round: true })}
                          </span>
                          <span className="block text-[11px] text-faint">
                            {format.money(point.contributed, { round: true })} in,{" "}
                            {format.money(point.growth, { round: true })} growth
                          </span>
                        </dd>
                      </div>
                    ) : null,
                  )}
                </dl>
              </Panel>
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
