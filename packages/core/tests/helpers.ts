import type { BodyMetric, FoodEntry, MealType, Profile, SetLog, WorkoutSession } from "../src/index";
import { addDays, toDateKey } from "../src/index";

export const makeProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: "test-user",
  sex: "male",
  birthDate: "1994-01-01",
  heightCm: 180,
  units: "metric",
  activityLevel: "moderate",
  goal: "lose",
  rateOfChangePctPerWeek: 0.5,
  trainingDaysPerWeek: 4,
  sessionMinutes: 60,
  experience: "intermediate",
  availableEquipment: ["barbell", "dumbbell", "cable", "machine", "bodyweight"],
  dietPreference: "none",
  allergies: [],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

export const makeEntry = (
  date: string,
  kcal: number,
  overrides: Partial<FoodEntry> = {},
): FoodEntry => ({
  id: `${date}-${Math.random()}`,
  date,
  meal: "lunch" as MealType,
  name: "Test food",
  grams: 100,
  nutrients: { kcal, protein: kcal / 40, carbs: kcal / 10, fat: kcal / 50, fiber: 3 },
  source: "catalog",
  createdAt: `${date}T12:00:00.000Z`,
  ...overrides,
});

export const makeMetric = (date: string, weightKg: number): BodyMetric => ({
  id: `m-${date}`,
  date,
  weightKg,
});

export const makeSet = (
  exerciseId: string,
  weightKg: number,
  reps: number,
  overrides: Partial<SetLog> = {},
): SetLog => ({
  id: `s-${Math.random()}`,
  exerciseId,
  weightKg,
  reps,
  completed: true,
  ...overrides,
});

export const makeSession = (
  date: string,
  sets: SetLog[],
  overrides: Partial<WorkoutSession> = {},
): WorkoutSession => ({
  id: `w-${date}-${Math.random()}`,
  date,
  name: "Session",
  startedAt: `${date}T18:00:00.000Z`,
  sets,
  cardio: [],
  ...overrides,
});

/** N consecutive days ending today, oldest first. */
export const daysEnding = (n: number, end = toDateKey()): string[] =>
  Array.from({ length: n }, (_, i) => addDays(end, -(n - 1 - i)));
