import type { Food, Nutrients } from "./types";
import type { MemoryFact } from "./memory";
import { findAlias } from "./memory";
import { matchFoodByName, nutrientsFor } from "./nutrition";
import { roundNutrients, scaleNutrients } from "./analytics";

/**
 * Grounding: turning what a model *said* about food into numbers worth trusting.
 *
 * A language model is good at reading a sentence or a photograph and working
 * out what was eaten and roughly how much. It is not a composition database,
 * and it should never be the source of truth for how much protein is in 100 g
 * of chicken. So every identified item is resolved against real data first:
 *
 *   1. a fact the user taught us ("milk" is that specific carton)
 *   2. a food the user created themselves
 *   3. the seed catalog
 *   4. only then, the model's own estimate — clearly labelled as such
 *
 * Running this on the client rather than in the API route matters: the user's
 * custom foods and memory live on the device, so this is the only place where
 * all four tiers are actually available.
 */

export interface RawFoodItem {
  name: string;
  description?: string;
  /** Estimated edible weight. */
  grams: number;
  confidence: number;
  /** The model's own macro estimate, used only as the last resort. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type GroundingBasis = "memory" | "custom" | "catalog" | "estimate";

export interface GroundedFoodItem {
  name: string;
  description?: string;
  grams: number;
  confidence: number;
  nutrients: Nutrients;
  basis: GroundingBasis;
  foodId?: string;
  /** The remembered fact that resolved this, if any. */
  factId?: string;
}

export interface GroundingContext {
  /** Every food available to the user: custom entries plus the seed catalog. */
  foods: Food[];
  memory: MemoryFact[];
}

export const BASIS_LABEL: Record<GroundingBasis, string> = {
  memory: "Remembered",
  custom: "Your food",
  catalog: "From database",
  estimate: "Estimated",
};

export const groundItem = (
  item: RawFoodItem,
  ctx: GroundingContext,
): GroundedFoodItem => {
  const byId = (id: string): Food | undefined => ctx.foods.find((f) => f.id === id);

  // 1. A fact the user taught us wins outright — it is the only tier that
  //    reflects a deliberate decision rather than an inference.
  const fact = findAlias(ctx.memory, item.name);
  if (fact?.foodId) {
    const food = byId(fact.foodId);
    if (food) {
      const grams = item.grams > 0 ? item.grams : (fact.defaultGrams ?? 100);
      return {
        name: food.name,
        description: item.description,
        grams,
        confidence: Math.max(item.confidence, 0.9),
        nutrients: nutrientsFor(food, grams),
        basis: "memory",
        foodId: food.id,
        factId: fact.id,
      };
    }
  }

  const grams = item.grams > 0 ? item.grams : (fact?.defaultGrams ?? 100);

  // 2. Foods the user created. A lower threshold is right here: they typed the
  //    name themselves, so a near match is far more likely to be the real thing.
  const custom = ctx.foods.filter((f) => !f.verified);
  const customMatch = custom.length ? matchFoodByName(custom, item.name, 300) : null;
  if (customMatch) {
    return {
      name: customMatch.name,
      description: item.description,
      grams,
      confidence: Math.max(item.confidence, 0.85),
      nutrients: nutrientsFor(customMatch, grams),
      basis: "custom",
      foodId: customMatch.id,
      factId: fact?.id,
    };
  }

  // 3. The seed catalog.
  const catalogMatch = matchFoodByName(ctx.foods, item.name);
  if (catalogMatch) {
    return {
      name: catalogMatch.name,
      description: item.description,
      grams,
      confidence: item.confidence,
      nutrients: nutrientsFor(catalogMatch, grams),
      basis: "catalog",
      foodId: catalogMatch.id,
      factId: fact?.id,
    };
  }

  // 4. Nothing matched. Keep the model's estimate, discount the confidence, and
  //    label it so the user knows which numbers are soft.
  return {
    name: item.name,
    description: item.description,
    grams,
    confidence: item.confidence * 0.85,
    nutrients: roundNutrients({
      kcal: item.kcal,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    }),
    basis: "estimate",
    factId: fact?.id,
  };
};

export const groundItems = (
  items: RawFoodItem[],
  ctx: GroundingContext,
): GroundedFoodItem[] => items.map((item) => groundItem(item, ctx));

/** Rescale a grounded item to a new portion, preserving its per-gram density. */
export const rescaleGrounded = (
  item: GroundedFoodItem,
  grams: number,
  foods: Food[],
): GroundedFoodItem => {
  if (item.foodId) {
    const food = foods.find((f) => f.id === item.foodId);
    if (food) return { ...item, grams, nutrients: nutrientsFor(food, grams) };
  }
  if (item.grams <= 0) return { ...item, grams };
  return {
    ...item,
    grams,
    nutrients: roundNutrients(scaleNutrients(item.nutrients, grams / item.grams)),
  };
};
