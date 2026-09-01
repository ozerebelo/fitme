/**
 * A small, dependency-free CSV reader.
 *
 * Handles the things that actually break naive `split(",")` implementations on
 * real exports: quoted fields containing the delimiter, doubled quotes as an
 * escape, CRLF line endings, a UTF-8 BOM, and semicolon-delimited files
 * produced by locales where the comma is the decimal separator.
 */

export type CsvRow = Record<string, string>;

const DELIMITERS = [",", ";", "\t", "|"] as const;

/** Guess the delimiter by counting candidates outside quoted regions. */
export const detectDelimiter = (text: string): string => {
  const sample = text.slice(0, 8192);
  let best = ",";
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i]!;
      if (ch === '"') {
        if (inQuotes && sample[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
      } else if (!inQuotes && ch === delimiter) count++;
      else if (!inQuotes && ch === "\n") break; // header line only
    }
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
};

/** Parse CSV text into an array of string arrays. */
export const parseCsvRows = (text: string, delimiter?: string): string[][] => {
  const clean = text.replace(/^﻿/, "");
  const sep = delimiter ?? detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      // Swallow; the \n that follows ends the record.
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop trailing blank records produced by a final newline.
  return rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
};

/** Parse CSV text into objects keyed by header name. */
export const parseCsv = (text: string, delimiter?: string): CsvRow[] => {
  const rows = parseCsvRows(text, delimiter);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const record: CsvRow = {};
    header.forEach((key, i) => {
      record[key] = (cells[i] ?? "").trim();
    });
    return record;
  });
};

/** Case- and punctuation-insensitive header lookup. */
export const pick = (row: CsvRow, ...names: string[]): string => {
  const normalize = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = names.map(normalize);
  for (const [key, value] of Object.entries(row)) {
    if (wanted.includes(normalize(key))) return value;
  }
  return "";
};

export const toNumber = (value: string): number => {
  if (!value) return 0;
  // Tolerate comma decimal separators from European exports.
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
};
