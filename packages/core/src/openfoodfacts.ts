import type { Food, Serving } from "./types";
import { round } from "./units";

/**
 * Open Food Facts normalisation.
 *
 * OFF is a crowd-sourced database of branded products — the thing a curated
 * seed catalog can never cover, because it is a moving target of thousands of
 * supermarket SKUs. The data is correspondingly messy: energy may be in
 * kilojoules or kilocalories, sodium may be given as salt, serving sizes are
 * free text, and plenty of products are missing macros entirely.
 *
 * This module is the airlock. Everything crossing it is either a usable `Food`
 * or nothing at all — a product with no calories is worse than no result,
 * because it silently logs a meal as free.
 */

export interface OffNutriments {
  "energy-kcal_100g"?: number;
  energy_100g?: number;
  "energy-kj_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  fiber_100g?: number;
  sugars_100g?: number;
  "saturated-fat_100g"?: number;
  sodium_100g?: number;
  salt_100g?: number;
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
  categories_tags?: string[];
}

export const KJ_PER_KCAL = 4.184;

const num = (value: unknown): number | undefined => {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Energy per 100 g, preferring a stated kcal figure over converting from kJ. */
export const energyPer100 = (n: OffNutriments | undefined): number | undefined => {
  if (!n) return undefined;
  const kcal = num(n["energy-kcal_100g"]);
  if (kcal != null) return round(kcal, 1);
  const kj = num(n["energy-kj_100g"]) ?? num(n.energy_100g);
  // `energy_100g` is kJ by OFF convention, but a few records store kcal in it.
  // A "kJ" value under 100 for a real food is almost certainly kcal mislabelled.
  if (kj != null) return round(kj > 100 ? kj / KJ_PER_KCAL : kj, 1);
  return undefined;
};

/** Sodium in mg per 100 g, derived from salt when sodium is absent. */
export const sodiumPer100Mg = (n: OffNutriments | undefined): number | undefined => {
  if (!n) return undefined;
  const sodium = num(n.sodium_100g);
  if (sodium != null) return Math.round(sodium * 1000);
  const salt = num(n.salt_100g);
  // Salt is sodium chloride; sodium is ~39.3 % of it by mass.
  if (salt != null) return Math.round(salt * 1000 * 0.393);
  return undefined;
};

/**
 * Pull a gram weight out of OFF's free-text serving size.
 * Handles "30 g", "1 bar (60g)", "250ml", "2 biscuits (25 g)".
 */
export const parseServingGrams = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  // Prefer a figure in brackets — that is the weight, not the count.
  const bracketed = value.match(/\(([^)]*)\)/);
  const candidates = [bracketed?.[1], value].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const match = candidate.match(/([\d.,]+)\s*(g|gr|gram|grams|ml|millilitres?)\b/i);
    if (match) {
      const grams = Number.parseFloat(match[1]!.replace(",", "."));
      if (Number.isFinite(grams) && grams > 0 && grams < 5000) return round(grams, 1);
    }
  }
  return undefined;
};

/** OFF stores drinks with an ml quantity; treat those as liquids. */
const looksLiquid = (product: OffProduct): boolean => {
  const text = `${product.quantity ?? ""} ${product.serving_size ?? ""}`.toLowerCase();
  if (/\bml\b|\bcl\b|\blitre|\bliter|\bl\b/.test(text)) return true;
  return (product.categories_tags ?? []).some((tag) => /beverage|drink|water|juice/.test(tag));
};

export interface NormalizeResult {
  food: Food | null;
  /** Why the product was rejected, for the UI to explain. */
  reason?: string;
}

/**
 * Turn an OFF product into a `Food`, or explain why it cannot be used.
 * Products without a name or without energy data are rejected outright.
 */
export const normalizeOffProduct = (product: OffProduct): NormalizeResult => {
  const name = (product.product_name_en || product.product_name || product.generic_name || "").trim();
  if (!name) {
    return { food: null, reason: "This product has no name recorded in Open Food Facts." };
  }

  const kcal = energyPer100(product.nutriments);
  if (kcal == null) {
    return {
      food: null,
      reason: `“${name}” is in Open Food Facts but has no nutrition data yet. You can add it as a food yourself from the label.`,
    };
  }

  const n = product.nutriments ?? {};
  const basis = looksLiquid(product) ? "ml" : "g";

  const servings: Serving[] = [];
  const servingGrams =
    parseServingGrams(product.serving_size) ?? num(product.serving_quantity);
  if (servingGrams && servingGrams > 0) {
    servings.push({
      label: `1 serving (${round(servingGrams, 1)} ${basis})`,
      grams: servingGrams,
    });
  }
  const packGrams = parseServingGrams(product.quantity);
  if (packGrams && packGrams > 0 && packGrams !== servingGrams && packGrams <= 2000) {
    servings.push({ label: `Whole pack (${round(packGrams, 1)} ${basis})`, grams: packGrams });
  }

  const brand = product.brands?.split(",")[0]?.trim() || undefined;

  return {
    food: {
      id: `off-${product.code ?? name.toLowerCase().replace(/\s+/g, "-")}`,
      name,
      brand,
      basis,
      per100: {
        kcal,
        protein: round(num(n.proteins_100g) ?? 0, 2),
        carbs: round(num(n.carbohydrates_100g) ?? 0, 2),
        fat: round(num(n.fat_100g) ?? 0, 2),
        fiber: num(n.fiber_100g) != null ? round(num(n.fiber_100g)!, 2) : undefined,
        sugar: num(n.sugars_100g) != null ? round(num(n.sugars_100g)!, 2) : undefined,
        satFat:
          num(n["saturated-fat_100g"]) != null
            ? round(num(n["saturated-fat_100g"])!, 2)
            : undefined,
        sodiumMg: sodiumPer100Mg(n),
      },
      servings,
      tags: ["branded"],
      // Not "verified" in our sense: it is crowd-sourced, and the UI says so.
      verified: false,
      source: "openfoodfacts",
      barcode: product.code,
    },
  };
};

/** A barcode is 8–14 digits; anything else is a typo or a misread. */
export const isValidBarcode = (code: string): boolean => /^\d{8,14}$/.test(code.trim());
