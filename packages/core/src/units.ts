/** Unit conversion and formatting helpers. Storage is always metric. */

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

/** Energy density of body mass change. ~7700 kcal per kg of mostly-fat tissue. */
export const KCAL_PER_KG_BODY_MASS = 7700;

export const kgToLb = (kg: number): number => kg / KG_PER_LB;
export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const cmToIn = (cm: number): number => cm / CM_PER_IN;
export const inToCm = (inches: number): number => inches * CM_PER_IN;

export const cmToFtIn = (cm: number): { ft: number; inches: number } => {
  const totalIn = cmToIn(cm);
  const ft = Math.floor(totalIn / 12);
  return { ft, inches: Math.round((totalIn - ft * 12) * 10) / 10 };
};

export const ftInToCm = (ft: number, inches: number): number =>
  inToCm(ft * 12 + inches);

export const round = (n: number, dp = 0): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Clamp with sane behaviour when min > max (returns min). */
export const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(n, min), Math.max(min, max));

export const formatWeight = (kg: number, units: UnitSystemLike): string =>
  units === "imperial"
    ? `${round(kgToLb(kg), 1)} lb`
    : `${round(kg, 1)} kg`;

export const formatHeight = (cm: number, units: UnitSystemLike): string => {
  if (units === "imperial") {
    const { ft, inches } = cmToFtIn(cm);
    return `${ft}'${Math.round(inches)}"`;
  }
  return `${round(cm)} cm`;
};

export const formatLength = (cm: number, units: UnitSystemLike): string =>
  units === "imperial" ? `${round(cmToIn(cm), 1)} in` : `${round(cm, 1)} cm`;

type UnitSystemLike = "metric" | "imperial";

/** Display weight in the user's units, without the suffix. */
export const displayWeight = (kg: number, units: UnitSystemLike): number =>
  round(units === "imperial" ? kgToLb(kg) : kg, 1);

/** Parse a weight the user typed in their own units back to kg. */
export const parseWeight = (value: number, units: UnitSystemLike): number =>
  units === "imperial" ? lbToKg(value) : value;

/** The smallest plate increment available, in kg, for a given unit system.
 *  Progression suggestions snap to this so the number is actually loadable. */
export const loadIncrement = (
  units: UnitSystemLike,
  kind: "upper" | "lower",
): number => {
  if (units === "imperial") {
    // 5 lb and 10 lb jumps, expressed in kg.
    return lbToKg(kind === "upper" ? 5 : 10);
  }
  return kind === "upper" ? 2.5 : 5;
};

/** Snap a load to something you can actually put on a bar. */
export const snapLoad = (kg: number, units: UnitSystemLike): number => {
  if (units === "imperial") {
    const lb = kgToLb(kg);
    return lbToKg(Math.round(lb / 2.5) * 2.5);
  }
  return Math.round(kg / 1.25) * 1.25;
};
