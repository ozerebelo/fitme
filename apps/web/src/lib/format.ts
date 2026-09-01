import type { UnitSystem } from "@fitme/core";
import { displayWeight, kgToLb, round } from "@fitme/core";

export const kcal = (value: number): string => `${Math.round(value)}`;

export const grams = (value: number): string => `${Math.round(value)} g`;

/** Weight in the user's units, with the suffix. */
export const weight = (kg: number, units: UnitSystem, dp = 1): string =>
  units === "imperial"
    ? `${round(kgToLb(kg), dp)} lb`
    : `${round(kg, dp)} kg`;

/** Weight in the user's units, bare number — for input fields. */
export const weightValue = (kg: number, units: UnitSystem): number =>
  displayWeight(kg, units);

export const unitLabel = (units: UnitSystem): string =>
  units === "imperial" ? "lb" : "kg";

export const signed = (value: number, dp = 0): string =>
  `${value > 0 ? "+" : ""}${round(value, dp)}`;

export const percent = (value: number): string => `${Math.round(value * 100)}%`;

export const duration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const minutesLabel = (minutes: number): string => {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** `1.2 kg/week` etc, with the sign that makes sense for weight change. */
export const rate = (kgPerWeek: number, units: UnitSystem): string => {
  const value = units === "imperial" ? kgToLb(kgPerWeek) : kgPerWeek;
  const suffix = units === "imperial" ? "lb" : "kg";
  return `${value > 0 ? "+" : ""}${round(value, 2)} ${suffix}/wk`;
};

export const clsx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");
