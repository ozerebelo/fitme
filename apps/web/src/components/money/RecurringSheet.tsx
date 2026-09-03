"use client";

import { useEffect, useState } from "react";
import { toDateKey } from "@fitme/core";
import type { Cents, Frequency, RecurringRule } from "@fitme/money";
import { FREQUENCY_LABELS, makeRule } from "@fitme/money";
import { useMoney } from "@/lib/money";
import { Button, Field, Select, Sheet, TextInput } from "@/components/ui";
import { AccountSelect, AmountField, CategorySelect, DateField } from "./fields";

/**
 * A standing payment: rent, the salary, a subscription.
 *
 * Posting is manual by default. A bill the app inserted on the 5th and the bank
 * took on the 8th is a balance that disagrees with reality for three days, and
 * a ledger you have to second-guess is one nobody trusts. Auto-posting is there
 * for the ones that genuinely never vary.
 */
export const RecurringSheet = ({
  open,
  onClose,
  editing,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  editing?: RecurringRule | null;
  /** Pre-filled from a subscription the app found in the history. */
  preset?: { name: string; amount: Cents; frequency: Frequency; categoryId: string | null } | null;
}) => {
  const money = useMoney();

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState(money.openAccounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState<Cents | null>(null);
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [anchorDate, setAnchorDate] = useState(toDateKey());
  const [autoPost, setAutoPost] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setAccountId(editing.accountId);
      setCategoryId(editing.categoryId);
      setAmount(Math.abs(editing.amount));
      setDirection(editing.amount >= 0 ? "in" : "out");
      setFrequency(editing.frequency);
      setAnchorDate(editing.anchorDate);
      setAutoPost(editing.autoPost);
    } else {
      setName(preset?.name ?? "");
      setAccountId(money.openAccounts[0]?.id ?? "");
      setCategoryId(preset?.categoryId ?? null);
      setAmount(preset?.amount ?? null);
      setDirection("out");
      setFrequency(preset?.frequency ?? "monthly");
      setAnchorDate(toDateKey());
      setAutoPost(false);
    }
  }, [open, editing, preset, money.openAccounts]);

  const save = (): void => {
    if (!name.trim() || amount == null || !accountId) return;
    const signed = direction === "in" ? Math.abs(amount) : -Math.abs(amount);
    if (editing) {
      money.updateRecurring({
        ...editing,
        name: name.trim(),
        accountId,
        categoryId,
        amount: signed,
        frequency,
        anchorDate,
        autoPost,
      });
    } else {
      money.addRecurring(
        makeRule({
          name: name.trim(),
          accountId,
          categoryId,
          amount: signed,
          frequency,
          anchorDate,
          autoPost,
        }),
      );
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit standing payment" : "New standing payment"}
      footer={
        <div className="flex gap-2">
          {editing && (
            <Button
              variant="danger"
              onClick={() => {
                money.removeRecurring(editing.id);
                onClose();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="primary" full onClick={save} disabled={!name.trim() || amount == null}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="What is it">
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Renda"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <AmountField value={amount} currency={money.currency} onChange={setAmount} />
          </Field>
          <Field label="Direction">
            <Select
              value={direction}
              onChange={(event) => setDirection(event.target.value as "in" | "out")}
            >
              <option value="out">Money out</option>
              <option value="in">Money in</option>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="How often">
            <Select
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as Frequency)}
            >
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="First one" hint="Every later date is counted from this.">
            <DateField value={anchorDate} onChange={setAnchorDate} />
          </Field>
        </div>

        <Field label="Account">
          <AccountSelect value={accountId} accounts={money.openAccounts} onChange={setAccountId} />
        </Field>

        <Field label="Category">
          <CategorySelect
            value={categoryId}
            categories={money.categories}
            onChange={setCategoryId}
            kind={direction === "in" ? "income" : "expense"}
          />
        </Field>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={autoPost}
            onChange={(event) => setAutoPost(event.target.checked)}
            className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]"
          />
          <span>
            Post it without asking
            <span className="mt-0.5 block text-xs leading-relaxed text-faint">
              Only for the ones that never vary. Otherwise it waits for you to confirm it
              actually left.
            </span>
          </span>
        </label>
      </div>
    </Sheet>
  );
};
