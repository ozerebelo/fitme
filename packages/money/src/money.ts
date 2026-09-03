import type { Cents, CurrencyCode, MoneySettings } from "./types";

/**
 * Amounts, in one place.
 *
 * Two rules hold everywhere else in the package because they hold here: money
 * is an integer number of minor units, and the only conversion between that
 * integer and a human decimal happens in `parseAmount` and `formatMoney`.
 */

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  symbol: string;
  /** Minor units per major unit, as a power of ten. Yen has none. */
  decimals: number;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  EUR: { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  GBP: { code: "GBP", name: "Pound sterling", symbol: "£", decimals: 2 },
  USD: { code: "USD", name: "US dollar", symbol: "$", decimals: 2 },
  BRL: { code: "BRL", name: "Brazilian real", symbol: "R$", decimals: 2 },
  CHF: { code: "CHF", name: "Swiss franc", symbol: "CHF", decimals: 2 },
  CAD: { code: "CAD", name: "Canadian dollar", symbol: "CA$", decimals: 2 },
  AUD: { code: "AUD", name: "Australian dollar", symbol: "A$", decimals: 2 },
  SEK: { code: "SEK", name: "Swedish krona", symbol: "kr", decimals: 2 },
  NOK: { code: "NOK", name: "Norwegian krone", symbol: "kr", decimals: 2 },
  DKK: { code: "DKK", name: "Danish krone", symbol: "kr", decimals: 2 },
  PLN: { code: "PLN", name: "Polish złoty", symbol: "zł", decimals: 2 },
  JPY: { code: "JPY", name: "Japanese yen", symbol: "¥", decimals: 0 },
};

export const currencyInfo = (code: CurrencyCode): CurrencyInfo =>
  CURRENCIES[code.toUpperCase()] ?? {
    code: code.toUpperCase(),
    name: code.toUpperCase(),
    symbol: code.toUpperCase(),
    decimals: 2,
  };

export const minorUnits = (code: CurrencyCode): number =>
  10 ** currencyInfo(code).decimals;

/* -------------------------------------------------------------------------- */
/*                                 Arithmetic                                 */
/* -------------------------------------------------------------------------- */

/** Round to a whole minor unit. Half away from zero, so −1.5 → −2. */
export const roundCents = (value: number): Cents =>
  value < 0 ? -Math.round(-value) : Math.round(value);

/** Major units (12.34) to minor (1234). */
export const toCents = (value: number, currency: CurrencyCode = "EUR"): Cents =>
  roundCents(value * minorUnits(currency));

/** Minor units to major, as a float — for charts and rate maths, never storage. */
export const toMajor = (cents: Cents, currency: CurrencyCode = "EUR"): number =>
  cents / minorUnits(currency);

export const sumCents = (values: Cents[]): Cents =>
  values.reduce((total, value) => total + value, 0);

/** Apply a percentage to an amount and land back on a whole minor unit. */
export const applyPct = (amount: Cents, pct: number): Cents =>
  roundCents(amount * (pct / 100));

/* -------------------------------------------------------------------------- */
/*                                  Parsing                                   */
/* -------------------------------------------------------------------------- */

const CLEAN = /[^0-9.,\-()]/g;

/**
 * Read an amount the way a person actually types it.
 *
 * `12,50`, `1.234,56`, `1,234.56`, `€ 12.50`, `-4,20`, `(4,20)` and `12` all
 * have to work, because all of them appear in Portuguese bank exports and in
 * what someone taps into a phone. The separator is decided per string rather
 * than per locale: a statement can carry both conventions in one file, and the
 * digits themselves say which is which.
 *
 * Returns null for anything with no digits in it, so callers can tell "nothing
 * typed yet" from "zero".
 */
export const parseAmount = (
  input: string,
  currency: CurrencyCode = "EUR",
): Cents | null => {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Accounting style: (12,50) means −12,50.
  const parenthesised = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(CLEAN, "");
  if (!/\d/.test(cleaned)) return null;

  const negative = parenthesised || cleaned.includes("-");
  const digitsAndSeparators = cleaned.replace(/[-()]/g, "");

  const lastComma = digitsAndSeparators.lastIndexOf(",");
  const lastDot = digitsAndSeparators.lastIndexOf(".");

  let decimalSeparator: "," | "." | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    // Both present: whichever comes last is the decimal point.
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0 || lastDot >= 0) {
    const index = Math.max(lastComma, lastDot);
    const separator = digitsAndSeparators[index] === "," ? "," : ".";
    const tail = digitsAndSeparators.slice(index + 1);
    const occurrences = digitsAndSeparators.split(separator).length - 1;
    // `1.234` is a thousand and a bit; `1.23` is a euro and a bit. Three
    // trailing digits with a single separator is the ambiguous case, and
    // thousands is the reading that is right far more often.
    decimalSeparator = occurrences === 1 && tail.length !== 3 ? separator : null;
  }

  let normalised: string;
  if (decimalSeparator) {
    const index =
      decimalSeparator === "," ? lastComma : lastDot;
    const whole = digitsAndSeparators.slice(0, index).replace(/[.,]/g, "");
    const fraction = digitsAndSeparators.slice(index + 1).replace(/[.,]/g, "");
    normalised = `${whole || "0"}.${fraction}`;
  } else {
    normalised = digitsAndSeparators.replace(/[.,]/g, "");
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return toCents(negative ? -value : value, currency);
};

