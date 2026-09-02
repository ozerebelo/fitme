import type { Food } from "./types";
import type { MemoryFact, MemoryKind } from "./memory";
import type { GroundedFoodItem, GroundingContext } from "./grounding";
import { groundItem } from "./grounding";
import { findAlias, normalizeTrigger } from "./memory";
import { matchFoodByName, scoreFood } from "./nutrition";
import {
  EXTRA_HOUSEHOLD_UNITS,
  FILLER_PREFIX,
  OF_PREFIX,
  PT_COUNT_NOISE,
  PT_LEADING_NOISE,
  PT_NUMBER_WORDS,
  PT_SEPARATOR_SOURCES,
  PT_STOP_FRAGMENTS,
  PT_UNIT_ALIASES,
  PT_UNIT_PHRASES,
  deaccent,
  looksPortuguese,
} from "./pt";
import { round } from "./units";

/**
 * On-device parsing of a typed meal.
 *
 * "Two eggs, toast with butter and a coffee" needs no language model: it is a
 * quantity, a unit and a food name, three times over. Handling that locally
 * makes the common case free, instant and available offline — the model is
 * then only worth calling for the sentences this cannot resolve.
 *
 * The parser is deliberately conservative. It reports what it could not resolve
 * rather than guessing, so the caller can decide whether to escalate.
 *
 * It reads English and Portuguese. The structure of a meal description is the
 * same in both — a quantity, a measure and a food — so only the vocabulary is
 * language-specific, and all of that lives in `pt.ts`. Both vocabularies are
 * always active: there is no language switch to get wrong, and "2 ovos com
 * toast" parses as readily as either language on its own.
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5, couple: 2,
  ...PT_NUMBER_WORDS,
};

/** Units that convert straight to grams or millilitres. */
const ABSOLUTE_UNITS: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gr: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  ml: 1, millilitre: 1, millilitres: 1, milliliter: 1, milliliters: 1,
  l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6,
};

/**
 * Household measures, in grams, used only when the food itself does not carry a
 * matching serving. A food's own serving is always better: "1 slice (38 g)" of
 * bread beats any generic figure for a slice.
 */
const HOUSEHOLD_UNITS: Record<string, number> = {
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  cup: 200, cups: 200,
  slice: 30, slices: 30,
  scoop: 30, scoops: 30,
  handful: 30, handfuls: 30,
  glass: 250, glasses: 250,
  can: 330, cans: 330,
  bottle: 500, bottles: 500,
  bowl: 300, bowls: 300,
  piece: 100, pieces: 100,
  portion: 150, portions: 150,
  serving: 100, servings: 100,
  square: 10, squares: 10,
  bar: 50, bars: 50,
  pint: 568, pints: 568,
  shot: 25, shots: 25,
  ...EXTRA_HOUSEHOLD_UNITS,
};

/** Phrases people open with that carry no food information. */
const LEADING_NOISE: readonly RegExp[] = [
  /^(?:i\s+(?:just\s+)?(?:had|ate|have|took)|for\s+(?:breakfast|lunch|dinner|a\s+snack)|today\s+i\s+had|this\s+morning|log|add|ate|had)\b[\s,:-]*/i,
  ...PT_LEADING_NOISE,
];

/** Strip openings until none is left: "hoje ao almoço comi" is three layers. */
const stripNoise = (text: string): string => {
  let out = text.trim();
  for (let pass = 0; pass < LEADING_NOISE.length; pass += 1) {
    const before = out;
    for (const pattern of LEADING_NOISE) out = out.replace(pattern, "").trim();
    if (out === before) break;
  }
  return out;
};

/**
 * Run against the original text, accents intact. That is deliberate: in
 * Portuguese "e" joins a list and "é" is the verb "is", and a de-accented copy
 * would split "o almoço é dois ovos" in the middle of a sentence.
 */
const SEPARATOR = new RegExp(
  `\\s*(?:,|;|\\+|\\band\\b|\\bwith\\b|\\bplus\\b|${PT_SEPARATOR_SOURCES.join("|")})\\s*`,
  "i",
);

export interface ParsedFact {
  kind: MemoryKind;
  trigger?: string;
  statement: string;
  foodName?: string;
  defaultGrams?: number;
}

