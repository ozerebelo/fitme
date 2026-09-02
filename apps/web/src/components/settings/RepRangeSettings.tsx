"use client";

import { useMemo, useState } from "react";
import type { Exercise } from "@fitme/core";
import { useApp } from "@/lib/state";
import { Badge, Button, Card, Field, NumberInput, Sheet, TextInput } from "@/components/ui";
import { PlusIcon, TrashIcon } from "@/components/icons";

/**
 * Rep ranges.
 *
 * These drive every progressive-overload prompt in the app: clear the top of
 * the range on every working set, at or below the effort ceiling, and the
 * weight goes up. Making them a setting rather than a constant matters because
 * the right range is a training decision, not a fact — a range that fits your
 * lifts is the difference between the prompts being useful and being ignored.
 */
export const RepRangeSettings = () => {
  const { data, exercises, updateSettings } = useApp();
  const policy = data.settings.repRange;
  const [addingOverride, setAddingOverride] = useState(false);

  const set = (patch: Partial<typeof policy>): void =>
    updateSettings({ repRange: { ...policy, ...patch } });

  const overrides = useMemo(
    () =>
      Object.entries(policy.overrides)
        .map(([id, range]) => ({
          id,
          range,
          name: exercises.find((e) => e.id === id)?.name ?? id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [policy.overrides, exercises],
  );

  return (
    <>
      <Card>
        <h2 className="font-semibold">Rep ranges</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          When every working set reaches the top of the range at or below your effort
          ceiling, FitMe tells you to add weight and resets the reps to the bottom.
        </p>

        <div className="mt-4 space-y-4">
          <RangeField
            label="Main lifts"
            hint="Compound movements — presses, rows, squats, hinges."
            range={policy.compound}
            onChange={(compound) => set({ compound })}
          />

          <RangeField
            label="Isolation work"
            hint="Curls, raises, extensions — usually productive at higher reps."
            range={policy.isolation}
            onChange={(isolation) => set({ isolation })}
          />

          <Field
            label={`Effort ceiling: RPE ${policy.targetRpe}`}
            hint="Above this, hitting the reps does not earn a load increase. Adding weight on top of a maximal set is how a stall starts."
          >
            <input
              type="range"
              min={7}
              max={10}
              step={0.5}
              value={policy.targetRpe}
              onChange={(e) => set({ targetRpe: Number(e.target.value) })}
              className="w-full accent-[var(--color-brand)]"
            />
          </Field>

          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block text-sm font-medium text-muted">
                Every set must clear the range
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-faint">
                {policy.requireAllSets
                  ? "Strict: all working sets must reach the top before the weight goes up. Slower, and it sticks."
                  : "Relaxed: your best set is enough. Progresses faster and stalls sooner."}
              </span>
            </span>
            <input
              type="checkbox"
              checked={policy.requireAllSets}
              onChange={(e) => set({ requireAllSets: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]"
            />
          </label>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
              Per-exercise ranges
            </h3>
            <Button size="sm" onClick={() => setAddingOverride(true)} aria-label="Add an override">
              <PlusIcon className="h-4 w-4" />
            </Button>
          </div>

          {overrides.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              None. Add one where a lift wants its own range — heavy deadlifts at 3–5, say.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {overrides.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                  <Badge tone="brand">
                    {item.range[0]}–{item.range[1]}
                  </Badge>
                  <button
                    type="button"
                    aria-label={`Remove the override for ${item.name}`}
                    onClick={() => {
                      const next = { ...policy.overrides };
                      delete next[item.id];
                      set({ overrides: next });
                    }}
                    className="shrink-0 text-muted hover:text-danger"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <OverrideSheet
        open={addingOverride}
        exercises={exercises}
        onClose={() => setAddingOverride(false)}
        onAdd={(id, range) => {
          set({ overrides: { ...policy.overrides, [id]: range } });
          setAddingOverride(false);
        }}
      />
    </>
  );
};

const RangeField = ({
  label,
  hint,
  range,
  onChange,
}: {
  label: string;
  hint: string;
  range: [number, number];
  onChange: (range: [number, number]) => void;
}) => (
  <Field label={`${label}: ${range[0]}–${range[1]} reps`} hint={hint}>
    <div className="flex items-center gap-2">
      <NumberInput
        aria-label={`${label} minimum reps`}
        value={range[0]}
        min={1}
        max={range[1]}
        onChange={(e) => {
          const min = Math.max(1, Math.min(Number(e.target.value), range[1]));
          onChange([min, range[1]]);
        }}
      />
      <span className="shrink-0 text-muted">to</span>
      <NumberInput
        aria-label={`${label} maximum reps`}
        value={range[1]}
        min={range[0]}
        max={30}
        onChange={(e) => {
          const max = Math.min(30, Math.max(Number(e.target.value), range[0]));
          onChange([range[0], max]);
        }}
      />
    </div>
  </Field>
);

const OverrideSheet = ({
  open,
  exercises,
  onClose,
  onAdd,
}: {
  open: boolean;
  exercises: Exercise[];
  onClose: () => void;
  onAdd: (exerciseId: string, range: [number, number]) => void;
}) => {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Exercise | null>(null);
  const [range, setRange] = useState<[number, number]>([5, 8]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return exercises.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, exercises]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Range for one exercise"
      footer={
        picked ? (
          <Button variant="primary" size="lg" full onClick={() => onAdd(picked.id, range)}>
            Use {range[0]}–{range[1]} for {picked.name}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {picked ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2.5">
              <span className="truncate text-sm">{picked.name}</span>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="shrink-0 text-xs text-muted hover:text-text"
              >
                Change
              </button>
            </div>
            <RangeField
              label="Range"
              hint="Low ranges suit lifts you train for strength; high ranges suit anything where load is limited."
              range={range}
              onChange={setRange}
            />
          </>
        ) : (
          <>
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              type="search"
              autoComplete="off"
              autoFocus
            />
            <ul className="divide-y divide-border">
              {matches.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(exercise);
                      setQuery("");
                    }}
                    className="w-full py-3 text-left text-sm"
                  >
                    {exercise.name}
                    <span className="ml-2 text-xs capitalize text-faint">
                      {exercise.primary.join(", ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
};
