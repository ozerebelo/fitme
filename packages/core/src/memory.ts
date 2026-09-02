import { cryptoId } from "./nutrition";

/**
 * Personal memory.
 *
 * The single biggest cost of food tracking is re-describing the same foods
 * every day. "Milk" means one specific carton in your fridge; "my shake" is a
 * fixed recipe; "a coffee" is always the same size. Teaching the app those
 * facts once turns a two-minute logging chore into a sentence.
 *
 * Facts are stored as human-readable statements *and*, where possible, as a
 * link to a concrete food. The statement is what the language model sees when
 * parsing; the link is what makes the resulting entry exact rather than
 * estimated.
 */

export type MemoryKind =
  /** "milk" always means this specific product. */
  | "alias"
  /** Standing dietary facts: allergies, dislikes, habits. */
  | "preference"
  /** Recurring meals: "my usual breakfast". */
  | "routine";

export interface MemoryFact {
  id: string;
  kind: MemoryKind;
  /** The phrase the user actually says. Required for aliases. */
  trigger?: string;
  /** Resolved food, when the fact names something in the food list. */
  foodId?: string;
  /** Portion to assume when the user does not give one. */
  defaultGrams?: number;
  /** Plain-language statement of the fact. Always present. */
  text: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  lastUsedAt?: string;
}

export const normalizeTrigger = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export interface CreateFactInput {
  kind: MemoryKind;
  text: string;
  trigger?: string;
  foodId?: string;
  defaultGrams?: number;
}

export const createFact = (input: CreateFactInput): MemoryFact => {
  const now = new Date().toISOString();
  return {
    id: cryptoId(),
    kind: input.kind,
    trigger: input.trigger ? normalizeTrigger(input.trigger) : undefined,
    foodId: input.foodId,
    defaultGrams: input.defaultGrams,
    text: input.text.trim(),
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
  };
};

/**
 * Find the alias that best matches a food name.
 *
 * Longest trigger wins, so a user who has taught both "milk" and "oat milk"
 * gets the specific one. Matching is on whole words: "milk" must not fire on
 * "milkshake".
 */
export const findAlias = (
  memory: MemoryFact[],
  name: string,
): MemoryFact | null => {
  const haystack = normalizeTrigger(name);
  if (!haystack) return null;
  const words = new Set(haystack.split(" "));

  let best: MemoryFact | null = null;
  let bestLength = 0;

  for (const fact of memory) {
    if (fact.kind !== "alias" || !fact.trigger) continue;
    const trigger = fact.trigger;

    const matched =
      haystack === trigger ||
      (trigger.includes(" ")
        ? new RegExp(`(^| )${escapeRegExp(trigger)}( |$)`).test(haystack)
        : words.has(trigger));

    if (matched && trigger.length > bestLength) {
      best = fact;
      bestLength = trigger.length;
    }
  }

  return best;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Mark a fact as used, so the UI can surface what is actually earning its keep. */
export const touchFact = (fact: MemoryFact): MemoryFact => ({
  ...fact,
  usageCount: fact.usageCount + 1,
  lastUsedAt: new Date().toISOString(),
});

/**
 * Render memory as prompt context.
 *
 * Deliberately terse and in the user's own words — the model reasons better
 * about "a coffee means a 350 ml latte with oat milk" than about a JSON blob.
 */
export const memoryBriefing = (memory: MemoryFact[]): string => {
  if (memory.length === 0) return "";
  const ordered = [...memory].sort((a, b) => b.usageCount - a.usageCount);
  const lines: string[] = [];

  const aliases = ordered.filter((f) => f.kind === "alias");
  const routines = ordered.filter((f) => f.kind === "routine");
  const preferences = ordered.filter((f) => f.kind === "preference");

  if (aliases.length) {
    lines.push("What their words mean:");
    for (const fact of aliases) lines.push(`- ${fact.text}`);
  }
  if (routines.length) {
    lines.push("Their usual meals:");
    for (const fact of routines) lines.push(`- ${fact.text}`);
  }
  if (preferences.length) {
    lines.push("Standing facts about them:");
    for (const fact of preferences) lines.push(`- ${fact.text}`);
  }

  return lines.join("\n");
};

/** Guard against the same fact being taught twice under a different wording. */
export const findConflictingFact = (
  memory: MemoryFact[],
  candidate: { kind: MemoryKind; trigger?: string; text: string },
): MemoryFact | null => {
  if (candidate.kind === "alias" && candidate.trigger) {
    const trigger = normalizeTrigger(candidate.trigger);
    return memory.find((f) => f.kind === "alias" && f.trigger === trigger) ?? null;
  }
  const text = normalizeTrigger(candidate.text);
  return (
    memory.find((f) => f.kind === candidate.kind && normalizeTrigger(f.text) === text) ??
    null
  );
};
