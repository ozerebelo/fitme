"use client";

import { useEffect, useState } from "react";
import type { Cents, Goal } from "@fitme/money";
import { makeGoal } from "@fitme/money";
import { useMoney } from "@/lib/money";
import { Button, Field, Select, Sheet, TextInput } from "@/components/ui";
import { AmountField, DateField } from "./fields";

/**
 * A savings goal.
 *
 * Linking it to an account is the default because a pot you keep by hand drifts
 * from the money that is actually there, and a goal that quietly disagrees with
 * your balance is worse than no goal.
 */
export const GoalSheet = ({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Goal | null;
}) => {
  const money = useMoney();

  const [name, setName] = useState("");
  const [target, setTarget] = useState<Cents | null>(null);
  const [targetDate, setTargetDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [monthly, setMonthly] = useState<Cents | null>(null);

  const savingsAccounts = money.openAccounts.filter((account) =>
    ["savings", "current", "cash", "investment"].includes(account.kind),
  );

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setTarget(editing.target);
      setTargetDate(editing.targetDate ?? "");
      setAccountId(editing.accountId ?? "");
      setMonthly(editing.monthlyContribution ?? null);
    } else {
      setName("");
      setTarget(null);
      setTargetDate("");
      setAccountId("");
      setMonthly(null);
    }
  }, [open, editing]);

  const save = (): void => {
    if (!name.trim() || target == null) return;
    if (editing) {
      money.updateGoal({
        ...editing,
        name: name.trim(),
        target,
        targetDate: targetDate || undefined,
        accountId: accountId || undefined,
        monthlyContribution: monthly ?? undefined,
      });
    } else {
      money.addGoal(
        makeGoal({
          name: name.trim(),
          target,
          currency: money.currency,
          targetDate: targetDate || undefined,
          accountId: accountId || undefined,
          monthlyContribution: monthly ?? undefined,
        }),
      );
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit goal" : "New goal"}
      footer={
        <div className="flex gap-2">
          {editing && (
            <Button
              variant="danger"
              onClick={() => {
                money.removeGoal(editing.id);
                onClose();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="primary" full onClick={save} disabled={!name.trim() || target == null}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="What for">
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Fundo de emergência"
            autoFocus
          />
        </Field>

        <Field label="Target">
          <AmountField value={target} currency={money.currency} onChange={setTarget} />
        </Field>

        <Field label="By when" hint="Optional. With a date, the app says what it takes a month.">
          <DateField value={targetDate} onChange={setTargetDate} />
        </Field>

        <Field
          label="Funded by"
          hint="Mirrors the balance of the account you pick, so progress is never out of date."
        >
          <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Contributions I record here</option>
            {savingsAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Planned each month" hint="Optional — otherwise the recent rate is used.">
          <AmountField value={monthly} currency={money.currency} onChange={setMonthly} />
        </Field>
      </div>
    </Sheet>
  );
};
