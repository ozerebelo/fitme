import { cryptoId } from "@fitme/core";
import type { Category, CategoryRule, Transaction } from "./types";
import { CATEGORIES } from "./data/categories";
import { MERCHANT_PATTERNS } from "./data/merchants";

/**
 * Payee → category.
 *
 * The same mechanism serves three sources: the shipped merchant list, the rules
 * learned when you recategorise something, and the rules you write by hand.
 * Keeping them one list means the seeds are editable and the learned ones are
 * inspectable — the alternative is a black box that silently files your rent as
 * groceries with no way to find out why.
 */

/** Lowercase, strip accents, collapse punctuation and runs of whitespace. */
export const normalisePayee = (payee: string): string =>
  payee
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9&./ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does this pattern apply to this payee?
 *
 * Matching is anchored on the left of a word, never mid-word: `renda` must find
 * `RENDA CASA` and not `APRENDA`. It also has to end on a word boundary when
 * the pattern is three characters or fewer — `edp` inside `medperfil` is
 * noise — or when it was written with a trailing space, which is how the seed
 * list says "this short name and nothing longer": `digi ` is a phone company,
 * `digital` is not.
 */
export const patternMatches = (pattern: string, normalisedPayee: string): boolean => {
  const needle = normalisePayee(pattern);
  if (!needle) return false;
  const wholeWord = needle.length <= 3 || /\s$/.test(pattern);
  const right = wholeWord ? "(?![a-z0-9])" : "";
  const expression = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}${right}`);
  return expression.test(normalisedPayee);
};

export const seedRules = (): CategoryRule[] => {
  const now = new Date().toISOString();
  return MERCHANT_PATTERNS.map(([match, categoryId]) => ({
    id: `seed:${match}`,
    match,
    categoryId,
    source: "seed" as const,
    hits: 0,
    createdAt: now,
  }));
};

/**
 * The rules actually in play: the shipped list plus everything this person has
 * taught or written, with a stored rule replacing a seed of the same pattern.
 *
 * Only the taught ones are stored. Keeping the seeds in code means the merchant
 * list improves with the app rather than being frozen into every document that
 * was ever created, and it keeps a few hundred rules out of every sync payload.
 */
export const effectiveRules = (stored: CategoryRule[]): CategoryRule[] => {
  const overridden = new Set(stored.map((rule) => normalisePayee(rule.match)));
  return [
    ...seedRules().filter((rule) => !overridden.has(normalisePayee(rule.match))),
    ...stored,
  ];
};

export interface RuleMatch {
  rule: CategoryRule;
  categoryId: string;
}

/**
 * The best rule for a payee, or null.
 *
 * Longest pattern wins, and a rule you wrote outranks a seed of the same
 * length — `uber eats` is a restaurant, `uber` is a taxi, and if you have
 * decided that your local `uber eats` is in fact groceries, that stands.
 */
export const matchRule = (payee: string, rules: CategoryRule[]): RuleMatch | null => {
  const normalised = normalisePayee(payee);
  if (!normalised) return null;

  let best: CategoryRule | null = null;
  for (const rule of rules) {
    if (!patternMatches(rule.match, normalised)) continue;
    if (!best) {
      best = rule;
      continue;
    }
    const lengthDelta = rule.match.length - best.match.length;
    if (lengthDelta > 0) best = rule;
    else if (lengthDelta === 0 && best.source === "seed" && rule.source !== "seed") {
      best = rule;
    }
  }
  return best ? { rule: best, categoryId: best.categoryId } : null;
};

export const suggestCategory = (payee: string, rules: CategoryRule[]): string | null =>
  matchRule(payee, rules)?.categoryId ?? null;

/**
 * The pattern to learn from a payee.
 *
 * Bank descriptions are full of one-off noise — card numbers, branch codes,
 * dates — so the whole string is the wrong thing to remember; it would never
 * match again. The leading words are the merchant, so that is what is kept,
 * with digits dropped.
 */
export const patternFromPayee = (payee: string, words = 2): string => {
  const cleaned = normalisePayee(payee)
    .split(" ")
    .filter((word) => word.length > 1 && !/^\d+$/.test(word));
  return cleaned.slice(0, words).join(" ");
};

/**
 * Teach the rules that this payee means this category.
 *
 * Re-teaching updates in place rather than stacking a second, contradictory
 * rule — the same correction model the food memory uses.
 */
export const learnRule = (
  rules: CategoryRule[],
  payee: string,
  categoryId: string,
): CategoryRule[] => {
  const match = patternFromPayee(payee);
  if (!match) return rules;

  const existing = rules.find(
    (rule) => rule.source !== "seed" && normalisePayee(rule.match) === match,
  );
  if (existing) {
    return rules.map((rule) =>
      rule.id === existing.id
        ? { ...rule, categoryId, hits: rule.hits + 1, source: "learned" as const }
        : rule,
    );
  }

  return [
    ...rules,
    {
      id: cryptoId(),
      match,
      categoryId,
      source: "learned",
      hits: 1,
      createdAt: new Date().toISOString(),
    },
  ];
};

/** Apply the rules to anything still uncategorised. Used after an import. */
export const applyRules = (
  transactions: Transaction[],
  rules: CategoryRule[],
): { transactions: Transaction[]; categorised: number } => {
  let categorised = 0;
  const next = transactions.map((transaction) => {
    if (transaction.categoryId || transaction.transferId) return transaction;
    const categoryId = suggestCategory(transaction.payee, rules);
    if (!categoryId) return transaction;
    categorised++;
    return { ...transaction, categoryId };
  });
  return { transactions: next, categorised };
};

/* -------------------------------------------------------------------------- */
/*                             Category lookup                                */
/* -------------------------------------------------------------------------- */

/** Seed catalog plus the user's own, theirs first so an override is visible. */
export const allCategories = (custom: Category[] = []): Category[] => [
  ...custom,
  ...CATEGORIES.filter((seeded) => !custom.some((c) => c.id === seeded.id)),
];

export const categoryIndex = (custom: Category[] = []): Map<string, Category> =>
  new Map(allCategories(custom).map((category) => [category.id, category]));

/** Find a category by either of its names — how typed input resolves. */
export const findCategoryByName = (
  name: string,
  custom: Category[] = [],
): Category | null => {
  const needle = normalisePayee(name);
  if (!needle) return null;
  const candidates = allCategories(custom);
  return (
    candidates.find(
      (category) =>
        normalisePayee(category.name) === needle ||
        normalisePayee(category.namePt) === needle,
    ) ??
    candidates.find(
      (category) =>
        normalisePayee(category.name).startsWith(needle) ||
        normalisePayee(category.namePt).startsWith(needle),
    ) ??
    null
  );
};

/** A user-created category, ready to store. */
export const makeCategory = (
  name: string,
  group: Category["group"],
  kind: Category["kind"],
  color: string,
): Category => ({
  id: cryptoId(),
  name,
  namePt: name,
  group,
  kind,
  color,
  seed: false,
});
