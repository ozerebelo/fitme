"use client";

import { useEffect, useRef, useState } from "react";
import type { ColumnMap, ColumnRole, ImportPreview } from "@fitme/money";
import { buildTransactions, previewCsv } from "@fitme/money";
import { useMoney } from "@/lib/money";
import { Button, Field, Select, Sheet } from "@/components/ui";
import { UploadIcon } from "@/components/icons";
import { AccountSelect } from "./fields";
import { useMoneyFormat } from "./format";

/**
 * Importing a bank statement.
 *
 * Nothing is saved until the preview has been looked at. Detection is good but
 * it is detection, and the failure mode of a silent import — a column read as
 * the wrong thing, an entire statement doubled — costs more to unpick than the
 * one screen it takes to check.
 */

const ROLE_LABELS: Partial<Record<ColumnRole, string>> = {
  date: "Date",
  payee: "Description",
  amount: "Amount (signed)",
  debit: "Money out",
  credit: "Money in",
  fee: "Fee",
  note: "Note",
};

export const ImportSheet = ({
  open,
  onClose,
  defaultAccountId,
}: {
  open: boolean;
  onClose: () => void;
  defaultAccountId?: string;
}) => {
  const { openAccounts, accountMap, rules, knownExternalIds, addTransactions } = useMoney();
  const format = useMoneyFormat();

  const [accountId, setAccountId] = useState(defaultAccountId ?? openAccounts[0]?.id ?? "");
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<ColumnMap | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const currency = accountMap.get(accountId)?.currency ?? format.currency;

  useEffect(() => {
    if (!open) {
      setText(null);
      setPreview(null);
      setMapping(null);
      setFileName("");
      setDone(null);
    }
  }, [open]);

  // Re-read whenever the file, the account or a hand-set column changes.
  useEffect(() => {
    if (!text || !accountId) return;
    setPreview(
      previewCsv(text, {
        accountId,
        currency,
        known: knownExternalIds,
        mapping: mapping ?? undefined,
      }),
    );
  }, [text, accountId, currency, mapping, knownExternalIds]);

  const load = async (file: File): Promise<void> => {
    setDone(null);
    setMapping(null);
    setFileName(file.name);
    setText(await file.text());
  };

  const runImport = (): void => {
    if (!preview) return;
    const result = buildTransactions(preview, {
      accountId,
      rules,
      known: knownExternalIds,
    });
    addTransactions(result.transactions);
    setDone(
      result.imported === 0
        ? `Nothing new — all ${result.duplicates} rows were already here.`
        : `Imported ${result.imported} transactions, ${result.categorised} of them categorised. ${result.duplicates} were already here.`,
    );
    setText(null);
    setPreview(null);
  };

  const fresh = preview ? preview.rows.length - preview.duplicates : 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import a statement"
      footer={
        preview && preview.rows.length > 0 ? (
          <Button variant="primary" full onClick={runImport} disabled={fresh === 0}>
            {fresh === 0 ? "Nothing new to import" : `Import ${fresh} transactions`}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <Field label="Into which account">
          <AccountSelect value={accountId} accounts={openAccounts} onChange={setAccountId} />
        </Field>

        <div>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void load(file);
            }}
          />
          <Button full onClick={() => fileInput.current?.click()}>
            <UploadIcon className="h-5 w-5" />
            {fileName || "Choose a CSV export"}
          </Button>
          <p className="mt-2 text-xs leading-relaxed text-faint">
            Any CSV your bank exports. Columns are detected, dates and decimal commas are
            handled, and importing the same file twice adds nothing the second time.
          </p>
        </div>

        {done && (
          <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm leading-relaxed text-brand">
            {done}
          </p>
        )}

        {preview && preview.problems.length > 0 && (
          <ul className="space-y-1 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {preview.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        {preview && preview.header.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-faint">
              <span>{preview.rows.length} rows read</span>
              {preview.duplicates > 0 && <span>{preview.duplicates} already here</span>}
              {preview.skipped > 0 && <span>{preview.skipped} skipped</span>}
              <span>
                dates read as{" "}
                {preview.dateOrder === "dmy"
                  ? "day first"
                  : preview.dateOrder === "mdy"
                    ? "month first"
                    : "year first"}
              </span>
            </div>

            <details className="rounded-xl border border-border">
              <summary className="cursor-pointer px-3 py-2.5 text-sm text-muted">
                Columns
              </summary>
              <div className="space-y-3 border-t border-border p-3">
                {(Object.keys(ROLE_LABELS) as ColumnRole[]).map((role) => (
                  <Field key={role} label={ROLE_LABELS[role] ?? role}>
                    <Select
                      value={String(preview.mapping[role] ?? "")}
                      onChange={(event) =>
                        setMapping({
                          ...preview.mapping,
                          [role]: event.target.value === "" ? undefined : Number(event.target.value),
                        })
                      }
                    >
                      <option value="">Not in this file</option>
                      {preview.header.map((name, index) => (
                        <option key={`${name}-${index}`} value={index}>
                          {name || `Column ${index + 1}`}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
            </details>

            {preview.rows.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
                  First rows as read
                </p>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {preview.rows.slice(0, 6).map((row) => (
                    <li
                      key={row.externalId}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate">{row.payee}</div>
                        <div className="text-xs text-faint">{row.date}</div>
                      </div>
                      <span
                        className={`tabular shrink-0 ${row.amount < 0 ? "text-danger" : "text-ok"}`}
                      >
                        {format.inCurrency(row.amount, currency, { signed: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
};
