"use client";

import { useEffect, useState } from "react";
import { toDateKey } from "@fitme/core";
import type { Cents, Holding, HoldingKind, Trade } from "@fitme/money";
import {
  CURRENCIES,
  HOLDING_KIND_LABELS,
  makeHolding,
  makeTrade,
  markAt,
  positionAt,
} from "@fitme/money";
import { useMoney } from "@/lib/money";
import { Button, Field, Select, Sheet, TextInput } from "@/components/ui";
import { TrashIcon } from "@/components/icons";
import { AccountSelect, AmountField, DateField } from "./fields";
import { useMoneyFormat } from "./format";

/**
 * A position: what you hold, what it is marked at, and every trade behind it.
 *
 * The price is a field you fill in, and it carries its date everywhere it is
 * used. There is no feed — an app that works on a plane cannot have one — and a
 * quote of unknown age dressed up as live is worse than an honest "last marked
 * on the 3rd".
 */
export const HoldingSheet = ({
  open,
  onClose,
  editing,
  defaultAccountId,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Holding | null;
  defaultAccountId?: string;
}) => {
  const money = useMoney();
  const format = useMoneyFormat();

  const investmentAccounts = money.openAccounts.filter(
    (account) => account.kind === "investment",
  );

  const [accountId, setAccountId] = useState(
    defaultAccountId ?? investmentAccounts[0]?.id ?? "",
  );
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<HoldingKind>("etf");
  const [currency, setCurrency] = useState(money.currency);

  const [priceText, setPriceText] = useState("");
  const [priceDate, setPriceDate] = useState(toDateKey());

  const [tradeKind, setTradeKind] = useState<Trade["kind"]>("buy");
  const [tradeDate, setTradeDate] = useState(toDateKey());
  const [quantity, setQuantity] = useState("");
  const [tradePrice, setTradePrice] = useState("");
  const [fee, setFee] = useState<Cents | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setAccountId(editing.accountId);
      setSymbol(editing.symbol);
      setName(editing.name);
      setKind(editing.kind);
      setCurrency(editing.currency);
      const latest = editing.prices[editing.prices.length - 1];
      setPriceText(latest ? String(latest.price) : "");
    } else {
      setAccountId(defaultAccountId ?? investmentAccounts[0]?.id ?? "");
      setSymbol("");
      setName("");
      setKind("etf");
      setCurrency(money.currency);
      setPriceText("");
    }
    setPriceDate(toDateKey());
    setTradeKind("buy");
    setTradeDate(toDateKey());
    setQuantity("");
    setTradePrice("");
    setFee(null);
    // `investmentAccounts` is derived fresh each render; depending on it would
    // reset the form on every keystroke elsewhere in the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, defaultAccountId, money.currency]);

  const trades = editing
    ? money.money.trades
        .filter((trade) => trade.holdingId === editing.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const position = editing
    ? positionAt(editing.id, money.money.trades, editing.currency)
    : null;
  const mark = editing ? markAt(editing, money.money.trades) : null;

  const saveHolding = (): void => {
    if (!accountId || !symbol.trim()) return;
    if (editing) {
      money.updateHolding({
        ...editing,
        accountId,
        symbol: symbol.trim().toUpperCase(),
        name: name.trim() || symbol.trim().toUpperCase(),
        kind,
        currency,
      });
    } else {
      money.addHolding(
        makeHolding({
          accountId,
          symbol,
          name: name.trim() || symbol,
          kind,
          currency,
        }),
      );
      onClose();
    }
  };

  const addPrice = (): void => {
    if (!editing) return;
    const price = Number(priceText.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) return;
    money.markPrice(editing.id, { date: priceDate, price });
  };

  const addTrade = (): void => {
    if (!editing) return;
    const parsedQuantity = Number(quantity.replace(",", "."));
    const parsedPrice = Number(tradePrice.replace(",", "."));
    if (tradeKind !== "fee" && (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0)) return;

    money.addTrade(
      makeTrade({
        holdingId: editing.id,
        date: tradeDate,
        kind: tradeKind,
        quantity: Number.isFinite(parsedQuantity) ? parsedQuantity : 0,
        price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
        fee: fee ?? 0,
        currency: editing.currency,
      }),
    );
    setQuantity("");
    setTradePrice("");
    setFee(null);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? editing.symbol : "Add a holding"}
      footer={
        !editing ? (
          <Button
            variant="primary"
            full
            onClick={saveHolding}
            disabled={!accountId || !symbol.trim()}
          >
            Add holding
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {investmentAccounts.length === 0 && (
          <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
            Add an investment account first — a holding has to live somewhere.
          </p>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Symbol">
              <TextInput
                value={symbol}
                onChange={(event) => setSymbol(event.target.value)}
                placeholder="VWCE"
                autoFocus={!editing}
              />
            </Field>
            <Field label="Kind">
              <Select
                value={kind}
                onChange={(event) => setKind(event.target.value as HoldingKind)}
              >
                {Object.entries(HOLDING_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Name">
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Vanguard FTSE All-World"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Account">
              <AccountSelect
                value={accountId}
                accounts={investmentAccounts}
                onChange={setAccountId}
              />
            </Field>
            <Field label="Currency">
              <Select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {Object.values(CURRENCIES).map((info) => (
                  <option key={info.code} value={info.code}>
                    {info.code}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {editing && (
            <Button full onClick={saveHolding}>
              Save details
            </Button>
          )}
        </div>

        {editing && position && (
          <>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-faint">Units</dt>
                <dd className="tabular text-right">{position.quantity}</dd>
                <dt className="text-faint">Cost</dt>
                <dd className="tabular text-right">
                  {format.inCurrency(position.costBasis, editing.currency)}
                </dd>
                <dt className="text-faint">Realised</dt>
                <dd className="tabular text-right">
                  {format.inCurrency(position.realised, editing.currency, { signed: true })}
                </dd>
                <dt className="text-faint">Dividends</dt>
                <dd className="tabular text-right">
                  {format.inCurrency(position.dividends, editing.currency)}
                </dd>
              </dl>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-muted">
                Price
                {mark?.date && (
                  <span className="ml-2 text-xs font-normal text-faint">
                    last {mark.source === "mark" ? "marked" : "traded"} {mark.date}
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <TextInput
                  value={priceText}
                  inputMode="decimal"
                  onChange={(event) => setPriceText(event.target.value)}
                  placeholder="132.40"
                  aria-label="Price per unit"
                  className="tabular"
                />
                <DateField value={priceDate} onChange={setPriceDate} />
                <Button onClick={addPrice}>Mark</Button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-muted">Record a trade</p>
              <div className="space-y-2">
                <Select
                  value={tradeKind}
                  onChange={(event) => setTradeKind(event.target.value as Trade["kind"])}
                  aria-label="Trade type"
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                  <option value="dividend">Dividend</option>
                  <option value="fee">Fee</option>
                  <option value="split">Split</option>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <TextInput
                    value={quantity}
                    inputMode="decimal"
                    onChange={(event) => setQuantity(event.target.value)}
                    placeholder={
                      tradeKind === "split"
                        ? "Ratio, e.g. 2"
                        : tradeKind === "dividend"
                          ? "Units held"
                          : "Units"
                    }
                    aria-label="Quantity"
                    className="tabular"
                  />
                  <TextInput
                    value={tradePrice}
                    inputMode="decimal"
                    onChange={(event) => setTradePrice(event.target.value)}
                    placeholder={tradeKind === "dividend" ? "Per unit" : "Price"}
                    aria-label="Price"
                    className="tabular"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <AmountField
                    value={fee}
                    currency={editing.currency}
                    onChange={setFee}
                    placeholder="Fee"
                  />
                  <DateField value={tradeDate} onChange={setTradeDate} />
                </div>
                <Button full onClick={addTrade}>
                  Add trade
                </Button>
              </div>
            </div>

            {trades.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-muted">History</p>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {trades.map((trade) => (
                    <li
                      key={trade.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="capitalize">
                          {trade.kind}
                          {trade.kind !== "fee" && trade.quantity > 0 && (
                            <span className="tabular ml-2 text-faint">
                              {trade.quantity}
                              {trade.price > 0 ? ` @ ${trade.price}` : ""}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-faint">{trade.date}</div>
                      </div>
                      <span className="flex shrink-0 items-center gap-3">
                        <span
                          className={`tabular ${trade.cash >= 0 ? "text-ok" : "text-muted"}`}
                        >
                          {format.inCurrency(trade.cash, editing.currency, { signed: true })}
                        </span>
                        <button
                          type="button"
                          aria-label="Delete trade"
                          onClick={() => money.removeTrade(trade.id)}
                          className="text-faint hover:text-danger"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              variant="danger"
              full
              onClick={() => {
                if (window.confirm(`Delete ${editing.symbol} and all of its trades?`)) {
                  money.removeHolding(editing.id);
                  onClose();
                }
              }}
            >
              Delete holding
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
};
