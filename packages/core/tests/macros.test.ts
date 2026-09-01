import { describe, expect, it } from "vitest";
import { FAT_FLOOR_G_PER_KG, buildMacroTargets, fiberTarget, kcalFromMacros } from "../src/index";

const base = {
  weightKg: 80,
  goal: "lose" as const,
  diet: "none" as const,
  trains: true,
};

describe("macro targets", () => {
  it("splits calories into macros that add back up", () => {
    const m = buildMacroTargets({ ...base, kcal: 2200 });
    expect(kcalFromMacros(m)).toBeGreaterThan(2200 * 0.97);
    expect(kcalFromMacros(m)).toBeLessThan(2200 * 1.03);
  });

  it("references lean mass when body fat is known", () => {
    const withBf = buildMacroTargets({ ...base, kcal: 2200, bodyFatPct: 20 });
    const without = buildMacroTargets({ ...base, kcal: 2200 });
    // 64 kg lean × 2.4 vs 80 kg × 2.0 — close, but derived differently.
    expect(withBf.proteinGPerKg).toBe(2.4);
    expect(without.proteinGPerKg).toBe(2.0);
    expect(withBf.protein).toBeCloseTo(64 * 2.4, 0);
  });

  it("sets more protein in a deficit than in a surplus", () => {
    const cutting = buildMacroTargets({ ...base, kcal: 2200, goal: "lose" });
    const bulking = buildMacroTargets({ ...base, kcal: 2200, goal: "gain" });
    expect(cutting.protein).toBeGreaterThan(bulking.protein);
  });

  it("never drops fat below the hormonal floor", () => {
    const m = buildMacroTargets({ ...base, kcal: 1200, diet: "high_carb" });
    expect(m.fat).toBeGreaterThanOrEqual(80 * FAT_FLOOR_G_PER_KG - 0.5);
  });

  it("compresses protein rather than going negative on carbs", () => {
    const m = buildMacroTargets({ ...base, kcal: 900 });
    expect(m.carbs).toBeGreaterThanOrEqual(0);
    expect(m.compressed).toBe(true);
    expect(kcalFromMacros(m)).toBeLessThanOrEqual(900 * 1.05);
  });

  it("moves fat and carbs with diet preference but holds protein", () => {
    const standard = buildMacroTargets({ ...base, kcal: 2200, diet: "none" });
    const keto = buildMacroTargets({ ...base, kcal: 2200, diet: "keto" });
    expect(keto.fat).toBeGreaterThan(standard.fat);
    expect(keto.carbs).toBeLessThan(standard.carbs);
    expect(keto.protein).toBe(standard.protein);
  });

  it("scales fibre with intake, within sane bounds", () => {
    expect(fiberTarget(2000)).toBe(28);
    expect(fiberTarget(800)).toBe(18);
    expect(fiberTarget(6000)).toBe(60);
  });

  it("honours a protein override", () => {
    const m = buildMacroTargets({ ...base, kcal: 2500, proteinGPerKgOverride: 1.5 });
    expect(m.protein).toBeCloseTo(80 * 1.5, 0);
  });
});
