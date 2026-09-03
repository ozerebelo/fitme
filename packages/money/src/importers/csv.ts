import type { DateKey } from "@fitme/core";
import { parseCsvRows } from "@fitme/core";
import type { CategoryRule, Cents, Transaction } from "../types";
import { parseAmount } from "../money";
import { suggestCategory } from "../rules";
import { makeTransaction } from "../transactions";

/**
 * Bank statement import.
 *
 * There is no open-banking connection here, so this is a file import — and the
 * files are a mess. Portuguese banks export a preamble of account details above
 * the header, dates as `12-03-2026`, amounts as `1.234,56`, and split the
 * amount into separate debit and credit columns as often as not. Revolut,
 * meanwhile, exports clean English headers, ISO dates and a fee column.
 *
 * Rather than ship a per-bank adapter list that rots, the columns are detected
 * from the header row and the shapes of the values, and the result is shown for
 * confirmation before anything is saved. Where detection fails, the mapping is
 * an ordinary parameter the UI lets you set by hand.
 *
 * Re-importing an overlapping statement is a no-op: every row is keyed by a
 * hash of the account, date, amount and payee, so what is already there is
 * recognised rather than duplicated. That is the same promise the Strong
 * importer makes, for the same reason — nobody keeps track of which weeks they
 * have already imported.
 */

const HEADER_ALIASES = {
  date: [
    "data",
    "data valor",
    "data mov",
    "data movimento",
    "data do movimento",
    "data lancamento",
    "data da operacao",
    "data operacao",
    "date",
    "completed date",
    "booking date",
    "transaction date",
    "value date",
    "fecha",
  ],
  payee: [
    "descricao",
    "descricao do movimento",
    "descritivo",
    "historico",
    "movimento",
    "description",
    "details",
    "detalhes",
    "concept",
    "concepto",
    "beneficiario",
    "merchant",
    "payee",
    "referencia",
  ],
  amount: [
    "montante",
    "valor",
    "importe",
    "amount",
    "valor em eur",
    "montante eur",
    "valor movimento",
    "valor do movimento",
    "montante do movimento",
  ],
  debit: ["debito", "debitos", "saida", "saidas", "levantamento", "withdrawal", "paid out", "debit"],
  credit: ["credito", "creditos", "entrada", "entradas", "deposito", "deposit", "paid in", "credit"],
  balance: ["saldo", "balance", "saldo contabilistico", "saldo apos movimento", "saldo disponivel"],
  currency: ["moeda", "divisa", "currency"],
  fee: ["comissao", "taxa", "fee", "fees"],
  note: ["observacoes", "notas", "notes", "note", "memo"],
} as const;

export type ColumnRole = keyof typeof HEADER_ALIASES;

export type ColumnMap = Partial<Record<ColumnRole, number>>;

export type DateOrder = "dmy" | "mdy" | "ymd";

const normaliseHeader = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const roleOf = (header: string): ColumnRole | null => {
  const needle = normaliseHeader(header);
  if (!needle) return null;
  for (const [role, aliases] of Object.entries(HEADER_ALIASES)) {
    if ((aliases as readonly string[]).includes(needle)) return role as ColumnRole;
  }
  // A header like "Data valor (dd-mm-aaaa)" still says "data valor".
  for (const [role, aliases] of Object.entries(HEADER_ALIASES)) {
    if ((aliases as readonly string[]).some((alias) => needle.startsWith(alias))) {
      return role as ColumnRole;
    }
  }
  return null;
};

/**
 * Find the header row.
 *
 * A statement usually opens with the account holder, the IBAN and a date range
 * before it gets to the table, so row zero is often not the header. The header
 * is the first row that names both a date and some kind of amount.
 */
export const findHeaderRow = (rows: string[][]): number => {
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i++) {
    const roles = new Set(
      (rows[i] ?? []).map(roleOf).filter((role): role is ColumnRole => !!role),
    );
    if (roles.has("date") && (roles.has("amount") || roles.has("debit") || roles.has("credit"))) {
      return i;
    }
  }
  return 0;
};

export const mapColumns = (header: string[]): ColumnMap => {
  const mapping: ColumnMap = {};
  header.forEach((name, index) => {
    const role = roleOf(name);
    // First column of a role wins: `Data valor` before `Data movimento` is the
    // order these files come in, and the first is the one people mean.
    if (role && mapping[role] == null) mapping[role] = index;
  });
  return mapping;
};

/* -------------------------------------------------------------------------- */
/*                                   Dates                                    */
/* -------------------------------------------------------------------------- */

