"use client";

import { useEffect, useState } from "react";
import { toDateKey } from "@fitme/core";
import type { Cents } from "@fitme/money";
import { useMoney } from "@/lib/money";
import { Button, Field, Sheet, TextInput } from "@/components/ui";
import { AccountSelect, AmountField, DateField } from "./fields";

/**
 * Moving money between your own accounts.
 *
 * Kept separate from adding a transaction because it is not one: a transfer is
 * neither income nor spending, and letting it be entered as an expense is how a
 * savings deposit ends up looking like the worst month of the year.
 */
export const TransferSheet = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const { openAccounts, accountMap, transfer } = useMoney();

  const [fromId, setFromId] = useState(openAccounts[0]?.id ?? "");
  const [toId, setToId] = useState(openAccounts[1]?.id ?? "");
  const [amount, setAmount] = useState<Cents | null>(null);
  const [received, setReceived] = useState<Cents | null>(null);
  const [date, setDate] = useState(toDateKey());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setFromId(openAccounts[0]?.id ?? "");
    setToId(openAccounts[1]?.id ?? "");
    setAmount(null);
    setReceived(null);
    setDate(toDateKey());
    setNote("");
  }, [open, openAccounts]);

  const from = accountMap.get(fromId);
  const to = accountMap.get(toId);
  const crossCurrency = !!from && !!to && from.currency !== to.currency;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Transfer"
      footer={
        <Button
          variant="primary"
          full
          disabled={!amount || !fromId || !toId || fromId === toId}
          onClick={() => {
            if (!amount) return;
            transfer({
              fromAccountId: fromId,
              toAccountId: toId,
              amount,
              receivedAmount: crossCurrency ? (received ?? undefined) : undefined,
              date,
              note: note.trim() || undefined,
            });
            onClose();
          }}
        >
          Transfer
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <AccountSelect
              value={fromId}
              accounts={openAccounts}
              onChange={setFromId}
              exclude={toId}
            />
          </Field>
          <Field label="To">
            <AccountSelect
              value={toId}
              accounts={openAccounts}
              onChange={setToId}
              exclude={fromId}
            />
          </Field>
        </div>

        <Field label={crossCurrency ? `Amount leaving (${from?.currency})` : "Amount"}>
          <AmountField
            value={amount}
            currency={from?.currency ?? "EUR"}
            onChange={setAmount}
            autoFocus
          />
        </Field>

        {crossCurrency && (
          <Field
            label={`Amount arriving (${to?.currency})`}
            hint="What actually landed, after the exchange."
          >
            <AmountField
              value={received}
              currency={to?.currency ?? "EUR"}
              onChange={setReceived}
            />
          </Field>
        )}

        <Field label="Date">
          <DateField value={date} onChange={setDate} />
        </Field>

        <Field label="Note">
          <TextInput
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>
    </Sheet>
  );
};
