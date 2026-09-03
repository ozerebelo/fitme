"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toDateKey } from "@fitme/core";
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
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, Spinner } from "@/components/ui";
import {
  ChevronRightIcon,
  DumbbellIcon,
  PlusIcon,
  ReceiptIcon,
  RepeatIcon,
  SettingsIcon,
  UploadIcon,
} from "@/components/icons";
import { FlowBars, StatRow } from "@/components/money/charts";
import { Money, useMoneyFormat } from "@/components/money/format";
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

  return (
    <div>
      <PageHeader
        title="Money"
        subtitle={report.headline}
        action={
          <div className="flex gap-2">
            <Link
              href="/"
              aria-label="Back to training"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted hover:text-text"
            >
              <DumbbellIcon className="h-5 w-5" />
            </Link>
            <Link
              href="/money/accounts"
              aria-label="Accounts and money settings"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted hover:text-text"
            >
              <SettingsIcon className="h-5 w-5" />
            </Link>
          </div>
        }
      />

      <div className="space-y-4 px-4">
        {money.accounts.length === 0 ? (
          <EmptyState
            title="Start with one account"
            detail="Add the account your salary lands in. You can import a statement straight after, and everything else — budgets, goals, the portfolio — builds on top of it."
            action={
              <Button variant="primary" onClick={() => setSheet("account")}>
                Add an account
              </Button>
            }
          />
        ) : (
          <>
            <Card>
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                    Net worth
                  </p>
                  <p className="tabular mt-1 text-[32px] font-semibold leading-none">
                    {format.money(worth.total, { round: true })}
                  </p>
                </div>
                {monthChange !== 0 && (
                  <span
                    className={`tabular text-sm ${monthChange > 0 ? "text-ok" : "text-danger"}`}
                  >
                    {monthChange > 0 ? "+" : ""}
                    {format.money(Math.round(monthChange * 100), { round: true })} this month
                  </span>
                )}
              </div>

              {worthPoints.length > 1 && (
                <div className="mt-4">
                  <TrendChart
                    points={worthPoints}
                    height={150}
                    valueLabel="Net worth"
                    seriesLabel="Net worth"
                    format={(value) => format.money(Math.round(value * 100), { round: true })}
                  />
                </div>
              )}

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                <div>
                  <dt className="text-faint">Assets</dt>
                  <dd className="tabular font-medium text-ok">
                    {format.money(worth.assets, { round: true })}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Owed</dt>
                  <dd className="tabular font-medium text-danger">
                    {format.money(worth.liabilities, { round: true })}
                  </dd>
                </div>
              </dl>
            </Card>

            {money.due.length > 0 && (
              <Link href="/money/plan" className="block">
                <Card className="border-warn/40 bg-warn/5 transition-colors hover:border-warn">
                  <div className="flex items-center gap-3">
                    <RepeatIcon className="h-5 w-5 shrink-0 text-warn" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {money.due.length} standing payment
                        {money.due.length === 1 ? "" : "s"} due
                      </p>
                      <p className="truncate text-sm text-muted">
                        {[...new Set(money.due.map((occurrence) => occurrence.rule.name))]
                          .slice(0, 3)
                          .join(", ")}{" "}
                        — post them when they have actually left.
                      </p>
                    </div>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-faint" />
                  </div>
                </Card>
              </Link>
            )}

            <Card>
              <SectionTitle>This month</SectionTitle>
              <StatRow
                stats={[
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
                <div className="mt-4 border-t border-border pt-4">
                  <FlowBars
                    data={flowBars}
                    format={(value) => format.money(Math.round(value * 100), { round: true })}
                  />
                </div>
              )}
            </Card>

            {report.insights.length > 0 && (
              <Link href="/money/plan" className="block">
                <Card className="transition-colors hover:border-faint">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-faint">
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
                      <p className="font-medium">{report.insights[0]!.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
                        {report.insights[0]!.detail}
                      </p>
                    </div>
                    <ChevronRightIcon className="mt-1 h-5 w-5 shrink-0 text-faint" />
                  </div>
                </Card>
              </Link>
            )}

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Add", Icon: PlusIcon, onClick: () => setSheet("transaction"), accent: true },
                { label: "Transfer", Icon: RepeatIcon, onClick: () => setSheet("transfer") },
                { label: "Import", Icon: UploadIcon, onClick: () => setSheet("import") },
                { label: "Spending", Icon: ReceiptIcon, href: "/money/spending" },
              ].map(({ label, Icon, onClick, href, accent }) => {
                const className = `flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center text-[11px] font-medium transition-colors ${
                  accent
                    ? "border-brand/40 bg-brand/10 text-brand hover:bg-brand/15"
                    : "border-border bg-surface text-muted hover:text-text"
                }`;
                return href ? (
                  <Link key={label} href={href} className={className}>
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                ) : (
                  <button key={label} type="button" onClick={onClick} className={className}>
                    <Icon className="h-5 w-5" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div>
              <SectionTitle
                action={
                  <Link href="/money/accounts" className="text-xs text-brand">
                    Manage
                  </Link>
                }
              >
                Accounts
              </SectionTitle>
              <Card className="p-0">
                <ul className="divide-y divide-border">
                  {money.balances
                    .filter(({ account }) => !account.archived)
                    .map(({ account, balance }) => {
                      const used = utilisation(account, balance);
                      return (
                        <li key={account.id}>
                          <Link
                            href={`/money/spending?account=${account.id}`}
                            className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">{account.name}</div>
                              <div className="truncate text-xs text-faint">
                                {account.institution ?? account.kind}
                                {used != null && ` · ${Math.round(used * 100)}% of limit used`}
                              </div>
                            </div>
                            <Money
                              cents={balance}
                              currency={account.currency}
                              className={
                                LIABILITY_KINDS.has(account.kind) || balance < 0
                                  ? "text-danger"
                                  : ""
                              }
                              round
                            />
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </Card>
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
