/**
 * Portuguese support for typed meal logging.
 *
 * The user writes in whichever language is quicker in the moment — "dois ovos,
 * uma torrada com manteiga e um café" as readily as its English equivalent. The
 * parser in `parse.ts` is structurally language-agnostic (a quantity, a unit and
 * a food name); what is language-specific is vocabulary. All of it lives here,
 * so adding a third language is a matter of one more file rather than a rewrite.
 *
 * Everything below is written for European Portuguese, with the Brazilian
 * variants included wherever they differ (chávena/xícara, sumo/suco,
 * ananás/abacaxi), because the cost of carrying both is a few extra strings.
 *
 * Accents are optional throughout: matching happens on text with diacritics
 * stripped, so "café" and "cafe" behave identically. Patterns that must run
 * against the *original* text — the teaching phrases, which read back to the
 * user — spell both forms explicitly.
 */

/** Strip diacritics so "chávena" and "chavena" are the same word. */
export const deaccent = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/* -------------------------------------------------------------------------- */
/*                                 Quantities                                 */
/* -------------------------------------------------------------------------- */

/** Written numbers, accent-free because the parser de-accents before lookup. */
export const PT_NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
  meio: 0.5, meia: 0.5,
};

/**
 * Portuguese measures, mapped to the canonical English token rather than
 * straight to grams.
 *
 * That indirection is the point: `gramsFor` prefers a food's own serving over
 * any generic figure, and it finds that serving by looking for the unit in the
 * serving's label. Rewriting "fatia" to "slice" means a slice of bread is the
 * 38 g the catalog says it is, not the 30 g a generic table would guess.
 *
 * A `colher` with nothing after it is a soup spoon in ordinary speech — nobody
 * says "colher" meaning a teaspoon without saying "de chá".
 */
export const PT_UNIT_ALIASES: Record<string, string> = {
  // Weight and volume.
  grama: "g", gramas: "g",
  quilo: "kg", quilos: "kg", quilograma: "kg", quilogramas: "kg",
  mililitro: "ml", mililitros: "ml",
  litro: "l", litros: "l",

  // Household measures.
  colher: "tbsp", colheres: "tbsp", colherada: "tbsp", colheradas: "tbsp",
  fatia: "slice", fatias: "slice",
  copo: "glass", copos: "glass",
  chavena: "cup", chavenas: "cup", xicara: "cup", xicaras: "cup",
  caneca: "mug", canecas: "mug",
  punhado: "handful", punhados: "handful",
  lata: "can", latas: "can",
  garrafa: "bottle", garrafas: "bottle",
  tigela: "bowl", tigelas: "bowl",
  taca: "glass", tacas: "glass",
  dose: "serving", doses: "serving",
  porcao: "portion", porcoes: "portion",
  medida: "scoop", medidas: "scoop",
  pedaco: "piece", pedacos: "piece",
  quadrado: "square", quadrados: "square",
  barra: "bar", barras: "bar",
  pote: "pot", potes: "pot",
  copinho: "shot", copinhos: "shot",
};

/**
 * Measures the English table lacks, needed as targets for the aliases above.
 * `pot` in particular matters: several foods carry a "1 pot (170 g)" serving
 * that nothing could previously ask for.
 */
export const EXTRA_HOUSEHOLD_UNITS: Record<string, number> = {
  pot: 150, pots: 150,
  mug: 300, mugs: 300,
  dessertspoon: 10, dessertspoons: 10,
};

/**
 * Multi-word measures, rewritten before the quantity parser runs. Longest
 * first: "colher de sopa" must be consumed before a bare "colher" is.
 */
export const PT_UNIT_PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcolher(?:es)?\s+(?:de\s+)?sobremesa\b/g, "dessertspoon"],
  [/\bcolher(?:es)?\s+(?:de\s+)?sopa\b/g, "tbsp"],
  [/\bcolher(?:es)?\s+(?:de\s+)?cha\b/g, "tsp"],
  [/\bcopo(?:s)?\s+grande(?:s)?\b/g, "pint"],
];

/**
 * "Unidade" is not a measure — it is the Portuguese way of saying "one of
 * them", which is exactly what a bare count already means.
 */
export const PT_COUNT_NOISE = /\bunidade(?:s)?\b/g;

/** Articles that follow a measure: "colher de sopa DE azeite". */
export const OF_PREFIX = /^(?:of|de|da|do|das|dos)\s+/;

/** As above, plus the articles that sit between a number and its measure:
 *  "half A cup of oats", "meio UM copo". */
export const FILLER_PREFIX = /^(?:of|de|da|do|das|dos|a|an|the)\s+/;

/* -------------------------------------------------------------------------- */
/*                            Sentence scaffolding                            */
/* -------------------------------------------------------------------------- */

/**
 * Openings that carry no food information. Applied repeatedly, so "hoje ao
 * almoço comi" is stripped in full rather than one layer at a time.
 */
