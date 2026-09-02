"use client";

import { useMemo, useState } from "react";
import type { Exercise, SetLog, UnitSystem, WorkoutSession } from "@fitme/core";
import {
  cryptoId,
  displayWeight,
  formatDayLabel,
  isWorkingSet,
  parseWeight,
  setE1RM,
  volumeLoad,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import { ExercisePicker } from "./ExercisePicker";
import { Badge, Button, Sheet, TextInput } from "@/components/ui";
import { PlusIcon, TrashIcon } from "@/components/icons";
import { clsx, minutesLabel, unitLabel } from "@/lib/format";

/**
 * Editing a finished workout.
 *
 * Without this a mistyped weight is permanent, and it is not merely cosmetic:
 * personal records, estimated 1RMs and every progression suggestion are derived
 * from these sets, so one stray digit quietly poisons the coaching until it is
 * noticed. Imported sessions are editable too — the import is one-time and
 * deduplicated by source timestamp, so a correction here survives a re-import.
 */
export const SessionEditor = ({
  session,
  onClose,
}: {
  session: WorkoutSession | null;
  onClose: () => void;
}) => {
  const { data, exercises, exerciseMap, saveSession, removeSession } = useApp();
  const units: UnitSystem = data.profile?.units ?? "metric";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const grouped = useMemo(() => {
    if (!session) return [];
    const order: string[] = [];
    const map = new Map<string, SetLog[]>();
    for (const set of session.sets) {
      const existing = map.get(set.exerciseId);
      if (existing) existing.push(set);
      else {
        map.set(set.exerciseId, [set]);
        order.push(set.exerciseId);
      }
    }
    return order.map((exerciseId) => ({ exerciseId, sets: map.get(exerciseId)! }));
  }, [session]);

  if (!session) return null;

  const update = (patch: Partial<WorkoutSession>): void =>
    saveSession({ ...session, ...patch });

  const updateSet = (setId: string, setPatch: Partial<SetLog>): void =>
    update({ sets: session.sets.map((s) => (s.id === setId ? { ...s, ...setPatch } : s)) });

  const removeSet = (setId: string): void =>
    update({ sets: session.sets.filter((s) => s.id !== setId) });

  const addSet = (exerciseId: string): void => {
    const existing = session.sets.filter((s) => s.exerciseId === exerciseId);
    const last = existing[existing.length - 1];
    const set: SetLog = {
      id: cryptoId(),
      exerciseId,
      weightKg: last?.weightKg ?? 0,
      reps: last?.reps ?? 8,
      completed: true,
    };
    const sets = [...session.sets];
    const insertAt = sets.map((s) => s.exerciseId).lastIndexOf(exerciseId) + 1;
    sets.splice(insertAt || sets.length, 0, set);
    update({ sets });
  };

  const addExercise = (exercise: Exercise): void => {
    update({
      sets: [
        ...session.sets,
        { id: cryptoId(), exerciseId: exercise.id, weightKg: 0, reps: 8, completed: true },
      ],
    });
    setPickerOpen(false);
  };

  const minutes =
    session.endedAt
      ? Math.max(
          0,
          Math.round(
            (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60000,
          ),
        )
      : 0;

  return (
    <>
      <Sheet
        open={!!session}
        onClose={onClose}
        title={session.name}
        footer={
          confirmDelete ? (
            <div className="space-y-2">
              <p className="text-sm leading-relaxed text-muted">
                Delete this whole session? Records and progression will be recalculated
                without it.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    removeSession(session.id);
                    onClose();
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="primary" size="lg" full onClick={onClose}>
              Done
            </Button>
          )
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{formatDayLabel(session.date)}</span>
            {minutes > 0 && <span>· {minutesLabel(minutes)}</span>}
            <span>· {session.sets.filter(isWorkingSet).length} sets</span>
            <span>· {Math.round(volumeLoad(session.sets)).toLocaleString()} kg</span>
            {session.source === "strong" && <Badge>Imported</Badge>}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">Name</span>
            <TextInput value={session.name} onChange={(e) => update({ name: e.target.value })} />
          </label>

          {grouped.map(({ exerciseId, sets }) => {
            const exercise = exerciseMap.get(exerciseId);
            return (
              <section key={exerciseId} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="truncate font-medium">{exercise?.name ?? exerciseId}</h3>
                  <span className="shrink-0 text-xs text-faint">{sets.length} sets</span>
                </div>

                <div className="flex items-center gap-1.5 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
                  <span className="w-6 text-center">#</span>
                  <span className="flex-1 text-center">{unitLabel(units)}</span>
                  <span className="flex-1 text-center">Reps</span>
                  <span className="w-12 text-center">RPE</span>
                  <span className="w-9" />
                </div>

                <ul className="space-y-1.5">
                  {sets.map((set, i) => (
                    <li key={set.id} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateSet(set.id, { isWarmup: !set.isWarmup })}
                        aria-label={set.isWarmup ? "Mark as working set" : "Mark as warm-up"}
                        className={clsx(
                          "tabular h-10 w-6 shrink-0 text-sm font-semibold",
                          set.isWarmup ? "text-warn" : "text-faint",
                        )}
                      >
                        {set.isWarmup ? "W" : i + 1}
                      </button>
                      <EditCell
                        value={displayWeight(set.weightKg, units)}
                        step={0.5}
                        onCommit={(v) => updateSet(set.id, { weightKg: parseWeight(v, units) })}
                      />
                      <EditCell
                        value={set.reps}
                        onCommit={(v) => updateSet(set.id, { reps: Math.max(0, Math.round(v)) })}
                      />
                      <EditCell
                        value={set.rpe ?? 0}
                        step={0.5}
                        placeholder="—"
                        className="w-12 flex-none"
                        onCommit={(v) =>
                          updateSet(set.id, { rpe: v >= 5 && v <= 10 ? v : undefined })
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Remove set ${i + 1}`}
                        onClick={() => removeSet(set.id)}
                        className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-faint hover:text-danger"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>

                {sets.some((s) => setE1RM(s) != null) && (
                  <p className="tabular mt-2 px-1 text-xs text-faint">
                    Best estimated 1RM{" "}
                    {Math.max(...sets.map((s) => setE1RM(s) ?? 0)).toFixed(1)} kg
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => addSet(exerciseId)}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm text-muted hover:border-faint hover:text-text"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add set
                </button>
              </section>
            );
          })}

          {session.cardio.length > 0 && (
            <section className="rounded-xl border border-border p-3">
              <h3 className="mb-2 font-medium">Cardio</h3>
              <ul className="space-y-2">
                {session.cardio.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {exerciseMap.get(entry.exerciseId)?.name ?? entry.exerciseId} ·{" "}
                      {minutesLabel(entry.minutes)}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular text-muted">{entry.kcal} kcal</span>
                      <button
                        type="button"
                        aria-label="Remove cardio entry"
                        onClick={() =>
                          update({ cardio: session.cardio.filter((c) => c.id !== entry.id) })
                        }
                        className="text-faint hover:text-danger"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Button full onClick={() => setPickerOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Add an exercise
          </Button>

          {!confirmDelete && (
            <Button variant="danger" full onClick={() => setConfirmDelete(true)}>
              Delete this session
            </Button>
          )}

          <p className="text-xs leading-relaxed text-faint">
            Edits here recalculate your records and every progression suggestion that reads
            from this session.
          </p>
        </div>
      </Sheet>

      <ExercisePicker
        open={pickerOpen}
        exercises={exercises}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
        title="Add to this session"
      />
    </>
  );
};

/** Commits on blur, so a half-typed number never lands in stored data. */
const EditCell = ({
  value,
  onCommit,
  step = 1,
  placeholder,
  className,
}: {
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  placeholder?: string;
  className?: string;
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
        "tabular h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface-2 text-center text-[15px] outline-none focus:border-brand",
        className,
      )}
    />
  );
};
