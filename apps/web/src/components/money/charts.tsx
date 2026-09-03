"use client";

import { useId, useMemo, useState } from "react";
import { clsx } from "@/lib/format";

/*
 * Money charts, hand-rolled SVG like the training ones and following the same
 * conventions: 2px lines, thin bars with rounded data-ends, a recessive grid,
 * a crosshair or per-mark tooltip on everything, and identity carried by a
 * label as well as by colour. The mark colours are the `--color-series-*` and
 * `--color-in` / `--color-out` tokens, which were validated as sets against the
 * chart surface — see the note in globals.css.
 */

export const SERIES_COLORS = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
  "var(--color-series-5)",
  "var(--color-series-6)",
  "var(--color-series-7)",
] as const;

/* -------------------------------------------------------------------------- */
/*                              Two-line compare                              */
/* -------------------------------------------------------------------------- */

export interface ComparePoint {
  label: string;
  a: number;
  b: number;
}

/**
 * Two series on one scale — portfolio value against the money put into it.
 *
 * One axis, always: the whole point of the pair is that the gap between them is
 * the return, and a second y-scale would make that gap meaningless.
 */
export const CompareChart = ({
  points,
  labelA,
  labelB,
  format,
  height = 170,
  colorA = "var(--color-series-1)",
  colorB = "var(--color-series-4)",
}: {
  points: ComparePoint[];
  labelA: string;
  labelB: string;
  format: (value: number) => string;
  height?: number;
  colorA?: string;
  colorB?: string;
}) => {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.flatMap((point) => [point.a, point.b]);
    const min = Math.min(0, ...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.12, 1);
    const lo = min - (min < 0 ? pad : 0);
    const hi = max + pad;
    const x = (i: number): number =>
      points.length === 1 ? 50 : (i / (points.length - 1)) * 100;
    const y = (value: number): number => ((hi - value) / (hi - lo || 1)) * height;
    return { lo, hi, x, y };
  }, [points, height]);

  if (!geometry || points.length === 0) return null;

  const path = (key: "a" | "b"): string =>
    points
      .map((point, i) => `${i === 0 ? "M" : "L"} ${geometry.x(i)} ${geometry.y(point[key])}`)
      .join(" ");

  const area = `${path("a")} L 100 ${height} L 0 ${height} Z`;
  const active = hover != null ? points[hover] : null;
  const last = points[points.length - 1]!;

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          role="img"
          aria-label={`${labelA} and ${labelB} over time`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - box.left) / box.width;
            setHover(
              Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))),
            );
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colorA} stopOpacity="0.22" />
              <stop offset="100%" stopColor={colorA} stopOpacity="0" />
            </linearGradient>
          </defs>

          {geometry.lo < 0 && (
            <line
              x1="0"
              x2="100"
              y1={geometry.y(0)}
              y2={geometry.y(0)}
              stroke="var(--color-border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}

          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={path("b")}
            fill="none"
            stroke={colorB}
            strokeWidth="2"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path("a")}
            fill="none"
            stroke={colorA}
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {hover != null && (
            <line
              x1={geometry.x(hover)}
              x2={geometry.x(hover)}
              y1="0"
              y2={height}
              stroke="var(--color-faint)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: `${geometry.x(hover ?? 0)}%`,
              transform: `translateX(${(hover ?? 0) > points.length / 2 ? "-105%" : "5%"})`,
            }}
          >
            <div className="font-medium">{active.label}</div>
            <div className="tabular mt-0.5 flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full" style={{ background: colorA }} />
              {format(active.a)}
            </div>
            <div className="tabular flex items-center gap-1.5 text-muted">
              <span className="h-1.5 w-3 rounded-full" style={{ background: colorB }} />
              {format(active.b)}
            </div>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: colorA }} />
          {labelA} · <span className="tabular text-muted">{format(last.a)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-0.5 w-4 rounded-full"
            style={{ background: colorB, opacity: 0.9 }}
          />
          {labelB} · <span className="tabular text-muted">{format(last.b)}</span>
        </span>
      </figcaption>
    </figure>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Money in / out                                */
/* -------------------------------------------------------------------------- */

export interface FlowBar {
  label: string;
  income: number;
  expenses: number;
}

/** Grouped bars per month. The pair is labelled, never colour alone. */
export const FlowBars = ({
  data,
  format,
  height = 140,
}: {
  data: FlowBar[];
  format: (value: number) => string;
  height?: number;
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((bar) => [bar.income, bar.expenses]));
  const active = hover != null ? data[hover] : null;

  return (
    <figure className="m-0">
      <div className="relative flex items-end gap-1.5" style={{ height }}>
        {data.map((bar, index) => (
          <button
            key={bar.label}
            type="button"
            className="group flex h-full flex-1 flex-col justify-end gap-1 rounded-md px-0.5 outline-none focus-visible:bg-surface-2"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
            aria-label={`${bar.label}: ${format(bar.income)} in, ${format(bar.expenses)} out`}
          >
            {/* A 2px gap keeps the two fills from reading as one stacked bar. */}
            <div className="flex h-full items-end justify-center gap-[2px]">
              <span
                className="w-1/3 rounded-t-[4px] transition-opacity"
                style={{
                  height: `${(bar.income / max) * 100}%`,
                  background: "var(--color-in)",
                  opacity: hover == null || hover === index ? 1 : 0.4,
                }}
              />
              <span
                className="w-1/3 rounded-t-[4px] transition-opacity"
                style={{
                  height: `${(bar.expenses / max) * 100}%`,
                  background: "var(--color-out)",
                  opacity: hover == null || hover === index ? 1 : 0.4,
                }}
              />
            </div>
            <span className="text-[10px] text-faint">{bar.label}</span>
          </button>
        ))}
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: "var(--color-in)" }} />
          In
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: "var(--color-out)" }} />
          Out
        </span>
        {active && (
          <span className="tabular ml-auto text-muted">
            {active.label}: {format(active.income)} in · {format(active.expenses)} out
          </span>
        )}
      </figcaption>
    </figure>
  );
};

