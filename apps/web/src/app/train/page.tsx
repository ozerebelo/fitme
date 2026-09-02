"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  Exercise,
  ProgressionStatus,
  SetLog,
  UnitSystem,
  WorkoutSession,
} from "@fitme/core";
import {
  CARDIO_EXERCISES,
  cryptoId,
  displayWeight,
  exerciseHistory,
  formatDayLabel,
  isWorkingSet,
  kcalFromMet,
  INTENSITY_MET_FACTOR,
  lastPerformance,
  personalRecords,
  toDateKey,
  volumeLoad,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import { RequireProfile } from "@/components/Guard";
import { ExerciseCard, type PreviousSet } from "@/components/train/ExerciseCard";
import { ExercisePicker } from "@/components/train/ExercisePicker";
import { PlateCalculator } from "@/components/train/PlateCalculator";
import { RestTimer } from "@/components/train/RestTimer";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NumberInput,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  Textarea,
} from "@/components/ui";
import { DumbbellIcon, PlusIcon, UploadIcon } from "@/components/icons";
import { clsx, duration, minutesLabel, unitLabel } from "@/lib/format";

function Train() {
  const {
    data,
    exercises,
    exerciseMap,
    coach,
    progression,
    currentWeightKg,
    saveSession,
    removeSession,
  } = useApp();
  const profile = data.profile!;

  // A session with no end time is the one in progress. Keeping that in the
  // store rather than component state means a locked phone, a backgrounded
  // tab, or an accidental reload never costs you a workout.
  const active = useMemo(
    () => data.sessions.find((s) => !s.endedAt && s.source !== "strong") ?? null,
    [data.sessions],
  );

  const finished = useMemo(
    () => data.sessions.filter((s) => s.endedAt).sort((a, b) => b.date.localeCompare(a.date)),
    [data.sessions],
  );

  // Records computed from completed history only, so a PR badge means you beat
  // your past self rather than the set you logged 30 seconds ago.
  const records = useMemo(
    () => personalRecords(finished.filter((s) => s.id !== active?.id)),
    [finished, active],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [cardioOpen, setCardioOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);

  const progressionFor = useMemo(
    () => new Map(progression.map((status) => [status.exerciseId, status])),
    [progression],
  );

  /* ------------------------------ Session ops ---------------------------- */

  const startSession = (name: string, blocks?: { exerciseId: string; sets: number; reps: number; weightKg: number | null }[], programDayId?: string): void => {
    const sets: SetLog[] = [];
    for (const block of blocks ?? []) {
      for (let i = 0; i < block.sets; i++) {
        sets.push({
          id: cryptoId(),
          exerciseId: block.exerciseId,
          weightKg: block.weightKg ?? 0,
          reps: block.reps,
          completed: false,
        });
      }
    }
    saveSession({
      id: cryptoId(),
      date: toDateKey(),
      name,
      source: "fitme",
      startedAt: new Date().toISOString(),
      sets,
      cardio: [],
      programId: programDayId ? (data.program?.id ?? undefined) : undefined,
      programDayId,
    });
  };

  const patchSession = (patch: Partial<WorkoutSession>): void => {
    if (!active) return;
    saveSession({ ...active, ...patch });
  };

  const updateSet = (setId: string, patch: Partial<SetLog>): void => {
    if (!active) return;
    patchSession({
      sets: active.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
    });
  };

  const completeSet = (set: SetLog): void => {
    if (!active) return;
    patchSession({
      sets: active.sets.map((s) => (s.id === set.id ? { ...s, completed: true } : s)),
    });
    setRestEndsAt(Date.now() + data.settings.restSeconds * 1000);
  };

  const addSet = (set: SetLog): void => {
    if (!active) return;
    // Insert after the last set of the same exercise, so the card stays grouped.
    const sets = [...active.sets];
    let insertAt = sets.length;
    for (let i = sets.length - 1; i >= 0; i--) {
      if (sets[i]!.exerciseId === set.exerciseId) {
        insertAt = i + 1;
        break;
      }
    }
    sets.splice(insertAt, 0, set);
    patchSession({ sets });
  };

  const addExercise = (exercise: Exercise): void => {
    if (!active) return;
    // Prefill the weight the progression engine says to use, not simply what
    // was done last time — otherwise a cleared rep range still needs a manual
    // edit before the bar is loaded, which is the whole friction being removed.
    const status = progressionFor.get(exercise.id);
    const template = lastPerformance(finished, exercise.id)?.topSet;
    const startingSets: SetLog[] = Array.from({ length: 3 }, () => ({
      id: cryptoId(),
      exerciseId: exercise.id,
      weightKg: status?.suggestedWeightKg ?? template?.weightKg ?? 0,
      reps: status?.suggestedReps ?? template?.reps ?? (exercise.defaultRepRange?.[1] ?? 8),
      completed: false,
    }));
    patchSession({ sets: [...active.sets, ...startingSets] });
    setPickerOpen(false);
  };

  /** Apply a suggested load to every unfinished set of one exercise. */
  const applyWeight = (exerciseId: string, weightKg: number): void => {
    if (!active) return;
    patchSession({
      sets: active.sets.map((s) =>
        s.exerciseId === exerciseId && !s.completed ? { ...s, weightKg } : s,
      ),
    });
  };

  const removeExercise = (exerciseId: string): void => {
    if (!active) return;
    patchSession({ sets: active.sets.filter((s) => s.exerciseId !== exerciseId) });
    setMenuFor(null);
  };

  const removeLastSet = (exerciseId: string): void => {
    if (!active) return;
    const sets = [...active.sets];
    for (let i = sets.length - 1; i >= 0; i--) {
      if (sets[i]!.exerciseId === exerciseId) {
        sets.splice(i, 1);
        break;
      }
    }
    patchSession({ sets });
    setMenuFor(null);
  };

  const finishSession = (): void => {
    if (!active) return;
    // Unticked sets were planned, not performed — dropping them keeps volume
    // and progression numbers honest.
    const performed = active.sets.filter((s) => s.completed);
    saveSession({ ...active, sets: performed, endedAt: new Date().toISOString() });
    setRestEndsAt(null);
    setFinishOpen(false);
  };

  const discardSession = (): void => {
    if (!active) return;
    removeSession(active.id);
    setRestEndsAt(null);
    setFinishOpen(false);
  };

  /* ------------------------------- Rendering ----------------------------- */

  if (!active) {
    return (
      <IdleTrain
        planned={coach.plannedSession}
        finished={finished}
        exerciseMap={exerciseMap}
        progression={progression}
        units={profile.units}
        onStart={startSession}
      />
    );
  }

  const grouped = groupSets(active.sets);
  const menuExercise = menuFor ? exerciseMap.get(menuFor) : undefined;
  const completedSets = active.sets.filter(isWorkingSet).length;

  return (
    <div>
      <ActiveHeader
        session={active}
        completedSets={completedSets}
        onFinish={() => setFinishOpen(true)}
      />

      <div className={`space-y-3 px-4 ${restEndsAt != null ? "pb-16" : ""}`}>
        {grouped.map(({ exerciseId, sets }) => {
          const exercise = exerciseMap.get(exerciseId);
          if (!exercise) return null;
          const last = lastPerformance(
            finished.filter((s) => s.id !== active.id),
            exerciseId,
          );
          const previous: PreviousSet[] =
            last?.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })) ?? [];

          return (
            <ExerciseCard
              key={exerciseId}
              exercise={exercise}
              sets={sets}
              previous={previous}
              record={records.get(exerciseId)}
              units={profile.units}
              progression={progressionFor.get(exerciseId)}
              onChange={updateSet}
              onAddSet={addSet}
              onCompleteSet={completeSet}
              onOpenMenu={() => setMenuFor(exerciseId)}
              onApplyWeight={(weightKg) => applyWeight(exerciseId, weightKg)}
            />
          );
        })}

        {active.cardio.length > 0 && (
          <Card>
            <h3 className="mb-2 font-semibold">Cardio</h3>
            <ul className="space-y-2">
              {active.cardio.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between text-sm">
                  <span>
                    {exerciseMap.get(entry.exerciseId)?.name ?? entry.exerciseId} ·{" "}
                    {minutesLabel(entry.minutes)}
                  </span>
                  <span className="tabular text-muted">{entry.kcal} kcal</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setPickerOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Exercise
          </Button>
          <Button onClick={() => setCardioOpen(true)}>Add cardio</Button>
        </div>

        <Textarea
          value={active.notes ?? ""}
          onChange={(e) => patchSession({ notes: e.target.value })}
          placeholder="Session notes — how it felt, what to change next time"
        />
      </div>

      <RestTimer
        endsAt={restEndsAt}
        alert={data.settings.restAlert}
        onExtend={(seconds) =>
          setRestEndsAt((current) => (current == null ? null : current + seconds * 1000))
        }
        onDismiss={() => setRestEndsAt(null)}
      />

      <ExercisePicker
        open={pickerOpen}
        exercises={exercises}
        availableEquipment={profile.availableEquipment}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
      />

      <Sheet
        open={!!menuExercise}
        onClose={() => setMenuFor(null)}
        title={menuExercise?.name ?? ""}
      >
        {menuExercise && (
          <ExerciseMenu
            exercise={menuExercise}
            sessions={finished}
            barWeightKg={data.settings.barWeightKg}
            currentTopWeight={
              Math.max(
                0,
                ...active.sets
                  .filter((s) => s.exerciseId === menuExercise.id)
                  .map((s) => s.weightKg),
              )
            }
            units={profile.units}
            onRemoveLastSet={() => removeLastSet(menuExercise.id)}
            onRemoveExercise={() => removeExercise(menuExercise.id)}
          />
        )}
      </Sheet>

      <CardioSheet
        open={cardioOpen}
        onClose={() => setCardioOpen(false)}
        bodyWeightKg={currentWeightKg ?? 75}
        onAdd={(entry) => {
          patchSession({ cardio: [...active.cardio, entry] });
          setCardioOpen(false);
        }}
      />

      <Sheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        title="Finish session"
        footer={
          <div className="space-y-2">
            <Button variant="primary" size="lg" full onClick={finishSession}>
              Save workout
            </Button>
            <Button variant="danger" full onClick={discardSession}>
              Discard this session
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted">
            {completedSets} working {completedSets === 1 ? "set" : "sets"} completed,{" "}
            {Math.round(volumeLoad(active.sets))} kg of total volume.
          </p>
          {active.sets.some((s) => !s.completed) && (
            <p className="rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
              {active.sets.filter((s) => !s.completed).length} unticked{" "}
              {active.sets.filter((s) => !s.completed).length === 1 ? "set" : "sets"} will be
              dropped. Only what you actually did should count towards your volume and
              progression.
            </p>
          )}
        </div>
      </Sheet>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Idle state                                  */
/* -------------------------------------------------------------------------- */

const IdleTrain = ({
  planned,
  finished,
  exerciseMap,
  progression,
  units,
  onStart,
}: {
  planned: ReturnType<typeof useApp>["coach"]["plannedSession"];
  finished: WorkoutSession[];
  exerciseMap: Map<string, Exercise>;
  progression: ProgressionStatus[];
  units: UnitSystem;
  onStart: (
    name: string,
    blocks?: { exerciseId: string; sets: number; reps: number; weightKg: number | null }[],
    programDayId?: string,
  ) => void;
}) => (
  <div>
    <PageHeader title="Train" subtitle={`${finished.length} sessions logged`} />

    <div className="space-y-4 px-4">
      <ProgressionBoard statuses={progression} units={units} />

      {planned && (
        <Card>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{planned.day.name}</h2>
            <span className="text-xs text-faint">~{planned.estimatedMinutes} min</span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {planned.blocks.map((block) => (
              <li key={block.exerciseId}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{block.exerciseName}</span>
                  <span className="tabular shrink-0 text-sm text-muted">
                    {block.sets} × {block.repMin}–{block.repMax}
                    {block.suggestedWeightKg ? ` @ ${block.suggestedWeightKg} kg` : ""}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-faint">{block.reason}</p>
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            full
            className="mt-4"
            onClick={() =>
              onStart(
                planned.day.name,
                planned.blocks.map((b) => ({
                  exerciseId: b.exerciseId,
                  sets: b.sets,
                  reps: b.repMax,
                  weightKg: b.suggestedWeightKg,
                })),
                planned.day.id,
              )
            }
          >
            Start {planned.day.name}
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => onStart("Workout")}>
          <PlusIcon className="h-4 w-4" />
          Empty session
        </Button>
        <Button
          disabled={finished.length === 0}
          onClick={() => {
            const last = finished[0];
            if (!last) return;
            const blocks = groupSets(last.sets).map((group) => ({
              exerciseId: group.exerciseId,
              sets: group.sets.length,
              reps: group.sets[0]?.reps ?? 8,
              weightKg: group.sets[0]?.weightKg ?? null,
            }));
            onStart(last.name, blocks);
          }}
        >
          Repeat last
        </Button>
      </div>

      {finished.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          detail="Start your first session above, or bring your history across from another app so the coach has something to work with from day one."
          action={
            <Link href="/settings">
              <Button size="sm">
                <UploadIcon className="h-4 w-4" />
                Import history
              </Button>
            </Link>
          }
        />
      ) : (
        <div>
          <h2 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-faint">
            Recent sessions
          </h2>
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {finished.slice(0, 15).map((session) => {
                const groups = groupSets(session.sets);
                return (
                  <li key={session.id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2 truncate font-medium">
                        {session.name}
                        {session.source === "strong" && <Badge>Strong</Badge>}
                      </span>
                      <span className="shrink-0 text-xs text-faint">
                        {formatDayLabel(session.date)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-faint">
                      {groups
                        .slice(0, 4)
                        .map(
                          (g) =>
                            `${exerciseMap.get(g.exerciseId)?.name ?? g.exerciseId} ${g.sets.length}×`,
                        )
                        .join(" · ")}
                      {groups.length > 4 ? ` +${groups.length - 4}` : ""}
                    </p>
                    <p className="tabular mt-1 text-xs text-muted">
                      {session.sets.filter(isWorkingSet).length} sets ·{" "}
                      {Math.round(volumeLoad(session.sets)).toLocaleString()} kg volume
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */

/**
 * What is due to go up.
 *
 * Answering "which weights should I add to today?" across a whole programme is
 * the thing double progression makes possible and nobody reliably does in their
 * head, so it gets its own card at the top of the Train tab.
 */
const ProgressionBoard = ({
  statuses,
  units,
}: {
  statuses: ProgressionStatus[];
  units: UnitSystem;
}) => {
  const [showAll, setShowAll] = useState(false);
  const ready = statuses.filter((s) => s.state === "ready");
  const attention = statuses.filter((s) => s.state === "stalled" || s.state === "deload");

  if (statuses.length === 0) return null;

  const shown = showAll ? statuses : [...ready, ...attention];
  if (shown.length === 0 && !showAll) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Progressive overload</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Nothing has cleared its rep range yet — keep chasing reps and the weights
              will come up on their own.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAll(true)}>
            All lifts
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">
          {ready.length > 0
            ? `${ready.length} ${ready.length === 1 ? "lift is" : "lifts are"} ready to go up`
            : "Progressive overload"}
        </h2>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="shrink-0 text-xs font-medium text-muted hover:text-text"
        >
          {showAll ? "Just what needs action" : `All ${statuses.length}`}
        </button>
      </div>

      <ul className="mt-3 divide-y divide-border">
        {shown.map((status) => (
          <li key={status.exerciseId} className="flex items-center gap-3 py-2.5">
            <span
              className={clsx(
                "h-2 w-2 shrink-0 rounded-full",
                status.state === "ready" && "bg-brand",
                status.state === "stalled" && "bg-warn",
                status.state === "deload" && "bg-warn",
                status.state === "building" && "bg-faint",
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{status.exerciseName}</span>
              <span className="block truncate text-xs text-faint">
                {status.lastSets.length > 0
                  ? `${displayWeight(status.lastSets[0]!.weightKg, units)} ${unitLabel(units)} × ${status.lastSets.map((s) => s.reps).join(", ")}`
                  : "—"}
                {" · "}
                {status.range[0]}–{status.range[1]} target
              </span>
            </span>
            {status.state === "ready" && status.suggestedWeightKg != null ? (
              <span className="tabular shrink-0 text-sm font-semibold text-brand">
                → {displayWeight(status.suggestedWeightKg, units)} {unitLabel(units)}
              </span>
            ) : (
              <span className="shrink-0 text-xs text-faint">
                {status.state === "stalled"
                  ? `${status.sessionsAtWeight} sessions`
                  : status.state === "deload"
                    ? "back off"
                    : `chase ${status.suggestedReps}`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
};

/* -------------------------------------------------------------------------- */

const ActiveHeader = ({
  session,
  completedSets,
  onFinish,
}: {
  session: WorkoutSession;
  completedSets: number;
  onFinish: () => void;
}) => {
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(new Date(session.startedAt).getTime());

  useEffect(() => {
    startedRef.current = new Date(session.startedAt).getTime();
    const tick = (): void =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedRef.current) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.startedAt]);

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{session.name}</h1>
          <p className="tabular text-sm text-muted">
            {duration(elapsed)} · {completedSets} {completedSets === 1 ? "set" : "sets"} done
          </p>
        </div>
        <Button variant="primary" onClick={onFinish}>
          Finish
        </Button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const ExerciseMenu = ({
  exercise,
  sessions,
  barWeightKg,
  currentTopWeight,
  units,
  onRemoveLastSet,
  onRemoveExercise,
}: {
  exercise: Exercise;
  sessions: WorkoutSession[];
  barWeightKg: number;
  currentTopWeight: number;
  units: UnitSystem;
  onRemoveLastSet: () => void;
  onRemoveExercise: () => void;
}) => {
  const history = exerciseHistory(sessions, exercise.id).slice(-10).reverse();
  const usesBar = exercise.equipment.includes("barbell");

  return (
    <div className="space-y-5">
      {exercise.cues && exercise.cues.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">
            Cues
          </h3>
          <ul className="space-y-1 text-sm leading-relaxed text-muted">
            {exercise.cues.map((cue) => (
              <li key={cue}>· {cue}</li>
            ))}
          </ul>
        </div>
      )}

      {usesBar && currentTopWeight > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
            Plate loading for {currentTopWeight} kg
          </h3>
          <PlateCalculator targetKg={currentTopWeight} barKg={barWeightKg} />
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
          History
        </h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Nothing logged for this lift yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.sessionId} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="shrink-0 text-faint">{formatDayLabel(entry.date)}</span>
                <span className="tabular truncate text-right">
                  {entry.sets
                    .map((s) => `${displayWeight(s.weightKg, units)}${unitLabel(units)}×${s.reps}`)
                    .join(", ")}
                  {entry.bestE1RM != null && (
                    <span className="ml-2 text-faint">e1RM {entry.bestE1RM}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-2 border-t border-border pt-4">
        <Button onClick={onRemoveLastSet}>Remove last set</Button>
        <Button variant="danger" onClick={onRemoveExercise}>
          Remove this exercise
        </Button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */

const CardioSheet = ({
  open,
  onClose,
  bodyWeightKg,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  bodyWeightKg: number;
  onAdd: (entry: WorkoutSession["cardio"][number]) => void;
}) => {
  const [exerciseId, setExerciseId] = useState(CARDIO_EXERCISES[0]?.id ?? "running");
  const [minutes, setMinutes] = useState(20);
  const [intensity, setIntensity] = useState<"easy" | "moderate" | "hard">("moderate");
  const [distance, setDistance] = useState(0);

  const exercise = CARDIO_EXERCISES.find((e) => e.id === exerciseId);
  const kcal = Math.round(
    kcalFromMet((exercise?.met ?? 6) * INTENSITY_MET_FACTOR[intensity], bodyWeightKg, minutes),
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add cardio"
      footer={
        <Button
          variant="primary"
          size="lg"
          full
          onClick={() =>
            onAdd({
              id: cryptoId(),
              exerciseId,
              minutes,
              intensity,
              distanceKm: distance > 0 ? distance : undefined,
              kcal,
            })
          }
        >
          Add · {kcal} kcal
        </Button>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Activity</span>
          <Select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
            {CARDIO_EXERCISES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Minutes</span>
          <NumberInput
            value={minutes}
            min={1}
            onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
          />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted">Intensity</span>
          <Segmented
            value={intensity}
            onChange={setIntensity}
            options={[
              { value: "easy", label: "Easy" },
              { value: "moderate", label: "Moderate" },
              { value: "hard", label: "Hard" },
            ]}
          />
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">
            Distance (km, optional)
          </span>
          <NumberInput
            value={distance}
            min={0}
            step={0.1}
            onChange={(e) => setDistance(Math.max(0, Number(e.target.value)))}
          />
        </label>

        <p className="rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
          Estimated from the activity&apos;s metabolic cost and your bodyweight. Treat it as a
          ballpark — machine and watch readouts are usually generous, and eating back every
          calorie a device claims you burned is the most common reason a deficit quietly
          disappears.
        </p>
      </div>
    </Sheet>
  );
};

/* -------------------------------------------------------------------------- */

/** Group a flat set list by exercise, preserving first-appearance order. */
const groupSets = (sets: SetLog[]): { exerciseId: string; sets: SetLog[] }[] => {
  const order: string[] = [];
  const map = new Map<string, SetLog[]>();
  for (const set of sets) {
    const existing = map.get(set.exerciseId);
    if (existing) existing.push(set);
    else {
      map.set(set.exerciseId, [set]);
      order.push(set.exerciseId);
    }
  }
  return order.map((exerciseId) => ({ exerciseId, sets: map.get(exerciseId)! }));
};

export default function TrainPage() {
  return (
    <RequireProfile>
      <Train />
    </RequireProfile>
  );
}
