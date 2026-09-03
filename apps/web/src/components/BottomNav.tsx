"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartIcon,
  CoinsIcon,
  DumbbellIcon,
  FoodIcon,
  HomeIcon,
  PieIcon,
  ReceiptIcon,
  SparkIcon,
  TargetIcon,
  WalletIcon,
} from "./icons";

/**
 * Two sections, one bar.
 *
 * Training and money are separate parts of the app that are used at separate
 * moments, and a single nine-tab bar would serve neither: six 60-pixel targets
 * is how you mis-tap on a phone. So the bar shows whichever section you are in,
 * and each section carries the door to the other — Today links to Money, and
 * the money overview links back.
 */

const FITNESS_TABS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/food", label: "Food", Icon: FoodIcon },
  { href: "/train", label: "Train", Icon: DumbbellIcon },
  { href: "/progress", label: "Progress", Icon: ChartIcon },
  { href: "/coach", label: "Coach", Icon: SparkIcon },
] as const;

const MONEY_TABS = [
  { href: "/money", label: "Money", Icon: WalletIcon },
  { href: "/money/spending", label: "Spending", Icon: ReceiptIcon },
  { href: "/money/budget", label: "Budget", Icon: PieIcon },
  { href: "/money/invest", label: "Invest", Icon: CoinsIcon },
  { href: "/money/plan", label: "Plan", Icon: TargetIcon },
] as const;

export const BottomNav = () => {
  const pathname = usePathname();
  // Onboarding is a full-screen flow; a nav bar there is just an escape hatch
  // out of a half-finished profile.
  if (pathname?.startsWith("/onboarding")) return null;

  const inMoney = pathname?.startsWith("/money") ?? false;
  const tabs = inMoney ? MONEY_TABS : FITNESS_TABS;

  const isActive = (href: string): boolean => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    if (href === "/money") return pathname === "/money" || pathname === "/money/accounts";
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-[68px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-brand" : "text-faint hover:text-muted"
                }`}
              >
                <Icon className="h-[22px] w-[22px]" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
