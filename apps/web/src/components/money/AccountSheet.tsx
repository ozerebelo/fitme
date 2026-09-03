"use client";

import { useEffect, useState } from "react";
import { toDateKey } from "@fitme/core";
import type { Account, AccountKind, BalanceMode, Cents } from "@fitme/money";
import { CURRENCIES, DEFAULT_BALANCE_MODE } from "@fitme/money";
import { useMoney } from "@/lib/money";
import { Button, Field, Select, Sheet, TextInput } from "@/components/ui";
import { AmountField, DateField } from "./fields";

const KIND_LABELS: Record<AccountKind, string> = {
  current: "Current account",
  savings: "Savings",
  cash: "Cash",
  credit: "Credit card",
  investment: "Investment account",
  loan: "Loan or mortgage",
  asset: "Asset (property, vehicle)",
};

const MODE_LABELS: Record<BalanceMode, string> = {
  transactions: "From the transactions logged against it",
  manual: "A value I enter myself",
  holdings: "From the holdings inside it",
};

/**
 * Creating and editing an account.
 *
 * The opening balance is the field people get wrong, so it says what it means:
 * what the account held on the day it enters the app, before anything logged
 * against it. For a card or a loan that is a negative number, and the hint says
 * so rather than leaving the sign to guesswork.
 */
export const AccountSheet = ({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Account | null;
}) => {
  const { addAccount, updateAccount, deleteAccount, setArchived, setValuation, currency } =
    useMoney();

  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [kind, setKind] = useState<AccountKind>("current");
  const [accountCurrency, setAccountCurrency] = useState(currency);
  const [balanceMode, setBalanceMode] = useState<BalanceMode>("transactions");
  const [openingBalance, setOpeningBalance] = useState<Cents | null>(0);
  const [negative, setNegative] = useState(false);
  const [openedOn, setOpenedOn] = useState(toDateKey());
  const [creditLimit, setCreditLimit] = useState<Cents | null>(null);
  const [rate, setRate] = useState("");
  const [currentValue, setCurrentValue] = useState<Cents | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setInstitution(editing.institution ?? "");
      setKind(editing.kind);
      setAccountCurrency(editing.currency);
      setBalanceMode(editing.balanceMode);
      setOpeningBalance(Math.abs(editing.openingBalance));
      setNegative(editing.openingBalance < 0);
      setOpenedOn(editing.openedOn);
      setCreditLimit(editing.creditLimit ?? null);
      setRate(editing.interestRatePct != null ? String(editing.interestRatePct) : "");
      setCurrentValue(editing.valuations[editing.valuations.length - 1]?.value ?? null);
    } else {
      setName("");
      setInstitution("");
      setKind("current");
      setAccountCurrency(currency);
      setBalanceMode("transactions");
      setOpeningBalance(0);
      setNegative(false);
      setOpenedOn(toDateKey());
      setCreditLimit(null);
      setRate("");
      setCurrentValue(null);
    }
  }, [open, editing, currency]);

  const chooseKind = (next: AccountKind): void => {
    setKind(next);
    // The mode follows the kind unless the person says otherwise afterwards.
    setBalanceMode(DEFAULT_BALANCE_MODE[next]);
    setNegative(next === "loan" || next === "credit");
  };

  const save = (): void => {
    const signedOpening = (openingBalance ?? 0) * (negative ? -1 : 1);
    const interestRatePct = rate.trim() ? Number(rate.replace(",", ".")) : undefined;

    if (editing) {
      updateAccount({
        ...editing,
        name: name.trim() || editing.name,
        institution: institution.trim() || undefined,
        kind,
        balanceMode,
        currency: accountCurrency,
        openingBalance: signedOpening,
        openedOn,
        creditLimit: creditLimit ?? undefined,
        interestRatePct: Number.isFinite(interestRatePct) ? interestRatePct : undefined,
      });
      if (balanceMode === "manual" && currentValue != null) {
        setValuation(editing.id, toDateKey(), currentValue);
      }
    } else {
      const created = addAccount({
        name: name.trim() || "Account",
        institution: institution.trim() || undefined,
        kind,
        balanceMode,
        currency: accountCurrency,
        openingBalance: signedOpening,
        openedOn,
        creditLimit: creditLimit ?? undefined,
        interestRatePct: Number.isFinite(interestRatePct) ? interestRatePct : undefined,
      });
      if (balanceMode === "manual" && currentValue != null) {
        setValuation(created.id, toDateKey(), currentValue);
      }
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Edit account" : "Add account"}
      footer={
        <Button variant="primary" full onClick={save} disabled={!name.trim()}>
          {editing ? "Save" : "Add account"}
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Conta à ordem"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <Select
              value={kind}
              onChange={(event) => chooseKind(event.target.value as AccountKind)}
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currency">
            <Select
              value={accountCurrency}
              onChange={(event) => setAccountCurrency(event.target.value)}
            >
              {Object.values(CURRENCIES).map((info) => (
                <option key={info.code} value={info.code}>
                  {info.code} — {info.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Bank or broker" hint="Optional, and only for your own eyes.">
          <TextInput
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
            placeholder="Millennium bcp"
          />
        </Field>

        <Field label="Balance comes from">
          <Select
            value={balanceMode}
            onChange={(event) => setBalanceMode(event.target.value as BalanceMode)}
          >
            {Object.entries(MODE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {balanceMode === "manual" ? (
          <Field
            label="What it is worth today"
            hint="Update this whenever you get a new valuation; the old ones are kept."
          >
            <AmountField
              value={currentValue}
              currency={accountCurrency}
              onChange={setCurrentValue}
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Opening balance"
              hint={
                negative
                  ? "What you owed on the opening date."
                  : "What it held on the opening date."
              }
            >
              <AmountField
                value={openingBalance}
                currency={accountCurrency}
                onChange={setOpeningBalance}
              />
            </Field>
            <Field label="Opening date">
              <DateField value={openedOn} onChange={setOpenedOn} />
            </Field>
          </div>
        )}

        {balanceMode !== "manual" && (
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={negative}
              onChange={(event) => setNegative(event.target.checked)}
              className="h-5 w-5 accent-[var(--color-brand)]"
            />
            This is money owed, not money held
          </label>
        )}

        {kind === "credit" && (
          <Field label="Credit limit" hint="So the app can show how much of it is used.">
            <AmountField
              value={creditLimit}
              currency={accountCurrency}
              onChange={setCreditLimit}
            />
          </Field>
        )}

        {(kind === "savings" || kind === "loan") && (
          <Field
            label={kind === "savings" ? "Interest rate (% a year)" : "Rate (% a year)"}
            hint="Used for the growth projection. Leave blank if you would rather not assume one."
          >
            <TextInput
              value={rate}
              inputMode="decimal"
              onChange={(event) => setRate(event.target.value)}
              placeholder="2.5"
            />
          </Field>
        )}

        {editing && (
          <div className="space-y-2 border-t border-border pt-4">
            <Button
              full
              onClick={() => {
                setArchived(editing.id, !editing.archived);
                onClose();
              }}
            >
              {editing.archived ? "Unarchive" : "Archive"}
            </Button>
            <p className="text-xs leading-relaxed text-faint">
              Archiving hides it from the pickers and the totals and keeps every
              transaction. Deleting removes the account and everything logged against it.
            </p>
            <Button
              variant="danger"
              full
              onClick={() => {
                if (
                  window.confirm(
                    `Delete ${editing.name} and every transaction on it? This cannot be undone.`,
                  )
                ) {
                  deleteAccount(editing.id);
                  onClose();
                }
              }}
            >
              Delete account
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
};