/* -------------------------------------------------------------------------- */
/*                                 Formatting                                 */
/* -------------------------------------------------------------------------- */

export interface FormatOptions {
  locale?: string;
  /** Drop the minor units. Totals read better without a cent nobody spends. */
  round?: boolean;
  /** Always show a sign, including `+`. For deltas and cash flow. */
  signed?: boolean;
  /** `€1.2k`. For axes and dense rows. */
  compact?: boolean;
  /** Symbol off, digits only — for inputs. */
  bare?: boolean;
}

export const formatMoney = (
  cents: Cents,
  currency: CurrencyCode = "EUR",
  options: FormatOptions = {},
): string => {
  const info = currencyInfo(currency);
  const value = cents / 10 ** info.decimals;
  const locale = options.locale;
  const digits = options.round || options.compact ? 0 : info.decimals;

  let text: string;
  try {
    text = new Intl.NumberFormat(locale, {
      style: options.bare ? "decimal" : "currency",
      currency: info.code,
      currencyDisplay: "narrowSymbol",
      notation: options.compact ? "compact" : "standard",
      minimumFractionDigits: options.compact ? 0 : digits,
      maximumFractionDigits: options.compact ? 1 : digits,
      signDisplay: options.signed ? "exceptZero" : "auto",
    }).format(value);
  } catch {
    // An unknown code, or a runtime without full ICU. Better a plain number
    // than an exception in the middle of a balance sheet.
    const fixed = Math.abs(value).toFixed(digits);
    const sign = value < 0 ? "-" : options.signed && value > 0 ? "+" : "";
    text = options.bare ? `${sign}${fixed}` : `${sign}${info.symbol}${fixed}`;
  }
  return text;
};

/** Bare digits for an input field: `1234.56`, no symbol, no grouping. */
export const amountValue = (cents: Cents, currency: CurrencyCode = "EUR"): string => {
  const info = currencyInfo(currency);
  return (cents / 10 ** info.decimals).toFixed(info.decimals);
};

export const formatPct = (fraction: number, dp = 0): string =>
  `${(fraction * 100).toFixed(dp)}%`;

export const formatSignedPct = (fraction: number, dp = 1): string =>
  `${fraction > 0 ? "+" : ""}${(fraction * 100).toFixed(dp)}%`;

/* -------------------------------------------------------------------------- */
/*                                   Rates                                    */
/* -------------------------------------------------------------------------- */

export const DEFAULT_SETTINGS: MoneySettings = {
  baseCurrency: "EUR",
  rates: {},
  monthStartDay: 1,
  savingsRateTarget: 0.2,
  emergencyFundMonths: 6,
  expectedReturnPct: 5,
};

/**
 * Convert into the base currency using the rates the user typed.
 *
 * An unknown rate returns the amount unchanged rather than zero or a throw:
 * showing a slightly wrong total beats showing a blank net worth, and the UI
 * flags which currencies are unrated so the number can be trusted or fixed.
 */
export const convert = (
  amount: Cents,
  from: CurrencyCode,
  settings: MoneySettings,
): Cents => {
  const base = settings.baseCurrency.toUpperCase();
  const source = from.toUpperCase();
  if (source === base) return amount;

  const entry = settings.rates[source];
  if (!entry || !Number.isFinite(entry.rate) || entry.rate <= 0) return amount;

  // Rates are quoted per major unit, and the two currencies may not share a
  // minor-unit exponent — ¥1000 is 1000 minor units, €10 is 1000.
  const major = amount / minorUnits(source);
  return roundCents(major * entry.rate * minorUnits(base));
};

/** Currencies in use that have no rate on file, so the UI can say so. */
export const unratedCurrencies = (
  used: CurrencyCode[],
  settings: MoneySettings,
): CurrencyCode[] => {
  const base = settings.baseCurrency.toUpperCase();
  const seen = new Set<string>();
  for (const code of used) {
    const upper = code.toUpperCase();
    if (upper !== base && !settings.rates[upper]) seen.add(upper);
  }
  return [...seen].sort();
};
