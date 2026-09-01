"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  MEAL_TYPES,
  cardioKcal,
  dailyNutrition,
  fromDateKey,
  groupByMeal,
  sumEntries,
  toDateKey,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import { RequireProfile } from "@/components/Guard";
import { CalorieRing, MACRO_COLORS, MacroBars } from "@/components/charts";
import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui";
import {
  CameraIcon,
  ChevronRightIcon,
  DumbbellIcon,
  PlusIcon,
  ScaleIcon,
  SettingsIcon,
} from "@/components/icons";
import { weight } from "@/lib/format";

const MEAL_LABELS: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

interface QuickAction {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
  accent?: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  { href: "/food?capture=1", label: "Snap a meal", Icon: CameraIcon, accent: true },
  { href: "/food", label: "Add food", Icon: PlusIcon },
  { href: "/train", label: "Train", Icon: DumbbellIcon },
  { href: "/progress?weigh=1", label: "Weigh in", Icon: ScaleIcon },
];

function Today() {
  const { data, targets, coach, currentWeightKg } = useApp();
  const today = toDateKey();
  const profile = data.profile!;

  const entries = useMemo(
    () => data.entries.filter((e) => e.date === today),
    [data.entries, today],
  );
  const totals = useMemo(() => sumEntries(entries), [entries]);
  const byMeal = useMemo(() => groupByMeal(entries), [entries]);

  const burned = useMemo(
    () => cardioKcal(data.sessions.filter((s) => s.date === today)),
    [data.sessions, today],
  );

  const streak = useMemo(() => {
    const days = dailyNutrition(
      data.entries,
      Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        return toDateKey(d);
      }),
    );
    let count = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i]!.logged) count++;
      else break;
    }
    return count;
  }, [data.entries]);

  const trainedToday = data.sessions.some((s) => s.date === today && s.endedAt);

  return (
    <div>
      <PageHeader
        title={profile.name ? `Hi, ${profile.name}` : "Today"}
        subtitle={fromDateKey(today).toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        action={
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted hover:text-text"
          >
            <SettingsIcon className="h-5 w-5" />
          </Link>
        }
      />

      <div className="space-y-4 px-4">
        <Card>
          <div className="flex items-center gap-5">
            <CalorieRing
              consumed={totals.kcal}
              target={targets.kcal}
              burned={burned}
              size={148}
            />
            <dl className="min-w-0 flex-1 space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Target</dt>
                <dd className="tabular font-medium">{targets.kcal}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Eaten</dt>
                <dd className="tabular font-medium">{Math.round(totals.kcal)}</dd>
              </div>
              {burned > 0 && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Burned</dt>
                  <dd className="tabular font-medium text-brand">+{Math.round(burned)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2 border-t border-border pt-2.5">
                <dt className="text-muted">Weight</dt>
                <dd className="tabular font-medium">
                  {currentWeightKg != null ? weight(currentWeightKg, profile.units) : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <MacroBars
              data={[
                {
                  key: "protein",
                  label: "Protein",
                  value: totals.protein,
                  target: targets.protein,
                  color: MACRO_COLORS.protein,
                },
                {
                  key: "carbs",
                  label: "Carbs",
                  value: totals.carbs,
                  target: targets.carbs,
                  color: MACRO_COLORS.carbs,
                },
                {
                  key: "fat",
                  label: "Fat",
                  value: totals.fat,
                  target: targets.fat,
                  color: MACRO_COLORS.fat,
                },
              ]}
            />
          </div>

          {targets.breakdown.adaptive && (
            <p className="mt-4 rounded-lg bg-brand/10 px-3 py-2 text-xs leading-relaxed text-brand">
              These targets are calibrated to your own measured maintenance, not to a
              formula.
            </p>
          )}
        </Card>

        <div className="grid grid-cols-4 gap-2">
          {QUICK_ACTIONS.map(({ href, label, Icon, accent }) => (
            <Link
              key={label}
              href={href}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center text-[11px] font-medium transition-colors ${
                accent
                  ? "border-brand/40 bg-brand/10 text-brand hover:bg-brand/15"
                  : "border-border bg-surface text-muted hover:text-text"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>

        {coach.insights.length > 0 && (
          <Link href="/coach" className="block">
            <Card className="transition-colors hover:border-faint">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-faint">
                      From your coach
                    </span>
                    <Badge
                      tone={
                        coach.insights[0]!.severity === "critical"
                          ? "danger"
                          : coach.insights[0]!.severity === "warning"
                            ? "warn"
                            : coach.insights[0]!.severity === "success"
                              ? "brand"
                              : "info"
                      }
                    >
                      {coach.insights[0]!.domain}
                    </Badge>
                  </div>
                  <p className="font-medium">{coach.headline}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">
                    {coach.insights[0]!.detail}
                  </p>
                </div>
                <ChevronRightIcon className="mt-1 h-5 w-5 shrink-0 text-faint" />
              </div>
            </Card>
          </Link>
        )}

        {coach.plannedSession && !trainedToday && (
          <Link href="/train" className="block">
            <Card className="transition-colors hover:border-faint">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-wider text-faint">
                    Next session
                  </span>
                  <p className="mt-1 font-medium">{coach.plannedSession.day.name}</p>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {coach.plannedSession.blocks
                      .slice(0, 3)
                      .map((b) => b.exerciseName)
                      .join(" · ")}
                  </p>
                  <p className="mt-1.5 text-xs text-faint">
                    {coach.plannedSession.blocks.length} exercises ·{" "}
                    {coach.plannedSession.estimatedMinutes} min
                  </p>
                </div>
                <ChevronRightIcon className="mt-1 h-5 w-5 shrink-0 text-faint" />
              </div>
            </Card>
          </Link>
        )}

        <div>
          <SectionTitle
            action={
              streak > 1 ? (
                <span className="text-xs text-brand">{streak}-day streak</span>
              ) : undefined
            }
          >
            Today&apos;s food
          </SectionTitle>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {MEAL_TYPES.map((meal) => {
                const mealEntries = byMeal[meal];
                const mealTotals = sumEntries(mealEntries);
                return (
                  <li key={meal}>
                    <Link
                      href={`/food?meal=${meal}`}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{MEAL_LABELS[meal]}</div>
                        <div className="truncate text-sm text-faint">
                          {mealEntries.length === 0
                            ? "Nothing logged"
                            : mealEntries.map((e) => e.name).join(", ")}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular text-sm font-medium">
                          {mealTotals.kcal > 0 ? Math.round(mealTotals.kcal) : ""}
                        </span>
                        <ChevronRightIcon className="h-4 w-4 text-faint" />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <RequireProfile>
      <Today />
    </RequireProfile>
  );
}
