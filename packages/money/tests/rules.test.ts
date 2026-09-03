import { describe, expect, it } from "vitest";
import {
  effectiveRules,
  findCategoryByName,
  learnRule,
  matchRule,
  patternFromPayee,
  seedRules,
  suggestCategory,
} from "../src/index";

const seeds = seedRules();

describe("payee matching", () => {
  it("categorises the usual Portuguese statement lines", () => {
    expect(suggestCategory("COMPRA CONTINENTE 4515 LISBOA", seeds)).toBe("groceries");
    expect(suggestCategory("PAG SERV EDP COMERCIAL", seeds)).toBe("utilities");
    expect(suggestCategory("PINGO DOCE ALVALADE", seeds)).toBe("groceries");
    expect(suggestCategory("GALP AREEIRO", seeds)).toBe("fuel");
    expect(suggestCategory("FARMACIA CENTRAL", seeds)).toBe("health");
  });

  it("ignores accents and case", () => {
    expect(suggestCategory("comissão de manutenção de conta", seeds)).toBe("fees");
    expect(suggestCategory("Transferência RENDA CASA", seeds)).toBe("housing");
  });

  it("prefers the longer pattern", () => {
    expect(suggestCategory("UBER EATS", seeds)).toBe("dining");
    expect(suggestCategory("UBER TRIP", seeds)).toBe("transport");
  });

  it("does not match mid-word", () => {
    // `renda` inside `aprenda`, and a three-letter pattern inside a longer word.
    expect(suggestCategory("APRENDA INGLES ONLINE", seeds)).not.toBe("housing");
    expect(suggestCategory("DIGITAL RIVER GMBH", seeds)).not.toBe("telecom");
  });

  it("returns nothing rather than guessing", () => {
    expect(suggestCategory("ZZQQ 1234", seeds)).toBeNull();
  });
});

describe("learning", () => {
  it("keeps the merchant and drops the noise", () => {
    expect(patternFromPayee("COMPRA TASCA DO ZE 1234 LISBOA")).toBe("compra tasca");
    expect(patternFromPayee("PADARIA 4512")).toBe("padaria");
  });

  it("corrects a rule in place rather than stacking a second one", () => {
    const once = learnRule([], "MERCEARIA DO JOAO", "groceries");
    const twice = learnRule(once, "MERCEARIA DO JOAO", "dining");
    expect(twice).toHaveLength(1);
    expect(twice[0]?.categoryId).toBe("dining");
    expect(twice[0]?.hits).toBe(2);
  });

  it("lets a taught rule override a seed of the same pattern", () => {
    const stored = learnRule([], "netflix", "entertainment");
    const rules = effectiveRules(stored);
    expect(suggestCategory("NETFLIX.COM", rules)).toBe("entertainment");
    // And the seed is gone rather than shadowed, so there is one rule to edit.
    expect(rules.filter((rule) => rule.match === "netflix")).toHaveLength(1);
  });

  it("reports which rule fired, so the UI can show its working", () => {
    const match = matchRule("LIDL SETUBAL", seeds);
    expect(match?.rule.match).toBe("lidl");
    expect(match?.rule.source).toBe("seed");
  });
});

describe("category lookup", () => {
  it("finds a category by either language", () => {
    expect(findCategoryByName("supermercado")?.id).toBe("groceries");
    expect(findCategoryByName("Groceries")?.id).toBe("groceries");
    expect(findCategoryByName("restaurantes")?.id).toBe("dining");
  });
});