/* -------------------------------------------------------------------------- */
/*                                   Donut                                    */
/* -------------------------------------------------------------------------- */

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/**
 * Part-to-whole for a handful of parts — what the portfolio is made of.
 *
 * Every slice is listed beside the ring with its share, so the ring is the
 * shape of the answer and the list is the answer.
 */
export const Donut = ({
  slices,
  total,
  format,
  size = 148,
}: {
  slices: Slice[];
  total: number;
  format: (value: number) => string;
  size?: number;
}) => {
  const stroke = 18;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="presentation">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={stroke}
          />
          {slices.map((slice) => {
            const share = total > 0 ? slice.value / total : 0;
            const length = share * circumference;
            const dash = `${Math.max(0, length - 2)} ${circumference - Math.max(0, length - 2)}`;
            const element = (
              <circle
                key={slice.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={stroke}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += length;
            return element;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-lg font-semibold">{format(total)}</span>
          <span className="text-[11px] uppercase tracking-wider text-faint">Total</span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate">{slice.label}</span>
            <span className="tabular shrink-0 text-muted">
              {total > 0 ? Math.round((slice.value / total) * 100) : 0}%
            </span>
            <span className="tabular shrink-0 text-faint">{format(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Category bars                                 */
/* -------------------------------------------------------------------------- */

export interface CategoryBar {
  label: string;
  value: number;
  share: number;
  color: string;
}

/**
 * Where the month went, largest first.
 *
 * Every row is direct-labelled with its name and its amount, so the colour is
 * the category's identity carried across screens rather than the only thing
 * telling two rows apart.
 */
export const CategoryBars = ({
  data,
  format,
}: {
  data: CategoryBar[];
  format: (value: number) => string;
}) => {
  const ceiling = Math.max(1, ...data.map((bar) => bar.value));
  return (
    <ul className="space-y-3">
      {data.map((bar) => (
        <li key={bar.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">{bar.label}</span>
            <span className="tabular shrink-0 text-sm">
              {format(bar.value)}
              <span className="ml-2 text-xs text-faint">
                {Math.round(bar.share * 100)}%
              </span>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full"
              style={{ width: `${(bar.value / ceiling) * 100}%`, background: bar.color }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Budget progress                               */
/* -------------------------------------------------------------------------- */

/**
 * A budget line, with the marker that makes it mean something.
 *
 * The tick is where even spending would have you today. Without it a half-full
 * bar says nothing: on the 5th it is a problem and on the 25th it is fine.
 */
export const BudgetBar = ({
  spent,
  available,
  expected,
  color,
  tone = "neutral",
}: {
  spent: number;
  available: number;
  expected: number;
  color: string;
  tone?: "neutral" | "over" | "spent";
}) => {
  const pct = available > 0 ? Math.min(spent / available, 1) : spent > 0 ? 1 : 0;
  const markerPct = available > 0 ? Math.min(expected / available, 1) : 0;

  return (
    <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${pct * 100}%`,
          background:
            tone === "spent"
              ? "var(--color-danger)"
              : tone === "over"
                ? "var(--color-warn)"
                : color,
        }}
      />
      {markerPct > 0 && markerPct < 1 && (
        <span
          className="absolute top-0 h-full w-[2px] bg-text/70"
          style={{ left: `${markerPct * 100}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

/** Small multiples of one number — the stat row at the top of a page. */
export const StatRow = ({
  stats,
}: {
  stats: { label: string; value: string; tone?: "up" | "down" | "flat"; hint?: string }[];
}) => (
  <dl className="grid grid-cols-3 gap-3">
    {stats.map((stat) => (
      <div key={stat.label} className="min-w-0">
        <dt className="truncate text-[11px] uppercase tracking-wider text-faint">
          {stat.label}
        </dt>
        <dd
          className={clsx(
            "tabular mt-1 truncate text-lg font-semibold",
            stat.tone === "up" && "text-ok",
            stat.tone === "down" && "text-danger",
          )}
        >
          {stat.value}
        </dd>
        {stat.hint && <p className="truncate text-[11px] text-faint">{stat.hint}</p>}
      </div>
    ))}
  </dl>
);