const DATE_PATTERN = /(\d{1,4})[-/. ](\d{1,2})[-/. ](\d{1,4})/;

/**
 * Work out whether the file is day-first or month-first.
 *
 * A single date is often ambiguous — `03/04/2026` is two different days on two
 * sides of the Atlantic — but a column of them rarely is: one value with a
 * first component above twelve settles it. With no evidence either way,
 * day-first wins, which is the convention in every locale this app is likely to
 * be used in and, more importantly, the convention of the banks it imports.
 */
export const detectDateOrder = (samples: string[]): DateOrder => {
  let dayFirstEvidence = 0;
  let monthFirstEvidence = 0;

  for (const sample of samples) {
    const match = DATE_PATTERN.exec(sample.trim());
    if (!match) continue;
    const [, a, b] = match;
    const first = Number(a);
    const second = Number(b);
    if (String(a).length === 4) return "ymd";
    if (first > 12 && second <= 12) dayFirstEvidence++;
    else if (second > 12 && first <= 12) monthFirstEvidence++;
  }
  if (monthFirstEvidence > dayFirstEvidence) return "mdy";
  return "dmy";
};

export const parseDate = (value: string, order: DateOrder): DateKey | null => {
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const [, a, b, c] = match;
  let year: number;
  let month: number;
  let day: number;

  if (order === "ymd" || String(a).length === 4) {
    year = Number(a);
    month = Number(b);
    day = Number(c);
  } else if (order === "mdy") {
    month = Number(a);
    day = Number(b);
    year = Number(c);
  } else {
    day = Number(a);
    month = Number(b);
    year = Number(c);
  }

  if (year < 100) year += year < 70 ? 2000 : 1900;
  if (!month || !day || month > 12 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

/* -------------------------------------------------------------------------- */
/*                                  Identity                                  */
/* -------------------------------------------------------------------------- */

/** FNV-1a. Short, stable, and not a security boundary — just an identity. */
const hash = (value: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
};

/**
 * The key that makes a re-import a no-op.
 *
 * `occurrence` disambiguates genuinely identical rows — two €1.20 coffees at
 * the same café on the same day are two transactions, and both must survive an
 * import, but importing the file twice must still not produce four.
 */
export const externalIdFor = (
  accountId: string,
  date: DateKey,
  amount: Cents,
  payee: string,
  occurrence: number,
): string =>
  `csv:${hash(`${accountId}|${date}|${amount}|${payee.trim().toLowerCase()}|${occurrence}`)}`;

/* -------------------------------------------------------------------------- */
/*                                   Reading                                  */
/* -------------------------------------------------------------------------- */

export interface ParsedRow {
  date: DateKey;
  payee: string;
  amount: Cents;
  note?: string;
  currency?: string;
  externalId: string;
  /** The original cells, so the review step can show what it read. */
  raw: string[];
}

export interface ImportPreview {
  header: string[];
  mapping: ColumnMap;
  dateOrder: DateOrder;
  rows: ParsedRow[];
  /** Rows that could not be read — usually totals and blank separators. */
  skipped: number;
  /** Which of the parsed rows are already in the ledger. */
  duplicates: number;
  problems: string[];
}

export interface ImportOptions {
  accountId: string;
  currency: string;
  mapping?: ColumnMap;
  dateOrder?: DateOrder;
  /** Existing external ids, so duplicates are reported before anything is saved. */
  known?: Set<string>;
  /** Statements sometimes carry the running balance; ignore those columns. */
  delimiter?: string;
}

export const previewCsv = (text: string, options: ImportOptions): ImportPreview => {
  const rows = parseCsvRows(text, options.delimiter);
  const problems: string[] = [];
  if (rows.length === 0) {
    return {
      header: [],
      mapping: {},
      dateOrder: "dmy",
      rows: [],
      skipped: 0,
      duplicates: 0,
      problems: ["That file has no rows in it."],
    };
  }

  const headerIndex = findHeaderRow(rows);
  const header = rows[headerIndex] ?? [];
  const mapping = options.mapping ?? mapColumns(header);
  const body = rows.slice(headerIndex + 1);

  if (mapping.date == null) problems.push("No date column was recognised.");
  if (mapping.amount == null && mapping.debit == null && mapping.credit == null) {
    problems.push("No amount column was recognised.");
  }

  const dateColumn = mapping.date ?? 0;
  const dateOrder =
    options.dateOrder ??
    detectDateOrder(body.slice(0, 40).map((row) => row[dateColumn] ?? ""));

  const seen = new Map<string, number>();
  const parsed: ParsedRow[] = [];
  let skipped = 0;

  for (const row of body) {
    const date = parseDate(row[dateColumn] ?? "", dateOrder);
    if (!date) {
      skipped++;
      continue;
    }

    const amount = amountFrom(row, mapping, options.currency);
    if (amount == null) {
      skipped++;
      continue;
    }

    const payee = cleanPayee(
      mapping.payee != null ? (row[mapping.payee] ?? "") : "",
    );
    const key = `${date}|${amount}|${payee.toLowerCase()}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);

    parsed.push({
      date,
      payee: payee || "Unnamed",
      amount,
      note: mapping.note != null ? row[mapping.note] || undefined : undefined,
      currency:
        mapping.currency != null ? row[mapping.currency] || undefined : undefined,
      externalId: externalIdFor(options.accountId, date, amount, payee, occurrence),
      raw: row,
    });
  }

  const known = options.known ?? new Set<string>();
  const duplicates = parsed.filter((row) => known.has(row.externalId)).length;

  if (parsed.length === 0 && problems.length === 0) {
    problems.push("No rows could be read from that file.");
  }

  return {
    header,
    mapping,
    dateOrder,
    rows: parsed.sort((a, b) => a.date.localeCompare(b.date)),
    skipped,
    duplicates,
    problems,
  };
};

/**
 * The signed amount for a row.
 *
 * Three shapes in the wild: one signed column; separate debit and credit
 * columns; and — the trap — a single unsigned "amount" column with the
 * direction only in a debit/credit column beside it. The first two are handled
 * here; the third looks like the second, because an empty credit cell and a
 * populated debit cell is exactly what it produces.
 */
const amountFrom = (
  row: string[],
  mapping: ColumnMap,
  currency: string,
): Cents | null => {
  if (mapping.debit != null || mapping.credit != null) {
    const debit = mapping.debit != null ? parseAmount(row[mapping.debit] ?? "", currency) : null;
    const credit =
      mapping.credit != null ? parseAmount(row[mapping.credit] ?? "", currency) : null;
    if (debit != null && debit !== 0) return -Math.abs(debit);
    if (credit != null && credit !== 0) return Math.abs(credit);
    if (mapping.amount == null) return null;
  }

  if (mapping.amount == null) return null;
  const amount = parseAmount(row[mapping.amount] ?? "", currency);
  if (amount == null || amount === 0) return null;

  // Revolut and friends charge the fee alongside rather than inside the amount.
  const fee = mapping.fee != null ? parseAmount(row[mapping.fee] ?? "", currency) : null;
  return fee ? amount - Math.abs(fee) : amount;
};

/** Strip the noise banks staple onto a merchant name. */
export const cleanPayee = (value: string): string =>
  value
    .replace(/\s+/g, " ")
    .replace(/^(compra|pagamento|pag\.?|pagam\.?|débito directo|debito directo|dd|transf\.?|transferencia|transferência|mb way|mbway|levantamento)\s+/i, "")
    .replace(/\s+\d{2}[-/.]\d{2}([-/.]\d{2,4})?$/, "")
    .replace(/\s+cart[aã]o\s+\d+/i, "")
    .trim();

/* -------------------------------------------------------------------------- */
/*                                  Building                                  */
/* -------------------------------------------------------------------------- */

export interface ImportResult {
  transactions: Transaction[];
  imported: number;
  duplicates: number;
  categorised: number;
}

/**
 * Turn the preview into transactions, skipping what is already on file and
 * categorising what the rules recognise.
 */
export const buildTransactions = (
  preview: ImportPreview,
  options: { accountId: string; rules: CategoryRule[]; known?: Set<string> },
): ImportResult => {
  const known = options.known ?? new Set<string>();
  const transactions: Transaction[] = [];
  let duplicates = 0;
  let categorised = 0;

  for (const row of preview.rows) {
    if (known.has(row.externalId)) {
      duplicates++;
      continue;
    }
    const categoryId = suggestCategory(row.payee, options.rules);
    if (categoryId) categorised++;
    transactions.push(
      makeTransaction({
        accountId: options.accountId,
        date: row.date,
        amount: row.amount,
        payee: row.payee,
        categoryId,
        note: row.note,
        externalId: row.externalId,
      }),
    );
  }

  return {
    transactions,
    imported: transactions.length,
    duplicates,
    categorised,
  };
};
