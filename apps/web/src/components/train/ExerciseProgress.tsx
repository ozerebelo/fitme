"use client";

import { useMemo } from "react";
import type { ProgressionStatus, UnitSystem } from "@fitme/core";
import {
  displayWeight,
  e1rmSeries,
  exerciseHistory,
  formatDayLabel,
  fromDateKey,
  personalRecords,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import { TrendChart } from "@/components/charts";
import { Badge, EmptyState, Sheet } from "@/components/ui";
import { unitLabel } from "@/lib/format";

/**
 * One lift, over time.
 *
 * Estimated 1RM is the right series to plot: raw top-set weight ignores that
 * 100 kg for 8 is a better session than 105 kg for 3, and volume load moves
 * with programme changes rather than with strength. It is also the number the
 * progression engine watches, so this chart is literally the evidence behind
 * the prompt on the logging screen.
 */
export const ExerciseProgress = ({
  status,
  onClose,
}: {
  status: ProgressionStatus | null;
  onClose: () => void;
}) => {
  const { data, exerciseMap } = useApp();
  const units: UnitSystem = data.profile?.units ?? "metric";

  const exerciseId = status?.exerciseId;

  const { points, history, record } = useMemo(() => {
    if (!exerciseId) return { points: [], history: [], record: undefined };
    const series = e1rmSeries(data.sessions, exerciseId);
    return {
      points: series.map((p) => ({
        label: fromDateKey(p.date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        value: displayWeight(p.e1rm, units),
      })),
      history: exerciseHistory(data.sessions, exerciseId).slice(-30).reverse(),
      record: personalRecords(data.sessions).get(exerciseId),
    };
  }, [data.sessions, exerciseId, units]);

  if (!status) return null;

  const first = points[0]?.value;
  const latest = points[points.length - 1]?.value;
  const change = first != null && latest != null && first > 0
    ? ((latest - first) / first) * 100
    : null;

  return (
    <Sheet open={!!status} onClose={onClose} title={status.exerciseName}>
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-semibold">{status.headline}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{status.detail}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat
            label="Best e1RM"
            value={record?.bestE1RM != null ? `${displayWeight(record.bestE1RM, units)}` : "—"}
            suffix={unitLabel(units)}
          />
          <Stat
            label="Heaviest"
            value={record ? `${displayWeight(record.maxWeightKg, units)}` : "—"}
            suffix={record ? `× ${record.maxWeightReps}` : ""}
          />
          <Stat label="Sessions" value={String(history.length)} suffix="logged" />
        </div>

        {points.length >= 2 ? (
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Estimated 1RM</h3>
              {change != null && (
                <span
                  className={`tabular text-xs ${change > 0 ? "text-brand" : "text-muted"}`}
                >
                  {change > 0 ? "+" : ""}
                  {change.toFixed(1)}% over {points.length} sessions
                </span>
              )}
            </div>
            <TrendChart
              points={points}
              valueLabel={unitLabel(units)}
              seriesLabel="Estimated 1RM"
            />
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Estimated from the best set of each session, so a heavy triple and a lighter
              set of ten are on the same scale. This is the series the progression prompts
              watch.
            </p>
          </div>
        ) : (
          <EmptyState
            title="Not enough sessions yet"
            detail="Two logged sessions of this lift and the trend appears here."
          />
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold">History</h3>
          <ul className="divide-y divide-border">
            {history.map((entry) => (
              <li key={entry.sessionId} className="flex items-baseline justify-between gap-3 py-2.5">
                <span className="shrink-0 text-xs text-faint">
                  {formatDayLabel(entry.date)}
                </span>
                <span className="tabular min-w-0 flex-1 truncate text-right text-sm">
                  {entry.sets
                    .map((s) => `${displayWeight(s.weightKg, units)}×${s.reps}`)
                    .join(", ")}
                </span>
                {entry.bestE1RM != null && (
                  <Badge>{displayWeight(entry.bestE1RM, units)}</Badge>
                )}
              </li>
            ))}
          </ul>
          {history.length === 0 && (
            <p className="py-4 text-center text-sm text-muted">Nothing logged yet.</p>
          )}
        </div>
      </div>
    </Sheet>
  );
};

const Stat = ({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) => (
  <div className="rounded-lg bg-surface-2 p-3">
    <div className="tabular text-lg font-semibold">{value}</div>
    {suffix && <div className="text-[11px] text-faint">{suffix}</div>}
    <div className="mt-0.5 text-xs text-faint">{label}</div>
  </div>
);
