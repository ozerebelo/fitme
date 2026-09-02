"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ActivityLevel,
  DietPreference,
  Equipment,
  ExperienceLevel,
  Goal,
} from "@fitme/core";
import { ACTIVITY_LABELS, RATE_BOUNDS, generateProgram } from "@fitme/core";
import { useApp } from "@/lib/state";
import { RequireProfile } from "@/components/Guard";
import { MemoryPanel } from "@/components/settings/MemoryPanel";
import { RepRangeSettings } from "@/components/settings/RepRangeSettings";
import { SyncSettings } from "@/components/settings/SyncSettings";
import { StrongImport } from "@/components/settings/StrongImport";
import {
  Button,
  Card,
  Chip,
  Field,
  NumberInput,
  PageHeader,
  Segmented,
  Select,
  Sheet,
  TextInput,
} from "@/components/ui";
import { emptyData, exportData, parseImport } from "@/lib/store";
import { weight as formatWeight } from "@/lib/format";

const EQUIPMENT: { value: Equipment; label: string }[] = [
  { value: "bodyweight", label: "Bodyweight" },
  { value: "dumbbell", label: "Dumbbells" },
  { value: "barbell", label: "Barbell" },
  { value: "machine", label: "Machines" },
  { value: "cable", label: "Cables" },
  { value: "kettlebell", label: "Kettlebells" },
  { value: "band", label: "Bands" },
  { value: "cardio", label: "Cardio kit" },
];

