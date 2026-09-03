"use client";

import { useMemo, useState } from "react";
import { toDateKey } from "@fitme/core";
import type { Account, Cents } from "@fitme/money";
import { CURRENCIES, LIABILITY_KINDS, formatPct, unratedCurrencies, utilisation } from "@fitme/money";
import { useMoney } from "@/lib/money";
import { Button, Field, Select, Spinner, TextInput } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { Money, useMoneyFormat } from "@/components/money/format";
import { AmountField } from "@/components/money/fields";
import {
  Empty,
  HeaderButton,
  Label,
  MoneyHeader,
  Note,
  Panel,
  Row,
  Rows,
} from "@/components/money/ui";
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
        money.accounts
          .map((account) => account.currency)
          .concat(money.money.holdings.map((holding) => holding.currency)),
        money.settings,
      ),
    [money.accounts, money.money.holdings, money.settings],
  );

  if (!money.ready) return <Spinner label="Loading your data" />;

  const open = money.balances.filter(({ account }) => !account.archived);
  const archived = money.balances.filter(({ account }) => account.archived);

  return (
    <div>
      <MoneyHeader
        title="Accounts"
        meta={`${format.money(money.worth.total, { round: true })} net worth`}
        action={
          <HeaderButton
            label="Add an account"
            accent
            onClick={() => {
              setEditing(null);
              setSheet(true);
            }}
          >
            <PlusIcon className="h-[18px] w-[18px]" />
          </HeaderButton>
        }
      />

      <div className="space-y-3 px-4">
        {open.length === 0 ? (
          <Empty
            title="No accounts yet"
            detail="Everything else hangs off an account: transactions, budgets, goals and the portfolio."
            action={
              <Button variant="primary" size="sm" onClick={() => setSheet(true)}>
                Add one
              </Button>
            }
          />
        ) : (
          <Rows>
            {open.map(({ account, balance, base }) => {
              const used = utilisation(account, balance);
              const isValuing = valuing?.id === account.id;
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(account);
                      setSheet(true);
                    }}
                    className="flex min-h-[44px] w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium leading-tight">
                        {account.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] leading-tight text-faint">
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
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Money
                        cents={balance}
                        currency={account.currency}
                        trim
                        className={
                          LIABILITY_KINDS.has(account.kind) || balance < 0 ? "text-danger" : ""
                        }
                      />
                      {account.currency !== money.currency && (
                        <span className="mt-0.5 block text-[11px] text-faint">
                          {format.money(base, { round: true })}
                        </span>
                      )}
                    </span>
                  </button>

                  {account.balanceMode === "manual" && (
                    <div className="flex items-end gap-2 px-3.5 pb-2.5">
                      {isValuing ? (
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
                            size="sm"
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
          </Rows>
        )}

        {archived.length > 0 && (
          <div>
            <Label>Archived</Label>
            <Rows>
              {archived.map(({ account, balance }) => (
                <Row
                  key={account.id}
                  onClick={() => {
                    setEditing(account);
                    setSheet(true);
                  }}
                  primary={account.name}
                  value={
                    <Money cents={balance} currency={account.currency} tone="muted" round />
                  }
                />
              ))}
            </Rows>
          </div>
        )}

        {unrated.length > 0 && (
          <div>
            <Label>Exchange rates</Label>
            <Panel className="space-y-3">
              <Note>
                {unrated.join(", ")} {unrated.length === 1 ? "has" : "have"} no rate on file, so
                {unrated.length === 1 ? " it is" : " they are"} counted into the totals at face
                value. Set a rate and the totals become true.
              </Note>
              {unrated.map((code) => (
                <RateRow key={code} code={code} />
              ))}
            </Panel>
          </div>
        )}

        {Object.keys(money.settings.rates).length > 0 && (
          <div>
            <Label>Rates on file</Label>
            <Rows>
              {Object.entries(money.settings.rates).map(([code, entry]) => (
                <Row
                  key={code}
                  primary={`1 ${code} = ${entry.rate} ${money.currency}`}
                  value={<span className="text-[11px] text-faint">set {entry.asOf}</span>}
                />
              ))}
            </Rows>
          </div>
        )}

        <div>
          <Label>Preferences</Label>
          <Panel className="space-y-4">
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
          </Panel>
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
