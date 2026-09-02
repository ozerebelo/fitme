"use client";

import type { Food, FoodEntry, GroundedFoodItem, MealType } from "@fitme/core";
import { BASIS_LABEL, createFoodEntry, cryptoId, rescaleGrounded } from "@fitme/core";
import { Badge } from "@/components/ui";
import { CheckIcon } from "@/components/icons";

/**
 * Review step shared by photo and conversational logging.
 *
 * Both flows produce the same thing — a list of foods with estimated portions —
 * and the portion is the number worth correcting, so it is a slider on every
 * row rather than something behind a tap. Each row states where its numbers
 * came from, because "looked up in a database" and "the model's best guess" are
 * very different claims and the user is entitled to know which they are getting.
 */

export interface ReviewRow extends GroundedFoodItem {
  rowId: string;
  include: boolean;
}

export const toReviewRows = (items: GroundedFoodItem[]): ReviewRow[] =>
  items.map((item) => ({ ...item, rowId: cryptoId(), include: true }));

const BASIS_TONE: Record<GroundedFoodItem["basis"], "brand" | "info" | "neutral" | "warn"> = {
  memory: "brand",
  custom: "info",
  catalog: "neutral",
  estimate: "warn",
};

export const ItemReview = ({
  rows,
  foods,
  onChange,
}: {
  rows: ReviewRow[];
  foods: Food[];
  onChange: (rows: ReviewRow[]) => void;
}) => {
  const setGrams = (rowId: string, grams: number): void =>
    onChange(
      rows.map((row) =>
        row.rowId === rowId
          ? { ...rescaleGrounded(row, grams, foods), rowId: row.rowId, include: row.include }
          : row,
      ),
    );

  const toggle = (rowId: string): void =>
    onChange(rows.map((row) => (row.rowId === rowId ? { ...row, include: !row.include } : row)));

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.rowId}
          className={`rounded-xl border p-3 transition-colors ${
            row.include ? "border-border bg-surface-2" : "border-border/50 opacity-50"
          }`}
        >
          <div className="flex items-start gap-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={row.include}
              aria-label={`Include ${row.name}`}
              onClick={() => toggle(row.rowId)}
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                row.include ? "border-brand bg-brand text-black" : "border-border"
              }`}
            >
              {row.include && <CheckIcon className="h-4 w-4" />}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.name}</span>
                <Badge tone={BASIS_TONE[row.basis]}>{BASIS_LABEL[row.basis]}</Badge>
              </div>
              {row.description && (
                <p className="mt-0.5 text-xs leading-relaxed text-faint">{row.description}</p>
              )}

              <div className="mt-2 flex items-center gap-2">
                <input
                  type="range"
                  min={Math.max(5, Math.round(row.grams * 0.3))}
                  max={Math.max(20, Math.round(row.grams * 2.5))}
                  step={5}
                  value={row.grams}
                  onChange={(e) => setGrams(row.rowId, Number(e.target.value))}
                  aria-label={`Portion of ${row.name} in grams`}
                  className="flex-1 accent-[var(--color-brand)]"
                />
                <span className="tabular w-16 shrink-0 text-right text-sm font-medium">
                  {row.grams} g
                </span>
              </div>

              <p className="tabular mt-1.5 text-xs text-muted">
                {Math.round(row.nutrients.kcal)} kcal · P {Math.round(row.nutrients.protein)} · C{" "}
                {Math.round(row.nutrients.carbs)} · F {Math.round(row.nutrients.fat)}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
};

export const reviewTotals = (rows: ReviewRow[]) =>
  rows
    .filter((r) => r.include)
    .reduce(
      (acc, row) => ({
        kcal: acc.kcal + row.nutrients.kcal,
        protein: acc.protein + row.nutrients.protein,
        carbs: acc.carbs + row.nutrients.carbs,
        fat: acc.fat + row.nutrients.fat,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );

/** Convert reviewed rows into diary entries. */
export const rowsToEntries = (
  rows: ReviewRow[],
  opts: {
    meal: MealType;
    date: string;
    foods: Food[];
    source: FoodEntry["source"];
    photoThumb?: string;
  },
): FoodEntry[] =>
  rows
    .filter((r) => r.include)
    .map((row, index) => {
      const food = row.foodId ? opts.foods.find((f) => f.id === row.foodId) : undefined;
      // One thumbnail per meal, on the first entry — not one per component.
      const photoThumb = index === 0 ? opts.photoThumb : undefined;

      if (food) {
        return createFoodEntry({
          food,
          grams: row.grams,
          meal: opts.meal,
          date: opts.date,
          source: opts.source,
          confidence: row.confidence,
          photoThumb,
          notes: row.description,
        });
      }

      return {
        id: cryptoId(),
        date: opts.date,
        meal: opts.meal,
        name: row.name,
        grams: row.grams,
        nutrients: row.nutrients,
        source: opts.source,
        confidence: row.confidence,
        photoThumb,
        notes: row.description,
        createdAt: new Date().toISOString(),
      } satisfies FoodEntry;
    });
