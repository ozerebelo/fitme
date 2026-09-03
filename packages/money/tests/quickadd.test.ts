import { describe, expect, it } from "vitest";
import { parseQuickAdd, seedRules } from "../src/index";
import { eur } from "./helpers";

const rules = seedRules();
const asOf = "2026-03-15";
const parse = (input: string) => parseQuickAdd(input, { rules, asOf });

describe("typed entry", () => {
  it("reads a Portuguese line", () => {
    const result = parse("almoço 12,50");
    expect(result.amount).toBe(-eur(12.5));
    expect(result.payee).toBe("almoço");
    expect(result.date).toBe(asOf);
  });

  it("drops the grammar and keeps the merchant", () => {
    expect(parse("café 1,20 no continente").payee).toBe("café continente");
  });

  it("categorises from the merchant", () => {
    const result = parse("54,32 continente");
    expect(result.categoryId).toBe("groceries");
    expect(result.categorySource).toBe("rule");
  });

  it("takes a category named outright over one inferred", () => {
    const result = parse("30 restaurantes tasca do ze");
    expect(result.categoryId).toBe("dining");
    expect(result.categorySource).toBe("named");
  });

  it("understands yesterday", () => {
    expect(parse("gasóleo 60 ontem").date).toBe("2026-03-14");
    expect(parse("gasóleo 60 anteontem").date).toBe("2026-03-13");
  });

  it("reads an explicit day and month", () => {
    expect(parse("jantar 40 02/03").date).toBe("2026-03-02");
  });

  it("reads a date with no year as the most recent one", () => {
    // On 15 March, `28/12` means last December, not next.
    expect(parse("presentes 80 28/12").date).toBe("2025-12-28");
  });

  it("flips the sign for money coming in", () => {
    const result = parse("recebi 1800 salário");
    expect(result.amount).toBe(eur(1800));
    expect(result.direction).toBe("income");
    expect(result.categoryId).toBe("salary");
  });

  it("works in English too", () => {
    const result = parse("lunch 12.50 yesterday");
    expect(result.amount).toBe(-eur(12.5));
    expect(result.date).toBe("2026-03-14");
  });

  it("takes only the first number as the amount", () => {
    const result = parse("2 cafés 2,40");
    expect(result.amount).toBe(-eur(2));
    expect(result.payee).toContain("cafés");
  });

  it("returns no amount rather than guessing one", () => {
    expect(parse("continente").amount).toBeNull();
  });

  it("says what it understood", () => {
    expect(parse("café 1,20 ontem").understood).toEqual([
      "an amount",
      "yesterday",
      "cafés & snacks",
    ]);
  });
});
