import { describe, expect, it } from "vitest";
import type { Food, GroundingContext } from "../src/index";
import {
  FOODS,
  createCustomFood,
  createFact,
  gramsFor,
  parseFacts,
  parseMeal,
  parseQuantity,
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

const ctx: GroundingContext = { foods: FOODS, memory: [] };
const withMemory: GroundingContext = {
  foods: [oatly, ...FOODS],
  memory: [
    createFact({
      kind: "alias",
      trigger: "milk",
      text: "Milk means Oatly Barista, usually 250 ml",
      foodId: oatly.id,
      defaultGrams: 250,
    }),
  ],
};

describe("quantities", () => {
  it("reads digits, words and fractions", () => {
    expect(parseQuantity("2 eggs").amount).toBe(2);
    expect(parseQuantity("two eggs").amount).toBe(2);
    expect(parseQuantity("a banana").amount).toBe(1);
    expect(parseQuantity("half an avocado").amount).toBe(0.5);
    expect(parseQuantity("1/2 avocado").amount).toBe(0.5);
    expect(parseQuantity("1.5 scoops whey").amount).toBe(1.5);
    expect(parseQuantity("2x eggs").amount).toBe(2);
  });

  it("reads units, glued or spaced", () => {
    expect(parseQuantity("200g chicken")).toMatchObject({ amount: 200, unit: "g" });
    expect(parseQuantity("200 g chicken")).toMatchObject({ amount: 200, unit: "g" });
    expect(parseQuantity("2 tbsp olive oil")).toMatchObject({ amount: 2, unit: "tbsp" });
    expect(parseQuantity("250ml milk")).toMatchObject({ amount: 250, unit: "ml" });
  });

  it("leaves the food name behind", () => {
    expect(parseQuantity("200g chicken breast").rest).toBe("chicken breast");
    expect(parseQuantity("a couple of eggs").rest).toBe("eggs");
    expect(parseQuantity("2 tbsp of peanut butter").rest).toBe("peanut butter");
  });

  it("defaults to one when no quantity is given", () => {
    expect(parseQuantity("banana")).toMatchObject({ amount: 1, rest: "banana" });
  });
});

describe("grams", () => {
  const banana = FOODS.find((f) => f.id === "banana")!;
  const bread = FOODS.find((f) => f.id === "bread-wholewheat")!;
  const oil = FOODS.find((f) => f.id === "olive-oil")!;

  it("converts absolute units exactly", () => {
    expect(gramsFor({ amount: 200, unit: "g", rest: "" }, banana)).toBe(200);
    expect(gramsFor({ amount: 1, unit: "kg", rest: "" }, banana)).toBe(1000);
    expect(gramsFor({ amount: 1, unit: "oz", rest: "" }, banana)).toBeCloseTo(28.4, 0);
  });

  it("prefers the food's own serving over a generic household figure", () => {
    // Wholemeal bread carries "1 slice (38 g)"; the generic slice is 30 g.
    expect(gramsFor({ amount: 2, unit: "slice", rest: "" }, bread)).toBe(76);
  });

  it("falls back to a generic figure when the food has no matching serving", () => {
    expect(gramsFor({ amount: 2, unit: "tbsp", rest: "" }, oil)).toBe(27); // oil has a tbsp serving
    // No banana serving mentions a bowl, so the guess is capped at the food's
    // own largest portion rather than the generic 300 g for a bowl.
    expect(gramsFor({ amount: 1, unit: "bowl", rest: "" }, banana)).toBe(136);
  });

  it("treats a bare count as that many servings", () => {
    // One medium banana is 118 g.
    expect(gramsFor({ amount: 2, unit: undefined, rest: "" }, banana)).toBe(236);
  });
});

describe("parsing a meal", () => {
  it("handles the everyday sentence", () => {
    const result = parseMeal("two eggs, toast with butter and a coffee", ctx);
    expect(result.confident).toBe(true);
    expect(result.items).toHaveLength(4);
    expect(result.items[0]!.name).toBe("Egg, whole");
    // "Toast" is not a catalogue name; either bread is a fair answer.
    expect(result.items[1]!.name).toMatch(/bread/i);
    expect(result.items[2]!.name).toBe("Butter");
    expect(result.items[3]!.name).toBe("Coffee, black");
    // Two large eggs = 100 g.
    expect(result.items[0]!.grams).toBe(100);
    expect(result.items[0]!.nutrients.kcal).toBe(143);
  });

  it("strips the way people actually open a sentence", () => {
    const result = parseMeal("I just had 200g chicken breast and 150g white rice", ctx);
    expect(result.items.map((i) => i.grams)).toEqual([200, 150]);
    expect(result.items[0]!.nutrients.protein).toBe(62);
  });

  it("applies a taught alias and its usual portion", () => {
    const result = parseMeal("a coffee with milk", withMemory);
    const milk = result.items.find((i) => i.name.includes("Oatly"));
    expect(milk).toBeDefined();
    expect(milk!.basis).toBe("memory");
    expect(milk!.grams).toBe(250);
  });

  it("lets an explicit amount beat the remembered portion", () => {
    const result = parseMeal("100ml milk", withMemory);
    expect(result.items[0]!.grams).toBe(100);
  });

  it("reports what it could not resolve instead of guessing", () => {
    const result = parseMeal("a banana and some wagyu tomahawk", ctx);
    expect(result.items.map((i) => i.name)).toEqual(["Banana"]);
    expect(result.unresolved.map((u) => u.fragment)).toEqual(["some wagyu tomahawk"]);
    expect(result.confident).toBe(false);
    expect(result.coverage).toBe(0.5);
  });

  it("is not confident about a sentence it understood nothing of", () => {
    const result = parseMeal("whatever was in the fridge", ctx);
    expect(result.confident).toBe(false);
    expect(result.items).toHaveLength(0);
  });

  it("never invents nutrition for an unknown food", () => {
    const result = parseMeal("300g mystery stew", ctx);
    expect(result.items).toHaveLength(0);
    expect(result.unresolved).toHaveLength(1);
  });
});

describe("teaching phrases", () => {
  it("recognises an alias and its portion", () => {
    const [fact] = parseFacts("whenever I say milk it's Oatly Barista, usually 250ml");
    expect(fact).toMatchObject({ kind: "alias", trigger: "milk", defaultGrams: 250 });
    expect(fact!.foodName).toMatch(/Oatly Barista/);
    expect(fact!.statement).toMatch(/^Milk means/);
  });

  it("recognises the shorter form", () => {
    const [fact] = parseFacts("shake means my protein shake");
    expect(fact).toMatchObject({ kind: "alias", trigger: "shake" });
  });

  it("recognises a routine", () => {
    const [fact] = parseFacts("my usual breakfast is oats, whey and a banana");
    expect(fact).toMatchObject({ kind: "routine" });
    expect(fact!.statement).toMatch(/Usual breakfast is oats/);
  });

  it("recognises standing preferences", () => {
    expect(parseFacts("I don't eat pork")[0]).toMatchObject({ kind: "preference" });
    expect(parseFacts("I'm vegetarian")[0]!.statement).toMatch(/vegetarian/);
  });

  it("does not treat a teaching sentence as a meal", () => {
    const result = parseMeal("whenever I say milk it's Oatly Barista, usually 250ml", ctx);
    expect(result.items).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    expect(result.confident).toBe(true);
  });

  it("finds nothing in an ordinary sentence", () => {
    expect(parseFacts("two eggs and toast")).toEqual([]);
  });
});
