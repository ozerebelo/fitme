"use client";

import { useRef, useState } from "react";
import type { StrongImportResult, WeightUnit } from "@fitme/core";
import { formatDayLabel, importStrongCsv } from "@fitme/core";
import { useApp } from "@/lib/state";
import { Badge, Button, Card, Segmented, Sheet, Spinner } from "@/components/ui";
import { UploadIcon } from "@/components/icons";

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
  const { data, exercises, currentWeightKg, importSessions } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit | null>(null);
  const [result, setResult] = useState<StrongImportResult | null>(null);
  const [done, setDone] = useState<number | null>(null);

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
    setOpen(false);
    setCsv(null);
    setResult(null);
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
