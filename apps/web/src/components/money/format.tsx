"use client";

import { useMemo } from "react";
import type { Cents, FormatOptions } from "@fitme/money";
import { formatMoney } from "@fitme/money";
import { useApp } from "@/lib/state";
import { clsx } from "@/lib/format";

/**
 * Formatting, read straight from the settings.
 *
 * Deliberately not part of `useMoney`: that hook computes the portfolio and the
 * whole insight report, and a table of forty rows must not each rebuild it just
 * to print a number.
 */
export const useMoneyFormat = () => {
  const { data } = useApp();
  const settings = data.money.settings;

  return useMemo(() => {
    const hidden = settings.privacyMode === true;
    const base = (cents: Cents, options: FormatOptions = {}): string =>
      hidden
        ? "•••"
        : formatMoney(cents, settings.baseCurrency, { locale: settings.locale, ...options });

    return {
      /** In the base currency — for anything totalled. */
      money: base,
      /** In a specific currency — for a row that belongs to one account. */
      inCurrency: (cents: Cents, currency: string, options: FormatOptions = {}): string =>
        hidden
          ? "•••"
          : formatMoney(cents, currency, { locale: settings.locale, ...options }),
      currency: settings.baseCurrency,
      locale: settings.locale,
      hidden,
    };
  }, [settings]);
};

/**
 * An amount, with the sign carried by a character as well as by colour.
 *
 * `tone="auto"` colours money in and money out, which is the one place in the
 * app where that convention is worth more than it costs — and the sign is
 * always printed, so the colour is never the only thing saying which way it
 * went.
 */
export const Money = ({
  cents,
  currency,
  tone = "plain",
  signed,
  round,
  className,
}: {
  cents: Cents;
  currency?: string;
  tone?: "plain" | "auto" | "muted";
  signed?: boolean;
  round?: boolean;
  className?: string;
}) => {
  const format = useMoneyFormat();
  const text = currency
    ? format.inCurrency(cents, currency, { signed, round })
    : format.money(cents, { signed, round });

  return (
    <span
      className={clsx(
        "tabular",
        tone === "auto" && cents > 0 && "text-ok",
        tone === "auto" && cents < 0 && "text-danger",
        tone === "muted" && "text-muted",
        className,
      )}
    >
      {text}
    </span>
  );
};
