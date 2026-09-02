import { describe, expect, it } from "vitest";
import { FOODS } from "../src/data/foods";
import { parseMeal, parseQuantity, scanFacts } from "../src/parse";
import { looksPortuguese } from "../src/pt";
import { matchFoodByName } from "../src/nutrition";
import type { GroundingContext } from "../src/grounding";

const ctx: GroundingContext = { foods: FOODS, memory: [] };
const names = (text: string) => parseMeal(text, ctx).items.map((i) => i.name);
const grams = (text: string) => parseMeal(text, ctx).items.map((i) => i.grams);

describe("Portuguese food names", () => {
  it("resolves everyday words", () => {
    expect(matchFoodByName(FOODS, "frango")?.id).toBe("chicken-breast");
    expect(matchFoodByName(FOODS, "arroz")?.id).toBe("white-rice");
    expect(matchFoodByName(FOODS, "pão")?.id).toBe("bread-white");
    expect(matchFoodByName(FOODS, "ovos")?.id).toBe("egg-whole");
    expect(matchFoodByName(FOODS, "azeite")?.id).toBe("olive-oil");
    expect(matchFoodByName(FOODS, "manteiga")?.id).toBe("butter");
    expect(matchFoodByName(FOODS, "bacalhau")?.id).toBe("cod");
  });

  it("does not need the accents", () => {
    expect(matchFoodByName(FOODS, "pao")?.id).toBe("bread-white");
    expect(matchFoodByName(FOODS, "maca")?.id).toBe("apple");
    expect(matchFoodByName(FOODS, "cafe")?.id).toBe("coffee-black");
    expect(matchFoodByName(FOODS, "brocolos")?.id).toBe("broccoli");
  });

  it("gives the plain word to the food people mean by it", () => {
    // "Frango" on its own is a breast; the thigh has to be asked for.
    expect(matchFoodByName(FOODS, "frango")?.id).toBe("chicken-breast");
    expect(matchFoodByName(FOODS, "coxa de frango")?.id).toBe("chicken-thigh");
    expect(matchFoodByName(FOODS, "chocolate")?.id).toBe("milk-chocolate");
    expect(matchFoodByName(FOODS, "chocolate negro")?.id).toBe("dark-chocolate");
    expect(matchFoodByName(FOODS, "feijão")?.id).toBe("black-beans");
    expect(matchFoodByName(FOODS, "feijão encarnado")?.id).toBe("kidney-beans");
  });

  it("keeps the Brazilian variants working", () => {
    expect(matchFoodByName(FOODS, "abacaxi")?.id).toBe("pineapple");
    expect(matchFoodByName(FOODS, "suco de laranja")?.id).toBe("orange-juice");
    expect(matchFoodByName(FOODS, "mussarela")?.id).toBe("mozzarella");
  });

  it("does not disturb the English names", () => {
    expect(matchFoodByName(FOODS, "chicken breast")?.id).toBe("chicken-breast");
    expect(matchFoodByName(FOODS, "eggs")?.id).toBe("egg-whole");
    expect(matchFoodByName(FOODS, "olive oil")?.id).toBe("olive-oil");
  });
});

describe("Portuguese quantities", () => {
  it("reads written numbers", () => {
    expect(parseQuantity("dois ovos").amount).toBe(2);
    expect(parseQuantity("três bananas").amount).toBe(3);
    expect(parseQuantity("meio abacate").amount).toBe(0.5);
    expect(parseQuantity("uma maçã").amount).toBe(1);
  });

  it("reads measures, accented or not", () => {
    expect(parseQuantity("uma fatia de pão")).toMatchObject({ amount: 1, unit: "slice", rest: "pao" });
    expect(parseQuantity("um copo de leite")).toMatchObject({ unit: "glass", rest: "leite" });
    expect(parseQuantity("meia chávena de aveia")).toMatchObject({ amount: 0.5, unit: "cup" });
    expect(parseQuantity("meia chavena de aveia")).toMatchObject({ amount: 0.5, unit: "cup" });
    expect(parseQuantity("200g de frango")).toMatchObject({ amount: 200, unit: "g", rest: "frango" });
  });

  it("folds the multi-word spoons", () => {
    expect(parseQuantity("duas colheres de sopa de azeite")).toMatchObject({
      amount: 2,
      unit: "tbsp",
      rest: "azeite",
    });
    expect(parseQuantity("uma colher de chá de mel")).toMatchObject({ unit: "tsp", rest: "mel" });
    // A bare "colher" is a soup spoon in ordinary speech.
    expect(parseQuantity("uma colher de manteiga").unit).toBe("tbsp");
  });

  it("treats 'unidade' as the bare count it is", () => {
    expect(parseQuantity("duas unidades de ovo")).toMatchObject({ amount: 2, rest: "ovo" });
  });

  it("does not split a decimal comma as if it were a list", () => {
    expect(grams("0,5 kg de frango")).toEqual([500]);
  });
});