export interface LocalParseResult {
  items: GroundedFoodItem[];
  /** Fragments that could not be resolved to a food. */
  unresolved: string[];
  facts: ParsedFact[];
  /** Share of food-bearing fragments that resolved, 0..1. */
  coverage: number;
  /** True when the result is good enough to skip calling a model. */
  confident: boolean;
}

/* -------------------------------------------------------------------------- */
/*                              Teaching phrases                              */
/* -------------------------------------------------------------------------- */

const PORTION_HINT = /(\d+(?:\.\d+)?)\s*(g|gram|grams|ml|kg|l)\b/i;

const extractPortion = (text: string): number | undefined => {
  const match = text.match(PORTION_HINT);
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]!);
  const unit = match[2]!.toLowerCase();
  const factor = ABSOLUTE_UNITS[unit] ?? 1;
  const grams = value * factor;
  return grams > 0 && grams < 5000 ? round(grams, 1) : undefined;
};

interface FactRule {
  kind: MemoryKind;
  pattern: RegExp;
  build: (match: RegExpMatchArray, pt: boolean) => ParsedFact | null;
}

const ARTICLE = /^(?:o|a|os|as|um|uma|uns|umas|the|an)\s+/i;

const tail = (text: string): string => text.replace(/[.!]+$/, "").trim();

const aliasFact = (rawTrigger: string, rawTarget: string, pt: boolean): ParsedFact | null => {
  const trigger = cleanPhrase(rawTrigger).replace(ARTICLE, "");
  const target = tail(rawTarget).replace(ARTICLE, "");
  if (!trigger || !target) return null;
  return {
    kind: "alias",
    trigger,
    statement: pt
      ? `${capitalise(trigger)} significa ${target}`
      : `${capitalise(trigger)} means ${target}`,
    foodName: stripPortion(target),
    defaultGrams: extractPortion(target),
  };
};


/**
 * The ways people teach the app something, in either language.
 *
 * Only high-confidence phrasings appear here — anything vaguer is left for the
 * model, which is far better at deciding whether a sentence was a durable rule
 * or a passing remark. Portuguese patterns spell accents as optional character
 * classes rather than matching a de-accented copy, so the statement read back
 * to the user keeps the accents they typed.
 */
