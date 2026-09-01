"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Food, FoodEntry, MealType } from "@fitme/core";
import {
  createCustomFood,
  createFoodEntry,
  createQuickAddEntry,
  macroCalorieMismatch,
  nutrientsFor,
  searchFoods,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import {
  Badge,
  Button,
  Field,
  NumberInput,
  Segmented,
  Sheet,
  TextInput,
} from "@/components/ui";
import { CameraIcon, PlusIcon } from "@/components/icons";

type View = "list" | "portion" | "custom" | "quick";

export const AddFoodSheet = ({
  open,
  meal,
  date,
  onClose,
  onCapture,
}: {
  open: boolean;
  meal: MealType;
  date: string;
  onClose: () => void;
  onCapture: () => void;
}) => {
  const { foods, data, addEntries, addCustomFood } = useApp();
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Food | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setView("list");
      setQuery("");
      setSelected(null);
      // Autofocus on desktop only: on mobile it yanks up the keyboard before
      // the sheet has finished animating, which feels broken.
      if (window.matchMedia("(pointer: fine)").matches) {
        setTimeout(() => searchRef.current?.focus(), 60);
      }
    }
  }, [open]);

  const results = useMemo(
    () => searchFoods(foods, query, { recentIds: data.recentFoodIds, limit: 40 }),
    [foods, query, data.recentFoodIds],
  );

  const commit = (entries: FoodEntry[]): void => {
    addEntries(entries);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        view === "portion"
          ? (selected?.name ?? "Portion")
          : view === "custom"
            ? "Create a food"
            : view === "quick"
              ? "Quick add"
              : "Add food"
      }
    >
      {view === "list" && (
        <div className="space-y-3">
          <TextInput
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods…"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
          />

          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" onClick={onCapture}>
              <CameraIcon className="h-4 w-4" />
              Photo
            </Button>
            <Button size="sm" onClick={() => setView("quick")}>
              Quick add
            </Button>
            <Button size="sm" onClick={() => setView("custom")}>
              <PlusIcon className="h-4 w-4" />
              New food
            </Button>
          </div>

          {query === "" && data.recentFoodIds.length > 0 && (
            <p className="px-1 text-xs font-semibold uppercase tracking-wider text-faint">
              Recent
            </p>
          )}

          <ul className="divide-y divide-border">
            {results.map((food) => {
              const per100 = food.per100;
              return (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(food);
                      setView("portion");
                    }}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{food.name}</span>
                        {!food.verified && <Badge>Custom</Badge>}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-faint">
                        {food.brand ? `${food.brand} · ` : ""}
                        {Math.round(per100.kcal)} kcal · P {Math.round(per100.protein)} · C{" "}
                        {Math.round(per100.carbs)} · F {Math.round(per100.fat)} per 100{" "}
                        {food.basis}
                      </span>
                    </span>
                    <PlusIcon className="h-5 w-5 shrink-0 text-faint" />
                  </button>
                </li>
              );
            })}
          </ul>

          {results.length === 0 && (
            <div className="py-8 text-center text-sm text-muted">
              <p>No match for “{query}”.</p>
              <Button className="mt-3" size="sm" onClick={() => setView("custom")}>
                Create it as a new food
              </Button>
            </div>
          )}
        </div>
      )}

      {view === "portion" && selected && (
        <PortionEditor
          food={selected}
          meal={meal}
          date={date}
          onCancel={() => setView("list")}
          onConfirm={(entry) => commit([entry])}
        />
      )}

      {view === "custom" && (
        <CustomFoodForm
          initialName={query}
          onCancel={() => setView("list")}
          onCreate={(food) => {
            addCustomFood(food);
            setSelected(food);
            setView("portion");
          }}
        />
      )}

      {view === "quick" && (
        <QuickAddForm
          onCancel={() => setView("list")}
          onConfirm={(input) => commit([createQuickAddEntry({ ...input, meal, date })])}
        />
      )}
    </Sheet>
  );
};

