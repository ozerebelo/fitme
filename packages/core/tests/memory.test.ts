import { describe, expect, it } from "vitest";
import type { Food } from "../src/index";
import {
  BASIS_LABEL,
  FOODS,
  createCustomFood,
  createFact,
  findAlias,
  findConflictingFact,
  groundItem,
  groundItems,
  memoryBriefing,
  normalizeTrigger,
  rescaleGrounded,
  touchFact,
} from "../src/index";

const oatly: Food = {
  ...createCustomFood({
    name: "Oatly Barista Oat Drink",
    servingGrams: 100,
    kcal: 59,
    protein: 1,
    carbs: 6.7,
    fat: 3,
  }),
  id: "custom-oatly",
};

const raw = (name: string, grams = 100, over: Partial<Record<string, number>> = {}) => ({
  name,
  grams,
  confidence: 0.7,
  kcal: 200,
  protein: 10,
  carbs: 20,
  fat: 8,
  ...over,
});

describe("triggers", () => {
  it("normalises punctuation, case and accents", () => {
    expect(normalizeTrigger("  Café  Latte! ")).toBe("cafe latte");
  });
});

describe("alias matching", () => {
  const memory = [
    createFact({ kind: "alias", trigger: "milk", text: "Milk means Oatly Barista", foodId: oatly.id, defaultGrams: 250 }),
    createFact({ kind: "alias", trigger: "oat milk", text: "Oat milk means Oatly Barista", foodId: oatly.id }),
  ];

  it("matches on whole words", () => {
    expect(findAlias(memory, "milk")?.trigger).toBe("milk");
    expect(findAlias(memory, "coffee with milk")?.trigger).toBe("milk");
  });

  it("does not fire on a word that merely contains the trigger", () => {
    expect(findAlias(memory, "milkshake")).toBeNull();
    expect(findAlias(memory, "buttermilk pancakes")).toBeNull();
  });

  it("prefers the most specific trigger", () => {
    expect(findAlias(memory, "a glass of oat milk")?.trigger).toBe("oat milk");
  });

  it("ignores non-alias facts", () => {
    const prefs = [createFact({ kind: "preference", text: "No pork" })];
    expect(findAlias(prefs, "pork")).toBeNull();
  });
});

describe("grounding", () => {
  const foods = [oatly, ...FOODS];
  const memory = [
    createFact({
      kind: "alias",
      trigger: "milk",
      text: "Milk means Oatly Barista, usually 250 ml",
      foodId: oatly.id,
      defaultGrams: 250,
    }),
  ];

  it("resolves a taught alias to the exact food", () => {
    const item = groundItem(raw("milk", 200), { foods, memory });
    expect(item.basis).toBe("memory");
    expect(item.foodId).toBe(oatly.id);
    expect(item.name).toBe("Oatly Barista Oat Drink");
    expect(item.nutrients.kcal).toBe(118); // 59 kcal/100 ml at 200 ml
    expect(item.factId).toBe(memory[0]!.id);
  });

  it("falls back to the remembered portion when none is given", () => {
    const item = groundItem(raw("milk", 0), { foods, memory });
    expect(item.grams).toBe(250);
  });

  it("prefers the user's own foods over the catalog", () => {
    const mine = createCustomFood({
      name: "Chicken breast",
      servingGrams: 100,
      kcal: 999,
      protein: 1,
      carbs: 1,
      fat: 1,
    });
    const item = groundItem(raw("chicken breast"), { foods: [mine, ...FOODS], memory: [] });
    expect(item.basis).toBe("custom");
    expect(item.nutrients.kcal).toBe(999);
  });

  it("uses the catalog when nothing personal matches", () => {
    const item = groundItem(raw("banana", 118), { foods: FOODS, memory: [] });
    expect(item.basis).toBe("catalog");
    expect(item.foodId).toBe("banana");
    expect(item.nutrients.kcal).toBe(105);
  });

  it("keeps the model estimate for anything unknown, and discounts it", () => {
    const item = groundItem(raw("wagyu tomahawk with truffle jus", 300), {
      foods: FOODS,
      memory: [],
    });
    expect(item.basis).toBe("estimate");
    expect(item.nutrients.kcal).toBe(200);
    expect(item.confidence).toBeLessThan(0.7);
  });

  it("labels every basis for the UI", () => {
    for (const basis of ["memory", "custom", "catalog", "estimate"] as const) {
      expect(BASIS_LABEL[basis]).toBeTruthy();
    }
  });

  it("grounds a whole meal in one pass", () => {
    const items = groundItems(
      [raw("milk", 250), raw("banana", 118), raw("mystery stew", 400)],
      { foods, memory },
    );
    expect(items.map((i) => i.basis)).toEqual(["memory", "catalog", "estimate"]);
  });
});

describe("rescaling", () => {
  const foods = [oatly, ...FOODS];

  it("recomputes from the linked food, not from rounded numbers", () => {
    const item = groundItem(raw("banana", 100), { foods, memory: [] });
    const doubled = rescaleGrounded(item, 200, foods);
    expect(doubled.nutrients.kcal).toBe(178); // 89 kcal/100 g
  });

  it("scales an unlinked estimate proportionally", () => {
    const item = groundItem(raw("mystery stew", 100), { foods, memory: [] });
    const half = rescaleGrounded(item, 50, foods);
    expect(half.nutrients.kcal).toBe(100);
  });
});

describe("briefing and bookkeeping", () => {
  it("renders memory in the user's own words, grouped by kind", () => {
    const briefing = memoryBriefing([
      createFact({ kind: "alias", trigger: "milk", text: "Milk means Oatly Barista" }),
      createFact({ kind: "preference", text: "Does not eat pork" }),
      createFact({ kind: "routine", text: "Usual breakfast is oats, whey and a banana" }),
    ]);
    expect(briefing).toMatch(/What their words mean:/);
    expect(briefing).toMatch(/Their usual meals:/);
    expect(briefing).toMatch(/Standing facts about them:/);
    expect(briefing).toMatch(/Oatly Barista/);
  });

  it("is empty when nothing has been taught", () => {
    expect(memoryBriefing([])).toBe("");
  });

  it("counts usage", () => {
    const fact = createFact({ kind: "alias", trigger: "milk", text: "x" });
    expect(touchFact(fact).usageCount).toBe(1);
    expect(touchFact(fact).lastUsedAt).toBeTruthy();
  });

  it("spots a re-taught alias so it updates rather than duplicates", () => {
    const memory = [createFact({ kind: "alias", trigger: "milk", text: "Milk means Oatly" })];
    expect(
      findConflictingFact(memory, { kind: "alias", trigger: "  Milk ", text: "Milk means semi-skimmed" })?.id,
    ).toBe(memory[0]!.id);
    expect(findConflictingFact(memory, { kind: "alias", trigger: "cheese", text: "x" })).toBeNull();
  });
});
