import { describe, expect, it } from "vitest";
import {
  FOODS,
  FOOD_BY_ID,
  createCustomFood,
  createQuickAddEntry,
  createFoodEntry,
  defaultMealForTime,
  groupByMeal,
  macroCalorieMismatch,
  matchFoodByName,
  nutrientsFor,
  rescaleEntry,
  searchFoods,
  sumEntries,
} from "../src/index";

describe("portions", () => {
  it("scales nutrients from the per-100 g basis", () => {
    const chicken = FOOD_BY_ID.get("chicken-breast")!;
    const n = nutrientsFor(chicken, 200);
    expect(n.kcal).toBe(330);
    expect(n.protein).toBe(62);
  });

  it("snapshots nutrients onto the entry", () => {
    const entry = createFoodEntry({
      food: FOOD_BY_ID.get("banana")!,
      grams: 118,
      meal: "breakfast",
      date: "2024-05-01",
    });
    expect(entry.nutrients.kcal).toBe(105);
    expect(entry.name).toBe("Banana");
    expect(entry.foodId).toBe("banana");
  });

  it("rescales an entry proportionally", () => {
    const entry = createFoodEntry({
      food: FOOD_BY_ID.get("chicken-breast")!,
      grams: 100,
      meal: "lunch",
    });
    const doubled = rescaleEntry(entry, 200);
    expect(doubled.nutrients.kcal).toBe(330);
    expect(doubled.grams).toBe(200);
  });

  it("supports calorie-only quick adds", () => {
    const entry = createQuickAddEntry({ kcal: 250, meal: "snack" });
    expect(entry.source).toBe("quick_add");
    expect(entry.nutrients.kcal).toBe(250);
    expect(entry.grams).toBe(0);
  });
});

describe("totals", () => {
  it("sums a day", () => {
    const entries = [
      createFoodEntry({ food: FOOD_BY_ID.get("banana")!, grams: 100, meal: "breakfast" }),
      createFoodEntry({ food: FOOD_BY_ID.get("oats")!, grams: 100, meal: "breakfast" }),
    ];
    const totals = sumEntries(entries);
    expect(totals.kcal).toBe(89 + 389);
    expect(totals.fiber).toBeCloseTo(2.6 + 10.6, 1);
  });

  it("groups by meal", () => {
    const grouped = groupByMeal([
      createFoodEntry({ food: FOOD_BY_ID.get("banana")!, grams: 100, meal: "breakfast" }),
      createFoodEntry({ food: FOOD_BY_ID.get("apple")!, grams: 100, meal: "snack" }),
    ]);
    expect(grouped.breakfast).toHaveLength(1);
    expect(grouped.snack).toHaveLength(1);
    expect(grouped.dinner).toHaveLength(0);
  });
});

describe("search", () => {
  it("puts exact matches first", () => {
    expect(searchFoods(FOODS, "banana")[0]!.id).toBe("banana");
  });

  it("matches on all query words", () => {
    const results = searchFoods(FOODS, "greek yogurt");
    expect(results.some((f) => f.id.startsWith("greek-yogurt"))).toBe(true);
  });

  it("boosts recently used foods", () => {
    const results = searchFoods(FOODS, "", { recentIds: ["cod", "banana"] });
    expect(results[0]!.id).toBe("cod");
  });

  it("grounds a free-text name against the catalog", () => {
    expect(matchFoodByName(FOODS, "chicken breast")?.id).toBe("chicken-breast");
    expect(matchFoodByName(FOODS, "wagyu tomahawk with truffle jus")).toBeNull();
  });
});

describe("custom foods", () => {
  it("normalises a per-serving entry to per 100 g", () => {
    const food = createCustomFood({
      name: "My shake",
      servingGrams: 50,
      kcal: 200,
      protein: 20,
      carbs: 10,
      fat: 5,
    });
    expect(food.per100.kcal).toBe(400);
    expect(food.per100.protein).toBe(40);
    expect(food.verified).toBe(false);
    expect(food.servings[0]!.grams).toBe(50);
  });

  it("flags macros that do not match the stated calories", () => {
    // 20 g protein + 15 g carbs + 6 g fat = 194 kcal, near enough to 200.
    expect(Math.abs(macroCalorieMismatch({ kcal: 200, protein: 20, carbs: 15, fat: 6 }))).toBeLessThan(0.1);
    // 40 g protein + 40 g carbs + 20 g fat is 500 kcal, not 200.
    expect(macroCalorieMismatch({ kcal: 200, protein: 40, carbs: 40, fat: 20 })).toBeGreaterThan(0.5);
  });
});

describe("meal defaults", () => {
  it("picks the meal from the time of day", () => {
    expect(defaultMealForTime(new Date(2024, 4, 1, 8))).toBe("breakfast");
    expect(defaultMealForTime(new Date(2024, 4, 1, 13))).toBe("lunch");
    expect(defaultMealForTime(new Date(2024, 4, 1, 19))).toBe("dinner");
    expect(defaultMealForTime(new Date(2024, 4, 1, 23))).toBe("snack");
  });
});
