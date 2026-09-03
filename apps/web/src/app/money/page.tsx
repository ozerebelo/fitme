"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fromDateKey, toDateKey } from "@fitme/core";
import {
  LIABILITY_KINDS,
  addMonths,
  earliestMonth,
  formatSignedPct,
  monthlyFlow,
  netWorthSeries,
  periodOf,
  shortMonthLabel,
  utilisation,
} from "@fitme/money";
import { useMoney } from "@/lib/money";
import { TrendChart } from "@/components/charts";
import { Badge, Button, Spinner } from "@/components/ui";
import {
  ChevronRightIcon,
  DumbbellIcon,
  PlusIcon,
  ReceiptIcon,
  RepeatIcon,
  SettingsIcon,
  UploadIcon,
} from "@/components/icons";
import { FlowBars } from "@/components/money/charts";
import { Money, useMoneyFormat } from "@/components/money/format";
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
import { ImportSheet } from "@/components/money/ImportSheet";
import { TransactionSheet } from "@/components/money/TransactionSheet";
import { TransferSheet } from "@/components/money/TransferSheet";

export default function MoneyOverviewPage() {
  const money = useMoney();
  const format = useMoneyFormat();
  const [sheet, setSheet] = useState<"none" | "account" | "transaction" | "transfer" | "import">(
    "none",
  );

  const asOf = toDateKey();
  const period = periodOf(asOf, money.settings.monthStartDay);

  const worthPoints = useMemo(() => {
    if (money.accounts.length === 0) return [];
    const first = earliestMonth(money.accounts, money.money.transactions, asOf);
    const from = first > addMonths(period.key, -11) ? first : addMonths(period.key, -11);
    return netWorthSeries(
      money.accounts,
      money.balanceInputs,
      money.settings,
      from,
      period.key,
    ).map((point) => ({
      label: shortMonthLabel(point.month, format.locale),
      value: point.total / 100,
    }));
  }, [money.accounts, money.money.transactions, money.balanceInputs, money.settings, period.key, asOf, format.locale]);

  const flowBars = useMemo(
    () =>
      monthlyFlow(
        money.money.transactions,
        money.ledger,
        addMonths(period.key, -5),
        period.key,
      ).map((month) => ({
        label: shortMonthLabel(month.month, format.locale),
        income: month.income / 100,
        expenses: month.expenses / 100,
      })),
    [money.money.transactions, money.ledger, period.key, format.locale],
  );

  if (!money.ready) return <Spinner label="Loading your data" />;

  const { report, worth } = money;
  const monthChange =
    worthPoints.length > 1
      ? worthPoints[worthPoints.length - 1]!.value - worthPoints[worthPoints.length - 2]!.value
      : 0;
  const dueNames = [...new Set(money.due.map((occurrence) => occurrence.rule.name))];

  return (
    <div>
      <MoneyHeader
        title="Money"
        meta={fromDateKey(asOf).toLocaleDateString(format.locale, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        action={
          <>
            <HeaderButton label="Back to training" href="/">
              <DumbbellIcon className="h-[18px] w-[18px]" />
            </HeaderButton>
            <HeaderButton label="Accounts and money settings" href="/money/accounts">
              <SettingsIcon className="h-[18px] w-[18px]" />
            </HeaderButton>
          </>
        }
      />

      <div className="space-y-3 px-4">
        {money.accounts.length === 0 ? (
          <Empty
            title="Start with one account"
            detail="Add the account your salary lands in. You can import a statement straight after, and everything else — budgets, goals, the portfolio — builds on top of it."
            action={
              <Button variant="primary" size="sm" onClick={() => setSheet("account")}>
                Add an account
              </Button>
            }
          />
        ) : (
          <>
            <Panel>
              <Hero
                label="Net worth"
                value={format.money(worth.total, { round: true })}
                delta={
                  monthChange !== 0
                    ? `${monthChange > 0 ? "+" : ""}${format.money(Math.round(monthChange * 100), { round: true })} this month`
                    : undefined
                }
                deltaTone={monthChange > 0 ? "up" : "down"}
              />

              {worthPoints.length > 1 && (
                <div className="mt-3">
                  <TrendChart
                    points={worthPoints}
                    height={120}
                    valueLabel="Net worth"
                    seriesLabel="Net worth"
                    format={(value) => format.money(Math.round(value * 100), { round: true })}
                  />
                </div>
              )}

              <div className="mt-3 border-t border-border pt-3">
                <Figures
                  items={[
                    {
                      label: "Assets",
                      value: format.money(worth.assets, { round: true }),
                      tone: "up",
                    },
                    {
                      label: "Owed",
                      value: format.money(worth.liabilities, { round: true }),
                      tone: worth.liabilities < 0 ? "down" : undefined,
                    },
                  ]}
                />
              </div>
            </Panel>

            {money.due.length > 0 && (
              <Link href="/money/plan" className="block">
                <Panel className="border-warn/40 bg-warn/5 transition-colors hover:border-warn">
                  <div className="flex items-center gap-2.5">
                    <RepeatIcon className="h-[18px] w-[18px] shrink-0 text-warn" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">
                        {money.due.length} standing payment
                        {money.due.length === 1 ? "" : "s"} due
                      </p>
                      <p className="truncate text-[11px] text-muted">
                        {dueNames.slice(0, 3).join(", ")} — post them when they have left.
                      </p>
                    </div>
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
                  </div>
                </Panel>
              </Link>
            )}

            <Panel>
              <Figures
                items={[
                  { label: "In", value: format.money(report.month.income, { round: true }) },
                  { label: "Out", value: format.money(report.month.expenses, { round: true }) },
                  {
                    label: "Kept",
                    value: format.money(report.month.net, { round: true }),
                    tone: report.month.net >= 0 ? "up" : "down",
                    hint:
                      report.month.savingsRate != null
                        ? `${formatSignedPct(report.month.savingsRate, 0)} of income`
                        : undefined,
                  },
                ]}
              />
              {flowBars.some((bar) => bar.income > 0 || bar.expenses > 0) && (
                <div className="mt-3 border-t border-border pt-3">
                  <FlowBars
                    data={flowBars}
                    height={110}
                    format={(value) => format.money(Math.round(value * 100), { round: true })}
                  />
                </div>
              )}
            </Panel>

            {report.insights.length > 0 && (
              <Link href="/money/plan" className="block">
                <Panel className="transition-colors hover:border-faint">
                  <div className="flex items-start gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                          What stands out
                        </span>
                        <Badge
                          tone={
                            report.insights[0]!.severity === "critical"
                              ? "danger"
                              : report.insights[0]!.severity === "warning"
                                ? "warn"
                                : report.insights[0]!.severity === "success"
                                  ? "brand"
                                  : "info"
                          }
                        >
                          {report.insights[0]!.domain}
                        </Badge>
                      </div>
                      <p className="text-[13px] font-medium">{report.insights[0]!.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted">
                        {report.insights[0]!.detail}
                      </p>
                    </div>
                    <ChevronRightIcon className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
                  </div>
                </Panel>
              </Link>
            )}

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Add", Icon: PlusIcon, onClick: () => setSheet("transaction"), accent: true },
                { label: "Transfer", Icon: RepeatIcon, onClick: () => setSheet("transfer") },
                { label: "Import", Icon: UploadIcon, onClick: () => setSheet("import") },
                { label: "Spending", Icon: ReceiptIcon, href: "/money/spending" },
              ].map(({ label, Icon, onClick, href, accent }) => {
                const className = `flex h-[58px] flex-col items-center justify-center gap-1 rounded-[12px] border text-[11px] font-medium transition-colors ${
                  accent
                    ? "border-brand/40 bg-brand/10 text-brand hover:bg-brand/15"
                    : "border-border bg-surface text-muted hover:text-text"
                }`;
                return href ? (
                  <Link key={label} href={href} className={className}>
                    <Icon className="h-[18px] w-[18px]" />
                    {label}
                  </Link>
                ) : (
                  <button key={label} type="button" onClick={onClick} className={className}>
                    <Icon className="h-[18px] w-[18px]" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div>
              <Label
                action={
                  <Link href="/money/accounts" className="text-[11px] text-brand">
                    Manage
                  </Link>
                }
              >
                Accounts
              </Label>
              <Rows>
                {money.balances
                  .filter(({ account }) => !account.archived)
                  .map(({ account, balance }) => {
                    const used = utilisation(account, balance);
                    return (
                      <Row
                        key={account.id}
                        href={`/money/spending?account=${account.id}`}
                        primary={account.name}
                        secondary={[
                          account.institution ?? account.kind,
                          used != null ? `${Math.round(used * 100)}% of limit` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        value={
                          <Money
                            cents={balance}
                            currency={account.currency}
                            trim
                            className={
                              LIABILITY_KINDS.has(account.kind) || balance < 0
                                ? "text-danger"
                                : ""
                            }
                          />
                        }
                      />
                    );
                  })}
              </Rows>
            </div>
          </>
        )}
      </div>

      <AccountSheet open={sheet === "account"} onClose={() => setSheet("none")} />
      <TransactionSheet open={sheet === "transaction"} onClose={() => setSheet("none")} />
      <TransferSheet open={sheet === "transfer"} onClose={() => setSheet("none")} />
      <ImportSheet open={sheet === "import"} onClose={() => setSheet("none")} />
    </div>
  );
}