const FACT_RULES: readonly FactRule[] = [
  // "Whenever I say milk it's Oatly Barista"
  {
    kind: "alias",
    pattern:
      /\bwhen(?:ever)?\s+i\s+(?:say|log|write|mention)\s+(.+?)\s*,?\s+(?:it'?s|it is|that'?s|that is|i mean|means)\s+([^);.]+)/i,
    build: (m, pt) => aliasFact(m[1]!, m[2]!, pt),
  },
  // "Milk means Oatly Barista"
  {
    kind: "alias",
    pattern: /^(.{2,40}?)\s+(?:always\s+)?means\s+([^);.]+)/i,
    build: (m, pt) => aliasFact(m[1]!, m[2]!, pt),
  },
  // "Sempre que eu disser leite é o Mimosa magro"
  {
    kind: "alias",
    pattern:
      /\b(?:sempre\s+que|quando|de\s+cada\s+vez\s+que)\s+(?:eu\s+)?(?:disser|digo|dizer|escrever|escrevo|falar|falo|mencionar|menciono|pedir|pe[çc]o)\s+(.+?)\s*,?\s+(?:[ée]\s+sempre|[ée]|significa|quer\s+dizer|refiro-?me\s+a|estou\s+a\s+falar\s+d[eo]|trata-se\s+d[eo])\s+([^);.]+)/i,
    build: (m, _pt) => aliasFact(m[1]!, m[2]!, true),
  },
  // "Leite significa Mimosa magro"
  {
    kind: "alias",
    pattern: /^(.{2,40}?)\s+(?:significa|quer\s+dizer|[ée]\s+sempre)\s+([^);.]+)/i,
    build: (m, _pt) => aliasFact(m[1]!, m[2]!, true),
  },
  // "My usual breakfast is porridge"
  {
    kind: "routine",
    pattern: /\bmy\s+(?:usual|regular|standard|go[- ]to)\s+(.{2,30}?)\s+is\s+([^);.]+)/i,
    build: (m, _pt) => ({
      kind: "routine",
      statement: `Usual ${cleanPhrase(m[1]!)} is ${tail(m[2]!)}`,
    }),
  },
  // "O meu pequeno-almoço habitual é papas de aveia"
  {
    kind: "routine",
    pattern:
      /\b(?:o|a)?\s*(?:meu|minha)\s+(.{2,30}?)\s+(?:habitual|do\s+costume|normal|de\s+sempre|t[íi]pico|t[íi]pica)\s+[ée]\s+([^);.]+)/i,
    build: (m, _pt) => ({
      kind: "routine",
      statement: `${capitalise(cleanPhrase(m[1]!))} habitual: ${tail(m[2]!)}`,
    }),
  },
  // "I don't eat pork"
  {
    kind: "preference",
    pattern: /\bi\s+(?:don'?t|do not|can'?t|cannot|never)\s+(?:eat|drink|have)\s+([^);.]+)/i,
    build: (m, _pt) => ({ kind: "preference", statement: `Does not eat ${tail(m[1]!)}` }),
  },
  // "Não como porco" / "Nunca bebo álcool"
  {
    kind: "preference",
    pattern:
      /\b(?:eu\s+)?(?:n[ãa]o|nunca)\s+(?:como|bebo|consumo|posso\s+comer|posso\s+beber)\s+([^);.]+)/i,
    build: (m, _pt) => ({ kind: "preference", statement: `Não come ${tail(m[1]!)}` }),
  },
  {
    kind: "preference",
    pattern: /\bi'?m\s+(?:a\s+)?(vegan|vegetarian|pescatarian|coeliac|celiac|lactose intolerant)\b/i,
    build: (m, _pt) => ({ kind: "preference", statement: `Is ${m[1]!.toLowerCase()}` }),
  },
  {
    kind: "preference",
    pattern:
      /\b(?:eu\s+)?sou\s+(vegan|vegano|vegana|vegetariano|vegetariana|cel[íi]aco|cel[íi]aca|intolerante\s+[àa]\s+lactose)\b/i,
    build: (m, _pt) => ({ kind: "preference", statement: `É ${m[1]!.toLowerCase()}` }),
  },
];

export interface FactScan {
  facts: ParsedFact[];
  /** The sentence with every teaching phrase removed. */
  remainder: string;
}

/**
 * Find the teaching phrases in a message and return what is left of it.
 *
 * Returning the remainder rather than a bare flag is what makes "two eggs, and
 * whenever I say milk it's Oatly" work: the rule is learned *and* the eggs are
 * logged, instead of the sentence being classed as one or the other.
 */
export const scanFacts = (text: string): FactScan => {
  const pt = looksPortuguese(text);
  const facts: ParsedFact[] = [];
  let remainder = text.trim();

  for (const rule of FACT_RULES) {
    const match = remainder.match(rule.pattern);
    if (!match) continue;
    const fact = rule.build(match, pt);
    if (!fact) continue;
    facts.push(fact);
    remainder = (remainder.slice(0, match.index) + " " + remainder.slice(match.index! + match[0].length))
      .replace(/\s+/g, " ")
      .trim();
  }

  return { facts, remainder };
};

/** The teaching phrases in a message, without the leftover text. */
export const parseFacts = (text: string): ParsedFact[] => scanFacts(text).facts;

const stripPortion = (text: string): string =>
  text.replace(PORTION_HINT, "").replace(/\busually\b|\babout\b|\baround\b/gi, "").replace(/[,\s]+$/, "").trim();

