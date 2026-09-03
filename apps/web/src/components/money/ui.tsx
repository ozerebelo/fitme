"use client";

import Link from "next/link";
import { clsx } from "@/lib/format";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

/**
 * The money section's own scale.
 *
 * The training side is typed for a gym: poor light, one hand, chalk, a glance
 * between sets. Big text and big targets are the right answer there and the
 * wrong one here. Money is a *reading* task — twenty rows of payee and amount
 * scanned for the one that looks wrong — and at the training side's scale a
 * month of spending needs four screens to show what should take one.
 *
 * So this section steps the type down and the density up, while holding the two
 * things that are not negotiable: every tappable row stays at least 44px tall,
 * and form inputs stay at 16px, because anything smaller makes iOS Safari zoom
 * the page on focus and that is far worse than a slightly large field.
 *
 *   page title      20px semibold      section label   11px uppercase
 *   hero figure     28px semibold      row primary     13px medium
 *   row secondary   11px faint         amounts         13px tabular
 *
 * Colours, radii and surfaces are the app's own tokens throughout — this is a
 * different density, not a different design.
 */

export const MoneyHeader = ({
  title,
  meta,
  action,
}: {
  title: string;
  /** The period, the account, the date — never a finding. Findings are cards. */
  meta?: string;
  action?: React.ReactNode;
}) => (
  <header className="flex items-start justify-between gap-3 px-4 pb-2.5 pt-4">
    <div className="min-w-0">
      <h1 className="text-[20px] font-semibold leading-tight tracking-tight">{title}</h1>
      {meta && <p className="mt-0.5 text-[12px] leading-snug text-faint">{meta}</p>}
    </div>
    {action && <div className="flex shrink-0 gap-2">{action}</div>}
  </header>
);

/** A 36px header button. Smaller than the training side's 40px, still tappable. */
export const HeaderButton = ({
  label,
  href,
  onClick,
  accent,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  accent?: boolean;
  children: React.ReactNode;
}) => {
  const className = clsx(
    "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
    accent
      ? "bg-brand text-black hover:bg-brand-dim"
      : "border border-border text-muted hover:text-text",
  );
  return href ? (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  ) : (
    <button type="button" aria-label={label} onClick={onClick} className={className}>
      {children}
    </button>
  );
};