export const PT_LEADING_NOISE: readonly RegExp[] = [
  /^(?:hoje|ontem|agora|ainda\s+agora)\b[\s,:-]*/i,
  /^(?:eu\s+)?(?:acabei\s+de\s+(?:comer|beber)|comi|bebi|tomei|almocei|jantei|lanchei|petisquei)\b[\s,:-]*/i,
  /^(?:ao|no|na|para\s+o|para\s+a|de)\s+(?:pequeno[-\s]almo[cç]o|almo[cç]o|jantar|lanche|ceia|caf[ée]\s+da\s+manh[ãa])\b[\s,:-]*/i,
  /^(?:[oa]\s+)?(?:(?:meu|minha)\s+)?(?:pequeno[-\s]almo[cç]o|almo[cç]o|jantar|lanche|ceia|refei[cç][ãa]o)\s+(?:de\s+hoje\s+)?(?:foi|[ée])(?=\s)[\s,:-]*/i,
  /^(?:registar?|regista|adicionar?|adiciona|anotar?|anota)\b[\s,:-]*/i,
];

/**
 * Separators, matched against the *original* text rather than a de-accented
 * copy. That distinction is load-bearing: "e" joins a list, "é" is the verb
 * "is", and stripping accents would collapse the two.
 */
export const PT_SEPARATOR_SOURCES = [
  "\\be\\s+tamb[ée]m\\b",
  "\\be\\b",
  "\\bcom\\b",
  "\\bmais\\b",
  "\\bacompanhado\\s+(?:de|por|com)\\b",
];

/** Fragments that never name a food on their own. */
export const PT_STOP_FRAGMENTS = [
  "o", "a", "os", "as", "um", "uma", "uns", "umas", "de", "da", "do", "das",
  "dos", "e", "com", "mais", "hoje", "ontem", "tambem", "também", "depois",
  "ainda", "isso", "isto", "meu", "minha", "no", "na", "ao", "que",
];

/* -------------------------------------------------------------------------- */
/*                              Language detection                            */
/* -------------------------------------------------------------------------- */

/**
 * Words that appear in Portuguese and effectively never in an English meal
 * description. Used only to pick which language to *reply* in — parsing itself
 * always tries both vocabularies, so a misdetection costs nothing.
 */
const PT_MARKERS =
  /\b(?:comi|bebi|tomei|almocei|jantei|lanchei|com|de|da|do|das|dos|uma?|dois|duas|tr[êe]s|meia?|meio|n[ãa]o|hoje|ontem|sempre\s+que|quer\s+dizer|significa|colher(?:es)?|fatias?|copos?|ch[áa]vena|p[ãa]o|ovos?|leite|frango|arroz|queijo|caf[ée]|manteiga|batatas?|azeite|almo[cç]o|jantar|pequeno[-\s]almo[cç]o)\b/i;

export const looksPortuguese = (text: string): boolean =>
  PT_MARKERS.test(text.toLowerCase());

/* -------------------------------------------------------------------------- */
/*                               Food synonyms                                */
/* -------------------------------------------------------------------------- */

/**
 * Portuguese names for the seed catalog, merged into each food's tags.
 *
 * The first entry of each list is the everyday word; the rest are regional
 * variants and near-synonyms. Where two foods could claim the same word, the
 * plain word belongs to the one people mean by default — "frango" is a breast,
 * not a thigh — and the other carries only its qualified form. The exact-tag
 * tier in `scoreFood` is what makes that resolution work.
 */
