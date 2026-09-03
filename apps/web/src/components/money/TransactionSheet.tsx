"use client";

import { useEffect, useRef, useState } from "react";
import { cryptoId, toDateKey } from "@fitme/core";
import type { Cents, LineItem, Transaction } from "@fitme/money";
import {
  makeLineItem,
  makeTransaction,
  parseQuickAdd,
  suggestCategory,
  toCents,
} from "@fitme/money";
import { useMoney } from "@/lib/money";
import { prepareImage } from "@/lib/image";
import { Badge, Button, Field, Sheet, Textarea, TextInput } from "@/components/ui";
import { CameraIcon, SparkIcon, TrashIcon } from "@/components/icons";
import { AccountSelect, AmountField, CategorySelect, DateField } from "./fields";
import { useMoneyFormat } from "./format";

/**
 * Adding and editing a purchase.
 *
 * Three ways in, in order of how often they get used: type a line and let the
 * device parse it, photograph the receipt, or fill the fields. The typed line
 * is first because the daily log only survives if adding to it costs one
 * sentence — but everything it decided lands in the same visible fields below,
 * so nothing is saved that you have not seen.
 */

interface ReceiptResponse {
  merchant: string;
  date: string | null;
  currency: string | null;
  total: number;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  notes: string[];
  confidence: number;
}