export const Panel = ({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) => (
  <Tag className={clsx("rounded-[14px] border border-border bg-surface p-3.5", className)}>
    {children}
  </Tag>
);

export const Label = ({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-faint">
      {children}
    </h2>
    {action}
  </div>
);

/**
 * The one big number on a screen.
 *
 * 28px rather than 32: a figure this size is read once, and the four pixels
 * bought nothing except a shorter card.
 */
export const Hero = ({
  label,
  value,
  delta,
  deltaTone,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "down";
}) => (
  <div className="flex items-baseline justify-between gap-3">
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
        {label}
      </p>
      <p className="tabular mt-0.5 text-[28px] font-semibold leading-none">{value}</p>
    </div>
    {delta && (
      <span
        className={clsx(
          "tabular shrink-0 text-[12px]",
          deltaTone === "up" && "text-ok",
          deltaTone === "down" && "text-danger",
          !deltaTone && "text-muted",
        )}
      >
        {delta}
      </span>
    )}
  </div>
);

/* -------------------------------------------------------------------------- */
/*                                    Rows                                    */
/* -------------------------------------------------------------------------- */

export const Rows = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={clsx("overflow-hidden rounded-[14px] border border-border bg-surface", className)}>
    <ul className="divide-y divide-border">{children}</ul>
  </div>
);

/**
 * One line of the ledger, the account list, the forecast.
 *
 * Everything in this section is the same shape — something on the left, a
 * number on the right — so it is one component rather than six near-copies, and
 * the amount column lines up from screen to screen because it is defined once.
 */
export const Row = ({
  primary,
  secondary,
  value,
  aside,
  leading,
  href,
  onClick,
  chevron,
  className,
}: {
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  /** The amount. Right-aligned, tabular, never wrapped. */
  value?: React.ReactNode;
  /** A second line under the amount — a percentage, a converted total. */
  aside?: React.ReactNode;
  /** A colour bar or icon at the start of the row. */
  leading?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
}) => {
  const interactive = !!href || !!onClick;
  const body = (
    <>
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">{primary}</span>
        {secondary && (
          <span className="mt-0.5 block truncate text-[11px] leading-tight text-faint">
            {secondary}
          </span>
        )}
      </span>
      {(value || aside) && (
        <span className="shrink-0 text-right">
          {value && <span className="block text-[13px] leading-tight">{value}</span>}
          {aside && (
            <span className="mt-0.5 block text-[11px] leading-tight text-faint">{aside}</span>
          )}
        </span>
      )}
      {chevron && <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />}
    </>
  );

  // 44px minimum whatever the content — the type got smaller, the target did not.
  const shell = clsx(
    "flex w-full min-h-[44px] items-center gap-2.5 px-3.5 py-2.5 text-left",
    interactive && "transition-colors hover:bg-surface-2",
    className,
  );

  return (
    <li>
      {href ? (
        <Link href={href} className={shell}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={shell}>
          {body}
        </button>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </li>
  );
};

/** The colour bar that starts a categorised row. */
export const Swatch = ({ color }: { color: string }) => (
  <span
    className="h-7 w-[3px] shrink-0 rounded-full"
    style={{ background: color }}
    aria-hidden="true"
  />
);

/** A filter in the row above a list. Shorter than the training side's chips. */
export const FilterChip = ({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={clsx(
      "h-8 shrink-0 rounded-full border px-3 text-[12px] font-medium transition-colors",
      selected
        ? "border-brand bg-brand/15 text-brand"
        : "border-border bg-surface-2 text-muted hover:text-text",
    )}
  >
    {children}
  </button>
);

/** Previous / next around a label. Used for the month on three screens. */
export const Stepper = ({
  label,
  onPrevious,
  onNext,
  nextDisabled,
}: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) => (
  <div className="flex items-center justify-between gap-2 rounded-[12px] border border-border bg-surface p-1">
    <button
      type="button"
      aria-label="Previous month"
      onClick={onPrevious}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
    >
      <ChevronLeftIcon className="h-4 w-4" />
    </button>
    <span className="text-[13px] font-medium">{label}</span>
    <button
      type="button"
      aria-label="Next month"
      onClick={onNext}
      disabled={nextDisabled}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"
    >
      <ChevronRightIcon className="h-4 w-4" />
    </button>
  </div>
);

/* -------------------------------------------------------------------------- */
/*                                   Blocks                                   */
/* -------------------------------------------------------------------------- */

/** Two or three figures side by side under a card's headline. */
export const Figures = ({
  items,
}: {
  items: { label: string; value: string; tone?: "up" | "down"; hint?: string }[];
}) => (
  // Written out rather than interpolated: Tailwind only ships the classes it
  // can see in the source, and a template literal is invisible to it.
  <dl className={clsx("grid gap-3", items.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
    {items.map((item) => (
      <div key={item.label} className="min-w-0">
        <dt className="truncate text-[11px] uppercase tracking-wider text-faint">
          {item.label}
        </dt>
        <dd
          className={clsx(
            "tabular mt-0.5 truncate text-[15px] font-semibold",
            item.tone === "up" && "text-ok",
            item.tone === "down" && "text-danger",
          )}
        >
          {item.value}
        </dd>
        {item.hint && <p className="truncate text-[11px] text-faint">{item.hint}</p>}
      </div>
    ))}
  </dl>
);

export const Note = ({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "brand" | "warn" | "danger";
}) => (
  <p
    className={clsx(
      "rounded-lg px-3 py-2 text-[12px] leading-relaxed",
      tone === "muted" && "bg-surface-2 text-muted",
      tone === "brand" && "bg-brand/10 text-brand",
      tone === "warn" && "bg-warn/10 text-warn",
      tone === "danger" && "bg-danger/10 text-danger",
    )}
  >
    {children}
  </p>
);

export const Empty = ({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) => (
  <div className="rounded-[14px] border border-dashed border-border px-4 py-7 text-center">
    <p className="text-[14px] font-medium">{title}</p>
    <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-muted">{detail}</p>
    {action && <div className="mt-3.5 flex justify-center">{action}</div>}
  </div>
);
