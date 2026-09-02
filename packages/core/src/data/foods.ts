import type { Food, Serving } from "../types";
import { PT_FOOD_SYNONYMS } from "../pt";

/**
 * Curated seed food database, per 100 g (or 100 ml for liquids).
 *
 * Values follow standard reference composition data for generic, unbranded
 * foods. It is intentionally a *starter* set covering the foods people log
 * most: branded items are expected to arrive via barcode lookup or be created
 * by the user, and photo logging grounds itself against this table first.
 */

type Row = [
  id: string,
  name: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  tags: string[],
  servings: Serving[],
  basis?: "g" | "ml",
];

const s = (label: string, grams: number): Serving => ({ label, grams });

const rows: Row[] = [
  /* ------------------------------- Poultry & meat ----------------------- */
  ["chicken-breast", "Chicken breast, cooked", 165, 31, 0, 3.6, 0, ["protein", "meat", "chicken"], [s("1 breast (170 g)", 170), s("1 portion (120 g)", 120)]],
  ["chicken-thigh", "Chicken thigh, cooked", 209, 26, 0, 10.9, 0, ["protein", "meat"], [s("1 thigh (85 g)", 85)]],
  ["turkey-breast", "Turkey breast, cooked", 135, 30, 0, 1, 0, ["protein", "meat"], [s("1 portion (120 g)", 120)]],
  ["beef-mince-5", "Beef mince 5% fat, cooked", 187, 27, 0, 8, 0, ["protein", "meat"], [s("1 portion (125 g)", 125)]],
  ["beef-mince-20", "Beef mince 20% fat, cooked", 272, 24, 0, 19, 0, ["protein", "meat"], [s("1 portion (125 g)", 125)]],
  ["beef-steak", "Beef sirloin steak, cooked", 212, 30, 0, 9.6, 0, ["protein", "meat"], [s("1 steak (200 g)", 200)]],
  ["pork-loin", "Pork loin, cooked", 202, 28, 0, 9, 0, ["protein", "meat"], [s("1 chop (130 g)", 130)]],
  ["bacon", "Bacon, cooked", 541, 37, 1.4, 42, 0, ["protein", "meat"], [s("1 rasher (12 g)", 12)]],
  ["ham", "Ham, sliced", 145, 21, 1.5, 6, 0, ["protein", "meat"], [s("1 slice (28 g)", 28)]],
  ["lamb", "Lamb, cooked", 258, 25, 0, 17, 0, ["protein", "meat"], [s("1 portion (120 g)", 120)]],

  /* ---------------------------------- Fish ------------------------------ */
  ["salmon", "Salmon, cooked", 208, 22, 0, 13, 0, ["protein", "fish"], [s("1 fillet (150 g)", 150)]],
  ["tuna-canned", "Tuna, canned in water", 116, 26, 0, 0.8, 0, ["protein", "fish"], [s("1 can, drained (120 g)", 120)]],
  ["cod", "Cod, cooked", 105, 23, 0, 0.9, 0, ["protein", "fish"], [s("1 fillet (140 g)", 140)]],
  ["shrimp", "Prawns, cooked", 99, 24, 0.2, 0.3, 0, ["protein", "fish"], [s("1 portion (100 g)", 100)]],
  ["sardines", "Sardines, canned in oil", 208, 25, 0, 11.5, 0, ["protein", "fish"], [s("1 tin (90 g)", 90)]],

  /* ------------------------------ Eggs & dairy -------------------------- */
  ["egg-whole", "Egg, whole", 143, 12.6, 0.7, 9.5, 0, ["protein", "dairy", "eggs"], [s("1 large egg (50 g)", 50), s("1 medium egg (44 g)", 44)]],
  ["egg-white", "Egg white", 52, 10.9, 0.7, 0.2, 0, ["protein", "dairy"], [s("1 large white (33 g)", 33)]],
  ["greek-yogurt-0", "Greek yogurt, 0% fat", 59, 10, 3.6, 0.4, 0, ["protein", "dairy"], [s("1 pot (170 g)", 170), s("1 tbsp (30 g)", 30)]],
  ["greek-yogurt-5", "Greek yogurt, 5% fat", 97, 9, 4, 5, 0, ["protein", "dairy"], [s("1 pot (170 g)", 170)]],
  ["milk-whole", "Milk, whole", 61, 3.2, 4.8, 3.3, 0, ["dairy", "drink"], [s("1 glass (250 ml)", 250), s("1 splash (30 ml)", 30)], "ml"],
  ["milk-skim", "Milk, skimmed", 34, 3.4, 5, 0.1, 0, ["dairy", "drink"], [s("1 glass (250 ml)", 250)], "ml"],
  ["oat-milk", "Oat milk", 46, 0.8, 7.5, 1.5, 0.8, ["dairy-free", "drink"], [s("1 glass (250 ml)", 250)], "ml"],
  ["cheddar", "Cheddar cheese", 403, 25, 1.3, 33, 0, ["dairy"], [s("1 slice (28 g)", 28), s("1 portion (40 g)", 40)]],
  ["mozzarella", "Mozzarella", 300, 22, 2.2, 22, 0, ["dairy"], [s("1 ball (125 g)", 125)]],
  ["parmesan", "Parmesan", 431, 38, 4.1, 29, 0, ["dairy"], [s("1 tbsp grated (5 g)", 5)]],
  ["cottage-cheese", "Cottage cheese, 2% fat", 84, 11, 4.3, 2.3, 0, ["protein", "dairy"], [s("1 pot (200 g)", 200)]],
  ["butter", "Butter", 717, 0.9, 0.1, 81, 0, ["fat", "dairy"], [s("1 tsp (5 g)", 5), s("1 tbsp (14 g)", 14)]],
  ["whey-protein", "Whey protein powder", 380, 80, 8, 4, 0, ["protein", "supplement", "whey", "shake"], [s("1 scoop (30 g)", 30)]],

  /* ------------------------------- Plant protein ------------------------ */
  ["tofu-firm", "Tofu, firm", 144, 17, 3, 9, 2, ["protein", "vegan"], [s("1 block (350 g)", 350), s("1 portion (100 g)", 100)]],
  ["tempeh", "Tempeh", 192, 20, 8, 11, 0, ["protein", "vegan"], [s("1 portion (100 g)", 100)]],
  ["black-beans", "Black beans, cooked", 132, 8.9, 24, 0.5, 8.7, ["protein", "vegan", "legume"], [s("1 cup (172 g)", 172)]],
  ["chickpeas", "Chickpeas, cooked", 164, 8.9, 27, 2.6, 7.6, ["protein", "vegan", "legume"], [s("1 cup (164 g)", 164)]],
  ["lentils", "Lentils, cooked", 116, 9, 20, 0.4, 7.9, ["protein", "vegan", "legume"], [s("1 cup (198 g)", 198)]],
  ["kidney-beans", "Kidney beans, cooked", 127, 8.7, 23, 0.5, 6.4, ["protein", "vegan", "legume"], [s("1 cup (177 g)", 177)]],
  ["edamame", "Edamame, cooked", 121, 12, 9, 5, 5, ["protein", "vegan", "legume"], [s("1 cup (155 g)", 155)]],

  /* ---------------------------------- Grains ---------------------------- */
  ["white-rice", "White rice, cooked", 130, 2.7, 28, 0.3, 0.4, ["carb", "grain"], [s("1 cup (158 g)", 158), s("1 portion (200 g)", 200)]],
  ["brown-rice", "Brown rice, cooked", 123, 2.7, 26, 1, 1.6, ["carb", "grain"], [s("1 cup (195 g)", 195)]],
  ["pasta", "Pasta, cooked", 158, 5.8, 31, 0.9, 1.8, ["carb", "grain"], [s("1 cup (140 g)", 140), s("1 portion (200 g)", 200)]],
  ["bread-wholewheat", "Wholemeal bread", 247, 13, 41, 3.4, 7, ["carb", "grain", "toast", "bread"], [s("1 slice (38 g)", 38)]],
  ["bread-white", "White bread", 265, 9, 49, 3.2, 2.7, ["carb", "grain", "toast", "bread"], [s("1 slice (36 g)", 36)]],
  ["oats", "Oats, dry", 389, 16.9, 66, 6.9, 10.6, ["carb", "grain", "oatmeal", "porridge"], [s("1 serving (40 g)", 40), s("1 cup (81 g)", 81)]],
  ["quinoa", "Quinoa, cooked", 120, 4.4, 21, 1.9, 2.8, ["carb", "grain"], [s("1 cup (185 g)", 185)]],
  ["couscous", "Couscous, cooked", 112, 3.8, 23, 0.2, 1.4, ["carb", "grain"], [s("1 cup (157 g)", 157)]],
  ["tortilla", "Flour tortilla", 306, 8, 51, 7.7, 3, ["carb", "grain"], [s("1 wrap (49 g)", 49)]],
  ["bagel", "Bagel", 250, 10, 49, 1.5, 2.1, ["carb", "grain"], [s("1 bagel (98 g)", 98)]],
  ["cornflakes", "Corn flakes", 357, 7.5, 84, 0.4, 3, ["carb", "grain"], [s("1 bowl (30 g)", 30)]],
  ["granola", "Granola", 471, 10, 64, 20, 7, ["carb", "grain"], [s("1 serving (50 g)", 50)]],

  /* -------------------------------- Potatoes ---------------------------- */
  ["potato", "Potato, boiled", 87, 1.9, 20, 0.1, 1.8, ["carb", "vegetable", "potatoes"], [s("1 medium (170 g)", 170)]],
  ["sweet-potato", "Sweet potato, baked", 90, 2, 21, 0.2, 3.3, ["carb", "vegetable"], [s("1 medium (150 g)", 150)]],
  ["french-fries", "French fries", 312, 3.4, 41, 15, 3.8, ["carb", "fast-food"], [s("small portion (100 g)", 100), s("large portion (170 g)", 170)]],

  /* --------------------------------- Fruit ------------------------------ */
  ["banana", "Banana", 89, 1.1, 23, 0.3, 2.6, ["fruit"], [s("1 medium (118 g)", 118), s("1 large (136 g)", 136)]],
  ["apple", "Apple", 52, 0.3, 14, 0.2, 2.4, ["fruit"], [s("1 medium (182 g)", 182)]],
  ["orange", "Orange", 47, 0.9, 12, 0.1, 2.4, ["fruit"], [s("1 medium (131 g)", 131)]],
  ["blueberries", "Blueberries", 57, 0.7, 14, 0.3, 2.4, ["fruit"], [s("1 cup (148 g)", 148)]],
  ["strawberries", "Strawberries", 32, 0.7, 7.7, 0.3, 2, ["fruit"], [s("1 cup (152 g)", 152)]],
  ["grapes", "Grapes", 69, 0.7, 18, 0.2, 0.9, ["fruit"], [s("1 cup (151 g)", 151)]],
  ["mango", "Mango", 60, 0.8, 15, 0.4, 1.6, ["fruit"], [s("1 medium (200 g)", 200)]],
  ["pineapple", "Pineapple", 50, 0.5, 13, 0.1, 1.4, ["fruit"], [s("1 slice (84 g)", 84)]],
  ["watermelon", "Watermelon", 30, 0.6, 7.6, 0.2, 0.4, ["fruit"], [s("1 wedge (286 g)", 286)]],
  ["avocado", "Avocado", 160, 2, 8.5, 15, 6.7, ["fruit", "fat"], [s("1 medium (150 g)", 150), s("half (75 g)", 75)]],

  /* ------------------------------- Vegetables --------------------------- */
  ["broccoli", "Broccoli", 34, 2.8, 7, 0.4, 2.6, ["vegetable"], [s("1 cup (91 g)", 91), s("1 portion (150 g)", 150)]],
  ["spinach", "Spinach", 23, 2.9, 3.6, 0.4, 2.2, ["vegetable"], [s("1 handful (30 g)", 30)]],
  ["carrot", "Carrot", 41, 0.9, 10, 0.2, 2.8, ["vegetable"], [s("1 medium (61 g)", 61)]],
  ["tomato", "Tomato", 18, 0.9, 3.9, 0.2, 1.2, ["vegetable"], [s("1 medium (123 g)", 123)]],
  ["cucumber", "Cucumber", 15, 0.7, 3.6, 0.1, 0.5, ["vegetable"], [s("1 portion (100 g)", 100)]],
  ["bell-pepper", "Bell pepper", 31, 1, 6, 0.3, 2.1, ["vegetable"], [s("1 medium (119 g)", 119)]],
  ["onion", "Onion", 40, 1.1, 9.3, 0.1, 1.7, ["vegetable"], [s("1 medium (110 g)", 110)]],
  ["mushrooms", "Mushrooms", 22, 3.1, 3.3, 0.3, 1, ["vegetable"], [s("1 cup (70 g)", 70)]],
  ["green-beans", "Green beans", 31, 1.8, 7, 0.2, 3.4, ["vegetable"], [s("1 cup (125 g)", 125)]],
  ["lettuce", "Lettuce", 15, 1.4, 2.9, 0.2, 1.3, ["vegetable"], [s("1 handful (30 g)", 30)]],
  ["zucchini", "Courgette", 17, 1.2, 3.1, 0.3, 1, ["vegetable"], [s("1 medium (196 g)", 196)]],
  ["cauliflower", "Cauliflower", 25, 1.9, 5, 0.3, 2, ["vegetable"], [s("1 cup (107 g)", 107)]],
  ["peas", "Peas", 81, 5.4, 14, 0.4, 5.7, ["vegetable"], [s("1 cup (145 g)", 145)]],
  ["sweetcorn", "Sweetcorn", 86, 3.2, 19, 1.2, 2, ["vegetable"], [s("1 cup (154 g)", 154)]],

  /* --------------------------------- Nuts & fats ------------------------ */
  ["almonds", "Almonds", 579, 21, 22, 50, 12.5, ["nuts", "fat"], [s("1 handful (28 g)", 28)]],
  ["peanuts", "Peanuts", 567, 26, 16, 49, 8.5, ["nuts", "fat"], [s("1 handful (28 g)", 28)]],
  ["walnuts", "Walnuts", 654, 15, 14, 65, 6.7, ["nuts", "fat"], [s("1 handful (28 g)", 28)]],
  ["cashews", "Cashews", 553, 18, 30, 44, 3.3, ["nuts", "fat"], [s("1 handful (28 g)", 28)]],
  ["peanut-butter", "Peanut butter", 588, 25, 20, 50, 6, ["nuts", "fat"], [s("1 tbsp (16 g)", 16), s("2 tbsp (32 g)", 32)]],
  ["chia-seeds", "Chia seeds", 486, 17, 42, 31, 34, ["seeds", "fat"], [s("1 tbsp (12 g)", 12)]],
  ["olive-oil", "Olive oil", 884, 0, 0, 100, 0, ["fat", "oil"], [s("1 tsp (4.5 ml)", 4.5), s("1 tbsp (13.5 ml)", 13.5)], "ml"],
  ["hummus", "Hummus", 166, 7.9, 14, 9.6, 6, ["dip"], [s("2 tbsp (30 g)", 30)]],

  /* -------------------------------- Prepared ---------------------------- */
  ["pizza-cheese", "Pizza, cheese", 266, 11, 33, 10, 2.3, ["prepared", "fast-food", "pizza"], [s("1 slice (107 g)", 107)]],
  ["burger", "Hamburger, fast food", 295, 17, 24, 14, 1.5, ["prepared", "fast-food"], [s("1 burger (110 g)", 110)]],
  ["sushi-roll", "Sushi roll", 150, 6, 28, 1.5, 1.5, ["prepared"], [s("1 roll, 6 pieces (170 g)", 170)]],
  ["caesar-salad", "Caesar salad with dressing", 190, 8, 8, 14, 1.6, ["prepared", "salad"], [s("1 bowl (250 g)", 250)]],
  ["chicken-curry", "Chicken curry", 150, 12, 8, 8, 1.5, ["prepared"], [s("1 portion (350 g)", 350)]],
  ["lasagna", "Lasagne", 132, 8, 11, 6, 1, ["prepared"], [s("1 portion (300 g)", 300)]],
  ["scrambled-eggs", "Scrambled eggs with butter", 168, 11, 1.6, 13, 0, ["prepared", "protein"], [s("2 eggs (120 g)", 120)]],

  /* --------------------------------- Snacks ----------------------------- */
  ["dark-chocolate", "Dark chocolate, 70%", 598, 7.8, 46, 43, 11, ["snack", "sweet"], [s("1 square (10 g)", 10), s("1 bar (100 g)", 100)]],
  ["milk-chocolate", "Milk chocolate", 535, 7.6, 59, 30, 3.4, ["snack", "sweet"], [s("1 bar (45 g)", 45)]],
  ["potato-chips", "Crisps", 536, 7, 53, 34, 4.8, ["snack"], [s("1 small bag (25 g)", 25)]],
  ["ice-cream", "Ice cream, vanilla", 207, 3.5, 24, 11, 0.7, ["snack", "sweet"], [s("1 scoop (66 g)", 66)]],
  ["cookie", "Biscuit / cookie", 480, 5, 65, 22, 2, ["snack", "sweet"], [s("1 cookie (16 g)", 16)]],
  ["croissant", "Croissant", 406, 8.2, 46, 21, 2.6, ["snack", "bakery"], [s("1 croissant (57 g)", 57)]],
  ["protein-bar", "Protein bar", 380, 30, 40, 12, 6, ["snack", "protein"], [s("1 bar (60 g)", 60)]],
  ["honey", "Honey", 304, 0.3, 82, 0, 0.2, ["sweet"], [s("1 tsp (7 g)", 7), s("1 tbsp (21 g)", 21)]],
  ["sugar", "Sugar", 387, 0, 100, 0, 0, ["sweet"], [s("1 tsp (4 g)", 4)]],
  ["ketchup", "Ketchup", 101, 1.2, 26, 0.1, 0.3, ["condiment"], [s("1 tbsp (17 g)", 17)]],
  ["mayonnaise", "Mayonnaise", 680, 1, 0.6, 75, 0, ["condiment", "fat"], [s("1 tbsp (14 g)", 14)]],

  /* --------------------------------- Drinks ----------------------------- */
  ["coffee-black", "Coffee, black", 2, 0.1, 0, 0, 0, ["drink"], [s("1 cup (240 ml)", 240)], "ml"],
  ["latte", "Latte with whole milk", 55, 3, 5.3, 2, 0, ["drink"], [s("1 medium (350 ml)", 350)], "ml"],
  ["orange-juice", "Orange juice", 45, 0.7, 10, 0.2, 0.2, ["drink"], [s("1 glass (250 ml)", 250)], "ml"],
  ["cola", "Cola", 42, 0, 10.6, 0, 0, ["drink"], [s("1 can (330 ml)", 330)], "ml"],
  ["beer", "Beer, 5%", 43, 0.5, 3.6, 0, 0, ["drink", "alcohol"], [s("1 pint (568 ml)", 568), s("1 bottle (330 ml)", 330)], "ml"],
  ["wine-red", "Red wine", 85, 0.1, 2.6, 0, 0, ["drink", "alcohol"], [s("1 glass (175 ml)", 175)], "ml"],
  ["spirits", "Spirits, 40%", 231, 0, 0, 0, 0, ["drink", "alcohol"], [s("1 shot (25 ml)", 25)], "ml"],
  ["sports-drink", "Sports drink", 26, 0, 6.5, 0, 0, ["drink"], [s("1 bottle (500 ml)", 500)], "ml"],
];

export const FOODS: Food[] = rows.map(
  ([id, name, kcal, protein, carbs, fat, fiber, tags, servings, basis]) => ({
    id,
    name,
    basis: basis ?? "g",
    per100: { kcal, protein, carbs, fat, fiber },
    servings,
    // Portuguese names are kept out of the table above and merged in here, so
    // the composition data stays readable and the translation stays reviewable
    // as one list. Search treats them exactly like any other tag.
    tags: [...tags, ...(PT_FOOD_SYNONYMS[id] ?? [])],
    verified: true,
  }),
);

export const FOOD_BY_ID: Map<string, Food> = new Map(FOODS.map((f) => [f.id, f]));
