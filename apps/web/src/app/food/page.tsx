"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FoodEntry, MealType } from "@fitme/core";
import {
  MEAL_TYPES,
  addDays,
  defaultMealForTime,
  formatDayLabel,
  groupByMeal,
  rescaleEntry,
  sumEntries,
  toDateKey,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import { RequireProfile } from "@/components/Guard";
import { AddFoodSheet, type AddFoodTool } from "@/components/food/AddFoodSheet";
import { ChatLogSheet } from "@/components/food/ChatLogSheet";
import { BarcodeScanner } from "@/components/food/BarcodeScanner";
import { PhotoMealSheet } from "@/components/food/PhotoMealSheet";
import { MACRO_COLORS, MacroBars } from "@/components/charts";
import {
  Badge,
  Button,
  Card,
  NumberInput,
  PageHeader,
  Sheet,
  Spinner,
} from "@/components/ui";
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SparkIcon,
  TrashIcon,
} from "@/components/icons";

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

function FoodDiary() {
  const params = useSearchParams();
  const { data, targets, updateEntry, removeEntry } = useApp();

  const [date, setDate] = useState(toDateKey());
  const [addOpen, setAddOpen] = useState(false);
  const [tool, setTool] = useState<AddFoodTool | null>(
    params.get("capture") === "1"
      ? "photo"
      : params.get("describe") === "1"
        ? "chat"
        : params.get("scan") === "1"
          ? "barcode"
          : null,
  );
  const [meal, setMeal] = useState<MealType>(
    (params.get("meal") as MealType) || defaultMealForTime(),
  );
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  const entries = useMemo(
    () => data.entries.filter((e) => e.date === date),
    [data.entries, date],
  );
  const totals = useMemo(() => sumEntries(entries), [entries]);
  const byMeal = useMemo(() => groupByMeal(entries), [entries]);

  const openAdd = (target: MealType): void => {
    setMeal(target);
    setAddOpen(true);
  };

  const remaining = targets.kcal - totals.kcal;

  return (
    <div>
      <PageHeader
        title="Food"
        subtitle={`${Math.round(totals.kcal)} of ${targets.kcal} kcal`}
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setTool("chat")} aria-label="Describe a meal">
              <SparkIcon className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setTool("photo")} aria-label="Photograph a meal">
              <CameraIcon className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="space-y-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setDate((d) => addDays(d, -1))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted hover:text-text"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="font-medium">{formatDayLabel(date)}</span>
          <button
            type="button"
            aria-label="Next day"
            disabled={date >= toDateKey()}
            onClick={() => setDate((d) => addDays(d, 1))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted hover:text-text disabled:opacity-30"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        <Card>
          <div className="mb-4 flex items-baseline justify-between">
            <span className="text-sm text-muted">
              {remaining >= 0 ? "Remaining" : "Over budget"}
            </span>
            <span
              className={`tabular text-2xl font-semibold ${remaining < 0 ? "text-danger" : ""}`}
            >
              {Math.abs(Math.round(remaining))}
              <span className="ml-1 text-sm font-normal text-faint">kcal</span>
            </span>
          </div>
          <MacroBars
            data={[
              {
                key: "protein",
                label: "Protein",
                value: totals.protein,
                target: targets.protein,
                color: MACRO_COLORS.protein,
              },
              {
                key: "carbs",
                label: "Carbs",
                value: totals.carbs,
                target: targets.carbs,
                color: MACRO_COLORS.carbs,
              },
              {
                key: "fat",
                label: "Fat",
                value: totals.fat,
                target: targets.fat,
                color: MACRO_COLORS.fat,
              },
            ]}
          />
        </Card>

        {MEAL_TYPES.map((mealType) => {
          const mealEntries = byMeal[mealType];
          const mealTotals = sumEntries(mealEntries);
          return (
            <section key={mealType}>
              <div className="flex items-center justify-between px-1 pb-2">
                <h2 className="font-semibold">{MEAL_LABELS[mealType]}</h2>
                <div className="flex items-center gap-3">
                  <span className="tabular text-sm text-muted">
                    {mealTotals.kcal > 0 ? `${Math.round(mealTotals.kcal)} kcal` : ""}
                  </span>
                  <button
                    type="button"
                    aria-label={`Add to ${MEAL_LABELS[mealType]}`}
                    onClick={() => openAdd(mealType)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:border-brand hover:text-brand"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {mealEntries.length === 0 ? (
                <button
                  type="button"
                  onClick={() => openAdd(mealType)}
                  className="w-full rounded-xl border border-dashed border-border px-4 py-4 text-left text-sm text-faint hover:border-faint"
                >
                  Add something to {MEAL_LABELS[mealType].toLowerCase()}
                </button>
              ) : (
                <Card className="p-0">
                  <ul className="divide-y divide-border">
                    {mealEntries.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => setEditing(entry)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
                        >
                          {entry.photoThumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={entry.photoThumb}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-lg object-cover"
                            />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate font-medium">{entry.name}</span>
                              {entry.source === "photo" && <Badge tone="info">Photo</Badge>}
                              {entry.source === "chat" && <Badge tone="info">Described</Badge>}
                              {entry.source === "quick_add" && <Badge>Quick</Badge>}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-faint">
                              {entry.servingLabel ??
                                (entry.grams > 0 ? `${Math.round(entry.grams)} g` : "—")}
                              {" · P "}
                              {Math.round(entry.nutrients.protein)}
                              {" C "}
                              {Math.round(entry.nutrients.carbs)}
                              {" F "}
                              {Math.round(entry.nutrients.fat)}
                            </span>
                          </span>
                          <span className="tabular shrink-0 text-sm font-medium">
                            {Math.round(entry.nutrients.kcal)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </section>
          );
        })}
      </div>

      <AddFoodSheet
        open={addOpen}
        meal={meal}
        date={date}
        onClose={() => setAddOpen(false)}
        onOpenTool={(next) => {
          setAddOpen(false);
          setTool(next);
        }}
      />

      <ChatLogSheet
        open={tool === "chat"}
        meal={meal}
        date={date}
        onClose={() => setTool(null)}
      />

      <PhotoMealSheet
        open={tool === "photo"}
        meal={meal}
        date={date}
        onClose={() => setTool(null)}
      />

      <BarcodeScanner
        open={tool === "barcode"}
        meal={meal}
        date={date}
        onClose={() => setTool(null)}
      />

      <EditEntrySheet
        entry={editing}
        onClose={() => setEditing(null)}
        onSave={(next) => {
          updateEntry(next);
          setEditing(null);
        }}
        onDelete={(id) => {
          removeEntry(id);
          setEditing(null);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const EditEntrySheet = ({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: FoodEntry | null;
  onClose: () => void;
  onSave: (entry: FoodEntry) => void;
  onDelete: (id: string) => void;
}) => {
  const [grams, setGrams] = useState(entry?.grams ?? 0);
  const [kcal, setKcal] = useState(entry?.nutrients.kcal ?? 0);

  // Reset the draft whenever a different entry is opened.
  const [trackedId, setTrackedId] = useState(entry?.id);
  if (entry && entry.id !== trackedId) {
    setTrackedId(entry.id);
    setGrams(entry.grams);
    setKcal(entry.nutrients.kcal);
  }

  if (!entry) return null;

  // A quick-add has no weight to scale, so calories are edited directly.
  const weighable = entry.grams > 0;
  const preview = weighable ? rescaleEntry(entry, grams) : entry;

  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      title={entry.name}
      footer={
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="danger" onClick={() => onDelete(entry.id)} aria-label="Delete entry">
            <TrashIcon className="h-5 w-5" />
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              onSave(
                weighable
                  ? preview
                  : { ...entry, nutrients: { ...entry.nutrients, kcal: Math.round(kcal) } },
              )
            }
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {entry.photoThumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={entry.photoThumb}
            alt=""
            className="max-h-48 w-full rounded-xl object-cover"
          />
        )}

        {entry.notes && <p className="text-sm leading-relaxed text-muted">{entry.notes}</p>}

        {entry.source === "photo" && entry.confidence != null && (
          <p className="rounded-lg bg-info/10 px-3 py-2 text-xs leading-relaxed text-info">
            Estimated from a photo at {Math.round(entry.confidence * 100)}% confidence. If you
            know the real portion, correcting it here is the single most useful thing you can
            do for the accuracy of your data.
          </p>
        )}

        {weighable ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">Amount (g)</span>
            <NumberInput
              value={grams}
              min={1}
              step={5}
              onChange={(e) => setGrams(Math.max(1, Number(e.target.value)))}
            />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">Calories</span>
            <NumberInput
              value={kcal}
              min={0}
              onChange={(e) => setKcal(Math.max(0, Number(e.target.value)))}
            />
          </label>
        )}

        <div className="rounded-xl bg-surface-2 p-4">
          <div className="tabular text-2xl font-semibold">
            {Math.round(weighable ? preview.nutrients.kcal : kcal)}
            <span className="ml-1 text-sm font-normal text-faint">kcal</span>
          </div>
          <p className="tabular mt-1 text-sm text-muted">
            P {Math.round(preview.nutrients.protein)} g · C{" "}
            {Math.round(preview.nutrients.carbs)} g · F {Math.round(preview.nutrients.fat)} g
          </p>
        </div>
      </div>
    </Sheet>
  );
};

export default function FoodPage() {
  return (
    <RequireProfile>
      <Suspense fallback={<Spinner />}>
        <FoodDiary />
      </Suspense>
    </RequireProfile>
  );
}
