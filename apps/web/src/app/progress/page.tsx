"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { MuscleGroup } from "@fitme/core";
import {
  VOLUME_LANDMARKS,
  adherence,
  buildEnergyPlan,
  classifyVolume,
  cryptoId,
  dailyNutrition,
  estimateAdaptiveTdee,
  fromDateKey,
  isWorkingSet,
  lastNDays,
  personalRecords,
  sessionsInRange,
  setsPerMuscle,
  toDateKey,
  volumeLoad,
  weightTrend,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import { RequireProfile } from "@/components/Guard";
import { RankedBars, TrendChart } from "@/components/charts";
import {
  Button,
  Card,
  EmptyState,
  NumberInput,
  PageHeader,
  Segmented,
  Sheet,
  Spinner,
} from "@/components/ui";
import { ScaleIcon } from "@/components/icons";
import { rate, weight as formatWeight, weightValue } from "@/lib/format";
import { parseWeight } from "@fitme/core";

type Range = "30" | "90" | "365";

function Progress() {
  const params = useSearchParams();
  const { data, targets, exerciseMap, logWeight, currentWeightKg } = useApp();
  const profile = data.profile!;
  const asOf = toDateKey();

  const [range, setRange] = useState<Range>("90");
  const [weighOpen, setWeighOpen] = useState(params.get("weigh") === "1");

  const windowDays = Number(range);
  const trend = useMemo(
    () => weightTrend(data.metrics, { asOf, windowDays }),
    [data.metrics, asOf, windowDays],
  );

  const nutritionDays = useMemo(
    () => dailyNutrition(data.entries, lastNDays(Math.min(windowDays, 90), asOf)),
    [data.entries, asOf, windowDays],
  );

  const stats = useMemo(
    () =>
      adherence(
        data.entries,
        { kcal: targets.kcal, protein: targets.protein },
        { asOf, windowDays: 14 },
      ),
    [data.entries, targets, asOf],
  );

  const adaptive = useMemo(
    () => estimateAdaptiveTdee(data.entries, data.metrics, { asOf }),
    [data.entries, data.metrics, asOf],
  );

  // `targets.breakdown.tdee` becomes the measured value once the adaptive
  // estimate is trusted, so the comparison has to recompute the formula figure.
  const formulaTdee = useMemo(
    () => buildEnergyPlan(profile, currentWeightKg ?? 75, { asOf }).tdee,
    [profile, currentWeightKg, asOf],
  );

  const weeklyVolume = useMemo(() => {
    const days = lastNDays(28, asOf);
    const sessions = sessionsInRange(data.sessions, days);
    const totals = setsPerMuscle(sessions, exerciseMap);
    return (Object.keys(VOLUME_LANDMARKS) as MuscleGroup[])
      .map((muscle) => {
        const perWeek = (totals[muscle] ?? 0) / 4;
        const verdict = classifyVolume(muscle, perWeek);
        return {
          label: muscle,
          value: perWeek,
          marker: VOLUME_LANDMARKS[muscle].mev,
          note:
            verdict === "optimal"
              ? "in range"
              : verdict === "high"
                ? "high"
                : verdict === "excessive"
                  ? "too much"
                  : verdict === "maintaining"
                    ? "maintenance only"
                    : "below minimum",
          color:
            verdict === "optimal"
              ? "var(--color-ok)"
              : verdict === "high"
                ? "var(--color-warn)"
                : verdict === "excessive"
                  ? "var(--color-danger)"
                  : "var(--color-faint)",
        };
      })
      .filter((row) => row.value > 0 || row.label !== "forearms")
      .sort((a, b) => b.value - a.value);
  }, [data.sessions, exerciseMap, asOf]);

  const records = useMemo(
    () => personalRecords(data.sessions.filter((s) => s.endedAt)),
    [data.sessions],
  );

  const trainingSummary = useMemo(() => {
    const days = lastNDays(28, asOf);
    const sessions = sessionsInRange(data.sessions.filter((s) => s.endedAt), days);
    return {
      sessions: sessions.length,
      sets: sessions.reduce((n, s) => n + s.sets.filter(isWorkingSet).length, 0),
      volume: sessions.reduce((n, s) => n + volumeLoad(s.sets), 0),
    };
  }, [data.sessions, asOf]);

  const weightPoints = trend.points.map((p) => ({
    label: fromDateKey(p.date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    raw: weightValue(p.raw, profile.units),
    value: weightValue(p.trend, profile.units),
  }));

  const caloriePoints = nutritionDays
    .filter((d) => d.logged)
    .map((d) => ({
      label: fromDateKey(d.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      value: Math.round(d.totals.kcal),
    }));

  return (
    <div>
      <PageHeader
        title="Progress"
        subtitle={
          currentWeightKg != null
            ? formatWeight(currentWeightKg, profile.units)
            : "No weigh-ins yet"
        }
        action={
          <Button size="sm" onClick={() => setWeighOpen(true)}>
            <ScaleIcon className="h-4 w-4" />
            Weigh in
          </Button>
        }
      />

      <div className="space-y-4 px-4">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "30", label: "30 days" },
            { value: "90", label: "3 months" },
            { value: "365", label: "1 year" },
          ]}
        />

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">Bodyweight</h2>
            {trend.trendKg != null && trend.spanDays >= 7 && (
              <span
                className={`tabular text-sm ${
                  (profile.goal === "lose" && trend.kgPerWeek < 0) ||
                  (profile.goal === "gain" && trend.kgPerWeek > 0)
                    ? "text-brand"
                    : "text-muted"
                }`}
              >
                {rate(trend.kgPerWeek, profile.units)}
              </span>
            )}
          </div>

          {weightPoints.length >= 2 ? (
            <>
              <TrendChart
                points={weightPoints}
                valueLabel={profile.units === "imperial" ? "lb" : "kg"}
              />
              <p className="mt-3 text-xs leading-relaxed text-muted">
                The line is your trend weight — a smoothed average. Day-to-day scale
                readings swing a kilo or two on water, food volume and sodium alone, so the
                trend is the only part worth reacting to.
              </p>
            </>
          ) : (
            <EmptyState
              title="Weigh in a few times"
              detail="Two or three weigh-ins a week is plenty. Same time of day, after the loo, before breakfast — consistency matters far more than frequency."
              action={
                <Button size="sm" onClick={() => setWeighOpen(true)}>
                  Log a weight
                </Button>
              }
            />
          )}
        </Card>

        {adaptive.tdee != null && (
          <Card>
            <h2 className="font-semibold">Your measured maintenance</h2>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="tabular text-3xl font-semibold">{adaptive.tdee}</span>
              <span className="text-sm text-faint">kcal/day</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{adaptive.reason}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
              <div>
                <dt className="text-xs text-faint">Formula estimate</dt>
                <dd className="tabular font-medium">{formulaTdee} kcal</dd>
              </div>
              <div>
                <dt className="text-xs text-faint">Confidence</dt>
                <dd className="tabular font-medium">
                  {Math.round(adaptive.confidence * 100)}%
                </dd>
              </div>
            </dl>
          </Card>
        )}

        <Card>
          <h2 className="mb-3 font-semibold">Calories logged</h2>
          {caloriePoints.length >= 2 ? (
            <TrendChart
              points={caloriePoints}
              valueLabel="kcal"
              color="var(--color-kcal)"
              seriesLabel="Daily total"
              format={(v) => String(Math.round(v))}
            />
          ) : (
            <p className="py-6 text-center text-sm text-muted">
              Log a few days of food to see the pattern.
            </p>
          )}
          <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
            <div>
              <dt className="text-xs text-faint">14-day average</dt>
              <dd className="tabular font-medium">{stats.meanKcal || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Days logged</dt>
              <dd className="tabular font-medium">
                {stats.daysLogged}/{stats.daysConsidered}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Protein hit</dt>
              <dd className="tabular font-medium">
                {Math.round(stats.proteinHitRate * 100)}%
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="font-semibold">Weekly sets per muscle</h2>
          <p className="mb-4 mt-1 text-xs leading-relaxed text-muted">
            Averaged over the last four weeks. The marker on each bar is the minimum weekly
            volume associated with growth — below it you are maintaining, not building.
          </p>
          {weeklyVolume.some((v) => v.value > 0) ? (
            <RankedBars data={weeklyVolume.filter((v) => v.value > 0)} unit="sets" />
          ) : (
            <p className="py-4 text-center text-sm text-muted">
              No training logged in the last four weeks.
            </p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Last four weeks</h2>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-surface-2 p-3">
              <dd className="tabular text-xl font-semibold">{trainingSummary.sessions}</dd>
              <dt className="text-xs text-faint">Sessions</dt>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dd className="tabular text-xl font-semibold">{trainingSummary.sets}</dd>
              <dt className="text-xs text-faint">Working sets</dt>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dd className="tabular text-xl font-semibold">
                {Math.round(trainingSummary.volume / 1000)}t
              </dd>
              <dt className="text-xs text-faint">Volume</dt>
            </div>
          </dl>
        </Card>

        {records.size > 0 && (
          <Card>
            <h2 className="mb-3 font-semibold">Personal records</h2>
            <ul className="divide-y divide-border">
              {[...records.values()]
                .filter((pr) => pr.bestE1RM != null)
                .sort((a, b) => (b.bestE1RM ?? 0) - (a.bestE1RM ?? 0))
                .slice(0, 12)
                .map((pr) => (
                  <li
                    key={pr.exerciseId}
                    className="flex items-baseline justify-between gap-2 py-2.5"
                  >
                    <span className="truncate text-sm font-medium">
                      {exerciseMap.get(pr.exerciseId)?.name ?? pr.exerciseId}
                    </span>
                    <span className="tabular shrink-0 text-sm text-muted">
                      {formatWeight(pr.maxWeightKg, profile.units)} × {pr.maxWeightReps}
                      <span className="ml-2 text-faint">e1RM {pr.bestE1RM}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>
        )}
      </div>

      <WeighInSheet
        open={weighOpen}
        onClose={() => setWeighOpen(false)}
        units={profile.units}
        lastWeightKg={currentWeightKg}
        onSave={(metric) => {
          logWeight(metric);
          setWeighOpen(false);
        }}
      />
    </div>
  );
}

const WeighInSheet = ({
  open,
  onClose,
  units,
  lastWeightKg,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  units: "metric" | "imperial";
  lastWeightKg: number | null;
  onSave: (metric: {
    id: string;
    date: string;
    weightKg: number;
    bodyFatPct?: number;
    waistCm?: number;
  }) => void;
}) => {
  const [value, setValue] = useState(
    lastWeightKg != null ? weightValue(lastWeightKg, units) : 75,
  );
  const [bodyFat, setBodyFat] = useState("");
  const [waist, setWaist] = useState("");

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Weigh in"
      footer={
        <Button
          variant="primary"
          size="lg"
          full
          onClick={() =>
            onSave({
              id: cryptoId(),
              date: toDateKey(),
              weightKg: parseWeight(value, units),
              bodyFatPct: bodyFat ? Number(bodyFat) : undefined,
              waistCm: waist ? Number(waist) : undefined,
            })
          }
        >
          Save
        </Button>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">
            Weight ({units === "imperial" ? "lb" : "kg"})
          </span>
          <NumberInput
            value={value}
            step={0.1}
            autoFocus
            onChange={(e) => setValue(Number(e.target.value))}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">
            Body fat % (optional)
          </span>
          <NumberInput
            value={bodyFat}
            step={0.1}
            onChange={(e) => setBodyFat(e.target.value)}
            placeholder="e.g. 18"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">
            Waist (cm, optional)
          </span>
          <NumberInput
            value={waist}
            step={0.5}
            onChange={(e) => setWaist(e.target.value)}
          />
        </label>

        <p className="rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          Weigh yourself under the same conditions each time — first thing, after the
          toilet, before eating or drinking. A single reading tells you almost nothing; the
          trend across a fortnight tells you everything.
        </p>
      </div>
    </Sheet>
  );
};

export default function ProgressPage() {
  return (
    <RequireProfile>
      <Suspense fallback={<Spinner />}>
        <Progress />
      </Suspense>
    </RequireProfile>
  );
}
