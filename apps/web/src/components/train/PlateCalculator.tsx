"use client";

import { KG_PLATES, platesFor } from "@fitme/core";
import { round } from "@fitme/core";

const PLATE_STYLE: Record<number, { color: string; height: string }> = {
  25: { color: "#dc2626", height: "h-16" },
  20: { color: "#2563eb", height: "h-16" },
  15: { color: "#eab308", height: "h-14" },
  10: { color: "#16a34a", height: "h-12" },
  5: { color: "#e5e7eb", height: "h-10" },
  2.5: { color: "#111827", height: "h-8" },
  1.25: { color: "#9ca3af", height: "h-7" },
};

/** What to actually put on the bar. Saves the arithmetic mid-session. */
export const PlateCalculator = ({
  targetKg,
  barKg = 20,
}: {
  targetKg: number;
  barKg?: number;
}) => {
  const solution = platesFor(targetKg, { barKg, plates: KG_PLATES });

  if (targetKg <= barKg) {
    return (
      <p className="text-sm text-muted">
        {round(targetKg, 1)} kg is at or below the bar ({barKg} kg) — no plates needed.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-end gap-1 overflow-x-auto pb-1">
        <span className="mr-1 h-1.5 w-6 shrink-0 rounded-full bg-faint" title="Bar" />
        {solution.perSide.map((plate, i) => {
          const style = PLATE_STYLE[plate] ?? { color: "#6b7280", height: "h-10" };
          return (
            <span
              key={`${plate}-${i}`}
              className={`${style.height} flex w-6 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold text-black`}
              style={{ background: style.color }}
              title={`${plate} kg`}
            >
              {plate}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-sm text-muted">
        <span className="font-medium text-text">Per side:</span>{" "}
        {solution.perSide.length ? solution.perSide.join(" + ") + " kg" : "nothing"}
      </p>
      {Math.abs(solution.errorKg) > 0.01 && (
        <p className="mt-1 text-xs text-warn">
          Closest loadable weight is {solution.achievedKg} kg ({solution.errorKg > 0 ? "+" : ""}
          {solution.errorKg} kg).
        </p>
      )}
    </div>
  );
};