const cleanPhrase = (text: string): string =>
  text.replace(/^["'“”]|["'“”]$/g, "").replace(/[.!,]+$/, "").trim().toLowerCase();

const capitalise = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

/* -------------------------------------------------------------------------- */
/*                              Quantity parsing                              */
/* -------------------------------------------------------------------------- */

interface Quantity {
  amount: number;
  unit?: string;
  /** The remaining text, which should name a food. */
  rest: string;
  /**
   * The same text with the measure word left in. "Barra" is a measure in "uma
   * barra de chocolate" and part of the name in "uma barra de proteína"; only
   * the food database can tell the two apart, so both readings are offered.
   */
  restWithUnit?: string;
}

/**
 * Normalise a fragment for quantity parsing: strip accents so "chávena" and
 * "chavena" are one word, fold multi-word Portuguese measures down to a single
 * canonical token, and drop "unidade", which says only what a bare count
 * already says.
 */
const canonicalise = (fragment: string): string => {
  let text = deaccent(fragment.trim().toLowerCase());
  for (const [pattern, token] of PT_UNIT_PHRASES) text = text.replace(pattern, token);
  text = text.replace(PT_COUNT_NOISE, " ").replace(/\s+/g, " ").trim();
  return text;
};

/** The English token for a measure, whichever language it was written in. */
const canonicalUnit = (word: string): string | undefined => {
  const alias = PT_UNIT_ALIASES[word] ?? word;
  return ABSOLUTE_UNITS[alias] != null || HOUSEHOLD_UNITS[alias] != null
    ? alias
    : undefined;
};

/** Pull a leading quantity and optional unit off a fragment. */
export const parseQuantity = (fragment: string): Quantity => {
  let text = canonicalise(fragment);
  let amount = 1;
  let explicit = false;
  let unitFromPhrase: string | undefined;

  // "2x" / "x2"
  const times = text.match(/^(?:(\d+(?:\.\d+)?)\s*x|x\s*(\d+(?:\.\d+)?))\s+/);
  if (times) {
    amount = Number.parseFloat(times[1] ?? times[2]!);
    text = text.slice(times[0].length);
    explicit = true;
  }

  if (!explicit) {
    // Phrases first: "a couple of eggs" must not stop at the "a".
    const phrase = text.match(/^(?:a\s+)?(couple|few|handful)\s+(?:of\s+)?/);
    if (phrase) {
      amount = phrase[1] === "few" ? 3 : phrase[1] === "handful" ? 1 : 2;
      if (phrase[1] === "handful") unitFromPhrase = "handful";
      text = text.slice(phrase[0].length);
      explicit = true;
    }
  }

  if (!explicit) {
    const fraction = text.match(/^(\d+)\s*\/\s*(\d+)\s+/);
    const decimal = text.match(/^(\d+(?:[.,]\d+)?)\s*/);
    const word = text.match(/^([a-z]+)\s+/);

    if (fraction) {
      amount = Number(fraction[1]) / Number(fraction[2]);
      text = text.slice(fraction[0].length);
      explicit = true;
    } else if (decimal) {
      amount = Number.parseFloat(decimal[1]!.replace(",", "."));
      text = text.slice(decimal[0].length);
      explicit = true;
    } else if (word && NUMBER_WORDS[word[1]!] != null) {
      amount = NUMBER_WORDS[word[1]!]!;
      text = text.slice(word[0].length);
      explicit = true;
    }
    // "a couple of eggs", "half a cup of oats", "duas unidades de ovo"
    if (explicit) text = text.replace(FILLER_PREFIX, "");
  }

  // A unit may follow the number, with or without a space: "200g", "2 tbsp",
  // "duas colheres de sopa" (already folded to "tbsp" above).
  const withUnit = text;
  const glued = text.match(/^([a-z]+)\s*/);
  let unit: string | undefined = unitFromPhrase;
  if (glued && !unit) {
    const candidate = canonicalUnit(glued[1]!);
    if (candidate) {
      unit = candidate;
      text = text.slice(glued[0].length).replace(OF_PREFIX, "");
    }
  }

  // "200g chicken" — the digits and unit run together.
  if (!unit && !explicit) {
    const combined = canonicalise(fragment).match(/^(\d+(?:[.,]\d+)?)\s*([a-z]+)\s+(.*)$/);
    const candidate = combined ? canonicalUnit(combined[2]!) : undefined;
    if (combined && candidate && ABSOLUTE_UNITS[candidate] != null) {
      amount = Number.parseFloat(combined[1]!.replace(",", "."));
      unit = candidate;
      text = combined[3]!.replace(OF_PREFIX, "");
    }
  }

  return { amount, unit, rest: text.trim(), restWithUnit: withUnit.trim() };
};

/** Resolve a quantity to grams for a specific food. */
export const gramsFor = (quantity: Quantity, food: Food | null): number => {
  const { amount, unit } = quantity;

  if (unit && ABSOLUTE_UNITS[unit] != null) {
    return round(amount * ABSOLUTE_UNITS[unit]!, 1);
  }

  if (unit && HOUSEHOLD_UNITS[unit] != null) {
    // The food's own serving beats a generic figure whenever it matches.
    const serving = food?.servings.find((s) =>
      s.label.toLowerCase().includes(unit.replace(/s$/, "")),
    );
    if (serving) return round(amount * serving.grams, 1);

    // Nothing matched. The generic table is written for bulky, wet foods and
    // badly overstates dense dry ones — a bowl of dry oats is not 300 g, it is
    // a cup. The catalog knows this food's realistic portions even when it has
    // no word for this measure, so cap the guess at its largest serving. Only
    // ever downwards: the generic figure stays when the food's own portions are
    // bigger still.
    const generic = amount * HOUSEHOLD_UNITS[unit]!;
    const largest = food?.servings.reduce((max, s) => Math.max(max, s.grams), 0) ?? 0;
    return round(largest > 0 ? Math.min(generic, amount * largest) : generic, 1);
  }

  // A bare count: "2 eggs" means two of whatever one of them weighs.
  const base = food?.servings[0]?.grams ?? 100;
  return round(amount * base, 1);
};

/* -------------------------------------------------------------------------- */
/*                                  Parsing                                   */
/* -------------------------------------------------------------------------- */

/** Words that never name a food on their own. */
const STOP_FRAGMENTS = new Set([
  "", "the", "some", "a", "an", "it", "that", "this", "my", "of", "on", "in",
  "for", "please", "today", "then", "also", "plus",
  ...PT_STOP_FRAGMENTS,
]);

export const parseMeal = (
  text: string,
  ctx: GroundingContext,
): LocalParseResult => {
  // Learn first, then log whatever is left. A message can be both.
  const { facts, remainder } = scanFacts(text);

  // A comma between two digits is a decimal point, not a list separator.
  // Brackets left empty by a teaching phrase we just lifted out are debris.
  const cleaned = stripNoise(remainder)
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\(\s*\)/g, " ");

  // A bracketed aside is one thought, however many separators are inside it:
  // "leite (leite magro sem lactose)" must not become "leite" and "lactose".
  // Mask them, split, then put them back.
  const asides: string[] = [];
  const masked = cleaned.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    asides.push(inner.trim());
    return `\u0001${asides.length - 1}\u0001`;
  });
  const unmask = (text: string): string =>
    text.replace(/\u0001(\d+)\u0001/g, (_, i: string) => `(${asides[Number(i)] ?? ""})`);

  const fragments = masked
    .split(SEPARATOR)
    .map((f) => unmask(f).trim().replace(OF_PREFIX, ""))
    .filter((f) => f.length > 0 && !STOP_FRAGMENTS.has(deaccent(f.toLowerCase())))
    // A stray "?" or a trailing clause is not a food; a bare number is not one
    // either. Neither should count against coverage.
    .filter((f) => /[a-zà-ÿ]{2}/i.test(f));

  const items: GroundedFoodItem[] = [];
  const unresolved: string[] = [];

  for (const fragment of fragments) {
    // "Leite (leite magro sem lactose)" — the bracket says which one they mean.
    const asideMatch = fragment.match(/\(([^)]*)\)/);
    const aside = asideMatch?.[1]?.trim() ?? "";
    const bare = fragment.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

    const quantity = parseQuantity(bare);
    const name = quantity.rest.replace(/[.!?]+$/, "").trim();
    if (!name || STOP_FRAGMENTS.has(name)) continue;

    // Resolve the name the same way everything else does: taught facts first,
    // then the user's own foods, then the catalog.
    const fact = findAlias(ctx.memory, name);
    const viaFact = fact?.foodId
      ? (ctx.foods.find((f) => f.id === fact.foodId) ?? null)
      : null;
    const custom = ctx.foods.filter((f) => !f.verified);

    let resolved = viaFact ?? resolve(ctx, custom, name);
    let measured: Quantity = { ...quantity, rest: name };

    // The bracket is the more deliberate statement of the two, so it wins when
    // it resolves to something more specific than the word in front of it.
    if (!viaFact && aside) {
      const clarified = resolveAside(ctx, custom, aside);
      if (clarified && clarified.score > scoreOf(resolved, name)) {
        resolved = clarified.food;
        measured = { ...measured, rest: clarified.query };
      }
    }

    // "Uma barra de proteína" reads as one *bar* of protein powder if the
    // measure is taken at face value. When the fragment matches a food better
    // with its measure word left in, that word was part of the name — so keep
    // the whole thing and fall back to counting portions.
    if (!viaFact && quantity.unit && quantity.restWithUnit && quantity.restWithUnit !== name) {
      const whole = resolve(ctx, custom, quantity.restWithUnit);
      if (whole && scoreOf(whole, quantity.restWithUnit) > scoreOf(resolved, name)) {
        resolved = whole;
        measured = { ...quantity, unit: undefined, rest: quantity.restWithUnit };
      }
    }

    const food = resolved;
    if (!food) {
      unresolved.push(fragment);
      continue;
    }

    const grams =
      measured.unit || measured.amount !== 1
        ? gramsFor(measured, food)
        : (fact?.defaultGrams ?? gramsFor(measured, food));

    // Hand the *original* wording to grounding so an alias is credited to the
    // fact that resolved it; the food above was only needed to size the portion.
    items.push(
      groundItem(
        {
          // The reading that won, not the one that was tried first: grounding
          // resolves this name again, and must land on the same food.
          name: measured.rest,
          description: describePortion(measured, fragment),
          grams,
          confidence: measured.unit ? 0.9 : 0.75,
          kcal: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        ctx,
      ),
    );
  }

  const considered = items.length + unresolved.length;
  // A message that was purely a rule ("sempre que digo leite...") resolved
  // completely, even though it logged nothing.
  const coverage = considered === 0 ? (facts.length > 0 ? 1 : 0) : items.length / considered;

  return {
    items,
    unresolved,
    facts,
    coverage: round(coverage, 2),
    // Everything resolved, and there was something to resolve.
    confident: (items.length > 0 || facts.length > 0) && unresolved.length === 0,
  };
};

