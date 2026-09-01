"use client";

import { useId, useMemo, useState } from "react";
import { clsx } from "@/lib/format";

/*
 * Charts are hand-rolled SVG rather than a charting library: the shapes here
 * are simple, and it keeps the bundle (and the offline cache) small.
 *
 * Conventions, applied consistently:
 *  - 2px lines, >=8px hover markers, thin bars with 4px rounded data-ends.
 *  - Grid and axes are recessive; the data is the only saturated thing.
 *  - Every multi-series mark is labelled, so identity is never colour alone.
 *  - Line charts carry a crosshair + tooltip; an SVG chart that cannot be
 *    interrogated is a picture, not a chart.
 */

/* -------------------------------------------------------------------------- */
/*                                Calorie ring                                */
/* -------------------------------------------------------------------------- */

export const CalorieRing = ({
  consumed,
  target,
  burned = 0,
  size = 168,
}: {
  consumed: number;
  target: number;
  burned?: number;
  size?: number;
}) => {
  const remaining = Math.round(target + burned - consumed);
  const progress = target > 0 ? consumed / (target + burned) : 0;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const swept = Math.min(progress, 1) * circumference;

  // Status, not decoration: over budget is the one state worth colouring.
  const tone =
    progress > 1.05
      ? "var(--color-danger)"
      : progress > 0.95
        ? "var(--color-warn)"
        : "var(--color-brand)";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(consumed)} of ${Math.round(target + burned)} calories consumed, ${remaining} remaining`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          // A round cap paints a dot even at zero length, which reads as
          // "you have eaten something" before anything is logged.
          strokeLinecap={swept > stroke / 2 ? "round" : "butt"}
          strokeDasharray={`${swept} ${circumference}`}
          style={{ transition: "stroke-dasharray 400ms ease, stroke 200ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-[34px] font-semibold leading-none">
          {Math.abs(remaining)}
        </span>
        <span className="mt-1 text-xs font-medium uppercase tracking-wider text-faint">
          {remaining >= 0 ? "left" : "over"}
        </span>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                 Macro bars                                 */
/* -------------------------------------------------------------------------- */

export interface MacroDatum {
  key: "protein" | "carbs" | "fat";
  label: string;
  value: number;
  target: number;
  color: string;
}

export const MACRO_COLORS = {
  protein: "var(--color-protein)",
  carbs: "var(--color-carbs)",
  fat: "var(--color-fat)",
} as const;

/** Progress-to-target bars. Direct-labelled, so the colour is reinforcement
 *  rather than the only way to tell the three apart. */
export const MacroBars = ({ data }: { data: MacroDatum[] }) => (
  <div className="grid grid-cols-3 gap-3">
    {data.map((macro) => {
      const pct = macro.target > 0 ? Math.min(macro.value / macro.target, 1) : 0;
      const over = macro.target > 0 && macro.value > macro.target * 1.1;
      return (
        <div key={macro.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-1">
            <span className="text-xs font-medium text-muted">{macro.label}</span>
            <span className="tabular text-xs text-faint">
              {Math.abs(Math.round(macro.target - macro.value))} g{" "}
              {macro.value > macro.target ? "over" : "left"}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${pct * 100}%`,
                background: over ? "var(--color-warn)" : macro.color,
              }}
            />
          </div>
          <div className="tabular mt-1.5 text-sm font-semibold">
            {Math.round(macro.value)}
            <span className="text-xs font-normal text-faint">
              {" / "}
              {Math.round(macro.target)} g
            </span>
          </div>
        </div>
      );
    })}
  </div>
);

/* -------------------------------------------------------------------------- */
/*                                 Line chart                                 */
/* -------------------------------------------------------------------------- */

export interface LinePoint {
  label: string;
  raw?: number | null;
  value: number;
}

/**
 * Trend line with the raw readings behind it.
 *
 * One entity shown two ways — the scatter is the noisy measurement, the line is
 * the signal — so there is no legend box; the two marks are captioned instead.
 */
