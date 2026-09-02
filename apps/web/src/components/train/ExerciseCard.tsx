"use client";

import { useState } from "react";
import type {
  Exercise,
  PersonalRecord,
  ProgressionState,
  ProgressionStatus,
  SetLog,
  UnitSystem,
} from "@fitme/core";
import {
  cryptoId,
  displayWeight,
  parseWeight,
  prsBrokenBy,
  setE1RM,
} from "@fitme/core";
import { clsx, unitLabel } from "@/lib/format";
import { Badge } from "@/components/ui";
import { CheckIcon, PlusIcon, TrophyIcon } from "@/components/icons";

export interface PreviousSet {
  weightKg: number;
  reps: number;
}

/**
 * One exercise inside an active session.
 *
 * The layout is built around a single question the user asks between sets:
 * "what did I do last time?" — so the previous performance sits inline on every
 * row rather than behind a tap. Completing a set is the only large target on
 * the row, because it is the only thing done mid-set with shaky hands.
 */
export const ExerciseCard = ({
  exercise,
  sets,
  previous,
  record,
  units,
  progression,
  onChange,
  onAddSet,
  onCompleteSet,
  onOpenMenu,
  onApplyWeight,
}: {
  exercise: Exercise;
  sets: SetLog[];
  previous: PreviousSet[];
  record: PersonalRecord | undefined;
  units: UnitSystem;
  progression?: ProgressionStatus;
  onChange: (setId: string, patch: Partial<SetLog>) => void;
  onAddSet: (set: SetLog) => void;
  onCompleteSet: (set: SetLog) => void;
  onOpenMenu: () => void;
  onApplyWeight: (weightKg: number) => void;
}) => {
  const [showRpe, setShowRpe] = useState(sets.some((s) => s.rpe != null));

  const addSet = (): void => {
    const last = sets[sets.length - 1];
    const template = last ?? previous[sets.length];
    onAddSet({
      id: cryptoId(),
      exerciseId: exercise.id,
      // A new set inherits the last one's load — the overwhelmingly common case.
      weightKg: template?.weightKg ?? 0,
      reps: template?.reps ?? (exercise.defaultRepRange?.[1] ?? 8),
      completed: false,
    });
  };

  return (
    <section className="rounded-[16px] border border-border bg-surface">
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{exercise.name}</h3>
          <p className="mt-0.5 truncate text-xs text-faint">
            {exercise.primary.join(" · ")}
            {record?.bestE1RM != null && ` · best e1RM ${record.bestE1RM} kg`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setShowRpe((v) => !v)}
            className={clsx(
              "rounded-lg border px-2 py-1 text-[11px] font-semibold",
              showRpe ? "border-brand text-brand" : "border-border text-faint",
            )}
            aria-pressed={showRpe}
          >
            RPE
          </button>
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label={`Options for ${exercise.name}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ⋯
            </span>
          </button>
        </div>
      </header>

      {progression && progression.state !== "new" && (
        <ProgressionBanner
          status={progression}
          units={units}
          alreadyAtSuggestion={
            progression.suggestedWeightKg != null &&
            sets.length > 0 &&
            sets.every((s) => Math.abs(s.weightKg - progression.suggestedWeightKg!) < 0.01)
          }
          onApply={() =>
            progression.suggestedWeightKg != null && onApplyWeight(progression.suggestedWeightKg)
          }
        />
      )}

      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
          <span className="w-7 text-center">Set</span>
          <span className="min-w-0 flex-1">Previous</span>
          <span className="w-16 text-center">{unitLabel(units)}</span>
          <span className="w-13 text-center">Reps</span>
          {showRpe && <span className="w-11 text-center">RPE</span>}
          <span className="w-9" />
        </div>

        <ul className="space-y-1.5">
          {sets.map((set, index) => {
            const prev = previous[index];
            const broken = set.completed ? prsBrokenBy(set, record) : [];
            const e1rm = setE1RM(set);

            return (
              <li key={set.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onChange(set.id, { isWarmup: !set.isWarmup })}
                  aria-label={set.isWarmup ? "Mark as working set" : "Mark as warm-up"}
                  className={clsx(
                    "tabular h-11 w-7 shrink-0 rounded-lg text-sm font-semibold",
                    set.isWarmup ? "text-warn" : "text-faint",
                  )}
                >
                  {set.isWarmup ? "W" : index + 1 - sets.slice(0, index).filter((s) => s.isWarmup).length}
                </button>

                <span className="tabular min-w-0 flex-1 truncate text-xs text-faint">
                  {prev ? `${displayWeight(prev.weightKg, units)} × ${prev.reps}` : "—"}
                </span>

                <NumberCell
                  value={displayWeight(set.weightKg, units)}
                  onCommit={(value) =>
                    onChange(set.id, { weightKg: parseWeight(value, units) })
                  }
                  className="w-16"
                  step={0.5}
                  completed={set.completed}
                />

                <NumberCell
                  value={set.reps}
                  onCommit={(value) => onChange(set.id, { reps: Math.max(0, Math.round(value)) })}
                  className="w-13"
                  completed={set.completed}
                />

                {showRpe && (
                  <NumberCell
                    value={set.rpe ?? 0}
                    placeholder="—"
                    onCommit={(value) =>
                      onChange(set.id, { rpe: value >= 5 && value <= 10 ? value : undefined })
                    }
                    className="w-11"
                    step={0.5}
                    completed={set.completed}
                  />
                )}

                <button
                  type="button"
                  aria-label={set.completed ? `Set ${index + 1} done` : `Complete set ${index + 1}`}
                  aria-pressed={set.completed}
                  onClick={() => {
                    if (set.completed) onChange(set.id, { completed: false });
                    else onCompleteSet(set);
                  }}
                  className={clsx(
                    "flex h-11 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    set.completed
                      ? "border-brand bg-brand text-black"
                      : "border-border text-faint hover:border-faint",
                  )}
                >
                  <CheckIcon className="h-5 w-5" />
                </button>

                {broken.length > 0 && (
                  <span className="sr-only">Personal record: {broken.join(", ")}</span>
                )}
              </li>
            );
          })}
        </ul>

        {sets.some((s) => s.completed && prsBrokenBy(s, record).length > 0) && (
          <div className="mt-2 flex items-center gap-1.5 px-1">
            <TrophyIcon className="h-4 w-4 text-brand" />
            <Badge tone="brand">Personal record</Badge>
          </div>
        )}

        {sets.some((s) => s.completed && setE1RM(s) != null) && (
          <p className="tabular mt-2 px-1 text-xs text-faint">
            Best estimated 1RM this session:{" "}
            {Math.max(
              ...sets.map((s) => setE1RM(s) ?? 0).filter((v) => v > 0),
            ).toFixed(1)}{" "}
            kg
          </p>
        )}

        <button
          type="button"
          onClick={addSet}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-sm font-medium text-muted hover:border-faint hover:text-text"
        >
          <PlusIcon className="h-4 w-4" />
          Add set
        </button>
      </div>
    </section>
  );
};

const STATE_STYLE: Record<
  Exclude<ProgressionState, "new">,
  { border: string; text: string; label: string }
> = {
  ready: { border: "border-brand/40 bg-brand/10", text: "text-brand", label: "Ready" },
  building: { border: "border-border bg-surface-2", text: "text-muted", label: "Building" },
  stalled: { border: "border-warn/40 bg-warn/10", text: "text-warn", label: "Stalled" },
  deload: { border: "border-warn/40 bg-warn/10", text: "text-warn", label: "Back off" },
};

/**
 * The progressive-overload prompt.
 *
 * It sits directly above the set rows because that is where the decision is
 * made — between racking the previous set and loading the bar. Working out
 * "did I clear the range last time?" from a history screen is exactly the
 * friction that leaves people at the same weight for months.
 */
const ProgressionBanner = ({
  status,
  units,
  alreadyAtSuggestion,
  onApply,
}: {
  status: ProgressionStatus;
  units: UnitSystem;
  alreadyAtSuggestion: boolean;
  onApply: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const style = STATE_STYLE[status.state as Exclude<ProgressionState, "new">];
  const suggestion = status.suggestedWeightKg;
  const showApply = suggestion != null && !alreadyAtSuggestion;

  return (
    <div className={clsx("mx-3 mt-3 rounded-xl border p-3", style.border)}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <span className={clsx("block text-sm font-semibold", style.text)}>
            {status.headline}
          </span>
          <span className="mt-0.5 block text-xs text-faint">
            {status.lastSets.length > 0
              ? `Last: ${displayWeight(status.lastSets[0]!.weightKg, units)} ${unitLabel(units)} × ${status.lastSets.map((s) => s.reps).join(", ")}`
              : "No previous sets"}
            {" · target "}
            {status.range[0]}–{status.range[1]}
            {expanded ? "" : " · why?"}
          </span>
        </button>

        {showApply && (
          <button
            type="button"
            onClick={onApply}
            className="tabular shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-black"
          >
            Use {displayWeight(suggestion, units)}
          </button>
        )}
      </div>

      {expanded && (
        <p className="mt-2 border-t border-border/60 pt-2 text-xs leading-relaxed text-muted">
          {status.detail}
        </p>
      )}
    </div>
  );
};

/**
 * A numeric cell that keeps its own draft while focused.
 *
 * Committing on every keystroke makes partially-typed values ("1" on the way to
 * "100") land in stored data and fight the user's cursor; committing on blur
 * does not.
 */
const NumberCell = ({
  value,
  onCommit,
  className,
  step = 1,
  placeholder,
  completed,
}: {
  value: number;
  onCommit: (value: number) => void;
  className?: string;
  step?: number;
  placeholder?: string;
  completed?: boolean;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (value === 0 && placeholder ? "" : String(value));

  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={display}
      placeholder={placeholder}
      onFocus={(e) => {
        setDraft(display);
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = Number(draft);
        onCommit(draft === "" || Number.isNaN(parsed) ? 0 : parsed);
        setDraft(null);
      }}
      className={clsx(
        "tabular h-11 shrink-0 rounded-lg border text-center text-[15px] font-medium outline-none transition-colors focus:border-brand",
        completed ? "border-brand/30 bg-brand/10" : "border-border bg-surface-2",
        className,
      )}
    />
  );
};
