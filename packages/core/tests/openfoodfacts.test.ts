import { describe, expect, it } from "vitest";
import {
  energyPer100,
  isValidBarcode,
  normalizeOffProduct,
  parseServingGrams,
  sodiumPer100Mg,
} from "../src/index";

describe("energy", () => {
  it("prefers a stated kcal figure", () => {
    expect(energyPer100({ "energy-kcal_100g": 250, energy_100g: 1046 })).toBe(250);
  });

  it("converts kilojoules when that is all there is", () => {
    expect(energyPer100({ energy_100g: 1046 })).toBeCloseTo(250, 0);
    expect(energyPer100({ "energy-kj_100g": 2000 })).toBeCloseTo(478, 0);
  });

  it("treats an implausibly small kJ value as kcal mislabelled", () => {
    // 59 "kJ" per 100 g would be almost nothing; it is oat milk in kcal.
    expect(energyPer100({ energy_100g: 59 })).toBe(59);
  });

  it("returns nothing when there is no energy data", () => {
    expect(energyPer100({})).toBeUndefined();
    expect(energyPer100(undefined)).toBeUndefined();
  });
});

describe("sodium", () => {
  it("uses sodium when present", () => {
    expect(sodiumPer100Mg({ sodium_100g: 0.5 })).toBe(500);
  });

  it("derives it from salt otherwise", () => {
    expect(sodiumPer100Mg({ salt_100g: 1.27 })).toBe(499);
  });
});

describe("serving sizes", () => {
  it("reads the shapes OFF actually contains", () => {
    expect(parseServingGrams("30 g")).toBe(30);
    expect(parseServingGrams("1 bar (60g)")).toBe(60);
    expect(parseServingGrams("250ml")).toBe(250);
    expect(parseServingGrams("2 biscuits (25 g)")).toBe(25);
    expect(parseServingGrams("30,5 g")).toBe(30.5);
  });

  it("prefers the weight in brackets over a count", () => {
    expect(parseServingGrams("2 slices (76 g)")).toBe(76);
  });

  it("gives up on nonsense rather than guessing", () => {
    expect(parseServingGrams("1 portion")).toBeUndefined();
    expect(parseServingGrams("")).toBeUndefined();
    expect(parseServingGrams(undefined)).toBeUndefined();
  });
});

describe("normalising a product", () => {
  const oatly = {
    code: "7394376616037",
    product_name: "Barista Oat Drink",
    brands: "Oatly, Oatly!",
    quantity: "1 l",
    serving_size: "100 ml",
    categories_tags: ["en:beverages", "en:plant-based-milk-alternatives"],
    nutriments: {
      "energy-kcal_100g": 59,
      proteins_100g: 1,
      carbohydrates_100g: 6.7,
      fat_100g: 3,
      fiber_100g: 0.8,
      salt_100g: 0.1,
    },
  };

  it("maps a well-populated product", () => {
    const { food } = normalizeOffProduct(oatly);
    expect(food).not.toBeNull();
    expect(food!.name).toBe("Barista Oat Drink");
    expect(food!.brand).toBe("Oatly");
    expect(food!.basis).toBe("ml");
    expect(food!.per100.kcal).toBe(59);
    expect(food!.per100.protein).toBe(1);
    expect(food!.barcode).toBe("7394376616037");
    expect(food!.source).toBe("openfoodfacts");
    // Crowd-sourced data is never marked verified.
    expect(food!.verified).toBe(false);
  });

  it("offers both the serving and the pack as portions", () => {
    const { food } = normalizeOffProduct(oatly);
    expect(food!.servings.map((s) => s.grams)).toContain(100);
  });

  it("rejects a product with no energy data instead of logging it as free", () => {
    const { food, reason } = normalizeOffProduct({
      code: "1",
      product_name: "Mystery snack",
      nutriments: {},
    });
    expect(food).toBeNull();
    expect(reason).toMatch(/no nutrition data/);
  });

  it("rejects a nameless product", () => {
    const { food, reason } = normalizeOffProduct({ code: "1", nutriments: { "energy-kcal_100g": 100 } });
    expect(food).toBeNull();
    expect(reason).toMatch(/no name/);
  });

  it("treats a solid as grams", () => {
    const { food } = normalizeOffProduct({
      code: "2",
      product_name: "Protein bar",
      quantity: "60 g",
      serving_size: "1 bar (60 g)",
      nutriments: { "energy-kcal_100g": 380, proteins_100g: 30 },
    });
    expect(food!.basis).toBe("g");
    expect(food!.servings[0]!.grams).toBe(60);
  });

  it("defaults missing macros to zero rather than dropping the product", () => {
    const { food } = normalizeOffProduct({
      code: "3",
      product_name: "Sparkling water",
      nutriments: { "energy-kcal_100g": 0 },
    });
    expect(food).not.toBeNull();
    expect(food!.per100.protein).toBe(0);
  });
});

describe("barcodes", () => {
  it("accepts real lengths and rejects everything else", () => {
    expect(isValidBarcode("7394376616037")).toBe(true);
    expect(isValidBarcode("50184453")).toBe(true);
    expect(isValidBarcode("123")).toBe(false);
    expect(isValidBarcode("abcdefgh")).toBe(false);
    expect(isValidBarcode("")).toBe(false);
  });
});
