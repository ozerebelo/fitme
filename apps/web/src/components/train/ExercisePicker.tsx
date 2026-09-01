"use client";

import { useMemo, useState } from "react";
import type { Equipment, Exercise, MuscleGroup } from "@fitme/core";
import { normalizeExerciseName } from "@fitme/core";
import { Chip, Sheet, TextInput } from "@/components/ui";

const MUSCLES: MuscleGroup[] = [
  "chest", "back", "lats", "shoulders", "biceps", "triceps",
  "quads", "hamstrings", "glutes", "calves", "core",
];

export const ExercisePicker = ({
  open,
  exercises,
  onClose,
  onPick,
  title = "Add an exercise",
  availableEquipment,
}: {
  open: boolean;
  exercises: Exercise[];
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  title?: string;
  availableEquipment?: Equipment[];
}) => {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  const results = useMemo(() => {
    const q = normalizeExerciseName(query);
    return exercises
      .filter((exercise) => {
        if (muscle && !exercise.primary.includes(muscle) && !exercise.secondary.includes(muscle)) {
          return false;
        }
        if (
          onlyMine &&
          availableEquipment?.length &&
          !exercise.equipment.some((e) => availableEquipment.includes(e))
        ) {
          return false;
        }
        if (!q) return true;
        const haystack = normalizeExerciseName(
          `${exercise.name} ${(exercise.aliases ?? []).join(" ")} ${exercise.equipment.join(" ")}`,
        );
        return q.split(" ").every((token) => haystack.includes(token));
      })
      .slice(0, 80);
  }, [exercises, query, muscle, onlyMine, availableEquipment]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises…"
          type="search"
          autoComplete="off"
        />

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {availableEquipment && availableEquipment.length > 0 && (
            <Chip selected={onlyMine} onClick={() => setOnlyMine((v) => !v)}>
              My kit
            </Chip>
          )}
          <Chip selected={muscle === null} onClick={() => setMuscle(null)}>
            All
          </Chip>
          {MUSCLES.map((m) => (
            <Chip key={m} selected={muscle === m} onClick={() => setMuscle(m)}>
              <span className="capitalize">{m}</span>
            </Chip>
          ))}
        </div>

        <ul className="divide-y divide-border">
          {results.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(exercise);
                  setQuery("");
                }}
                className="w-full py-3 text-left"
              >
                <span className="block font-medium">{exercise.name}</span>
                <span className="mt-0.5 block text-xs capitalize text-faint">
                  {exercise.primary.join(", ")} · {exercise.equipment.join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {results.length === 0 && (
          <p className="py-8 text-center text-sm text-muted">
            No exercise matches that. Try a different name or clear the filters.
          </p>
        )}
      </div>
    </Sheet>
  );
};
