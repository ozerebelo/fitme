import type { Food, FoodEntry, MealType, Nutrients, NutritionSource } from "./types";
import { roundNutrients, scaleNutrients } from "./analytics";
import { round } from "./units";
import { toDateKey } from "./date";

/* -------------------------------------------------------------------------- */
/*                             Resolving portions                             */
/* -------------------------------------------------------------------------- */

/** Nutrients for an arbitrary weight of a food. */
export const nutrientsFor = (food: Food, grams: number): Nutrients =>
  roundNutrients(scaleNutrients(food.per100, grams / 100));

export interface CreateEntryInput {
  food: Food;
  grams: number;
  meal: MealType;
  date?: string;
  servingLabel?: string;
  source?: NutritionSource;
  confidence?: number;
  photoThumb?: string;
  notes?: string;
  id?: string;
}

export const createFoodEntry = (input: CreateEntryInput): FoodEntry => ({
  id: input.id ?? cryptoId(),
  date: input.date ?? toDateKey(),
  meal: input.meal,
  foodId: input.food.id,
  name: input.food.name,
  brand: input.food.brand,
  grams: round(input.grams, 1),
  servingLabel: input.servingLabel,
  nutrients: nutrientsFor(input.food, input.grams),
  source: input.source ?? (input.food.verified ? "catalog" : "custom"),
  confidence: input.confidence,
  photoThumb: input.photoThumb,
  notes: input.notes,
  createdAt: new Date().toISOString(),
});

/** A calories-only entry, for when the user knows the number but not the food. */
export const createQuickAddEntry = (input: {
  kcal: number;
  meal: MealType;
  name?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
  date?: string;
}): FoodEntry => ({
  id: cryptoId(),
  date: input.date ?? toDateKey(),
  meal: input.meal,
  name: input.name?.trim() || "Quick add",
  grams: 0,
  nutrients: {
    kcal: Math.round(input.kcal),
    protein: round(input.protein ?? 0, 1),
    carbs: round(input.carbs ?? 0, 1),
    fat: round(input.fat ?? 0, 1),
  },
  source: "quick_add",
  createdAt: new Date().toISOString(),
});

/** Rescale an existing entry to a new weight, keeping its per-gram density.
 *  Used by the photo flow when the user corrects a portion estimate. */
export const rescaleEntry = (entry: FoodEntry, grams: number): FoodEntry => {
  if (entry.grams <= 0) return entry;
  const factor = grams / entry.grams;
  return {
    ...entry,
    grams: round(grams, 1),
    nutrients: roundNutrients(scaleNutrients(entry.nutrients, factor)),
  };
};

/* -------------------------------------------------------------------------- */
/*                                   Search                                   */
/* -------------------------------------------------------------------------- */

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Rank a food against a query. Higher is better; 0 means no match.
 *
 * The ordering that matters in practice: exact name, then prefix, then all
 * query words present, then partial. Recently used foods are boosted by the
 * caller, because what you ate yesterday is the best predictor of today.
 */
export const scoreFood = (food: Food, query: string): number => {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(food.name);
  const brand = food.brand ? normalize(food.brand) : "";
  const haystack = `${name} ${brand} ${food.tags.join(" ")}`;

  if (name === q) return 1000;
  if (name.startsWith(q)) return 800 - name.length;

  const words = q.split(" ");
  if (words.every((w) => haystack.includes(w))) {
    const inName = words.filter((w) => name.includes(w)).length;
    return 500 + inName * 20 - name.length;
  }
  if (haystack.includes(q)) return 300 - name.length;
  return 0;
};

export interface SearchOptions {
  limit?: number;
  /** Food ids used recently, most recent first. Boosted in the ranking. */
  recentIds?: string[];
}

export const searchFoods = (
  foods: Food[],
  query: string,
  opts: SearchOptions = {},
): Food[] => {
  const recentRank = new Map(
    (opts.recentIds ?? []).map((id, i) => [id, opts.recentIds!.length - i]),
  );
  const q = query.trim();

  const scored = foods
    .map((food) => {
      const base = q ? scoreFood(food, q) : 0;
      const boost = (recentRank.get(food.id) ?? 0) * (q ? 5 : 100);
      return { food, score: base + boost };
    })
    .filter((r) => r.score > 0);

  scored.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name));
  return scored.slice(0, opts.limit ?? 30).map((r) => r.food);
};

/**
 * Best catalog match for a free-text food name, used to ground photo-derived
 * items in real composition data instead of a model's guess.
 * Returns null when nothing scores above the confidence bar.
 */
export const matchFoodByName = (
  foods: Food[],
  name: string,
  minScore = 500,
): Food | null => {
  let best: Food | null = null;
  let bestScore = 0;
  for (const food of foods) {
    const score = scoreFood(food, name);
    if (score > bestScore) {
      bestScore = score;
      best = food;
    }
  }
  return bestScore >= minScore ? best : null;
};

/* -------------------------------------------------------------------------- */
/*                              Meal organisation                             */
/* -------------------------------------------------------------------------- */

export const groupByMeal = (
  entries: FoodEntry[],
): Record<MealType, FoodEntry[]> => {
  const out: Record<MealType, FoodEntry[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  for (const e of entries) out[e.meal].push(e);
  return out;
};

/** Meal to default to when logging, based on the time of day. */
export const defaultMealForTime = (date: Date = new Date()): MealType => {
  const h = date.getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
};

/* -------------------------------------------------------------------------- */
/*                              Custom foods                                  */
/* -------------------------------------------------------------------------- */

export interface CustomFoodInput {
  name: string;
  brand?: string;
  /** Nutrients as entered, for the serving size the user typed. */
  servingGrams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  basis?: "g" | "ml";
  barcode?: string;
  source?: string;
}

/** Normalise a user-entered food to the per-100 g representation we store. */
export const createCustomFood = (input: CustomFoodInput): Food => {
  const factor = 100 / Math.max(input.servingGrams, 0.01);
  return {
    id: `custom-${cryptoId()}`,
    name: input.name.trim(),
    brand: input.brand?.trim() || undefined,
    basis: input.basis ?? "g",
    per100: {
      kcal: round(input.kcal * factor, 1),
      protein: round(input.protein * factor, 2),
      carbs: round(input.carbs * factor, 2),
      fat: round(input.fat * factor, 2),
      fiber: input.fiber != null ? round(input.fiber * factor, 2) : undefined,
    },
    servings: [{ label: `1 serving (${round(input.servingGrams, 1)} g)`, grams: input.servingGrams }],
    tags: ["custom"],
    verified: false,
    barcode: input.barcode,
    source: input.source,
  };
};

/**
 * Sanity check on user-entered macros: the macros should roughly account for
 * the stated calories. A large mismatch is nearly always a typo.
 */
export const macroCalorieMismatch = (input: {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}): number => {
  const implied = input.protein * 4 + input.carbs * 4 + input.fat * 9;
  if (input.kcal <= 0) return 0;
  return round((implied - input.kcal) / input.kcal, 3);
};

/* -------------------------------------------------------------------------- */

/** Short unique id. Uses crypto when available, falls back for older runtimes. */
export const cryptoId = (): string => {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};
