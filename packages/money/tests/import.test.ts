import { describe, expect, it } from "vitest";
import {
  buildTransactions,
  cleanPayee,
  detectDateOrder,
  parseDate,
  previewCsv,
  seedRules,
} from "../src/index";
import { eur } from "./helpers";

/** A Portuguese bank export: preamble, semicolons, debit and credit columns. */
const PORTUGUESE = `Extrato de conta;;;;
Conta;PT50 0000 0000 0000 0000 0000 0;;;
Periodo;01-03-2026 a 31-03-2026;;;
;;;;
Data mov.;Data valor;Descricao;Debito;Credito;Saldo
02-03-2026;02-03-2026;COMPRA CONTINENTE 4515 LISBOA;54,32;;1.945,68
03-03-2026;03-03-2026;PAG SERV EDP COMERCIAL;71,20;;1.874,48
05-03-2026;05-03-2026;TRANSF SALARIO MARCO;;1.800,00;3.674,48
06-03-2026;06-03-2026;LEVANTAMENTO MB 06-03;40,00;;3.634,48
;;Totais;165,52;1.800,00;
`;

/** Revolut: clean English headers, ISO dates, a separate fee column. */
const REVOLUT = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-03-02 08:14:22,2026-03-02 10:02:11,Pingo Doce,-24.10,0.00,EUR,COMPLETED,412.30
TOPUP,Current,2026-03-03 09:00:00,2026-03-03 09:00:02,Payment from Zé,100.00,0.00,EUR,COMPLETED,512.30
ATM,Current,2026-03-05 18:00:00,2026-03-05 18:00:04,Cash at Multibanco,-50.00,1.50,EUR,COMPLETED,460.80
`;

describe("Portuguese statement", () => {
  const preview = previewCsv(PORTUGUESE, { accountId: "a1", currency: "EUR" });

  it("finds the header under the preamble", () => {
    expect(preview.header[0]).toBe("Data mov.");
    expect(preview.mapping.debit).toBe(3);
    expect(preview.mapping.credit).toBe(4);
  });

  it("signs the rows from the debit and credit columns", () => {
    expect(preview.rows).toHaveLength(4);
    expect(preview.rows[0]).toMatchObject({ date: "2026-03-02", amount: -eur(54.32) });
    expect(preview.rows[2]).toMatchObject({ date: "2026-03-05", amount: eur(1800) });
  });

  it("skips the totals row instead of importing it", () => {
    expect(preview.skipped).toBeGreaterThan(0);
    expect(preview.rows.some((row) => row.payee.includes("Totais"))).toBe(false);
  });

  it("reads day-first dates", () => {
    expect(preview.dateOrder).toBe("dmy");
  });

  it("categorises what it recognises", () => {
    const result = buildTransactions(preview, { accountId: "a1", rules: seedRules() });
    const byPayee = new Map(result.transactions.map((t) => [t.payee, t.categoryId]));
    expect(byPayee.get("CONTINENTE 4515 LISBOA")).toBe("groceries");
    expect(byPayee.get("SERV EDP COMERCIAL")).toBe("utilities");
    expect(result.categorised).toBeGreaterThanOrEqual(2);
  });

  it("is a no-op when the same file is imported again", () => {
    const first = buildTransactions(preview, { accountId: "a1", rules: [] });
    const known = new Set(first.transactions.map((t) => t.externalId!));
    const second = previewCsv(PORTUGUESE, { accountId: "a1", currency: "EUR", known });
    expect(second.duplicates).toBe(4);
    const again = buildTransactions(second, { accountId: "a1", rules: [], known });
    expect(again.imported).toBe(0);
    expect(again.duplicates).toBe(4);
  });

  it("keeps two identical rows from the same day as two transactions", () => {
    const twice = `Data;Descricao;Debito
07-03-2026;CAFE CENTRAL;1,20
07-03-2026;CAFE CENTRAL;1,20
`;
    const parsed = previewCsv(twice, { accountId: "a1", currency: "EUR" });
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]!.externalId).not.toBe(parsed.rows[1]!.externalId);
  });
});

describe("Revolut export", () => {
  const preview = previewCsv(REVOLUT, { accountId: "a2", currency: "EUR" });

  it("uses the completed date and the signed amount", () => {
    expect(preview.dateOrder).toBe("ymd");
    expect(preview.rows[0]).toMatchObject({ date: "2026-03-02", amount: -eur(24.1) });
    expect(preview.rows[1]!.amount).toBe(eur(100));
  });

  it("takes the fee off the amount", () => {
    expect(preview.rows[2]!.amount).toBe(-eur(51.5));
  });
});

describe("date reading", () => {
  it("settles the ambiguity from the column as a whole", () => {
    expect(detectDateOrder(["01/02/2026", "13/02/2026"])).toBe("dmy");
    expect(detectDateOrder(["01/02/2026", "02/13/2026"])).toBe("mdy");
    expect(detectDateOrder(["2026-02-01"])).toBe("ymd");
  });

  it("defaults to day-first when nothing settles it", () => {
    expect(parseDate("03/04/2026", detectDateOrder(["03/04/2026"]))).toBe("2026-04-03");
  });

  it("expands a two-digit year", () => {
    expect(parseDate("03-04-26", "dmy")).toBe("2026-04-03");
  });

  it("refuses a date that is not one", () => {
    expect(parseDate("Totais", "dmy")).toBeNull();
    expect(parseDate("45/13/2026", "dmy")).toBeNull();
  });
});

describe("payee cleaning", () => {
  it("drops the bank's prefixes and trailing card noise", () => {
    expect(cleanPayee("COMPRA CONTINENTE 4515 LISBOA")).toBe("CONTINENTE 4515 LISBOA");
    expect(cleanPayee("PAG SERV EDP COMERCIAL")).toBe("SERV EDP COMERCIAL");
    expect(cleanPayee("LEVANTAMENTO MB 06-03")).toBe("MB");
  });
});

describe("a file that is not a statement", () => {
  it("says so instead of importing nothing quietly", () => {
    const preview = previewCsv("hello\nworld\n", { accountId: "a1", currency: "EUR" });
    expect(preview.rows).toHaveLength(0);
    expect(preview.problems.length).toBeGreaterThan(0);
  });
});
