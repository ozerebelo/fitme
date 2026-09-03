/**
 * Seed payee patterns, mostly Portuguese.
 *
 * A bank statement is a list of shouted abbreviations — `COMPRA CONT MODELO
 * 4515 LISBOA`, `PAG SERV EDP COMERCIAL` — and categorising a year of them by
 * hand is the reason people stop using budgeting apps in week two. These
 * patterns turn the common half of a Portuguese statement into categories on
 * import, and every one of them is an ordinary editable rule afterwards: the
 * seeds and the rules you teach it are the same mechanism, so there is nothing
 * privileged about this list.
 *
 * Patterns are lowercase and accent-free; the matcher normalises the payee the
 * same way. The longest matching pattern wins, which is what makes `uber eats`
 * a restaurant and `uber` a taxi.
 */
export const MERCHANT_PATTERNS: [pattern: string, categoryId: string][] = [
  /* ------------------------------- Groceries ------------------------------ */
  ["continente", "groceries"],
  ["cont modelo", "groceries"],
  ["pingo doce", "groceries"],
  ["lidl", "groceries"],
  ["aldi", "groceries"],
  ["auchan", "groceries"],
  ["jumbo", "groceries"],
  ["minipreco", "groceries"],
  ["mini preco", "groceries"],
  ["intermarche", "groceries"],
  ["e.leclerc", "groceries"],
  ["leclerc", "groceries"],
  ["mercadona", "groceries"],
  ["meu super", "groceries"],
  ["froiz", "groceries"],
  ["recheio", "groceries"],
  ["makro", "groceries"],
  ["spar ", "groceries"],
  ["supermercado", "groceries"],
  ["hipermercado", "groceries"],
  ["mercearia", "groceries"],
  ["frutaria", "groceries"],
  ["talho", "groceries"],
  ["padaria", "groceries"],
  ["celeiro", "groceries"],
  ["go natural", "groceries"],

  /* --------------------------------- Cafés -------------------------------- */
  ["starbucks", "cafes"],
  ["pastelaria", "cafes"],
  ["cafe", "cafes"],
  ["cafetaria", "cafes"],
  ["a padaria portuguesa", "cafes"],
  ["delta cafes", "cafes"],
  ["costa coffee", "cafes"],

  /* ------------------------------ Restaurants ----------------------------- */
  ["restaurante", "dining"],
  ["mcdonald", "dining"],
  ["burger king", "dining"],
  ["kfc", "dining"],
  ["pizza hut", "dining"],
  ["telepizza", "dining"],
  ["dominos", "dining"],
  ["uber eats", "dining"],
  ["ubereats", "dining"],
  ["glovo", "dining"],
  ["bolt food", "dining"],
  ["takeaway", "dining"],
  ["churrasqueira", "dining"],
  ["marisqueira", "dining"],
  ["cervejaria", "dining"],
  ["tasca", "dining"],
  ["sushi", "dining"],
  ["vitaminas", "dining"],
  ["h3 ", "dining"],
  ["nandos", "dining"],
  ["wok", "dining"],

  /* ------------------------------- Transport ------------------------------ */
  ["cp comboios", "transport"],
  ["comboios de portugal", "transport"],
  ["metropolitano", "transport"],
  ["metro do porto", "transport"],
  ["carris", "transport"],
  ["transtejo", "transport"],
  ["rede expressos", "transport"],
  ["flixbus", "transport"],
  ["navegante", "transport"],
  ["andante", "transport"],
  ["via verde", "transport"],
  ["portagem", "transport"],
  ["brisa ", "transport"],
  ["ascendi", "transport"],
  ["parquimetro", "transport"],
  ["empark", "transport"],
  ["saba park", "transport"],
  ["uber", "transport"],
  ["bolt", "transport"],
  ["free now", "transport"],
  ["freenow", "transport"],
  ["taxi", "transport"],

  /* --------------------------------- Fuel --------------------------------- */
  ["galp", "fuel"],
  ["petrogal", "fuel"],
  ["repsol", "fuel"],
  ["cepsa", "fuel"],
  ["prio", "fuel"],
  ["bp ", "fuel"],
  ["shell", "fuel"],
  ["gasolineira", "fuel"],

  /* ------------------------------- Utilities ------------------------------ */
  ["edp", "utilities"],
  ["endesa", "utilities"],
  ["iberdrola", "utilities"],
  ["galp power", "utilities"],
  ["goldenergy", "utilities"],
  ["luzboa", "utilities"],
  ["epal", "utilities"],
  ["aguas de", "utilities"],
  ["indaqua", "utilities"],
  ["sonorgas", "utilities"],
  ["dianagas", "utilities"],

  /* -------------------------------- Telecom ------------------------------- */
  ["meo", "telecom"],
  ["nos comunica", "telecom"],
  ["vodafone", "telecom"],
  ["nowo", "telecom"],
  ["altice", "telecom"],
  ["digi ", "telecom"],
  ["uzo", "telecom"],
  ["moche", "telecom"],

  /* -------------------------------- Health -------------------------------- */
  ["farmacia", "health"],
  ["hospital", "health"],
  ["clinica", "health"],
  ["dentista", "health"],
  ["medis", "health"],
  ["multicare", "health"],
  ["lusiadas", "health"],
  ["luz saude", "health"],
  ["cuf ", "health"],
  ["analises clinicas", "health"],
  ["opticalia", "health"],
  ["multiopticas", "health"],
  ["wells", "health"],

  /* ------------------------------- Insurance ------------------------------ */
  ["seguros", "insurance"],
  ["seguradora", "insurance"],
  ["fidelidade", "insurance"],
  ["tranquilidade", "insurance"],
  ["allianz", "insurance"],
  ["ageas", "insurance"],
  ["generali", "insurance"],
  ["zurich", "insurance"],
  ["mapfre", "insurance"],
  ["ocidental", "insurance"],

  /* ------------------------------- Subscriptions -------------------------- */
  ["netflix", "subscriptions"],
  ["spotify", "subscriptions"],
  ["disney", "subscriptions"],
  ["hbo", "subscriptions"],
  ["prime video", "subscriptions"],
  ["amazon prime", "subscriptions"],
  ["youtube premium", "subscriptions"],
  ["apple.com/bill", "subscriptions"],
  ["itunes", "subscriptions"],
  ["icloud", "subscriptions"],
  ["google one", "subscriptions"],
  ["google storage", "subscriptions"],
  ["dropbox", "subscriptions"],
  ["notion", "subscriptions"],
  ["openai", "subscriptions"],
  ["anthropic", "subscriptions"],
  ["adobe", "subscriptions"],
  ["microsoft 365", "subscriptions"],
  ["playstation", "subscriptions"],
  ["nintendo", "subscriptions"],
  ["dazn", "subscriptions"],
  ["audible", "subscriptions"],
  ["storytel", "subscriptions"],
  ["filmin", "subscriptions"],

  /* ------------------------------ Entertainment --------------------------- */
  ["cinemas", "entertainment"],
  ["cinema", "entertainment"],
  ["ticketline", "entertainment"],
  ["blueticket", "entertainment"],
  ["bol.pt", "entertainment"],
  ["coliseu", "entertainment"],
  ["altice arena", "entertainment"],
  ["teatro", "entertainment"],

  /* -------------------------------- Shopping ------------------------------ */
  ["amazon", "shopping"],
  ["worten", "shopping"],
  ["fnac", "shopping"],
  ["ikea", "shopping"],
  ["leroy merlin", "shopping"],
  ["maxmat", "shopping"],
  ["aki ", "shopping"],
  ["decathlon", "shopping"],
  ["el corte ingles", "shopping"],
  ["aliexpress", "shopping"],
  ["shein", "shopping"],
  ["temu", "shopping"],
  ["ctt ", "shopping"],

  /* -------------------------------- Clothing ------------------------------ */
  ["zara", "clothing"],
  ["bershka", "clothing"],
  ["pull&bear", "clothing"],
  ["stradivarius", "clothing"],
  ["massimo dutti", "clothing"],
  ["lefties", "clothing"],
  ["primark", "clothing"],
  ["h&m", "clothing"],
  ["mango", "clothing"],
  ["springfield", "clothing"],
  ["uniqlo", "clothing"],
  ["nike", "clothing"],
  ["adidas", "clothing"],
  ["jd sports", "clothing"],
  ["sport zone", "clothing"],
  ["seaside", "clothing"],

  /* --------------------------------- Fitness ------------------------------ */
  ["fitness hut", "fitness"],
  ["holmes place", "fitness"],
  ["solinca", "fitness"],
  ["ginasio", "fitness"],
  ["phive", "fitness"],
  ["pump gym", "fitness"],
  ["basic fit", "fitness"],

  /* --------------------------------- Travel ------------------------------- */
  ["booking.com", "travel"],
  ["airbnb", "travel"],
  ["ryanair", "travel"],
  ["tap portugal", "travel"],
  ["tap air", "travel"],
  ["easyjet", "travel"],
  ["vueling", "travel"],
  ["lufthansa", "travel"],
  ["expedia", "travel"],
  ["edreams", "travel"],
  ["hotel", "travel"],
  ["hostel", "travel"],
  ["pousada", "travel"],

  /* ----------------------------- Personal care ---------------------------- */
  ["cabeleireiro", "personal"],
  ["barbearia", "personal"],
  ["perfumes & companhia", "personal"],
  ["douglas", "personal"],
  ["sephora", "personal"],
  ["primor", "personal"],
  ["mass perfumarias", "personal"],

  /* ----------------------------------- Pets ------------------------------- */
  ["veterinari", "pets"],
  ["pet shop", "pets"],
  ["petshop", "pets"],
  ["kiwoko", "pets"],
  ["animalife", "pets"],

  /* -------------------------------- Education ----------------------------- */
  ["universidade", "education"],
  ["faculdade", "education"],
  ["politecnico", "education"],
  ["explicacoes", "education"],
  ["udemy", "education"],
  ["coursera", "education"],
  ["domestika", "education"],

  /* --------------------------------- Children ----------------------------- */
  ["infantario", "children"],
  ["creche", "children"],
  ["jardim de infancia", "children"],

  /* ---------------------------------- Housing ----------------------------- */
  ["renda", "housing"],
  ["arrendamento", "housing"],
  ["condominio", "housing"],
  ["credito habitacao", "housing"],

  /* ----------------------------------- Taxes ------------------------------ */
  ["autoridade tributaria", "taxes"],
  ["imposto", "taxes"],
  ["financas", "taxes"],
  ["seguranca social", "taxes"],
  ["seg social", "taxes"],
  ["iuc", "taxes"],
  ["imi ", "taxes"],

  /* ----------------------------------- Fees ------------------------------- */
  ["comissao", "fees"],
  ["manutencao de conta", "fees"],
  ["anuidade", "fees"],
  ["imposto do selo", "fees"],

  /* ------------------------------ Loan payments --------------------------- */
  ["prestacao", "loanPayment"],
  ["emprestimo", "loanPayment"],
  ["cofidis", "loanPayment"],
  ["cetelem", "loanPayment"],
  ["unicre", "loanPayment"],
  ["oney", "loanPayment"],

  /* -------------------------------- Investing ----------------------------- */
  ["degiro", "investing"],
  ["trading 212", "investing"],
  ["trading212", "investing"],
  ["interactive brokers", "investing"],
  ["etoro", "investing"],
  ["xtb ", "investing"],
  ["coinbase", "investing"],
  ["binance", "investing"],
  ["kraken", "investing"],
  ["mintos", "investing"],
  ["goparity", "investing"],
  ["raize", "investing"],

  /* --------------------------------- Savings ------------------------------ */
  ["certificados de aforro", "savings"],
  ["certificados do tesouro", "savings"],
  ["deposito a prazo", "savings"],
  ["poupanca", "savings"],

  /* ---------------------------------- Income ------------------------------ */
  ["salario", "salary"],
  ["ordenado", "salary"],
  ["vencimento", "salary"],
  ["remuneracao", "salary"],
  ["payroll", "salary"],
  ["juros credor", "interest"],
  ["reembolso", "refund"],
  ["estorno", "refund"],
  ["devolucao", "refund"],
  ["dividendo", "dividends"],
];
