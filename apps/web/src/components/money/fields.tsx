"use client";

import { useEffect, useState } from "react";
import type { Account, Category, Cents } from "@fitme/money";
import { GROUP_LABELS, amountValue, currencyInfo, parseAmount } from "@fitme/money";
import { Select, TextInput } from "@/components/ui";

/**
 * The three inputs every money form needs.
 *
 * The amount field is the one worth care: it holds text, not a number, because
 * `12,` is a valid thing to be halfway through typing and a number input would
 * either reject it or silently drop the comma. Parsing happens on the way out.
 */

export const AmountField = ({
  value,
  currency,
  onChange,
  autoFocus,
  placeholder,
  id,
}: {
  value: Cents | null;
  currency: string;
  onChange: (cents: Cents | null) => void;
  autoFocus?: boolean;
  placeholder?: string;
  id?: string;
}) => {
  const [text, setText] = useState(value == null ? "" : amountValue(Math.abs(value), currency));

  // Follow the value when something else sets it — the quick-add parser, or
  // opening the sheet on a different transaction.
  useEffect(() => {
    setText(value == null ? "" : amountValue(Math.abs(value), currency));
  }, [value, currency]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
        {currencyInfo(currency).symbol}
      </span>
      <TextInput
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder ?? "0,00"}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          onChange(parseAmount(next, currency));
        }}
        className="tabular pl-9 text-lg"
      />
    </div>
  );
};

export const CategorySelect = ({
  value,
  categories,
  onChange,
  kind,
  allowNone = true,
  noneLabel = "Uncategorised",
  id,
}: {
  value: string | null;
  categories: Category[];
  onChange: (categoryId: string | null) => void;
  kind?: Category["kind"];
  allowNone?: boolean;
  /** What the empty option says. "Uncategorised" when setting, "All" when filtering. */
  noneLabel?: string;
  id?: string;
}) => {
  const groups: Category["group"][] = ["essentials", "lifestyle", "financial", "income"];
  const visible = categories.filter(
    (category) => !category.archived && (!kind || category.kind === kind),
  );

  return (
    <Select
      id={id}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      {allowNone && <option value="">{noneLabel}</option>}
      {groups.map((group) => {
        const inGroup = visible.filter((category) => category.group === group);
        if (inGroup.length === 0) return null;
        return (
          <optgroup key={group} label={GROUP_LABELS[group]}>
            {inGroup.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
};

export const AccountSelect = ({
  value,
  accounts,
  onChange,
  id,
  exclude,
}: {
  value: string;
  accounts: Account[];
  onChange: (accountId: string) => void;
  id?: string;
  exclude?: string;
}) => (
  <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
    {accounts
      .filter((account) => account.id !== exclude)
      .map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}
          {account.currency !== "EUR" ? ` (${account.currency})` : ""}
        </option>
      ))}
  </Select>
);

export const DateField = ({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (date: string) => void;
  id?: string;
}) => (
  <TextInput
    id={id}
    type="date"
    value={value}
    onChange={(event) => onChange(event.target.value)}
  />
);
