import type { DateKey } from "@fitme/core";
import { addDays, daysBetween, fromDateKey, toDateKey } from "@fitme/core";
import type { MonthKey } from "./types";

/**
 * Months, and the budgeting period that may not be one.
 *
 * Someone paid on the 25th does not live in calendar months, and a budget that
 * insists they do resets in the middle of their money. So every period-aware
 * calculation goes through `periodBounds`, which is the calendar month when
 * `startDay` is 1 — the ordinary case — and a shifted window otherwise.
 *
 * A shifted period is labelled by the month it *starts* in: 25 January to
 * 24 February is `2026-01`. Labelling by the end month would read more like a
 * payslip, but it makes "which month is this transaction in" ambiguous in
 * exactly the place people check it. The UI shows the dates under the label.
 */

const pad = (n: number): string => String(n).padStart(2, "0");

export const monthKeyOf = (date: DateKey): MonthKey => date.slice(0, 7);

export const currentMonthKey = (asOf: DateKey = toDateKey()): MonthKey =>
  monthKeyOf(asOf);

export const monthParts = (key: MonthKey): { year: number; month: number } => {
  const [year, month] = key.split("-").map(Number);
  return { year: year ?? 1970, month: month ?? 1 };
};

/** First calendar day of the month. */
export const monthStart = (key: MonthKey): DateKey => `${key}-01`;

export const daysInMonth = (key: MonthKey): number => {
  const { year, month } = monthParts(key);
  return new Date(year, month, 0).getDate();
};

/** Last calendar day of the month. */
export const monthEnd = (key: MonthKey): DateKey =>
  `${key}-${pad(daysInMonth(key))}`;

export const addMonths = (key: MonthKey, count: number): MonthKey => {
  const { year, month } = monthParts(key);
  const index = year * 12 + (month - 1) + count;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
};

export const monthsBetween = (from: MonthKey, to: MonthKey): number => {
  const a = monthParts(from);
  const b = monthParts(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
};

/** Inclusive list of month keys. */
export const monthRange = (from: MonthKey, to: MonthKey): MonthKey[] => {
  const out: MonthKey[] = [];
  const span = monthsBetween(from, to);
  for (let i = 0; i <= span; i++) out.push(addMonths(from, i));
  return out;
};

/** The last `n` months ending at `end`, oldest first. */
export const lastNMonths = (n: number, end: MonthKey): MonthKey[] =>
  monthRange(addMonths(end, -(n - 1)), end);

export const monthLabel = (key: MonthKey, locale?: string): string => {
  const { year, month } = monthParts(key);
  return new Date(year, month - 1, 1).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });
};

export const shortMonthLabel = (key: MonthKey, locale?: string): string => {
  const { year, month } = monthParts(key);
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: "short" });
};

/* -------------------------------------------------------------------------- */
/*                             Budgeting periods                              */
/* -------------------------------------------------------------------------- */

export interface Period {
  key: MonthKey;
  start: DateKey;
  end: DateKey;
  days: number;
}

/** Clamp a day-of-month to one that exists: the 31st of February is the 28th. */
const clampDay = (key: MonthKey, day: number): DateKey =>
  `${key}-${pad(Math.min(Math.max(1, Math.round(day)), daysInMonth(key)))}`;

export const periodBounds = (key: MonthKey, startDay = 1): Period => {
  const start = startDay <= 1 ? monthStart(key) : clampDay(key, startDay);
  const end =
    startDay <= 1
      ? monthEnd(key)
      : addDays(clampDay(addMonths(key, 1), startDay), -1);
  return { key, start, end, days: daysBetween(start, end) + 1 };
};

/** Which budgeting period a date falls in. */
export const periodOf = (date: DateKey, startDay = 1): Period => {
  const key = monthKeyOf(date);
  if (startDay <= 1) return periodBounds(key, startDay);
  const candidate = periodBounds(key, startDay);
  // Before this month's start day, the date belongs to the period that opened
  // in the previous month.
  return date < candidate.start ? periodBounds(addMonths(key, -1), startDay) : candidate;
};

/** How far into the period `asOf` is, 0–1. Drives every "pace" comparison. */
export const periodProgress = (period: Period, asOf: DateKey): number => {
  if (asOf < period.start) return 0;
  if (asOf >= period.end) return 1;
  return (daysBetween(period.start, asOf) + 1) / period.days;
};

export const daysLeftInPeriod = (period: Period, asOf: DateKey): number =>
  Math.max(0, daysBetween(asOf, period.end));

/**
 * Add months to a date, clamping the day to one the target month has.
 *
 * 31 January plus a month is 28 February, and the month after that is 31 March
 * — the clamp must not be sticky, or a rule anchored on the 31st quietly
 * becomes a rule about the 28th.
 */
export const addMonthsToDate = (date: DateKey, count: number): DateKey => {
  const source = fromDateKey(date);
  const day = source.getDate();
  const key = addMonths(monthKeyOf(date), count);
  return clampDay(key, day);
};