export const TrendChart = ({
  points,
  height = 180,
  format = (v: number) => v.toFixed(1),
  valueLabel,
  color = "var(--color-brand)",
  seriesLabel = "Trend",
  rawLabel = "Daily reading",
}: {
  points: LinePoint[];
  height?: number;
  format?: (value: number) => string;
  valueLabel: string;
  color?: string;
  /** Names the line. A smoothed series and a raw one are not the same claim. */
  seriesLabel?: string;
  rawLabel?: string;
}) => {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.flatMap((p) =>
      [p.value, p.raw].filter((v): v is number => typeof v === "number"),
    );
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A flat series would otherwise divide by zero and collapse to a line at
    // the top of the box.
    const pad = Math.max((max - min) * 0.15, 0.4);
    const lo = min - pad;
    const hi = max + pad;
    const width = 100;
    const x = (i: number): number =>
      points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
    const y = (v: number): number => ((hi - v) / (hi - lo)) * height;
    return { lo, hi, width, x, y };
  }, [points, height]);

  if (!geometry || points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-faint"
        style={{ height }}
      >
        Not enough data yet
      </div>
    );
  }

  const { x, y } = geometry;
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(p.value).toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(2)} ${height} L ${x(0).toFixed(2)} ${height} Z`;

  const active = hover != null ? points[hover] : null;

  return (
    <figure className="m-0">
      <div className="relative">
        <svg
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          className="w-full touch-none"
          style={{ height }}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (event.clientX - rect.left) / rect.width;
            setHover(
              Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))),
            );
          }}
          onTouchMove={(event) => {
            const touch = event.touches[0];
            if (!touch) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = (touch.clientX - rect.left) / rect.width;
            setHover(
              Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))),
            );
          }}
          onTouchEnd={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive gridlines. */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2="100"
              y1={height * f}
              y2={height * f}
              stroke="var(--color-border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* Raw readings sit behind the trend, deliberately quiet. */}
          {points.map((p, i) =>
            typeof p.raw === "number" ? (
              <circle
                key={`raw-${i}`}
                cx={x(i)}
                cy={y(p.raw)}
                r="2"
                fill="var(--color-faint)"
                opacity="0.5"
                vectorEffect="non-scaling-stroke"
              />
            ) : null,
          )}

          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {hover != null && (
            <>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1="0"
                y2={height}
                stroke="var(--color-faint)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={x(hover)}
                cy={y(points[hover]!.value)}
                r="4"
                fill={color}
                stroke="var(--color-surface)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs shadow-lg"
            style={{
              left: `${Math.min(Math.max(x(hover!), 8), 92)}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="text-faint">{active.label}</div>
            <div className="tabular font-semibold">
              {format(active.value)} <span className="text-faint">{valueLabel}</span>
            </div>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex items-center gap-4 text-[11px] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: color }} />
          {seriesLabel}
        </span>
        {/* Only claim a raw series when one is actually plotted. */}
        {points.some((p) => typeof p.raw === "number") && (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-faint" />
            {rawLabel}
          </span>
        )}
      </figcaption>
    </figure>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Horizontal bars                               */
/* -------------------------------------------------------------------------- */

export interface RankedBar {
  label: string;
  value: number;
  /** Status colour; always accompanied by `note`, never colour alone. */
  color: string;
  note: string;
  /** Optional reference marker, e.g. the minimum effective volume. */
  marker?: number;
}

export const RankedBars = ({
  data,
  max,
  unit,
}: {
  data: RankedBar[];
  max?: number;
  unit: string;
}) => {
  const ceiling = max ?? Math.max(1, ...data.map((d) => Math.max(d.value, d.marker ?? 0)));
  return (
    <ul className="space-y-3">
      {data.map((bar) => (
        <li key={bar.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium capitalize">{bar.label}</span>
            <span className="tabular shrink-0 text-xs text-muted">
              {Math.round(bar.value * 10) / 10} {unit}
              <span className="ml-2 text-faint">{bar.note}</span>
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(bar.value / ceiling, 1) * 100}%`, background: bar.color }}
            />
            {bar.marker != null && bar.marker <= ceiling && (
              <span
                className="absolute top-0 h-full w-[3px] rounded-full bg-text/70"
                style={{ left: `${(bar.marker / ceiling) * 100}%` }}
                aria-hidden="true"
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
};

/** Small inline sparkline for list rows. Decorative — always paired with a number. */
export const Sparkline = ({
  values,
  className,
  color = "var(--color-brand)",
}: {
  values: number[];
  className?: string;
  color?: string;
}) => {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 24 - ((v - min) / span) * 20 - 2;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={clsx("h-6 w-16", className)}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};