export const PT_FOOD_SYNONYMS: Record<string, string[]> = {
  /* Poultry & meat */
  "chicken-breast": ["frango", "peito de frango"],
  "chicken-thigh": ["coxa de frango", "perna de frango", "sobrecoxa"],
  "turkey-breast": ["peru", "peito de peru"],
  "beef-mince-5": ["carne picada magra", "carne moida magra"],
  "beef-mince-20": ["carne picada", "carne moida"],
  "beef-steak": ["bife", "carne de vaca", "vaca", "lombo de vaca", "picanha"],
  "pork-loin": ["porco", "lombo de porco", "febras", "carne de porco"],
  bacon: ["toucinho", "panceta"],
  ham: ["fiambre", "presunto"],
  lamb: ["borrego", "cordeiro"],

  /* Fish */
  salmon: ["salmao"],
  "tuna-canned": ["atum", "atum em lata", "lata de atum"],
  cod: ["bacalhau"],
  shrimp: ["camarao", "camaroes", "gambas"],
  sardines: ["sardinha", "sardinhas"],

  /* Eggs & dairy */
  "egg-whole": ["ovo", "ovos", "egg", "ovo inteiro"],
  "egg-white": ["clara", "claras", "clara de ovo", "claras de ovo"],
  "greek-yogurt-0": ["iogurte grego magro", "iogurte grego 0%"],
  "greek-yogurt-5": ["iogurte", "iogurte grego"],
  "milk-whole": ["leite", "leite gordo", "leite inteiro"],
  "milk-skim": ["leite magro", "leite desnatado"],
  "oat-milk": ["bebida de aveia", "leite de aveia"],
  cheddar: ["queijo", "queijo cheddar", "queijo flamengo"],
  mozzarella: ["mussarela", "mozarela", "queijo mozzarella"],
  parmesan: ["parmesao", "queijo parmesao"],
  "cottage-cheese": ["queijo cottage", "requeijao"],
  butter: ["manteiga"],
  "whey-protein": ["proteina", "proteina em po", "batido de proteina", "whey"],

  /* Plant protein */
  "tofu-firm": ["tofu"],
  tempeh: ["tempeh"],
  "black-beans": ["feijao", "feijao preto"],
  chickpeas: ["grao", "grao de bico"],
  lentils: ["lentilhas", "lentilha"],
  "kidney-beans": ["feijao encarnado", "feijao vermelho", "feijao catarino"],
  edamame: ["edamame"],

  /* Grains & starch */
  "white-rice": ["arroz", "arroz branco"],
  "brown-rice": ["arroz integral"],
  pasta: ["massa", "esparguete", "macarrao", "penne"],
  "bread-wholewheat": ["pao integral", "torrada integral", "pao escuro"],
  "bread-white": ["pao", "torrada", "pao branco", "papo seco", "carcaca", "bolinha"],
  oats: ["aveia", "flocos de aveia", "papas de aveia", "farinha de aveia"],
  quinoa: ["quinoa"],
  couscous: ["cuscuz"],
  tortilla: ["tortilha", "wrap"],
  bagel: ["bagel"],
  cornflakes: ["cereais", "flocos de milho"],
  granola: ["granola", "muesli"],
  potato: ["batata", "batatas", "batata cozida"],
  "sweet-potato": ["batata doce"],
  "french-fries": ["batatas fritas", "batata frita"],

  /* Fruit */
  banana: ["banana", "bananas"],
  apple: ["maca", "macas"],
  orange: ["laranja", "laranjas"],
  blueberries: ["mirtilos", "mirtilo"],
  strawberries: ["morangos", "morango"],
  grapes: ["uvas", "uva"],
  mango: ["manga"],
  pineapple: ["ananas", "abacaxi"],
  watermelon: ["melancia"],
  avocado: ["abacate"],

  /* Vegetables */
  broccoli: ["brocolos", "brocoli"],
  spinach: ["espinafres", "espinafre"],
  carrot: ["cenoura", "cenouras"],
  tomato: ["tomate", "tomates"],
  cucumber: ["pepino"],
  "bell-pepper": ["pimento", "pimentao"],
  onion: ["cebola", "cebolas"],
  mushrooms: ["cogumelos", "cogumelo"],
  "green-beans": ["feijao verde"],
  lettuce: ["alface"],
  zucchini: ["courgette", "abobrinha"],
  cauliflower: ["couve flor", "couve-flor"],
  peas: ["ervilhas", "ervilha"],
  sweetcorn: ["milho"],

  /* Nuts, seeds & fats */
  almonds: ["amendoas", "amendoa"],
  peanuts: ["amendoins", "amendoim"],
  walnuts: ["nozes", "noz"],
  cashews: ["caju", "castanha de caju", "castanhas de caju"],
  "peanut-butter": ["manteiga de amendoim"],
  "chia-seeds": ["chia", "sementes de chia"],
  "olive-oil": ["azeite"],
  hummus: ["humus"],

  /* Composite dishes */
  "pizza-cheese": ["pizza"],
  burger: ["hamburguer", "hamburger"],
  "sushi-roll": ["sushi"],
  "caesar-salad": ["salada cesar"],
  "chicken-curry": ["caril", "caril de frango"],
  lasagna: ["lasanha"],
  "scrambled-eggs": ["ovos mexidos", "ovo mexido"],

  /* Sweets & snacks */
  "dark-chocolate": ["chocolate negro", "chocolate preto", "chocolate amargo"],
  "milk-chocolate": ["chocolate", "chocolate de leite"],
  "potato-chips": ["batatas fritas de pacote", "batata frita de pacote"],
  "ice-cream": ["gelado", "sorvete", "gelado de baunilha", "baunilha"],
  cookie: ["bolacha", "bolachas", "biscoito", "biscoitos"],
  croissant: ["croissant"],
  "protein-bar": ["barra de proteina"],
  honey: ["mel"],
  sugar: ["acucar"],
  ketchup: ["ketchup"],
  mayonnaise: ["maionese"],

  /* Drinks */
  "coffee-black": ["cafe", "bica", "cafe simples", "expresso"],
  latte: ["galao", "meia de leite", "cafe com leite"],
  "orange-juice": ["sumo de laranja", "suco de laranja"],
  cola: ["coca cola", "refrigerante"],
  beer: ["cerveja", "imperial", "fino"],
  "wine-red": ["vinho", "vinho tinto"],
  spirits: ["bebida branca", "gin", "vodka", "whisky"],
  "sports-drink": ["bebida isotonica", "isotonico"],
};
