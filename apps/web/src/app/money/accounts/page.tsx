"use client";

import { useMemo, useState } from "react";
import { toDateKey } from "@fitme/core";
import type { Account, Cents } from "@fitme/money";
import { CURRENCIES, LIABILITY_KINDS, formatPct, unratedCurrencies, utilisation } from "@fitme/money";
import { useMoney } from "@/lib/money";
import {
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  SectionTitle,
  Select,
  Spinner,
  TextInput,
} from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { Money, useMoneyFormat } from "@/components/money/format";
import { AmountField } from "@/components/money/fields";
import { AccountSheet } from "@/components/money/AccountSheet";

/**
 * Accounts, exchange rates and the handful of preferences the money side has.
 *
 * The rates are typed in rather than fetched. There is no feed in an app that
 * has to work with no network, and a rate of unknown age presented as live is
 * worse than one you entered and can see the date of.
 */
export default function AccountsPage() {
  const money = useMoney();
  const format = useMoneyFormat();
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [valuing, setValuing] = useState<Account | null>(null);
  const [newValue, setNewValue] = useState<Cents | null>(null);

  const unrated = useMemo(
    () =>
      unratedCurrencies(
        money.accounts.map((account) => account.currency).concat(
          money.money.holdings.map((holding) => holding.currency),
        ),
        money.settings,
      ),
    [money.accounts, money.money.holdings, money.settings],
  );

  if (!money.ready) return <Spinner label="Loading your data" />;

  const open = money.balances.filter(({ account }) => !account.archived);
  const archived = money.balances.filter(({ account }) => account.archived);

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle={`${format.money(money.worth.total, { round: true })} net worth`}
        action={
          <button
            type="button"
            aria-label="Add an account"
            onClick={() => {
              setEditing(null);
              setSheet(true);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-black"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        }
      />

      <div className="space-y-4 px-4">
        {open.length === 0 ? (
          <EmptyState
            title="No accounts yet"
            detail="Everything else hangs off an account: transactions, budgets, goals and the portfolio."
            action={
              <Button variant="primary" onClick={() => setSheet(true)}>
                Add one
              </Button>
            }
          />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-border">
              {open.map(({ account, balance, base }) => {
                const used = utilisation(account, balance);
                return (
                  <li key={account.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(account);
                        setSheet(true);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{account.name}</div>
                        <div className="truncate text-xs text-faint">
                          {[
                            account.institution,
                            account.kind,
                            account.currency !== money.currency ? account.currency : null,
                            used != null ? `${formatPct(used)} of limit` : null,
                            account.balanceMode === "manual"
                              ? `valued ${account.valuations[account.valuations.length - 1]?.date ?? account.openedOn}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <Money
                          cents={balance}
                          currency={account.currency}
                          round
                          className={
                            LIABILITY_KINDS.has(account.kind) || balance < 0 ? "text-danger" : ""
                          }
                        />
                        {account.currency !== money.currency && (
                          <span className="block text-xs text-faint">
                            {format.money(base, { round: true })}
                          </span>
                        )}
                      </div>
                    </button>

                    {account.balanceMode === "manual" && (
                      <div className="flex items-end gap-2 px-4 pb-3">
                        {valuing?.id === account.id ? (
                          <>
                            <div className="flex-1">
                              <AmountField
                                value={newValue}
                                currency={account.currency}
                                onChange={setNewValue}
                                autoFocus
                              />
                            </div>
                            <Button
                              onClick={() => {
                                if (newValue != null) {
                                  money.setValuation(account.id, toDateKey(), newValue);
                                }
                                setValuing(null);
                                setNewValue(null);
                              }}
                            >
                              Save
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => {
                              setValuing(account);
                              setNewValue(balance);
                            }}
                          >
                            Update its value
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {archived.length > 0 && (
          <div>
            <SectionTitle>Archived</SectionTitle>
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {archived.map(({ account, balance }) => (
                  <li key={account.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(account);
                        setSheet(true);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-muted transition-colors hover:bg-surface-2"
                    >
                      <span className="truncate">{account.name}</span>
                      <Money cents={balance} currency={account.currency} tone="muted" round />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {unrated.length > 0 && (
          <div>
            <SectionTitle>Exchange rates</SectionTitle>
            <Card>
              <p className="text-sm leading-relaxed text-muted">
                {unrated.join(", ")} {unrated.length === 1 ? "has" : "have"} no rate on file, so
                {unrated.length === 1 ? " it is" : " they are"} counted into the totals at face
                value. Set a rate and the totals become true.
              </p>
              <div className="mt-3 space-y-3">
                {unrated.map((code) => (
                  <RateRow key={code} code={code} />
                ))}
              </div>
            </Card>
          </div>
        )}

        {Object.keys(money.settings.rates).length > 0 && (
          <div>
            <SectionTitle>Rates on file</SectionTitle>
            <Card className="p-0">
              <ul className="divide-y divide-border">
                {Object.entries(money.settings.rates).map(([code, entry]) => (
                  <li
                    key={code}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span>
                      1 {code} = {entry.rate} {money.currency}
                    </span>
                    <span className="text-xs text-faint">set {entry.asOf}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        <div>
          <SectionTitle>Preferences</SectionTitle>
          <Card className="space-y-4">
            <Field
              label="Currency everything is totalled in"
              hint="Accounts keep their own currency; this is what the totals are shown in."
            >
              <Select
                value={money.currency}
                onChange={(event) => money.updateSettings({ baseCurrency: event.target.value })}
              >
                {Object.values(CURRENCIES).map((info) => (
                  <option key={info.code} value={info.code}>
                    {info.code} — {info.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="The month starts on day"
              hint="Set this to your payday if you budget from one salary to the next."
            >
              <Select
                value={String(money.settings.monthStartDay)}
                onChange={(event) =>
                  money.updateSettings({ monthStartDay: Number(event.target.value) })
                }
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    {day === 1 ? "1 (the calendar month)" : day}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Savings target (%)">
                <TextInput
                  inputMode="decimal"
                  value={String(Math.round(money.settings.savingsRateTarget * 100))}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      money.updateSettings({
                        savingsRateTarget: Math.max(0, Math.min(1, value / 100)),
                      });
                    }
                  }}
                  className="tabular"
                />
              </Field>
              <Field label="Emergency fund (months)">
                <TextInput
                  inputMode="decimal"
                  value={String(money.settings.emergencyFundMonths)}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) {
                      money.updateSettings({ emergencyFundMonths: Math.max(0, value) });
                    }
                  }}
                  className="tabular"
                />
              </Field>
            </div>

            <Field
              label="Assumed long-run return (% a year)"
              hint="Used only by the projection, and clearly labelled there as an assumption."
            >
              <TextInput
                inputMode="decimal"
                value={String(money.settings.expectedReturnPct)}
                onChange={(event) => {
                  const value = Number(event.target.value.replace(",", "."));
                  if (Number.isFinite(value)) {
                    money.updateSettings({ expectedReturnPct: value });
                  }
                }}
                className="tabular"
              />
            </Field>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={money.settings.privacyMode === true}
                onChange={(event) => money.updateSettings({ privacyMode: event.target.checked })}
                className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]"
              />
              <span>
                Hide the amounts
                <span className="mt-0.5 block text-xs leading-relaxed text-faint">
                  Every figure becomes •••, for using this on a train. The charts still work.
                </span>
              </span>
            </label>
          </Card>
        </div>
      </div>

      <AccountSheet
        open={sheet}
        editing={editing}
        onClose={() => {
          setSheet(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

const RateRow = ({ code }: { code: string }) => {
  const money = useMoney();
  const [value, setValue] = useState("");

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Field label={`1 ${code} in ${money.currency}`}>
          <TextInput
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="0.92"
            className="tabular"
          />
        </Field>
      </div>
      <Button
        onClick={() => {
          const rate = Number(value.replace(",", "."));
          if (Number.isFinite(rate) && rate > 0) money.setRate(code, rate);
          setValue("");
        }}
      >
        Set
      </Button>
    </div>
  );
};
