"use client";

import { useMemo, useState } from "react";
import { addDays, toDateKey } from "@fitme/core";
import type { DetectedSubscription, Goal, MoneyInsight, RecurringRule } from "@fitme/money";
import {
  FREQUENCY_LABELS,
  convert,
  forecast,
  goalStatus,
  nextOccurrence,
  projectCashFlow,
} from "@fitme/money";
import { useMoney } from "@/lib/money";
import { Badge, Button, Card, EmptyState, PageHeader, SectionTitle, Spinner } from "@/components/ui";
import { PlusIcon, RepeatIcon, TargetIcon } from "@/components/icons";
import { Money, useMoneyFormat } from "@/components/money/format";
import { GoalSheet } from "@/components/money/GoalSheet";
import { RecurringSheet } from "@/components/money/RecurringSheet";

/**
 * What is coming, what you are saving for, and what the numbers say about both.
 *
 * The order is deliberate: the payments due this week come first, because they
 * are the only thing on this page that is already decided.
 */
export default function PlanPage() {
  const money = useMoney();
  const format = useMoneyFormat();

  const [goalSheet, setGoalSheet] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [ruleSheet, setRuleSheet] = useState(false);
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);
  const [preset, setPreset] = useState<DetectedSubscription | null>(null);

  const asOf = toDateKey();
  const horizon = addDays(asOf, 30);

  const upcoming = useMemo(
    () => forecast(money.money.recurring, addDays(asOf, 1), horizon),
    [money.money.recurring, asOf, horizon],
  );

  const projection = useMemo(
    () => projectCashFlow(money.liquid, upcoming, addDays(asOf, 1), horizon),
    [money.liquid, upcoming, asOf, horizon],
  );

  if (!money.ready) return <Spinner label="Loading your data" />;

  const openGoals = money.money.goals.filter((goal) => !goal.archived);
  const committed = upcoming
    .filter((entry) => entry.amount < 0)
    .reduce((total, entry) => total - entry.amount, 0);

  return (
    <div>
      <PageHeader title="Plan" subtitle={money.report.headline} />

      <div className="space-y-4 px-4">
        {money.due.length > 0 && (
          <Card className="border-warn/40">
            <SectionTitle>Due now</SectionTitle>
            <ul className="divide-y divide-border">
              {money.due.map((occurrence) => (
                <li
                  key={`${occurrence.rule.id}-${occurrence.date}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{occurrence.rule.name}</div>
                    <div className="text-xs text-faint">{occurrence.date}</div>
                  </div>
                  <Money cents={occurrence.rule.amount} tone="auto" signed />
                </li>
              ))}
            </ul>
            <Button variant="primary" full className="mt-3" onClick={() => money.postDue(money.due)}>
              Post {money.due.length} payment{money.due.length === 1 ? "" : "s"}
            </Button>
            <p className="mt-2 text-xs leading-relaxed text-faint">
              Post them once they have actually left the account — that is what keeps the
              balance honest.
            </p>
          </Card>
        )}

        {upcoming.length > 0 && (
          <Card>
            <SectionTitle>The next 30 days</SectionTitle>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">Committed</dt>
                <dd className="tabular mt-1 font-semibold">
                  {format.money(committed, { round: true })}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">Lowest point</dt>
                <dd
                  className={`tabular mt-1 font-semibold ${
                    (projection.low?.balance ?? 0) < 0 ? "text-danger" : ""
                  }`}
                >
                  {format.money(projection.low?.balance ?? money.liquid, { round: true })}
                </dd>
                {projection.low && (
                  <p className="text-[11px] text-faint">{projection.low.date}</p>
                )}
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wider text-faint">Then</dt>
                <dd className="tabular mt-1 font-semibold">
                  {format.money(projection.closing, { round: true })}
                </dd>
              </div>
            </dl>

            <ul className="mt-4 divide-y divide-border border-t border-border">
              {upcoming.slice(0, 8).map((entry) => (
                <li
                  key={`${entry.ruleId}-${entry.date}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate">{entry.name}</div>
                    <div className="text-xs text-faint">{entry.date}</div>
                  </div>
                  <Money cents={entry.amount} tone="auto" signed round />
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div>
          <SectionTitle
            action={
              <button
                type="button"
                onClick={() => {
                  setEditingGoal(null);
                  setGoalSheet(true);
                }}
                className="flex items-center gap-1 text-xs text-brand"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add
              </button>
            }
          >
            Goals
          </SectionTitle>

          {openGoals.length === 0 ? (
            <EmptyState
              title="Nothing being saved for yet"
              detail="An emergency fund first, then whatever comes after it. With a date on it, the app tells you what it takes a month and when it actually lands at the rate you are going."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setEditingGoal(null);
                    setGoalSheet(true);
                  }}
                >
                  <TargetIcon className="h-4 w-4" />
                  Set a goal
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {openGoals.map((goal) => {
                const linked = goal.accountId
                  ? money.balances.find(({ account }) => account.id === goal.accountId)
                  : undefined;
                const status = goalStatus(
                  goal,
                  linked
                    ? convert(linked.balance, linked.account.currency, money.settings)
                    : undefined,
                  asOf,
                );
                return (
                  <Card key={goal.id} as="section">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => {
                        setEditingGoal(goal);
                        setGoalSheet(true);
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{goal.name}</span>
                        <span className="tabular shrink-0 text-sm">
                          {format.money(status.saved, { round: true })}
                          <span className="text-faint">
                            {" / "}
                            {format.money(goal.target, { round: true })}
                          </span>
                        </span>
                      </div>

                      <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full transition-[width] duration-300"
                          style={{
                            width: `${status.progress * 100}%`,
                            background: status.complete
                              ? "var(--color-ok)"
                              : "var(--color-series-1)",
                          }}
                        />
                      </div>

                      <p className="mt-2 text-xs text-faint">
                        {status.complete
                          ? "Funded."
                          : status.requiredMonthly != null
                            ? `${format.money(status.requiredMonthly, { round: true })} a month to hit ${goal.targetDate}${
                                status.projectedDate
                                  ? ` · on the current ${format.money(status.assumedMonthly, { round: true })} a month it lands ${status.projectedDate}`
                                  : ""
                              }`
                            : status.projectedDate
                              ? `At ${format.money(status.assumedMonthly, { round: true })} a month it lands ${status.projectedDate}`
                              : "No date and no rate yet — set one and this becomes a plan."}
                      </p>

                      {status.onTrack === false && (
                        <Badge tone="warn">Behind the date you set</Badge>
                      )}
                    </button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <SectionTitle
            action={
              <button
                type="button"
                onClick={() => {
                  setEditingRule(null);
                  setPreset(null);
                  setRuleSheet(true);
                }}
                className="flex items-center gap-1 text-xs text-brand"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add
              </button>
            }
          >
            Standing payments
          </SectionTitle>

          {money.money.recurring.length === 0 ? (
            <EmptyState
              title="Nothing scheduled"
              detail="Rent, the salary, the insurance. Once they are in, the app can tell you what the month really looks like rather than what today's balance suggests."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setEditingRule(null);
                    setPreset(null);
                    setRuleSheet(true);
                  }}
                >
                  <RepeatIcon className="h-4 w-4" />
                  Add one
                </Button>
              }
            />
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {money.money.recurring.map((rule) => (
                  <li key={rule.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRule(rule);
                        setRuleSheet(true);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{rule.name}</div>
                        <div className="text-xs text-faint">
                          {FREQUENCY_LABELS[rule.frequency]}
                          {rule.active
                            ? ` · next ${nextOccurrence(rule, asOf) ?? "—"}`
                            : " · paused"}
                          {rule.autoPost ? " · posts itself" : ""}
                        </div>
                      </div>
                      <Money cents={rule.amount} tone="auto" signed round />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {money.report.subscriptions.length > 0 && (
          <div>
            <SectionTitle>Found in your history</SectionTitle>
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {money.report.subscriptions.slice(0, 8).map((subscription) => {
                  const known = money.money.recurring.some(
                    (rule) => rule.name.toLowerCase() === subscription.payee.toLowerCase(),
                  );
                  return (
                    <li
                      key={subscription.payee}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{subscription.payee}</div>
                        <div className="text-xs text-faint">
                          {FREQUENCY_LABELS[subscription.frequency].toLowerCase()} ·{" "}
                          {subscription.occurrences} charges · last {subscription.lastDate}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Money cents={subscription.monthlyCost} round className="text-sm" />
                        {!known && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setEditingRule(null);
                              setPreset(subscription);
                              setRuleSheet(true);
                            }}
                          >
                            Track
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        )}

        {money.report.insights.length > 0 && (
          <div>
            <SectionTitle>What the numbers say</SectionTitle>
            <div className="space-y-3">
              {money.report.insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          </div>
        )}
      </div>

      <GoalSheet
        open={goalSheet}
        editing={editingGoal}
        onClose={() => {
          setGoalSheet(false);
          setEditingGoal(null);
        }}
      />
      <RecurringSheet
        open={ruleSheet}
        editing={editingRule}
        preset={
          preset
            ? {
                name: preset.payee,
                amount: preset.amount,
                frequency: preset.frequency,
                categoryId: preset.categoryId,
              }
            : null
        }
        onClose={() => {
          setRuleSheet(false);
          setEditingRule(null);
          setPreset(null);
        }}
      />
    </div>
  );
}

/** A finding, with the numbers behind it one tap away. */
const InsightCard = ({ insight }: { insight: MoneyInsight }) => {
  const [showWorking, setShowWorking] = useState(false);
  const evidence = Object.entries(insight.evidence ?? {});

  return (
    <Card as="section">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Badge
              tone={
                insight.severity === "critical"
                  ? "danger"
                  : insight.severity === "warning"
                    ? "warn"
                    : insight.severity === "success"
                      ? "brand"
                      : "info"
              }
            >
              {insight.domain}
            </Badge>
          </div>
          <p className="font-medium">{insight.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">{insight.detail}</p>
          {insight.action && (
            <p className="mt-2 text-sm leading-relaxed text-brand">{insight.action}</p>
          )}
        </div>
      </div>

      {evidence.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowWorking((current) => !current)}
            className="text-xs text-faint hover:text-muted"
          >
            {showWorking ? "Hide the numbers" : "Show the numbers"}
          </button>
          {showWorking && (
            <dl className="mt-2 space-y-1 text-xs">
              {evidence.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-faint">{label}</dt>
                  <dd className="tabular">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </Card>
  );
};
