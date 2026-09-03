import type { DateKey } from "@fitme/core";
import { addDays, toDateKey } from "@fitme/core";
import type { Category, CategoryRule, Cents } from "./types";
import { parseAmount } from "./money";
import { findCategoryByName, normalisePayee, suggestCategory } from "./rules";

/**
 * One line in, one transaction out.
 *
 * `almoço 12,50 no zé`, `café 1,20`, `55 continente ontem`, `recebi 1800
 * salário` — the daily-spend log only stays current if adding to it costs one
 * sentence, and a form with five fields is why most people's ledgers stop in
 * February.
 *
 * It runs entirely on the device, in Portuguese and English, and it never
 * guesses silently: everything it decided comes back in the result for the row
 * that is shown before saving.
 */

const TODAY_WORDS = ["hoje", "today"];
const YESTERDAY_WORDS = ["ontem", "yesterday"];
const DAY_BEFORE_WORDS = ["anteontem"];

/** Words that flip the sign. Everything else is money going out. */
const INCOME_WORDS = [
  "recebi",
  "recebido",
  "entrada",
  "ganhei",
  "salario",
  "ordenado",
  "vencimento",
  "reembolso",
  "received",
  "income",
  "refund",
  "salary",
  "paid me",
];

/** Noise that is never part of a merchant's name. */
const FILLER = new Set([
  "no",
  "na",
  "nos",
  "nas",
  "em",
  "de",
  "do",
  "da",
  "com",
  "para",
  "por",
  "euros",
  "euro",
  "eur",
  "at",
  "in",
  "on",
  "for",
  "from",
  "to",
  "the",
  "a",
  "o",
]);

export interface QuickAdd {
  /** Signed, like every other amount: negative for spending. */
  amount: Cents | null;
  date: DateKey;
  payee: string;
  categoryId: string | null;
  direction: "expense" | "income";
  /** How the category was reached, so the review row can say so. */
  categorySource: "named" | "rule" | "none";
  /** What was actually recognised, for the "did it understand me" line. */
  understood: string[];
}

const DATE_TOKEN = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/;

export const parseQuickAdd = (
  input: string,
  options: {
    rules?: CategoryRule[];
    categories?: Category[];
    currency?: string;
    asOf?: DateKey;
  } = {},
): QuickAdd => {
  const asOf = options.asOf ?? toDateKey();
  const currency = options.currency ?? "EUR";
  const understood: string[] = [];

  const raw = input.trim();
  const tokens = raw.split(/\s+/).filter(Boolean);

  let date = asOf;
  let amount: Cents | null = null;
  let direction: "expense" | "income" = "expense";
  const rest: string[] = [];

  const normalisedLine = normalisePayee(raw);
  if (INCOME_WORDS.some((word) => normalisedLine.includes(word))) {
    direction = "income";
    understood.push("money in");
  }

  for (const token of tokens) {
    const plain = normalisePayee(token);

    if (TODAY_WORDS.includes(plain)) {
      understood.push("today");
      continue;
    }
    if (YESTERDAY_WORDS.includes(plain)) {
      date = addDays(asOf, -1);
      understood.push("yesterday");
      continue;
    }
    if (DAY_BEFORE_WORDS.includes(plain)) {
      date = addDays(asOf, -2);
      understood.push("the day before yesterday");
      continue;
    }

    const dateMatch = DATE_TOKEN.exec(token);
    if (dateMatch) {
      const day = Number(dateMatch[1]);
      const month = Number(dateMatch[2]);
      const yearPart = dateMatch[3];
      const year = yearPart
        ? Number(yearPart.length === 2 ? `20${yearPart}` : yearPart)
        : Number(asOf.slice(0, 4));
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        // A day-and-month with no year that lands in the future means last year:
        // on 3 January, "31/12" is a fortnight ago, not in eleven months.
        date = !yearPart && candidate > asOf ? shiftYear(candidate, -1) : candidate;
        understood.push("a date");
        continue;
      }
    }

    // A bare number, or one wearing a currency symbol, is the amount — but only
    // the first one. The second number in `2 cafes 2,40` is not the price.
    if (amount == null && /\d/.test(token) && !/^\d+x$/i.test(token)) {
      const parsed = parseAmount(token, currency);
      if (parsed != null && parsed !== 0) {
        amount = Math.abs(parsed);
        understood.push("an amount");
        continue;
      }
    }

    rest.push(token);
  }

  // Everything left over is the payee, minus the words that are only grammar.
  const words = rest.filter((word) => !FILLER.has(normalisePayee(word)));
  const payee = words.join(" ").trim();

  let categoryId: string | null = null;
  let categorySource: QuickAdd["categorySource"] = "none";

  // A category named outright wins over one inferred from the merchant: if
  // someone wrote `supermercado`, that is not a guess to be second-guessed.
  for (const word of words) {
    const category = findCategoryByName(word, options.categories);
    if (category && category.kind === (direction === "income" ? "income" : "expense")) {
      categoryId = category.id;
      categorySource = "named";
      understood.push(category.name.toLowerCase());
      break;
    }
  }

  if (!categoryId && options.rules && payee) {
    const suggested = suggestCategory(payee, options.rules);
    if (suggested) {
      categoryId = suggested;
      categorySource = "rule";
    }
  }

  return {
    amount: amount == null ? null : direction === "income" ? amount : -amount,
    date,
    payee: payee || (direction === "income" ? "Income" : "Expense"),
    categoryId,
    direction,
    categorySource,
    understood,
  };
};

const shiftYear = (date: DateKey, years: number): DateKey => {
  const [year, rest] = [Number(date.slice(0, 4)) + years, date.slice(4)];
  return `${year}${rest}`;
};