/** The best food for a name: the user's own first, then the catalog. */
const resolve = (ctx: GroundingContext, custom: Food[], name: string): Food | null =>
  (custom.length ? matchFoodByName(custom, name, 300) : null) ??
  matchFoodByName(ctx.foods, name);

const scoreOf = (food: Food | null, name: string): number =>
  food ? scoreFood(food, name) : 0;

/**
 * Resolve a bracketed clarification, shortening it from the right until it
 * matches. "Leite magro sem lactose" is not in any database; "leite magro" is,
 * and dropping the trailing qualifier is what gets there.
 *
 * Trimming only ever happens inside a bracket, where the user was deliberately
 * being *more* specific — so the worst case is falling back to the plainer word
 * they had already written outside it. The same trick applied to bare text
 * would turn "leite de coco" into milk.
 */
const resolveAside = (
  ctx: GroundingContext,
  custom: Food[],
  aside: string,
): { food: Food; query: string; score: number } | null => {
  const words = aside.split(/\s+/);
  let best: { food: Food; query: string; score: number } | null = null;
  for (let end = words.length; end >= 1; end -= 1) {
    const query = words.slice(0, end).join(" ");
    const food = resolve(ctx, custom, query);
    if (!food) continue;
    const score = scoreFood(food, query);
    if (!best || score > best.score) best = { food, query, score };
  }
  return best;
};

const describePortion = (quantity: Quantity, fragment: string): string => {
  if (quantity.unit) return `${quantity.amount} ${quantity.unit}`;
  if (quantity.amount !== 1) return `${quantity.amount} × ${quantity.rest}`;
  return fragment;
};

/** Turn a locally parsed fact into the shape the memory store expects. */
export const factTrigger = (fact: ParsedFact): string | undefined =>
  fact.trigger ? normalizeTrigger(fact.trigger) : undefined;

export type { MemoryFact };
