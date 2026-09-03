import { describe, expect, it } from "vitest";
import {
  convert,
  formatMoney,
  parseAmount,
  toCents,
  unratedCurrencies,
} from "../src/index";
import { settings } from "./helpers";

describe("parseAmount", () => {
  it("reads the Portuguese convention", () => {
    expect(parseAmount("12,50")).toBe(1250);
    expect(parseAmount("1.234,56")).toBe(123456);
    expect(parseAmount("€ 1.234,56")).toBe(123456);
  });

  it("reads the English one", () => {
    expect(parseAmount("12.50")).toBe(1250);
    expect(parseAmount("1,234.56")).toBe(123456);
    expect(parseAmount("$1,234.56")).toBe(123456);
  });

  it("treats a lone separator with three digits after it as thousands", () => {
    // The genuinely ambiguous case, and thousands is right far more often.
    expect(parseAmount("1.234")).toBe(123400);
    expect(parseAmount("1,234")).toBe(123400);
    expect(parseAmount("1.23")).toBe(123);
  });

  it("handles both ways a statement writes a negative", () => {
    expect(parseAmount("-12,50")).toBe(-1250);
    expect(parseAmount("(12,50)")).toBe(-1250);
    expect(parseAmount("12,50-")).toBe(-1250);
  });

  it("returns null when there is nothing to read", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("  ")).toBeNull();
    expect(parseAmount("saldo")).toBeNull();
  });

  it("respects currencies with no minor unit", () => {
    expect(parseAmount("1200", "JPY")).toBe(1200);
    expect(toCents(12, "JPY")).toBe(12);
  });
});

describe("formatMoney", () => {
  it("rounds only when asked", () => {
    expect(formatMoney(123456, "EUR", { locale: "en-GB" })).toContain("1,234.56");
    expect(formatMoney(123456, "EUR", { locale: "en-GB", round: true })).toContain("1,235");
  });

  it("signs deltas", () => {
    expect(formatMoney(500, "EUR", { locale: "en-GB", signed: true })).toContain("+");
    expect(formatMoney(-500, "EUR", { locale: "en-GB" })).toContain("-");
  });
});

describe("convert", () => {
  const withRates = settings({
    baseCurrency: "EUR",
    rates: { USD: { rate: 0.9, asOf: "2026-01-01" } },
  });

  it("applies the rate the user typed", () => {
    expect(convert(10000, "USD", withRates)).toBe(9000);
  });

  it("leaves the base currency alone", () => {
    expect(convert(10000, "EUR", withRates)).toBe(10000);
  });

  it("passes an unrated currency through rather than zeroing the total", () => {
    expect(convert(10000, "GBP", withRates)).toBe(10000);
    expect(unratedCurrencies(["GBP", "USD", "EUR"], withRates)).toEqual(["GBP"]);
  });

  it("crosses a minor-unit boundary correctly", () => {
    const yen = settings({
      baseCurrency: "EUR",
      rates: { JPY: { rate: 0.0062, asOf: "2026-01-01" } },
    });
    // ¥10,000 is 10000 minor units; at 0.0062 that is €62.00 = 6200 cents.
    expect(convert(10000, "JPY", yen)).toBe(6200);
  });
});