/* -------------------------------------------------------------------------- */
/*                               Portion editor                               */
/* -------------------------------------------------------------------------- */

export const PortionEditor = ({
  food,
  meal,
  date,
  initialGrams,
  onCancel,
  onConfirm,
  confirmLabel = "Add to diary",
}: {
  food: Food;
  meal: MealType;
  date: string;
  initialGrams?: number;
  onCancel: () => void;
  onConfirm: (entry: FoodEntry) => void;
  confirmLabel?: string;
}) => {
  const defaultServing = food.servings[0];
  const [servingIndex, setServingIndex] = useState(defaultServing ? 0 : -1);
  const [quantity, setQuantity] = useState(1);
  const [grams, setGrams] = useState(initialGrams ?? defaultServing?.grams ?? 100);

  // Serving mode drives grams; gram mode is the escape hatch for a scale.
  const usingServing = servingIndex >= 0;
  const effectiveGrams = usingServing
    ? (food.servings[servingIndex]?.grams ?? 100) * quantity
    : grams;

  const nutrients = nutrientsFor(food, effectiveGrams);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-2 p-4">
        <div className="tabular text-3xl font-semibold">{Math.round(nutrients.kcal)}</div>
        <div className="text-xs uppercase tracking-wider text-faint">kcal</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
          {[
            { label: "Protein", value: nutrients.protein, color: "var(--color-protein)" },
            { label: "Carbs", value: nutrients.carbs, color: "var(--color-carbs)" },
            { label: "Fat", value: nutrients.fat, color: "var(--color-fat)" },
          ].map((m) => (
            <div key={m.label}>
              <span
                className="mx-auto mb-1 block h-1 w-6 rounded-full"
                style={{ background: m.color }}
              />
              <div className="tabular font-medium">{Math.round(m.value)} g</div>
              <div className="text-[11px] text-faint">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {food.servings.length > 0 && (
        <Field label="Serving">
          <div className="flex flex-wrap gap-2">
            {food.servings.map((serving, i) => (
              <button
                key={serving.label}
                type="button"
                onClick={() => setServingIndex(i)}
                className={`rounded-full border px-3 py-2 text-sm ${
                  servingIndex === i
                    ? "border-brand bg-brand/15 text-brand"
                    : "border-border bg-surface-2 text-muted"
                }`}
              >
                {serving.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setGrams(Math.round(effectiveGrams));
                setServingIndex(-1);
              }}
              className={`rounded-full border px-3 py-2 text-sm ${
                servingIndex === -1
                  ? "border-brand bg-brand/15 text-brand"
                  : "border-border bg-surface-2 text-muted"
              }`}
            >
              By weight
            </button>
          </div>
        </Field>
      )}

      {usingServing ? (
        <Field label="How many">
          <NumberInput
            value={quantity}
            step={0.25}
            min={0.25}
            onChange={(e) => setQuantity(Math.max(0.25, Number(e.target.value)))}
          />
        </Field>
      ) : (
        <Field label={`Amount (${food.basis})`}>
          <NumberInput
            value={grams}
            step={5}
            min={1}
            onChange={(e) => setGrams(Math.max(1, Number(e.target.value)))}
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onCancel}>Back</Button>
        <Button
          variant="primary"
          onClick={() =>
            onConfirm(
              createFoodEntry({
                food,
                grams: effectiveGrams,
                meal,
                date,
                servingLabel: usingServing
                  ? `${quantity} × ${food.servings[servingIndex]?.label}`
                  : undefined,
              }),
            )
          }
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                              Custom food form                              */
/* -------------------------------------------------------------------------- */

const CustomFoodForm = ({
  initialName,
  onCancel,
  onCreate,
}: {
  initialName: string;
  onCancel: () => void;
  onCreate: (food: Food) => void;
}) => {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState("");
  const [basis, setBasis] = useState<"g" | "ml">("g");
  const [servingGrams, setServingGrams] = useState(100);
  const [kcal, setKcal] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [fiber, setFiber] = useState(0);

  const mismatch = macroCalorieMismatch({ kcal, protein, carbs, fat });
  const suspicious = kcal > 0 && Math.abs(mismatch) > 0.2;
  const impliedKcal = Math.round(protein * 4 + carbs * 4 + fat * 9);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">
        Enter the numbers exactly as they appear on the label, for the serving size the
        label uses. FitMe converts to per-100 {basis} internally.
      </p>

      <Field label="Name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Protein flapjack" />
      </Field>
      <Field label="Brand (optional)">
        <TextInput value={brand} onChange={(e) => setBrand(e.target.value)} />
      </Field>

      <Segmented
        value={basis}
        onChange={setBasis}
        options={[
          { value: "g", label: "Solid (g)" },
          { value: "ml", label: "Liquid (ml)" },
        ]}
      />

      <Field label={`Serving size (${basis})`}>
        <NumberInput
          value={servingGrams}
          min={1}
          onChange={(e) => setServingGrams(Math.max(1, Number(e.target.value)))}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories">
          <NumberInput value={kcal} min={0} onChange={(e) => setKcal(Number(e.target.value))} />
        </Field>
        <Field label="Protein (g)">
          <NumberInput value={protein} min={0} step={0.1} onChange={(e) => setProtein(Number(e.target.value))} />
        </Field>
        <Field label="Carbs (g)">
          <NumberInput value={carbs} min={0} step={0.1} onChange={(e) => setCarbs(Number(e.target.value))} />
        </Field>
        <Field label="Fat (g)">
          <NumberInput value={fat} min={0} step={0.1} onChange={(e) => setFat(Number(e.target.value))} />
        </Field>
      </div>

      <Field label="Fibre (g, optional)">
        <NumberInput value={fiber} min={0} step={0.1} onChange={(e) => setFiber(Number(e.target.value))} />
      </Field>

      {suspicious && (
        <p className="rounded-lg bg-warn/10 p-3 text-xs leading-relaxed text-warn">
          Those macros work out to {impliedKcal} kcal, not {kcal}. Worth a second look at
          the label — it is usually a typo or a per-serving/per-100 g mix-up.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!name.trim() || kcal <= 0}
          onClick={() =>
            onCreate(
              createCustomFood({
                name,
                brand,
                basis,
                servingGrams,
                kcal,
                protein,
                carbs,
                fat,
                fiber: fiber || undefined,
              }),
            )
          }
        >
          Create
        </Button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*                                 Quick add                                  */
/* -------------------------------------------------------------------------- */

const QuickAddForm = ({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (input: { kcal: number; name?: string; protein?: number; carbs?: number; fat?: number }) => void;
}) => {
  const [kcal, setKcal] = useState(0);
  const [name, setName] = useState("");
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted">
        For when you know roughly what it cost you but not what was in it. A rough entry
        beats a missing day — under-logging is what makes a plan look like it has stopped
        working.
      </p>

      <Field label="Calories">
        <NumberInput
          value={kcal}
          min={0}
          autoFocus
          onChange={(e) => setKcal(Number(e.target.value))}
        />
      </Field>
      <Field label="Label (optional)">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Dinner out" />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="P (g)">
          <NumberInput value={protein} min={0} onChange={(e) => setProtein(Number(e.target.value))} />
        </Field>
        <Field label="C (g)">
          <NumberInput value={carbs} min={0} onChange={(e) => setCarbs(Number(e.target.value))} />
        </Field>
        <Field label="F (g)">
          <NumberInput value={fat} min={0} onChange={(e) => setFat(Number(e.target.value))} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          disabled={kcal <= 0}
          onClick={() => onConfirm({ kcal, name, protein, carbs, fat })}
        >
          Add
        </Button>
      </div>
    </div>
  );
};
