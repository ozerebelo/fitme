"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ActivityLevel,
  DietPreference,
  Equipment,
  ExperienceLevel,
  Goal,
  Profile,
  Sex,
  UnitSystem,
} from "@fitme/core";
import {
  ACTIVITY_LABELS,
  RATE_BOUNDS,
  buildDailyTargets,
  buildEnergyPlan,
  cryptoId,
  ftInToCm,
  generateProgram,
  lbToKg,
  toDateKey,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import {
  Button,
  Card,
  Chip,
  Field,
  NumberInput,
  Segmented,
  Select,
  TextInput,
} from "@/components/ui";
import { ChevronLeftIcon } from "@/components/icons";

const EQUIPMENT_OPTIONS: { value: Equipment; label: string }[] = [
  { value: "bodyweight", label: "Bodyweight" },
  { value: "dumbbell", label: "Dumbbells" },
  { value: "barbell", label: "Barbell" },
  { value: "machine", label: "Machines" },
  { value: "cable", label: "Cables" },
  { value: "kettlebell", label: "Kettlebells" },
  { value: "band", label: "Bands" },
  { value: "cardio", label: "Cardio kit" },
];

const GOAL_COPY: Record<Goal, { title: string; detail: string }> = {
  lose: { title: "Lose fat", detail: "Calorie deficit, training to keep muscle" },
  maintain: { title: "Maintain", detail: "Hold weight, keep getting stronger" },
  gain: { title: "Build muscle", detail: "Controlled surplus, volume-led training" },
  recomp: { title: "Recomposition", detail: "Near maintenance, slow but steady change" },
};

const STEPS = ["You", "Goal", "Training", "Food", "Plan"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { setProfile, logWeight, setProgram, data } = useApp();
  const [step, setStep] = useState(0);

  const [units, setUnits] = useState<UnitSystem>("metric");
  const [name, setName] = useState("");
  const [sex, setSex] = useState<Sex>("male");
  const [birthDate, setBirthDate] = useState("1995-01-01");
  const [heightCm, setHeightCm] = useState(178);
  const [heightFt, setHeightFt] = useState(5);
  const [heightIn, setHeightIn] = useState(10);
  const [weightInput, setWeightInput] = useState(80);
  const [bodyFat, setBodyFat] = useState("");

  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("lose");
  const [rate, setRate] = useState(0.5);

  const [trainingDays, setTrainingDays] = useState(4);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [experience, setExperience] = useState<ExperienceLevel>("intermediate");
  const [equipment, setEquipment] = useState<Equipment[]>([
    "barbell",
    "dumbbell",
    "machine",
    "cable",
    "bodyweight",
  ]);

  const [diet, setDiet] = useState<DietPreference>("none");
  const [allergies, setAllergies] = useState("");

  const resolvedHeightCm = units === "imperial" ? ftInToCm(heightFt, heightIn) : heightCm;
  const weightKg = units === "imperial" ? lbToKg(weightInput) : weightInput;
  const bodyFatPct = bodyFat.trim() ? Number(bodyFat) : undefined;

  const draftProfile = useMemo<Profile>(
    () => ({
      id: data.profile?.id ?? cryptoId(),
      name: name.trim() || undefined,
      sex,
      birthDate,
      heightCm: resolvedHeightCm,
      units,
      activityLevel,
      goal,
      rateOfChangePctPerWeek: rate,
      trainingDaysPerWeek: trainingDays,
      sessionMinutes,
      experience,
      availableEquipment: equipment.length ? equipment : ["bodyweight"],
      dietPreference: diet,
      allergies: allergies
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      createdAt: data.profile?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    [
      data.profile, name, sex, birthDate, resolvedHeightCm, units, activityLevel,
      goal, rate, trainingDays, sessionMinutes, experience, equipment, diet, allergies,
    ],
  );

  const preview = useMemo(() => {
    const plan = buildEnergyPlan(draftProfile, weightKg, { bodyFatPct });
    const targets = buildDailyTargets(draftProfile, plan, weightKg, bodyFatPct);
    const program = generateProgram(draftProfile);
    return { plan, targets, program };
  }, [draftProfile, weightKg, bodyFatPct]);

  const bounds = RATE_BOUNDS[goal];

  const finish = (): void => {
    setProfile(draftProfile);
    logWeight({
      id: cryptoId(),
      date: toDateKey(),
      weightKg,
      bodyFatPct,
    });
    setProgram(preview.program);
    router.push("/");
  };

  const next = (): void => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = (): void => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="px-4 pb-10 pt-6">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              aria-label="Back"
              className="-ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-faint">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </span>
        </div>
        <div className="flex gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-surface-2"}`}
            />
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s set you up</h1>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              These numbers seed your starting targets. They are a first estimate — once
              you have a couple of weeks of data, FitMe measures your actual maintenance
              calories and replaces the estimate with it.
            </p>
          </div>

          <Segmented
            value={units}
            onChange={setUnits}
            options={[
              { value: "metric", label: "Metric (kg)" },
              { value: "imperial", label: "Imperial (lb)" },
            ]}
          />

          <Field label="Name (optional)">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should the coach call you?"
              autoComplete="given-name"
            />
          </Field>

          <Field label="Sex" hint="Used by the metabolic equations. Both formulas need it.">
            <Segmented
              value={sex}
              onChange={setSex}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
              ]}
            />
          </Field>

          <Field label="Date of birth">
            <TextInput
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </Field>

          {units === "metric" ? (
            <Field label="Height">
              <NumberInput
                value={heightCm}
                onChange={(e) => setHeightCm(Number(e.target.value))}
                min={120}
                max={230}
              />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Height (ft)">
                <NumberInput
                  value={heightFt}
                  onChange={(e) => setHeightFt(Number(e.target.value))}
                  min={3}
                  max={8}
                />
              </Field>
              <Field label="Height (in)">
                <NumberInput
                  value={heightIn}
                  onChange={(e) => setHeightIn(Number(e.target.value))}
                  min={0}
                  max={11}
                />
              </Field>
            </div>
          )}

          <Field label={`Current weight (${units === "imperial" ? "lb" : "kg"})`}>
            <NumberInput
              value={weightInput}
              step={0.1}
              onChange={(e) => setWeightInput(Number(e.target.value))}
            />
          </Field>

          <Field
            label="Body fat % (optional)"
            hint="If you know it, targets switch to the Katch-McArdle equation, which is more accurate at either end of the body-composition range."
          >
            <NumberInput
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              placeholder="e.g. 18"
              min={3}
              max={60}
            />
          </Field>

          <Button variant="primary" size="lg" full onClick={next}>
            Continue
          </Button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">What are you after?</h1>
          </div>

          <div className="grid gap-2">
            {(Object.keys(GOAL_COPY) as Goal[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setGoal(option);
                  const b = RATE_BOUNDS[option];
                  setRate(Math.min(Math.max(rate, b.min), b.max || b.min));
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  goal === option
                    ? "border-brand bg-brand/10"
                    : "border-border bg-surface hover:border-faint"
                }`}
              >
                <div className="font-medium">{GOAL_COPY[option].title}</div>
                <div className="mt-0.5 text-sm text-muted">{GOAL_COPY[option].detail}</div>
              </button>
            ))}
          </div>

          {bounds.max > 0 && (
            <Field
              label={`Rate: ${rate}% of bodyweight per week`}
              hint={
                goal === "lose"
                  ? "Faster than 1 %/week and an increasing share of what you lose is muscle. 0.5 % is the sweet spot for most people."
                  : "Muscle cannot be built faster than about 0.5 %/week. Anything quicker is mostly fat."
              }
            >
              <input
                type="range"
                min={bounds.min}
                max={bounds.max}
                step={0.125}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="w-full accent-[var(--color-brand)]"
              />
              <div className="mt-1 flex justify-between text-xs text-faint">
                <span>{bounds.min}% · gradual</span>
                <span>{bounds.max}% · aggressive</span>
              </div>
            </Field>
          )}

          <Field
            label="Day-to-day activity"
            hint="Not counting your workouts — this is your job and general movement."
          >
            <Select
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
            >
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((level) => (
                <option key={level} value={level}>
                  {ACTIVITY_LABELS[level]}
                </option>
              ))}
            </Select>
          </Field>

          <Button variant="primary" size="lg" full onClick={next}>
            Continue
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">How you train</h1>
            <p className="mt-1 text-sm text-muted">
              This decides your split. Be honest about the days you will actually show up
              for — a smaller plan you finish beats a bigger one you abandon.
            </p>
          </div>

          <Field label={`Training days per week: ${trainingDays}`}>
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={trainingDays}
              onChange={(e) => setTrainingDays(Number(e.target.value))}
              className="w-full accent-[var(--color-brand)]"
            />
          </Field>

          <Field label={`Time per session: ${sessionMinutes} minutes`}>
            <input
              type="range"
              min={20}
              max={120}
              step={5}
              value={sessionMinutes}
              onChange={(e) => setSessionMinutes(Number(e.target.value))}
              className="w-full accent-[var(--color-brand)]"
            />
          </Field>

          <Field label="Experience">
            <Segmented
              value={experience}
              onChange={setExperience}
              options={[
                { value: "beginner", label: "Beginner" },
                { value: "intermediate", label: "Intermediate" },
                { value: "advanced", label: "Advanced" },
              ]}
            />
          </Field>

          <Field label="Equipment you can get to" hint="Your plan only uses what you tick.">
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  selected={equipment.includes(option.value)}
                  onClick={() =>
                    setEquipment((current) =>
                      current.includes(option.value)
                        ? current.filter((e) => e !== option.value)
                        : [...current, option.value],
                    )
                  }
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </Field>

          <Button variant="primary" size="lg" full onClick={next}>
            Continue
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">How you eat</h1>
            <p className="mt-1 text-sm text-muted">
              Protein stays where the evidence puts it regardless. This shifts the balance
              of fat and carbohydrate.
            </p>
          </div>

          <Field label="Dietary pattern">
            <Select value={diet} onChange={(e) => setDiet(e.target.value as DietPreference)}>
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

          <Field
            label="Allergies and foods to avoid"
            hint="Comma separated. The coach will take these into account."
          >
            <TextInput
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="peanuts, shellfish"
            />
          </Field>

          <Button variant="primary" size="lg" full onClick={next}>
            See my plan
          </Button>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your starting plan</h1>
          </div>

          <Card>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Daily calories</span>
              <span className="tabular text-3xl font-semibold">{preview.targets.kcal}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Protein", value: preview.targets.protein, color: "var(--color-protein)" },
                { label: "Carbs", value: preview.targets.carbs, color: "var(--color-carbs)" },
                { label: "Fat", value: preview.targets.fat, color: "var(--color-fat)" },
              ].map((macro) => (
                <div key={macro.label} className="rounded-lg bg-surface-2 p-3">
                  <span
                    className="mx-auto mb-1.5 block h-1 w-8 rounded-full"
                    style={{ background: macro.color }}
                  />
                  <div className="tabular text-lg font-semibold">{macro.value} g</div>
                  <div className="text-xs text-faint">{macro.label}</div>
                </div>
              ))}
            </div>
            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Resting metabolism</dt>
                <dd className="tabular">{preview.plan.bmr} kcal</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Maintenance estimate</dt>
                <dd className="tabular">{preview.plan.tdee} kcal</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">
                  {preview.plan.adjustment < 0 ? "Deficit" : preview.plan.adjustment > 0 ? "Surplus" : "Adjustment"}
                </dt>
                <dd className="tabular">
                  {preview.plan.adjustment > 0 ? "+" : ""}
                  {preview.plan.adjustment} kcal
                </dd>
              </div>
            </dl>
            {preview.plan.floorApplied && (
              <p className="mt-3 rounded-lg bg-warn/10 p-3 text-xs leading-relaxed text-warn">
                Your requested rate would have taken you below a safe intake, so the target
                has been raised to the floor. Losing more slowly is the only way to do this
                without shedding muscle.
              </p>
            )}
          </Card>

          <Card>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Training plan</span>
              <span className="font-medium">{preview.program.name}</span>
            </div>
            <ul className="mt-3 space-y-2">
              {preview.program.days.map((day) => (
                <li key={day.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{day.name}</span>
                  <span className="truncate text-right text-xs text-faint">
                    {day.blocks.length} exercises
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {preview.program.rationale[0]}
            </p>
          </Card>

          <Button variant="primary" size="lg" full onClick={finish}>
            Start using FitMe
          </Button>
          <p className="text-center text-xs text-faint">
            Everything stays on this device. You can change any of it later.
          </p>
        </div>
      )}
    </div>
  );
}
