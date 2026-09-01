/** Calendar-date helpers. A "date key" is a local-time `YYYY-MM-DD` string. */

export type DateKey = string;

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local-time date key. Deliberately not `toISOString()`, which is UTC and
 *  silently shifts the day for anyone west of Greenwich in the evening. */
export const toDateKey = (d: Date = new Date()): DateKey =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const fromDateKey = (key: DateKey): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

export const addDays = (key: DateKey, days: number): DateKey => {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

export const daysBetween = (a: DateKey, b: DateKey): number =>
  Math.round(
    (fromDateKey(b).getTime() - fromDateKey(a).getTime()) / 86_400_000,
  );

/** Inclusive list of date keys from `start` to `end`. */
export const dateRange = (start: DateKey, end: DateKey): DateKey[] => {
  const out: DateKey[] = [];
  const n = daysBetween(start, end);
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
};

/** The last `n` days ending at `end` (inclusive). */
export const lastNDays = (n: number, end: DateKey = toDateKey()): DateKey[] =>
  dateRange(addDays(end, -(n - 1)), end);

/** ISO weekday, 1 = Monday .. 7 = Sunday. */
export const weekdayOf = (key: DateKey): number => {
  const js = fromDateKey(key).getDay();
  return js === 0 ? 7 : js;
};

export const isWeekend = (key: DateKey): boolean => weekdayOf(key) >= 6;

/** Monday of the week containing `key`. */
export const startOfWeek = (key: DateKey): DateKey =>
  addDays(key, -(weekdayOf(key) - 1));

export const ageFrom = (birthDate: DateKey, asOf: DateKey = toDateKey()): number => {
  const b = fromDateKey(birthDate);
  const a = fromDateKey(asOf);
  let age = a.getFullYear() - b.getFullYear();
  const m = a.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < b.getDate())) age--;
  return Math.max(0, age);
};

export const formatDayLabel = (key: DateKey, today: DateKey = toDateKey()): string => {
  const diff = daysBetween(key, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  return fromDateKey(key).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};
