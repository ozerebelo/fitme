"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartIcon,
  DumbbellIcon,
  FoodIcon,
  HomeIcon,
  SparkIcon,
} from "./icons";

const TABS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/food", label: "Food", Icon: FoodIcon },
  { href: "/train", label: "Train", Icon: DumbbellIcon },
  { href: "/progress", label: "Progress", Icon: ChartIcon },
  { href: "/coach", label: "Coach", Icon: SparkIcon },
] as const;

export const BottomNav = () => {
  const pathname = usePathname();
  // Onboarding is a full-screen flow; a nav bar there is just an escape hatch
  // out of a half-finished profile.
  if (pathname?.startsWith("/onboarding")) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
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