function Settings() {
  const router = useRouter();
  const {
    data,
    targets,
    currentWeightKg,
    setProfile,
    updateSettings,
    setProgram,
    replaceAll,
  } = useApp();
  const profile = data.profile!;

  const [resetOpen, setResetOpen] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const backupRef = useRef<HTMLInputElement>(null);

  const patchProfile = (patch: Partial<typeof profile>): void =>
    setProfile({ ...profile, ...patch });

  const bounds = RATE_BOUNDS[profile.goal];

  const downloadBackup = (): void => {
    const blob = new Blob([exportData(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fitme-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const restoreBackup = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const outcome = parseImport(await file.text());
    if (!outcome.ok || !outcome.data) {
      setImportMessage(outcome.error ?? "That file could not be read.");
      return;
    }
    replaceAll(outcome.data);
    setImportMessage("Backup restored.");
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Everything stays on this device" />

      <div className="space-y-4 px-4">
        {/* ------------------------------- Goal ------------------------------ */}
        <Card>
          <h2 className="mb-3 font-semibold">Goal</h2>
          <div className="space-y-4">
            <Field label="What you're working towards">
              <Select
                value={profile.goal}
                onChange={(e) => {
                  const goal = e.target.value as Goal;
                  const b = RATE_BOUNDS[goal];
                  patchProfile({
                    goal,
                    rateOfChangePctPerWeek: Math.min(
                      Math.max(profile.rateOfChangePctPerWeek, b.min),
                      b.max || b.min,
                    ),
                  });
                }}
              >
                <option value="lose">Lose fat</option>
                <option value="maintain">Maintain</option>
                <option value="gain">Build muscle</option>
                <option value="recomp">Recomposition</option>
              </Select>
            </Field>

            {bounds.max > 0 && (
              <Field label={`Rate: ${profile.rateOfChangePctPerWeek}% of bodyweight per week`}>
                <input
                  type="range"
                  min={bounds.min}
                  max={bounds.max}
                  step={0.125}
                  value={profile.rateOfChangePctPerWeek}
                  onChange={(e) =>
                    patchProfile({ rateOfChangePctPerWeek: Number(e.target.value) })
                  }
                  className="w-full accent-[var(--color-brand)]"
                />
              </Field>
            )}

            <Field label="Day-to-day activity">
              <Select
                value={profile.activityLevel}
                onChange={(e) =>
                  patchProfile({ activityLevel: e.target.value as ActivityLevel })
                }
              >
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {ACTIVITY_LABELS[level]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Dietary pattern">
              <Select
                value={profile.dietPreference}
                onChange={(e) =>
                  patchProfile({ dietPreference: e.target.value as DietPreference })
                }
              >
                <option value="none">No particular pattern</option>
                <option value="mediterranean">Mediterranean</option>
                <option value="vegetarian">Vegetarian</option>
                <option value="vegan">Vegan</option>
                <option value="pescatarian">Pescatarian</option>
                <option value="low_carb">Lower carb</option>
                <option value="keto">Ketogenic</option>
                <option value="high_carb">Higher carb</option>
              </Select>
            </Field>
          </div>
        </Card>

        {/* ------------------------------ Targets ---------------------------- */}
        <Card>
          <h2 className="mb-1 font-semibold">Daily targets</h2>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            {targets.breakdown.adaptive
              ? "Calibrated to the maintenance level measured from your own intake and weight trend."
              : "Estimated from your body metrics and activity level. Once you have a few weeks of data, this switches to your measured maintenance automatically."}
          </p>

          <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-surface-2 p-3">
              <dd className="tabular text-xl font-semibold">{targets.kcal}</dd>
              <dt className="text-xs text-faint">kcal</dt>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dd className="tabular text-xl font-semibold">{targets.protein} g</dd>
              <dt className="text-xs text-faint">
                Protein ({targets.breakdown.proteinGPerKg} g/kg)
              </dt>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dd className="tabular font-semibold">{targets.breakdown.bmr}</dd>
              <dt className="text-xs text-faint">Resting metabolism</dt>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <dd className="tabular font-semibold">{targets.breakdown.tdee}</dd>
              <dt className="text-xs text-faint">Maintenance</dt>
            </div>
          </dl>

          <div className="space-y-4">
            <Field
              label="Calorie override"
              hint="Leave at 0 to use the calculated target."
            >
              <NumberInput
                value={profile.calorieTargetOverride ?? 0}
                min={0}
                step={50}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  patchProfile({ calorieTargetOverride: value > 0 ? value : undefined });
                }}
              />
            </Field>

            <Field label="Protein override (g per kg)" hint="Leave at 0 for the default.">
              <NumberInput
                value={profile.proteinGPerKgOverride ?? 0}
                min={0}
                step={0.1}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  patchProfile({ proteinGPerKgOverride: value > 0 ? value : undefined });
                }}
              />
            </Field>
          </div>
        </Card>

        {/* ----------------------------- Training ---------------------------- */}
        <Card>
          <h2 className="mb-3 font-semibold">Training</h2>
          <div className="space-y-4">
            <Field label={`Days per week: ${profile.trainingDaysPerWeek}`}>
              <input
                type="range"
                min={1}
                max={6}
                value={profile.trainingDaysPerWeek}
                onChange={(e) =>
                  patchProfile({ trainingDaysPerWeek: Number(e.target.value) })
                }
                className="w-full accent-[var(--color-brand)]"
              />
            </Field>

            <Field label={`Session length: ${profile.sessionMinutes} minutes`}>
              <input
                type="range"
                min={20}
                max={120}
                step={5}
                value={profile.sessionMinutes}
                onChange={(e) => patchProfile({ sessionMinutes: Number(e.target.value) })}
                className="w-full accent-[var(--color-brand)]"
              />
            </Field>

            <Field label="Experience">
              <Segmented
                value={profile.experience}
                onChange={(experience: ExperienceLevel) => patchProfile({ experience })}
                options={[
                  { value: "beginner", label: "Beginner" },
                  { value: "intermediate", label: "Intermediate" },
                  { value: "advanced", label: "Advanced" },
                ]}
              />
            </Field>

            <Field label="Equipment">
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT.map((option) => (
                  <Chip
                    key={option.value}
                    selected={profile.availableEquipment.includes(option.value)}
                    onClick={() =>
                      patchProfile({
                        availableEquipment: profile.availableEquipment.includes(option.value)
                          ? profile.availableEquipment.filter((e) => e !== option.value)
                          : [...profile.availableEquipment, option.value],
                      })
                    }
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <Button full onClick={() => setProgram(generateProgram(profile))}>
              Rebuild my training plan
            </Button>
          </div>
        </Card>

        {/* ---------------------------- Rep ranges --------------------------- */}
        <RepRangeSettings />

        {/* ---------------------------- In the gym --------------------------- */}
        <Card>
          <h2 className="mb-3 font-semibold">In the gym</h2>
          <div className="space-y-4">
            <Field label={`Default rest: ${data.settings.restSeconds} seconds`}>
              <input
                type="range"
                min={30}
                max={300}
                step={15}
                value={data.settings.restSeconds}
                onChange={(e) => updateSettings({ restSeconds: Number(e.target.value) })}
                className="w-full accent-[var(--color-brand)]"
              />
            </Field>

            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-muted">
                Vibrate when rest is up
              </span>
              <input
                type="checkbox"
                checked={data.settings.restAlert}
                onChange={(e) => updateSettings({ restAlert: e.target.checked })}
                className="h-5 w-5 accent-[var(--color-brand)]"
              />
            </label>

            <Field label="Barbell weight (kg)" hint="Used by the plate calculator.">
              <NumberInput
                value={data.settings.barWeightKg}
                min={5}
                step={2.5}
                onChange={(e) => updateSettings({ barWeightKg: Number(e.target.value) })}
              />
            </Field>

            <Field label="Units">
              <Segmented
                value={profile.units}
                onChange={(units: "metric" | "imperial") => patchProfile({ units })}
                options={[
                  { value: "metric", label: "kg / cm" },
                  { value: "imperial", label: "lb / in" },
                ]}
              />
            </Field>
          </div>
        </Card>

        {/* ------------------------------- You ------------------------------- */}
        <Card>
          <h2 className="mb-3 font-semibold">About you</h2>
          <div className="space-y-4">
            <Field label="Name">
              <TextInput
                value={profile.name ?? ""}
                onChange={(e) => patchProfile({ name: e.target.value || undefined })}
              />
            </Field>
            <Field label="Height (cm)">
              <NumberInput
                value={profile.heightCm}
                onChange={(e) => patchProfile({ heightCm: Number(e.target.value) })}
              />
            </Field>
            <Field label="Date of birth">
              <TextInput
                type="date"
                value={profile.birthDate}
                onChange={(e) => patchProfile({ birthDate: e.target.value })}
              />
            </Field>
            <p className="text-sm text-muted">
              Current weight:{" "}
              {currentWeightKg != null
                ? formatWeight(currentWeightKg, profile.units)
                : "not logged"}{" "}
              · {data.metrics.length} weigh-ins recorded
            </p>
          </div>
        </Card>

        {/* ------------------------------ Memory ----------------------------- */}
        <MemoryPanel />

        {/* ------------------------------- Sync ------------------------------ */}
        <SyncSettings />

        {/* ------------------------------- Data ------------------------------ */}
        <StrongImport />

        <Card>
          <h2 className="font-semibold">Your data</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {data.entries.length} food entries · {data.sessions.length} sessions ·{" "}
            {data.metrics.length} weigh-ins · {data.memory.length} remembered facts, all
            stored locally in this browser. Back it up before switching device or clearing
            site data.
          </p>

          <input
            ref={backupRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void restoreBackup(e.target.files?.[0])}
          />

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={downloadBackup}>Export backup</Button>
            <Button onClick={() => backupRef.current?.click()}>Restore backup</Button>
          </div>

          {importMessage && (
            <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm text-muted">
              {importMessage}
            </p>
          )}

          <Button variant="danger" full className="mt-3" onClick={() => setResetOpen(true)}>
            Erase everything
          </Button>
        </Card>

        <p className="pb-6 text-center text-xs leading-relaxed text-faint">
          FitMe gives general fitness and nutrition guidance. It is not medical advice —
          talk to a doctor before making significant changes if you have a health
          condition, are pregnant, or are recovering from injury.
        </p>
      </div>

      <Sheet
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Erase everything?"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                // Built from emptyData() so new fields cannot be forgotten here.
                replaceAll({ ...emptyData(), settings: data.settings });
                router.push("/onboarding");
              }}
            >
              Erase
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-muted">
          This deletes your profile, food diary, training history and weigh-ins from this
          device. It cannot be undone. If you might want any of it back, export a backup
          first.
        </p>
      </Sheet>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireProfile>
      <Settings />
    </RequireProfile>
  );
}
