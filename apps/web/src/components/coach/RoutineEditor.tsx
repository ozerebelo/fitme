"use client";

import { useState } from "react";
import type { Exercise, Program, ProgramDay, ProgramExercise } from "@fitme/core";
import { resolveRepRange, sessionMinutes } from "@fitme/core";
import { useApp } from "@/lib/state";
import { ExercisePicker } from "@/components/train/ExercisePicker";
import { Button, Sheet, TextInput } from "@/components/ui";
import { PlusIcon, TrashIcon } from "@/components/icons";

/**
 * Editing a routine.
 *
 * A generated or imported programme is a starting point, not a prescription —
 * a gym without a hack squat, a lift that aggravates a shoulder, or simply a
 * preference all need an edit rather than a full regeneration, which would
 * throw away every other choice already made.
 *
 * Rep ranges deliberately are not edited here: they come from the range policy
 * in Settings, so the progression prompts and the plan can never disagree about
 * what counts as clearing the range.
 */
export const RoutineEditor = ({
  program,
  day,
  onClose,
}: {
  program: Program;
  day: ProgramDay | null;
  onClose: () => void;
}) => {
  const { exercises, exerciseMap, data, setProgram } = useApp();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!day) return null;
  const policy = data.settings.repRange;

  const commit = (next: ProgramDay): void =>
    setProgram({
      ...program,
      days: program.days.map((d) => (d.id === next.id ? next : d)),
    });

  const setBlocks = (blocks: ProgramExercise[]): void => commit({ ...day, blocks });

  const move = (index: number, delta: number): void => {
    const target = index + delta;
    if (target < 0 || target >= day.blocks.length) return;
    const blocks = [...day.blocks];
    const [moved] = blocks.splice(index, 1);
    blocks.splice(target, 0, moved!);
    setBlocks(blocks);
  };

  const addExercise = (exercise: Exercise): void => {
    const [repMin, repMax] = resolveRepRange(exercise, policy);
    setBlocks([
      ...day.blocks,
      {
        exerciseId: exercise.id,
        sets: 3,
        repMin,
        repMax,
        rpe: policy.targetRpe,
        restSeconds: exercise.isCompound ? 180 : 90,
      },
    ]);
    setPickerOpen(false);
  };

  const removeDay = (): void =>
    setProgram({
      ...program,
      days: program.days
        .filter((d) => d.id !== day.id)
        .map((d, dayIndex) => ({ ...d, dayIndex })),
      daysPerWeek: Math.max(1, program.days.length - 1),
    });

  return (
    <>
      <Sheet
        open={!!day}
        onClose={onClose}
        title={`Edit ${day.name}`}
        footer={
          <Button variant="primary" size="lg" full onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">Name</span>
            <TextInput
              value={day.name}
              onChange={(e) => commit({ ...day, name: e.target.value })}
            />
          </label>

          <p className="text-xs text-faint">
            About {sessionMinutes(day.blocks)} minutes · {day.blocks.length} exercises
          </p>

          <ul className="space-y-2">
            {day.blocks.map((block, index) => {
              const exercise = exerciseMap.get(block.exerciseId);
              return (
                <li key={`${block.exerciseId}-${index}`} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {exercise?.name ?? block.exerciseId}
                      </p>
                      <p className="mt-0.5 text-xs text-faint">
                        {block.repMin}–{block.repMax} reps · RPE {block.rpe} ·{" "}
                        {block.restSeconds}s rest
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Move ${exercise?.name ?? "exercise"} earlier`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${exercise?.name ?? "exercise"} later`}
                        disabled={index === day.blocks.length - 1}
                        onClick={() => move(index, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${exercise?.name ?? "exercise"}`}
                        onClick={() =>
                          setBlocks(day.blocks.filter((_, i) => i !== index))
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-faint hover:text-danger"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-muted">Sets</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5, 6].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() =>
                            setBlocks(
                              day.blocks.map((b, i) => (i === index ? { ...b, sets: count } : b)),
                            )
                          }
                          className={`tabular h-8 w-8 rounded-lg text-sm ${
                            block.sets === count
                              ? "bg-brand font-semibold text-black"
                              : "border border-border text-muted"
                          }`}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {day.blocks.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
              No exercises in this day yet.
            </p>
          )}

          <Button full onClick={() => setPickerOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Add an exercise
          </Button>

          <p className="text-xs leading-relaxed text-faint">
            Rep ranges come from your settings, so the plan and the progression prompts
            always agree on what counts as clearing the range.
          </p>

          {program.days.length > 1 && (
            <Button
              variant="danger"
              full
              onClick={() => {
                removeDay();
                onClose();
              }}
            >
              Remove this day
            </Button>
          )}
        </div>
      </Sheet>

      <ExercisePicker
        open={pickerOpen}
        exercises={exercises}
        availableEquipment={data.profile?.availableEquipment}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
        title={`Add to ${day.name}`}
      />
    </>
  );
};
