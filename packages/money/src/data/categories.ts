import type { Category } from "../types";

/**
 * The seed category catalog.
 *
 * Code, not data — the same choice the food catalog makes. It ships with the
 * app, it is the same for everyone, and anything a person adds themselves lives
 * in their document alongside it.
 *
 * Every category carries a Portuguese name as well as an English one. That is
 * not decoration: the CSV importer and the typed quick-add both match against
 * both lists, so a statement full of `Supermercado` and a phone typed
 * `almoço 12,50` land in the right place without a translation step.
 */

/**
 * Categorical marks for the spending charts, validated as a set against the
 * dark chart surface (#14171c): each hue is separated from its neighbours in
 * the ring, and none of them sits below the chroma floor where deuteranopia
 * collapses adjacent pairs. Categories are always direct-labelled, so colour
 * is reinforcement rather than the only carrier of identity.
 */
export const PALETTE = {
  red: "#f87171",
  orange: "#fb923c",
  amber: "#fbbf24",
  lime: "#a3e635",
  green: "#4ade80",
  teal: "#2dd4bf",
  cyan: "#22d3ee",
  blue: "#60a5fa",
  indigo: "#818cf8",
  violet: "#a78bfa",
  fuchsia: "#e879f9",
  pink: "#f472b6",
  rose: "#fb7185",
  slate: "#94a3b8",
} as const;

const seed = (
  id: string,
  name: string,
  namePt: string,
  group: Category["group"],
  kind: Category["kind"],
  color: string,
): Category => ({ id, name, namePt, group, kind, color, seed: true });

export const CATEGORIES: Category[] = [
  /* --------------------------------- Essentials -------------------------- */
  seed("housing", "Rent & mortgage", "Renda e prestação", "essentials", "expense", PALETTE.indigo),
  seed("utilities", "Utilities", "Água, luz e gás", "essentials", "expense", PALETTE.cyan),
  seed("telecom", "Phone & internet", "Telemóvel e internet", "essentials", "expense", PALETTE.blue),
  seed("groceries", "Groceries", "Supermercado", "essentials", "expense", PALETTE.green),
  seed("transport", "Transport", "Transportes", "essentials", "expense", PALETTE.teal),
  seed("fuel", "Fuel", "Combustível", "essentials", "expense", PALETTE.slate),
  seed("health", "Health", "Saúde", "essentials", "expense", PALETTE.rose),
  seed("insurance", "Insurance", "Seguros", "essentials", "expense", PALETTE.violet),
  seed("education", "Education", "Educação", "essentials", "expense", PALETTE.amber),
  seed("children", "Children", "Filhos", "essentials", "expense", PALETTE.pink),
  seed("loanPayment", "Loan payments", "Prestações de crédito", "essentials", "expense", PALETTE.red),
  seed("taxes", "Taxes", "Impostos", "essentials", "expense", PALETTE.orange),
  seed("home", "Home & repairs", "Casa e reparações", "essentials", "expense", PALETTE.lime),

  /* --------------------------------- Lifestyle --------------------------- */
  seed("dining", "Restaurants", "Restaurantes", "lifestyle", "expense", PALETTE.orange),
  seed("cafes", "Cafés & snacks", "Cafés e snacks", "lifestyle", "expense", PALETTE.amber),
  seed("shopping", "Shopping", "Compras", "lifestyle", "expense", PALETTE.fuchsia),
  seed("clothing", "Clothing", "Vestuário", "lifestyle", "expense", PALETTE.pink),
  seed("entertainment", "Entertainment", "Lazer", "lifestyle", "expense", PALETTE.violet),
  seed("subscriptions", "Subscriptions", "Subscrições", "lifestyle", "expense", PALETTE.indigo),
  seed("travel", "Travel", "Viagens", "lifestyle", "expense", PALETTE.cyan),
  seed("fitness", "Gym & sport", "Ginásio e desporto", "lifestyle", "expense", PALETTE.green),
  seed("personal", "Personal care", "Cuidado pessoal", "lifestyle", "expense", PALETTE.rose),
  seed("pets", "Pets", "Animais", "lifestyle", "expense", PALETTE.lime),
  seed("gifts", "Gifts", "Presentes", "lifestyle", "expense", PALETTE.red),
  seed("other", "Other", "Outros", "lifestyle", "expense", PALETTE.slate),

  /* --------------------------------- Financial --------------------------- */
  seed("savings", "Savings", "Poupança", "financial", "expense", PALETTE.teal),
  seed("investing", "Investing", "Investimento", "financial", "expense", PALETTE.blue),
  seed("fees", "Bank fees", "Comissões bancárias", "financial", "expense", PALETTE.slate),
  seed("charity", "Charity", "Donativos", "financial", "expense", PALETTE.green),

  /* ---------------------------------- Income ----------------------------- */
  seed("salary", "Salary", "Salário", "income", "income", PALETTE.green),
  seed("freelance", "Freelance", "Trabalho independente", "income", "income", PALETTE.teal),
  seed("bonus", "Bonus", "Prémios", "income", "income", PALETTE.lime),
  seed("interest", "Interest", "Juros", "income", "income", PALETTE.cyan),
  seed("dividends", "Dividends", "Dividendos", "income", "income", PALETTE.blue),
  seed("rental", "Rental income", "Rendas recebidas", "income", "income", PALETTE.indigo),
  seed("refund", "Refunds", "Reembolsos", "income", "income", PALETTE.violet),
  seed("otherIncome", "Other income", "Outros rendimentos", "income", "income", PALETTE.slate),
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/**
 * Categories whose spending is genuinely committed.
 *
 * This is the list behind "months of cover" and the runway figure, so it is
 * deliberately narrow: the question those answer is what you would still be
 * paying if you stopped choosing to spend, and a gym membership is a choice.
 */
export const ESSENTIAL_CATEGORY_IDS = new Set([
  "housing",
  "utilities",
  "telecom",
  "groceries",
  "transport",
  "fuel",
  "health",
  "insurance",
  "education",
  "children",
  "loanPayment",
  "taxes",
]);

export const GROUP_LABELS: Record<Category["group"], string> = {
  essentials: "Essentials",
  lifestyle: "Lifestyle",
  financial: "Saving & investing",
  income: "Income",
};