export const TransactionSheet = ({
  open,
  onClose,
  editing,
  defaultAccountId,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Transaction | null;
  defaultAccountId?: string;
}) => {
  const {
    openAccounts,
    accountMap,
    categories,
    rules,
    addTransactions,
    updateTransaction,
    removeTransaction,
    categorise,
  } = useMoney();
  const format = useMoneyFormat();

  const [accountId, setAccountId] = useState(defaultAccountId ?? openAccounts[0]?.id ?? "");
  const [date, setDate] = useState(toDateKey());
  const [amount, setAmount] = useState<Cents | null>(null);
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [payee, setPayee] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [receiptThumb, setReceiptThumb] = useState<string | undefined>();

  const [quick, setQuick] = useState("");
  const [understood, setUnderstood] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const currency = accountMap.get(accountId)?.currency ?? format.currency;

  // Reset to whatever the sheet was opened for.
  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setUnderstood([]);
    setQuick("");
    if (editing) {
      setAccountId(editing.accountId);
      setDate(editing.date);
      setAmount(Math.abs(editing.amount));
      setDirection(editing.amount >= 0 ? "income" : "expense");
      setPayee(editing.payee);
      setCategoryId(editing.categoryId);
      setNote(editing.note ?? "");
      setItems(editing.items ?? []);
      setReceiptThumb(editing.receiptThumb);
    } else {
      setAccountId(defaultAccountId ?? openAccounts[0]?.id ?? "");
      setDate(toDateKey());
      setAmount(null);
      setDirection("expense");
      setPayee("");
      setCategoryId(null);
      setNote("");
      setItems([]);
      setReceiptThumb(undefined);
    }
  }, [open, editing, defaultAccountId, openAccounts]);

  const applyQuickAdd = (): void => {
    if (!quick.trim()) return;
    const parsed = parseQuickAdd(quick, { rules, categories, currency });
    if (parsed.amount != null) setAmount(Math.abs(parsed.amount));
    setDirection(parsed.direction);
    setDate(parsed.date);
    setPayee(parsed.payee);
    if (parsed.categoryId) setCategoryId(parsed.categoryId);
    setUnderstood(parsed.understood);
    setQuick("");
  };

  const readReceipt = async (file: File): Promise<void> => {
    setReading(true);
    setMessage(null);
    try {
      const image = await prepareImage(file, { maxEdge: 1400 });
      const response = await fetch("/api/vision/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: image.base64, mediaType: image.mediaType }),
      });
      const json = (await response.json()) as ReceiptResponse & { message?: string };
      if (!response.ok) {
        setMessage(json.message ?? "That receipt could not be read.");
        return;
      }

      const receiptCurrency = json.currency ?? currency;
      if (json.merchant) setPayee(json.merchant);
      if (json.date) setDate(json.date);
      if (json.total > 0) setAmount(toCents(json.total, receiptCurrency));
      setDirection("expense");
      setItems(
        json.items.map((item) =>
          makeLineItem(item.name, item.quantity, toCents(item.unitPrice, receiptCurrency)),
        ),
      );
      setReceiptThumb(image.thumbnail);
      const suggested = json.merchant ? suggestCategory(json.merchant, rules) : null;
      if (suggested) setCategoryId(suggested);
      setMessage(
        json.notes.length > 0
          ? json.notes.join(" ")
          : `Read ${json.items.length} line${json.items.length === 1 ? "" : "s"}. Check it before saving.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That photo could not be read.");
    } finally {
      setReading(false);
    }
  };

  const save = (): void => {
    if (amount == null || amount === 0 || !accountId) return;
    const signed = direction === "income" ? Math.abs(amount) : -Math.abs(amount);

    if (editing) {
      updateTransaction({
        ...editing,
        accountId,
        date,
        amount: signed,
        payee: payee.trim() || "Unnamed",
        categoryId,
        note: note.trim() || undefined,
        items: items.length > 0 ? items : undefined,
        receiptThumb,
      });
      // Editing the category of an existing row should teach the rules too.
      if (categoryId && categoryId !== editing.categoryId) {
        categorise(editing.id, categoryId);
      }
    } else {
      addTransactions([
        makeTransaction({
          accountId,
          date,
          amount: signed,
          payee: payee.trim() || "Unnamed",
          categoryId,
          note: note.trim() || undefined,
          items: items.length > 0 ? items : undefined,
          receiptThumb,
        }),
      ]);
    }
    onClose();
  };

  /** Edit one line, keeping its total consistent with quantity × unit price. */
  const patchItem = (id: string, patch: Partial<LineItem>): void => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        return { ...next, total: Math.round(next.unitPrice * next.quantity) };
      }),
    );
  };

  const itemsTotal = items.reduce((total, item) => total + item.total, 0);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit transaction" : "Add transaction"}
      footer={
        <div className="flex gap-2">
          {editing && (
            <Button
              variant="danger"
              onClick={() => {
                removeTransaction(editing.id);
                onClose();
              }}
              aria-label="Delete transaction"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          )}
          <Button variant="primary" full onClick={save} disabled={!amount || !accountId}>
            {editing ? "Save" : "Add"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!editing && (
          <div>
            <div className="flex gap-2">
              <TextInput
                value={quick}
                onChange={(event) => setQuick(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyQuickAdd();
                  }
                }}
                placeholder="café 1,20 no continente"
                aria-label="Describe the transaction"
              />
              <Button onClick={applyQuickAdd} aria-label="Read what I typed">
                <SparkIcon className="h-5 w-5" />
              </Button>
              <Button
                onClick={() => fileInput.current?.click()}
                disabled={reading}
                aria-label="Photograph a receipt"
              >
                <CameraIcon className="h-5 w-5" />
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void readReceipt(file);
                }}
              />
            </div>
            {understood.length > 0 && (
              <p className="mt-2 text-xs text-faint">
                Read {understood.join(", ")} — check the fields below.
              </p>
            )}
            {reading && (
              <p className="mt-2 text-xs text-brand">Reading the receipt…</p>
            )}
          </div>
        )}

        {message && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
            {message}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setDirection("expense")}
            aria-pressed={direction === "expense"}
            className={`h-11 rounded-xl border text-sm font-medium transition-colors ${
              direction === "expense"
                ? "border-out bg-out/15 text-out"
                : "border-border bg-surface-2 text-muted"
            }`}
          >
            Money out
          </button>
          <button
            type="button"
            onClick={() => setDirection("income")}
            aria-pressed={direction === "income"}
            className={`h-11 rounded-xl border text-sm font-medium transition-colors ${
              direction === "income"
                ? "border-in bg-in/15 text-in"
                : "border-border bg-surface-2 text-muted"
            }`}
          >
            Money in
          </button>
        </div>

        <Field label="Amount">
          <AmountField value={amount} currency={currency} onChange={setAmount} />
        </Field>

        <Field label="Payee">
          <TextInput
            value={payee}
            onChange={(event) => setPayee(event.target.value)}
            placeholder="Continente"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Account">
            <AccountSelect value={accountId} accounts={openAccounts} onChange={setAccountId} />
          </Field>
          <Field label="Date">
            <DateField value={date} onChange={setDate} />
          </Field>
        </div>

        <Field
          label="Category"
          hint={
            categoryId
              ? "Filing this teaches the rules, so the next one from this payee files itself."
              : undefined
          }
        >
          <CategorySelect
            value={categoryId}
            categories={categories}
            onChange={setCategoryId}
            kind={direction === "income" ? "income" : "expense"}
          />
        </Field>

        <Field label="Note">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional"
            className="min-h-16"
          />
        </Field>

        {items.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-muted">
                Items ({items.length})
              </span>
              <span className="text-xs text-faint">
                {format.inCurrency(itemsTotal, currency)}
                {amount != null && Math.abs(itemsTotal - amount) > 2 && (
                  <Badge tone="warn"> total differs</Badge>
                )}
              </span>
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-2">
                  <TextInput
                    value={item.name}
                    aria-label="Item name"
                    onChange={(event) => patchItem(item.id, { name: event.target.value })}
                    className="min-w-0 flex-1 py-2 text-sm"
                  />
                  <TextInput
                    value={String(item.quantity)}
                    aria-label="Quantity"
                    inputMode="decimal"
                    onChange={(event) => {
                      const quantity = Number(event.target.value.replace(",", "."));
                      patchItem(item.id, {
                        quantity: Number.isFinite(quantity) ? quantity : 1,
                      });
                    }}
                    className="tabular w-14 shrink-0 py-2 text-center text-sm"
                  />
                  <div className="w-24 shrink-0">
                    <AmountField
                      value={item.unitPrice}
                      currency={currency}
                      onChange={(unitPrice) => patchItem(item.id, { unitPrice: unitPrice ?? 0 })}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() =>
                      setItems((current) =>
                        current.filter((existing) => existing.id !== item.id),
                      )
                    }
                    className="text-faint hover:text-danger"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              className="mt-2"
              onClick={() =>
                setItems((current) => [
                  ...current,
                  { id: cryptoId(), name: "", quantity: 1, unitPrice: 0, total: 0 },
                ])
              }
            >
              Add a line
            </Button>
          </div>
        )}

        {items.length === 0 && (
          <Button
            size="sm"
            onClick={() =>
              setItems([{ id: cryptoId(), name: "", quantity: 1, unitPrice: 0, total: 0 }])
            }
          >
            Itemise this purchase
          </Button>
        )}

        {receiptThumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={receiptThumb}
            alt="The receipt this was read from"
            className="max-h-40 rounded-xl border border-border object-contain"
          />
        )}
      </div>
    </Sheet>
  );
};