describe("parsing Portuguese meals", () => {
  it("parses a whole breakfast", () => {
    expect(names("dois ovos, uma torrada com manteiga e um café")).toEqual([
      "Egg, whole",
      "White bread",
      "Butter",
      "Coffee, black",
    ]);
  });

  it("strips the way people open a sentence", () => {
    expect(names("hoje ao almoço comi 200g de frango com arroz")).toEqual([
      "Chicken breast, cooked",
      "White rice, cooked",
    ]);
    expect(names("o meu almoço foi frango com arroz")).toHaveLength(2);
    expect(names("o pequeno-almoço é dois ovos")).toEqual(["Egg, whole"]);
    expect(names("jantei bacalhau com batatas e brócolos")).toHaveLength(3);
  });

  it("uses the food's own serving for a Portuguese measure", () => {
    // Bread's own slice is 38 g, not the generic 30 g for a slice.
    expect(grams("uma fatia de pão integral")).toEqual([38]);
    // Wine's own glass is 175 ml, not the generic 250 ml.
    expect(grams("um copo de vinho tinto")).toEqual([175]);
    expect(grams("uma lata de atum")).toEqual([120]);
  });

  it("does not let a measure swallow the food", () => {
    // "Chávena de café" is a cup of coffee, not a coffee-cup of nothing.
    expect(names("chávena de café")).toEqual(["Coffee, black"]);
    // "Barra" is the measure in one of these and part of the name in the other.
    expect(names("1 barra de proteína")).toEqual(["Protein bar"]);
    expect(names("uma barra de chocolate")).toEqual(["Milk chocolate"]);
  });

  it("does not inflate a dense dry food to a generic bowlful", () => {
    // 300 g of dry oats would be 1,167 kcal. A bowl of oats is a cup of them.
    expect(grams("uma tigela de aveia")).toEqual([81]);
  });

  it("reports what it cannot resolve instead of guessing", () => {
    const result = parseMeal("um pacote de bolachas", ctx);
    expect(result.confident).toBe(false);
    expect(result.unresolved).toEqual(["um pacote de bolachas"]);
  });

  it("handles a sentence that mixes the two languages", () => {
    expect(names("2 ovos com toast")).toEqual(["Egg, whole", "White bread"]);
  });
});

describe("teaching the app in Portuguese", () => {
  it("learns an alias", () => {
    const { facts } = scanFacts("sempre que eu disser leite é o Mimosa magro 250ml");
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      kind: "alias",
      trigger: "leite",
      foodName: "Mimosa magro",
      defaultGrams: 250,
    });
    expect(facts[0]!.statement).toBe("Leite significa Mimosa magro 250ml");
  });

  it("learns an alias from the short form", () => {
    expect(scanFacts("leite significa Mimosa magro").facts[0]).toMatchObject({
      kind: "alias",
      trigger: "leite",
    });
  });

  it("does not eat into the trigger word", () => {
    // "é" must be a word of its own, not the last letter of "leite".
    expect(scanFacts("de cada vez que eu disser café é uma bica").facts[0]).toMatchObject({
      trigger: "café",
      foodName: "bica",
    });
  });

  it("learns a routine and a preference", () => {
    expect(scanFacts("o meu pequeno-almoço habitual é papas de aveia").facts[0]).toMatchObject({
      kind: "routine",
    });
    expect(scanFacts("não como porco").facts[0]).toMatchObject({ kind: "preference" });
    expect(scanFacts("nunca bebo refrigerante").facts[0]).toMatchObject({ kind: "preference" });
    expect(scanFacts("sou intolerante à lactose").facts[0]).toMatchObject({ kind: "preference" });
  });

  it("logs the meal and learns the rule from one sentence", () => {
    const result = parseMeal("comi dois ovos e sempre que digo leite é Mimosa", ctx);
    expect(result.items.map((i) => i.name)).toEqual(["Egg, whole"]);
    expect(result.facts).toHaveLength(1);
    expect(result.confident).toBe(true);
  });

  it("counts a message that was purely a rule as fully resolved", () => {
    const result = parseMeal("não como porco", ctx);
    expect(result.items).toEqual([]);
    expect(result.confident).toBe(true);
    expect(result.coverage).toBe(1);
  });

  it("still writes English statements for English input", () => {
    expect(scanFacts("whenever I say milk it's Oatly Barista").facts[0]!.statement).toBe(
      "Milk means Oatly Barista",
    );
  });
});

describe("brackets and asides", () => {
  const real =
    "fatia de pão de trigo com manteiga (quando disser manteiga é creme vegetal com sabor a manteiga) e uma chavena de café com leite (leite magro sem lactose)";

  it("does not let a teaching phrase run past its bracket", () => {
    const { facts } = scanFacts(real);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      kind: "alias",
      trigger: "manteiga",
      foodName: "creme vegetal com sabor a manteiga",
    });
  });

  it("logs the whole meal around the aside", () => {
    const result = parseMeal(real, ctx);
    expect(result.items.map((i) => i.name)).toEqual([
      "White bread",
      "Butter",
      "Coffee, black",
      "Milk, skimmed",
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it("does not split inside a bracket", () => {
    // "com" separates a list, except when it is inside an aside.
    expect(names("leite (leite magro sem lactose)")).toEqual(["Milk, skimmed"]);
  });

  it("takes the bracket as the more specific reading", () => {
    expect(names("pão (pão integral)")).toEqual(["Wholemeal bread"]);
  });

  it("keeps the plainer word when the bracket adds nothing", () => {
    expect(names("banana (madura)")).toEqual(["Banana"]);
  });
});

describe("looksPortuguese", () => {
  it("recognises Portuguese", () => {
    expect(looksPortuguese("dois ovos com pão")).toBe(true);
    expect(looksPortuguese("hoje comi frango")).toBe(true);
  });

  it("leaves English alone", () => {
    expect(looksPortuguese("two eggs and toast")).toBe(false);
    expect(looksPortuguese("chicken breast with rice")).toBe(false);
  });
});
