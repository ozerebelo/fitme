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
import { Badge, Button, Spinner } from "@/components/ui";
import { PlusIcon, RepeatIcon, TargetIcon } from "@/components/icons";
import { Money, useMoneyFormat } from "@/components/money/format";
import {
  Empty,
  Figures,
  Label,
  MoneyHeader,
  Panel,
  Row,
  Rows,
} from "@/components/money/ui";
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

  const addAction = (onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-[11px] font-medium text-brand"
    >
      <PlusIcon className="h-3.5 w-3.5" />
      Add
    </button>
  );

  return (
    <div>
      <MoneyHeader title="Plan" meta="The next 30 days, the goals, and the findings" />

      <div className="space-y-3 px-4">
        {money.due.length > 0 && (
          <div>
            <Label>Due now</Label>
            <Panel className="border-warn/40 p-0">
              <ul className="divide-y divide-border">
                {money.due.map((occurrence) => (
                  <Row
                    key={`${occurrence.rule.id}-${occurrence.date}`}
                    primary={occurrence.rule.name}
                    secondary={occurrence.date}
                    value={<Money cents={occurrence.rule.amount} tone="auto" signed trim />}
                  />
                ))}
              </ul>
              <div className="border-t border-border p-3">
                <Button
                  variant="primary"
                  size="sm"
                  full
                  onClick={() => money.postDue(money.due)}
                >
                  Post {money.due.length} payment{money.due.length === 1 ? "" : "s"}
                </Button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                  Post them once they have actually left the account — that is what keeps the
                  balance honest.
                </p>
              </div>
            </Panel>
          </div>
        )}

        {upcoming.length > 0 && (
          <div>
            <Label>The next 30 days</Label>
            <Panel>
              <Figures
                items={[
                  { label: "Committed", value: format.money(committed, { round: true }) },
                  {
                    label: "Lowest point",
                    value: format.money(projection.low?.balance ?? money.liquid, { round: true }),
                    tone: (projection.low?.balance ?? 0) < 0 ? "down" : undefined,
                    hint: projection.low?.date,
                  },
                  { label: "Then", value: format.money(projection.closing, { round: true }) },
                ]}
              />
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {upcoming.slice(0, 8).map((entry) => (
                  <li
                    key={`${entry.ruleId}-${entry.date}`}
                    className="flex items-center justify-between gap-3 py-2 text-[13px]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{entry.name}</span>
                      <span className="block text-[11px] text-faint">{entry.date}</span>
                    </span>
                    <Money cents={entry.amount} tone="auto" signed round />
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}

        <div>
          <Label
            action={addAction(() => {
              setEditingGoal(null);
              setGoalSheet(true);
            })}
          >
            Goals
          </Label>

          {openGoals.length === 0 ? (
            <Empty
              title="Nothing being saved for yet"
              detail="An emergency fund first, then whatever comes after it. With a date on it, the app tells you what it takes a month and when it actually lands at the rate you are going."
              action={
                <Button
                  variant="primary"
                  size="sm"
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
            <div className="space-y-2">
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
                  <Panel key={goal.id} as="section" className="p-3">
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => {
                        setEditingGoal(goal);
                        setGoalSheet(true);
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium">{goal.name}</span>
                          {status.onTrack === false && <Badge tone="warn">behind</Badge>}
                        </span>
                        <span className="tabular shrink-0 text-[13px]">
                          {format.money(status.saved, { round: true })}
                          <span className="text-[11px] text-faint">
                            {" / "}
                            {format.money(goal.target, { round: true })}
                          </span>
                        </span>
                      </div>

                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
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

                      <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                        {status.complete
                          ? "Funded."
                          : status.requiredMonthly != null
                            ? `${format.money(status.requiredMonthly, { round: true })} a month to hit ${goal.targetDate}${
                                status.projectedDate
                                  ? ` · at ${format.money(status.assumedMonthly, { round: true })} a month it lands ${status.projectedDate}`
                                  : ""
                              }`
                            : status.projectedDate
                              ? `At ${format.money(status.assumedMonthly, { round: true })} a month it lands ${status.projectedDate}`
                              : "No date and no rate yet — set one and this becomes a plan."}
                      </p>
                    </button>
                  </Panel>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <Label
            action={addAction(() => {
              setEditingRule(null);
              setPreset(null);
              setRuleSheet(true);
            })}
          >
            Standing payments
          </Label>

          {money.money.recurring.length === 0 ? (
            <Empty
              title="Nothing scheduled"
              detail="Rent, the salary, the insurance. Once they are in, the app can tell you what the month really looks like rather than what today's balance suggests."
              action={
                <Button
                  variant="primary"
                  size="sm"
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
            <Rows>
              {money.money.recurring.map((rule) => (
                <Row
                  key={rule.id}
                  onClick={() => {
                    setEditingRule(rule);
                    setRuleSheet(true);
                  }}
                  primary={rule.name}
                  secondary={[
                    FREQUENCY_LABELS[rule.frequency],
                    rule.active ? `next ${nextOccurrence(rule, asOf) ?? "—"}` : "paused",
                    rule.autoPost ? "posts itself" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  value={<Money cents={rule.amount} tone="auto" signed round />}
                />
              ))}
            </Rows>
          )}
        </div>

        {money.report.subscriptions.length > 0 && (
          <div>
            <Label>Found in your history</Label>
            <Rows>
              {money.report.subscriptions.slice(0, 8).map((subscription) => {
                const known = money.money.recurring.some(
                  (rule) => rule.name.toLowerCase() === subscription.payee.toLowerCase(),
                );
                return (
                  <Row
                    key={subscription.payee}
                    primary={subscription.payee}
                    secondary={`${FREQUENCY_LABELS[subscription.frequency].toLowerCase()} · ${subscription.occurrences} charges · last ${subscription.lastDate}`}
                    value={
                      known ? (
                        <Money cents={subscription.monthlyCost} round />
                      ) : (
                        <span className="flex items-center gap-2">
                          <Money cents={subscription.monthlyCost} round />
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
                        </span>
                      )
                    }
                  />
                );
              })}
            </Rows>
          </div>
        )}

        {money.report.insights.length > 0 && (
          <div>
            <Label>What the numbers say</Label>
            <div className="space-y-2">
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
    <Panel as="section" className="p-3">
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
      <p className="text-[13px] font-medium">{insight.title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">{insight.detail}</p>
      {insight.action && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-brand">{insight.action}</p>
      )}

      {evidence.length > 0 && (
        <div className="mt-2.5 border-t border-border pt-2.5">
          <button
            type="button"
            onClick={() => setShowWorking((current) => !current)}
            className="text-[11px] text-faint hover:text-muted"
          >
            {showWorking ? "Hide the numbers" : "Show the numbers"}
          </button>
          {showWorking && (
            <dl className="mt-2 space-y-1 text-[11px]">
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
    </Panel>
  );
};
