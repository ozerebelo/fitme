"use client";

import Link from "next/link";
import { hasMoneyData } from "@fitme/money";
import { useMoney } from "@/lib/money";
import { Card } from "@/components/ui";
import { ChevronRightIcon, WalletIcon } from "@/components/icons";
import { useMoneyFormat } from "./format";

/**
 * The door to the money side, on the training side's home screen.
 *
 * The two halves of the app are used at different moments and have their own
 * navigation, so each one carries a way into the other. This is that way in,
 * and it earns its place on the screen by being useful on its own: what you are
 * worth, and what is left of the month.
 */
export const MoneyCard = () => {
  const money = useMoney();
  const format = useMoneyFormat();

  if (!money.ready) return null;

  const started = hasMoneyData(money.money);

  return (
    <Link href="/money" className="block">
      <Card className="transition-colors hover:border-faint">
        <div className="flex items-center gap-3">
          <WalletIcon className="h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            {started ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-faint">
                    Money
                  </span>
                  <span className="tabular text-sm font-medium">
                    {format.money(money.worth.total, { round: true })}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">{money.report.headline}</p>
              </>
            ) : (
              <>
                <p className="font-medium">Money</p>
                <p className="truncate text-sm text-muted">
                  Accounts, spending, budgets and investments — set it up once.
                </p>
              </>
            )}
          </div>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-faint" />
        </div>
      </Card>
    </Link>
  );
};
