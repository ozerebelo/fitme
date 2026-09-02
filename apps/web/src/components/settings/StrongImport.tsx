"use client";

import { useRef, useState } from "react";
import type { DerivedRoutine, StrongImportResult, WeightUnit } from "@fitme/core";
import {
  deriveRoutinesFromHistory,
  formatDayLabel,
  importStrongCsv,
  programFromRoutines,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import { Badge, Button, Card, Segmented, Sheet, Spinner } from "@/components/ui";
import { CheckIcon, UploadIcon } from "@/components/icons";

/**
 * One-time import of a Strong app CSV export.
 *
 * Strong has no public API, so its CSV export is the whole integration. The
 * import is content-addressed by each workout's source timestamp, which means
 * running it twice — or importing a newer export that still contains old
 * workouts — adds only what is genuinely new. That property is worth having
 * even for a one-off: the failure mode of a duplicated training history is a
 * silently doubled volume count that would mislead the coach for months.
 */
export const StrongImport = () => {
  const { data, exercises, exerciseMap, currentWeightKg, importSessions, setProgram } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit | null>(null);
  const [result, setResult] = useState<StrongImportResult | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [routines, setRoutines] = useState<DerivedRoutine[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const existingIds = data.sessions
    .map((s) => s.externalId)
    .filter((v): v is string => !!v);

  const run = (text: string, forcedUnit: WeightUnit | null): StrongImportResult =>
    importStrongCsv(text, {
      exercises,
      existingExternalIds: existingIds,
      bodyWeightKg: currentWeightKg ?? 75,
      ...(forcedUnit ? { weightUnit: forcedUnit } : {}),
    });

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setParsing(true);
    setDone(null);
    try {
      const text = await file.text();
      const parsed = run(text, null);
      setCsv(text);
      setUnit(parsed.stats.detectedUnit);
      setResult(parsed);
      setOpen(true);
    } finally {
      setParsing(false);
    }
  };

  const changeUnit = (next: WeightUnit): void => {
    if (!csv) return;
    setUnit(next);
    setResult(run(csv, next));
  };

  const commit = (): void => {
    if (!result) return;
    importSessions(result.sessions, result.newExercises);
    setDone(result.sessions.length);

    // Offer back the routines they have actually been running. Retyping a
    // programme that is already sitting in the history is pure friction.
    const merged = [...data.sessions, ...result.sessions];
    const catalog = new Map(exerciseMap);
    for (const exercise of result.newExercises) catalog.set(exercise.id, exercise);
    const derived = deriveRoutinesFromHistory(merged, {
      policy: data.settings.repRange,
      catalog,
      limit: 3,
    });
    setRoutines(derived.length > 0 ? derived : null);
    setChosen(new Set(derived.map((r) => r.name)));

    setOpen(false);
    setCsv(null);
    setResult(null);
  };

  const createRoutines = (): void => {
    if (!routines || !data.profile) return;
    const selected = routines.filter((r) => chosen.has(r.name));
    if (selected.length === 0) return;
    setProgram(programFromRoutines(selected, data.profile));
    setRoutines(null);
  };

  const sample = result?.sessions
    .flatMap((s) => s.sets)
    .filter((s) => s.weightKg > 0)
    .slice(-3);

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      <Card>
        <h3 className="font-semibold">Import from Strong</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Bring your training history across in one go. In Strong, go to{" "}
          <span className="text-text">Settings → Export Data → Export Workout Data</span> and
          save the CSV, then open it here.
        </p>
        <p className="mt-2 text-xs leading-relaxed text-faint">
          Strong offers no public API, so this is a file import rather than a live
          connection. Running it more than once is safe — workouts already imported are
          skipped rather than duplicated.
        </p>

        {done != null && (
          <p className="mt-3 rounded-lg bg-brand/10 p-3 text-sm text-brand">
            {done === 0
              ? "Nothing new to import — your history was already up to date."
              : `Imported ${done} ${done === 1 ? "workout" : "workouts"}. Your history, records and volume charts are populated.`}
          </p>
        )}

        <Button
          full
          className="mt-4"
          disabled={parsing}
          onClick={() => fileRef.current?.click()}
        >
          <UploadIcon className="h-4 w-4" />
          {parsing ? "Reading…" : "Choose strong.csv"}
        </Button>
      </Card>

      {routines && (
        <Card>
          <h3 className="font-semibold">Keep the routines you have been running</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Taken from your most recent session under each name — same exercises, same
            order, same set counts. Rep targets come from your own range settings.
          </p>

          <ul className="mt-3 space-y-2">
            {routines.map((routine) => {
              const selected = chosen.has(routine.name);
              return (
                <li
                  key={routine.name}
                  className={`rounded-xl border p-3 transition-colors ${
                    selected ? "border-brand/40 bg-brand/10" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (next.has(routine.name)) next.delete(routine.name);
                        else next.add(routine.name);
                        return next;
                      })
                    }
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        selected ? "border-brand bg-brand text-black" : "border-border"
                      }`}
                    >
                      {selected && <CheckIcon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">{routine.name}</span>
                        <span className="text-xs text-faint">
                          {routine.day.blocks.length} exercises · last{" "}
                          {formatDayLabel(routine.lastPerformed)}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">
                        {routine.day.blocks
                          .map((b, i) => `${b.sets}× ${routine.exerciseNames[i]}`)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => setRoutines(null)}>Not now</Button>
            <Button variant="primary" disabled={chosen.size === 0} onClick={createRoutines}>
              Use {chosen.size} {chosen.size === 1 ? "routine" : "routines"}
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-faint">
            This replaces any generated plan. Your logged history is untouched either way.
          </p>
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Review the import"
        footer={
          result && result.stats.sessionsNew > 0 ? (
            <Button variant="primary" size="lg" full onClick={commit}>
              Import {result.stats.sessionsNew} workouts
            </Button>
          ) : (
            <Button full onClick={() => setOpen(false)}>
              Close
            </Button>
          )
        }
      >
        {parsing && <Spinner label="Parsing the export" />}

        {result && (
          <div className="space-y-4">
            {result.stats.sessionsFound === 0 ? (
              <div className="rounded-xl bg-danger/10 p-4 text-sm leading-relaxed text-danger">
                {result.warnings[0] ??
                  "No workouts were found in that file. Make sure you exported workout data rather than measurements."}
              </div>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3">
                  <Stat label="New workouts" value={result.stats.sessionsNew} highlight />
                  <Stat label="Already imported" value={result.stats.sessionsDuplicate} />
                  <Stat label="Sets" value={result.stats.setsImported} />
                  <Stat label="Cardio entries" value={result.stats.cardioImported} />
                </dl>

                {result.stats.dateRange && (
                  <p className="text-sm text-muted">
                    Covering {formatDayLabel(result.stats.dateRange.from)} to{" "}
                    {formatDayLabel(result.stats.dateRange.to)}.
                  </p>
                )}

                <div>
                  <p className="mb-1.5 text-sm font-medium text-muted">Weights are in</p>
                  <Segmented
                    value={unit ?? "kg"}
                    onChange={changeUnit}
                    options={[
                      { value: "kg", label: "Kilograms" },
                      { value: "lb", label: "Pounds" },
                    ]}
                  />
                  {sample && sample.length > 0 && (
                    <p className="mt-2 text-xs leading-relaxed text-faint">
                      Sanity check — your most recent sets read as{" "}
                      {sample
                        .map((s) => `${Math.round(s.weightKg * 10) / 10} kg × ${s.reps}`)
                        .join(", ")}
                      . If that looks wrong, flip the unit above.
                    </p>
                  )}
                </div>

                {result.unmatched.length > 0 && (
                  <div className="rounded-xl border border-border p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
                      {result.unmatched.length} unfamiliar exercise
                      {result.unmatched.length === 1 ? "" : "s"}
                    </p>
                    <p className="mb-2 text-xs leading-relaxed text-muted">
                      These are not in the exercise catalog. They will be kept under their
                      original names with muscle groups inferred, so no history is lost.
                    </p>
                    <ul className="space-y-1 text-sm">
                      {result.unmatched.slice(0, 12).map((item) => (
                        <li
                          key={item.sourceName}
                          className="flex items-baseline justify-between gap-2"
                        >
                          <span className="truncate">{item.sourceName}</span>
                          <span className="tabular shrink-0 text-xs text-faint">
                            {item.setCount} sets
                          </span>
                        </li>
                      ))}
                    </ul>
                    {result.unmatched.length > 12 && (
                      <p className="mt-1 text-xs text-faint">
                        …and {result.unmatched.length - 12} more.
                      </p>
                    )}
                  </div>
                )}

                {result.warnings.map((warning) => (
                  <p
                    key={warning}
                    className="rounded-lg bg-warn/10 p-3 text-xs leading-relaxed text-warn"
                  >
                    {warning}
                  </p>
                ))}

                {result.stats.sessionsNew === 0 && result.stats.sessionsDuplicate > 0 && (
                  <p className="rounded-lg bg-surface-2 p-3 text-sm leading-relaxed text-muted">
                    Every workout in this file has already been imported. Nothing will be
                    duplicated.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Badge>Read-only once imported</Badge>
                  <Badge tone="info">Feeds records &amp; volume</Badge>
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
};

const Stat = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) => (
  <div className="rounded-xl bg-surface-2 p-3">
    <dd className={`tabular text-2xl font-semibold ${highlight ? "text-brand" : ""}`}>
      {value}
    </dd>
    <dt className="text-xs text-faint">{label}</dt>
  </div>
);
