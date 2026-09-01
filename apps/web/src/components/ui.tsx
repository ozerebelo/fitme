"use client";

import { useEffect, useRef } from "react";
import { clsx } from "@/lib/format";
import { CloseIcon, MinusIcon, PlusIcon } from "./icons";

/* -------------------------------------------------------------------------- */
/*                                  Surfaces                                  */
/* -------------------------------------------------------------------------- */

export const Card = ({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) => (
  <Tag
    className={clsx(
      "rounded-[16px] border border-border bg-surface p-4",
      className,
    )}
  >
    {children}
  </Tag>
);

export const PageHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) => (
  <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-5">
    <div className="min-w-0">
      <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
    </div>
    {action}
  </header>
);

export const SectionTitle = ({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between px-1 pb-2 pt-1">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
      {children}
    </h2>
    {action}
  </div>
);

export const EmptyState = ({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) => (
  <div className="rounded-[16px] border border-dashed border-border px-5 py-8 text-center">
    <p className="font-medium">{title}</p>
    <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">{detail}</p>
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

/* -------------------------------------------------------------------------- */
/*                                  Controls                                  */
/* -------------------------------------------------------------------------- */

type ButtonProps = React.ComponentPropsWithRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  full?: boolean;
};

export const Button = ({
  variant = "secondary",
  size = "md",
  full,
  className,
  ...props
}: ButtonProps) => (
  <button
    {...props}
    className={clsx(
      "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors",
      "disabled:cursor-not-allowed disabled:opacity-40",
      size === "sm" && "h-9 px-3 text-sm",
      size === "md" && "h-11 px-4 text-[15px]",
      size === "lg" && "h-13 px-5 text-base",
      full && "w-full",
      variant === "primary" && "bg-brand text-black hover:bg-brand-dim active:bg-brand-dim",
      variant === "secondary" &&
        "border border-border bg-surface-2 hover:border-faint active:bg-surface",
      variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-text",
      variant === "danger" && "border border-danger/40 text-danger hover:bg-danger/10",
      className,
    )}
  />
);

export const Field = ({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  error?: string;
}) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
    {children}
    {error ? (
      <span className="mt-1 block text-xs text-danger">{error}</span>
    ) : hint ? (
      <span className="mt-1 block text-xs leading-relaxed text-faint">{hint}</span>
    ) : null}
  </label>
);

const inputClasses =
  "w-full rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-[16px] outline-none transition-colors placeholder:text-faint focus:border-brand";

export const TextInput = (props: React.ComponentPropsWithRef<"input">) => (
  <input {...props} className={clsx(inputClasses, props.className)} />
);

export const NumberInput = ({
  className,
  ...props
}: React.ComponentPropsWithRef<"input">) => (
  <input
    {...props}
    type="number"
    inputMode="decimal"
    className={clsx(inputClasses, "tabular", className)}
  />
);

export const Select = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithRef<"select">) => (
  <select {...props} className={clsx(inputClasses, "appearance-none", className)}>
    {children}
  </select>
);

export const Textarea = ({
  className,
  ...props
}: React.ComponentPropsWithRef<"textarea">) => (
  <textarea {...props} className={clsx(inputClasses, "min-h-24 resize-y", className)} />
);

/** Segmented control. Keeps a small set of options visible rather than hiding
 *  them behind a dropdown — faster to hit, and shows the alternatives. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={clsx(
        "flex gap-1 rounded-xl border border-border bg-surface-2 p-1",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          type="button"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            "flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
            value === option.value
              ? "bg-brand text-black"
              : "text-muted hover:text-text",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Big +/- stepper. Built for thumbs and chalky hands. */
export const Stepper = ({
  value,
  step = 1,
  min = 0,
  max,
  onChange,
  suffix,
  dp = 0,
}: {
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  suffix?: string;
  dp?: number;
}) => {
  const clamp = (next: number): number => {
    const bounded = Math.max(min, max != null ? Math.min(next, max) : next);
    return Number(bounded.toFixed(dp + 2));
  };
  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(clamp(value - step))}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text active:bg-border"
      >
        <MinusIcon className="h-5 w-5" />
      </button>
      <div className="tabular flex-1 text-center text-lg font-semibold">
        {Number(value.toFixed(dp))}
        {suffix && <span className="ml-1 text-sm font-normal text-muted">{suffix}</span>}
      </div>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(clamp(value + step))}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text active:bg-border"
      >
        <PlusIcon className="h-5 w-5" />
      </button>
    </div>
  );
};

export const Chip = ({
  selected,
  children,
  onClick,
}: {
  selected?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    className={clsx(
      "shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
      selected
        ? "border-brand bg-brand/15 text-brand"
        : "border-border bg-surface-2 text-muted hover:text-text",
    )}
  >
    {children}
  </button>
);

/* -------------------------------------------------------------------------- */
/*                                   Sheet                                    */
/* -------------------------------------------------------------------------- */

/** Bottom sheet. The dominant mobile pattern for a focused sub-task, and it
 *  keeps the thumb near the controls. */
export const Sheet = ({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-[20px] border border-border bg-surface outline-none sm:rounded-[20px]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
        {footer && (
          <div
            className="shrink-0 border-t border-border p-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                  Feedback                                  */
/* -------------------------------------------------------------------------- */

export const Badge = ({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "brand" | "warn" | "danger" | "info";
  children: React.ReactNode;
}) => (
  <span
    className={clsx(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
      tone === "neutral" && "bg-surface-2 text-muted",
      tone === "brand" && "bg-brand/15 text-brand",
      tone === "warn" && "bg-warn/15 text-warn",
      tone === "danger" && "bg-danger/15 text-danger",
      tone === "info" && "bg-info/15 text-info",
    )}
  >
    {children}
  </span>
);

export const Spinner = ({ label }: { label?: string }) => (
  <div className="flex items-center justify-center gap-3 py-8 text-muted">
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-brand" />
    {label && <span className="text-sm">{label}</span>}
  </div>
);
