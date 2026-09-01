"use client";

import { useEffect, useRef, useState } from "react";
import type { FoodEntry, MealType } from "@fitme/core";
import { createFoodEntry, cryptoId, scaleNutrients, toDateKey } from "@fitme/core";
import { useApp } from "@/lib/state";
import { prepareImage } from "@/lib/image";
import { Badge, Button, Sheet, Spinner, TextInput } from "@/components/ui";
import { CameraIcon, CheckIcon } from "@/components/icons";

interface AnalysedItem {
  name: string;
  description: string;
  grams: number;
  confidence: number;
  nutrients: { kcal: number; protein: number; carbs: number; fat: number; fiber?: number };
  basis: "catalog" | "estimate";
  matchedFoodId?: string;
  matchedFoodName?: string;
}

interface Analysis {
  mealDescription: string;
  items: AnalysedItem[];
  assumptions: string[];
  overallConfidence: number;
}

type Phase = "pick" | "preview" | "analysing" | "review" | "error";

/** Per-item state in the review step: portions are adjustable, because the
 *  photo estimate is a starting point rather than an answer. */
interface ReviewRow extends AnalysedItem {
  id: string;
  include: boolean;
  /** Nutrients per gram, so rescaling stays proportional. */
  perGram: { kcal: number; protein: number; carbs: number; fat: number };
}

export const PhotoMealSheet = ({
  open,
  meal,
  date,
  onClose,
}: {
  open: boolean;
  meal: MealType;
  date: string;
  onClose: () => void;
}) => {
  const { addEntries, foods } = useApp();
  const [phase, setPhase] = useState<Phase>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [payload, setPayload] = useState<{ base64: string; mediaType: string } | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string>("");

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("pick");
    setPreview(null);
    setPayload(null);
    setThumb(null);
    setHint("");
    setAnalysis(null);
    setRows([]);
    setError("");
  }, [open]);

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      const prepared = await prepareImage(file);
      setPayload({ base64: prepared.base64, mediaType: prepared.mediaType });
      setThumb(prepared.thumbnail);
      setPreview(prepared.thumbnail);
      setPhase("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That image could not be read.");
      setPhase("error");
    }
  };

  const analyse = async (): Promise<void> => {
    if (!payload) return;
    setPhase("analysing");
    try {
      const response = await fetch("/api/vision/meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: payload.base64,
          mediaType: payload.mediaType,
          hint,
        }),
      });
      const json = (await response.json()) as Analysis & { message?: string };

      if (!response.ok) {
        setError(json.message ?? "Analysis failed.");
        setPhase("error");
        return;
      }

      setAnalysis(json);
      setRows(
        json.items.map((item) => ({
          ...item,
          id: cryptoId(),
          include: true,
          perGram: {
            kcal: item.nutrients.kcal / Math.max(item.grams, 1),
            protein: item.nutrients.protein / Math.max(item.grams, 1),
            carbs: item.nutrients.carbs / Math.max(item.grams, 1),
            fat: item.nutrients.fat / Math.max(item.grams, 1),
          },
        })),
      );
      setPhase("review");
    } catch {
      setError("Could not reach the analysis service. Check your connection.");
      setPhase("error");
    }
  };

  const setGrams = (id: string, grams: number): void => {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              grams,
              nutrients: {
                kcal: Math.round(row.perGram.kcal * grams),
                protein: Math.round(row.perGram.protein * grams * 10) / 10,
                carbs: Math.round(row.perGram.carbs * grams * 10) / 10,
                fat: Math.round(row.perGram.fat * grams * 10) / 10,
              },
            }
          : row,
      ),
    );
  };

  const included = rows.filter((r) => r.include);
  const totals = included.reduce(
    (acc, row) => ({
      kcal: acc.kcal + row.nutrients.kcal,
      protein: acc.protein + row.nutrients.protein,
      carbs: acc.carbs + row.nutrients.carbs,
      fat: acc.fat + row.nutrients.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const commit = (): void => {
    const entries: FoodEntry[] = included.map((row, index) => {
      const matched = row.matchedFoodId
        ? foods.find((f) => f.id === row.matchedFoodId)
        : undefined;

      if (matched) {
        return createFoodEntry({
          food: matched,
          grams: row.grams,
          meal,
          date,
          source: "photo",
          confidence: row.confidence,
          // Only the first entry carries the photo, so the diary shows one
          // thumbnail per meal rather than one per component.
          photoThumb: index === 0 ? (thumb ?? undefined) : undefined,
          notes: row.description,
        });
      }

      return {
        id: cryptoId(),
        date,
        meal,
        name: row.name,
        grams: row.grams,
        nutrients: scaleNutrients(row.nutrients, 1),
        source: "photo" as const,
        confidence: row.confidence,
        photoThumb: index === 0 ? (thumb ?? undefined) : undefined,
        notes: row.description,
        createdAt: new Date().toISOString(),
      };
    });

    addEntries(entries);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log a meal from a photo"
      footer={
        phase === "review" ? (
          <Button variant="primary" size="lg" full disabled={included.length === 0} onClick={commit}>
            Add {included.length} {included.length === 1 ? "item" : "items"} ·{" "}
            {Math.round(totals.kcal)} kcal
          </Button>
        ) : undefined
      }
    >
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {phase === "pick" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
            <CameraIcon className="mx-auto mb-3 h-8 w-8 text-faint" />
            <p className="font-medium">Photograph your plate</p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted">
              Shoot from slightly above, with something in frame for scale — a fork, your
              hand, the edge of the plate.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" size="lg" onClick={() => cameraRef.current?.click()}>
              <CameraIcon className="h-5 w-5" />
              Camera
            </Button>
            <Button size="lg" onClick={() => libraryRef.current?.click()}>
              Choose photo
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-faint">
            The photo is resized on your device before it is sent for analysis, and only
            a small thumbnail is kept in your diary.
          </p>
        </div>
      )}

      {phase === "preview" && preview && (
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="The meal you photographed"
            className="max-h-64 w-full rounded-xl object-cover"
          />
          <TextInput
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Anything it can't see? e.g. cooked in 2 tbsp olive oil"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setPhase("pick")}>Retake</Button>
            <Button variant="primary" onClick={() => void analyse()}>
              Analyse
            </Button>
          </div>
        </div>
      )}

      {phase === "analysing" && (
        <div className="py-6">
          <Spinner label="Working out what's on the plate…" />
          <p className="mx-auto max-w-sm text-center text-xs leading-relaxed text-faint">
            Identifying each component, estimating portion weights, then looking up real
            composition data for anything it recognises.
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-4 py-4 text-center">
          <p className="font-medium">Could not analyse that photo</p>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">{error}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setPhase("pick")}>Try again</Button>
            <Button onClick={onClose}>Log it manually</Button>
          </div>
        </div>
      )}

      {phase === "review" && analysis && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-3">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">{analysis.mealDescription}</p>
              <p className="mt-0.5 text-xs text-faint">
                Overall confidence {Math.round(analysis.overallConfidence * 100)}%. Check the
                portions below — they are the part worth correcting.
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
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
                    onClick={() =>
                      setRows((current) =>
                        current.map((r) => (r.id === row.id ? { ...r, include: !r.include } : r)),
                      )
                    }
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                      row.include ? "border-brand bg-brand text-black" : "border-border"
                    }`}
                  >
                    {row.include && <CheckIcon className="h-4 w-4" />}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.name}</span>
                      <Badge tone={row.basis === "catalog" ? "brand" : "warn"}>
                        {row.basis === "catalog" ? "From database" : "Estimated"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-faint">{row.description}</p>

                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min={Math.max(5, Math.round(row.grams * 0.3))}
                        max={Math.round(row.grams * 2.5)}
                        step={5}
                        value={row.grams}
                        onChange={(e) => setGrams(row.id, Number(e.target.value))}
                        aria-label={`Portion of ${row.name} in grams`}
                        className="flex-1 accent-[var(--color-brand)]"
                      />
                      <span className="tabular w-16 shrink-0 text-right text-sm font-medium">
                        {row.grams} g
                      </span>
                    </div>

                    <p className="tabular mt-1.5 text-xs text-muted">
                      {Math.round(row.nutrients.kcal)} kcal · P {Math.round(row.nutrients.protein)}{" "}
                      · C {Math.round(row.nutrients.carbs)} · F {Math.round(row.nutrients.fat)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-xl bg-surface-2 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">Meal total</span>
              <span className="tabular text-xl font-semibold">
                {Math.round(totals.kcal)} kcal
              </span>
            </div>
            <p className="tabular mt-1 text-xs text-faint">
              P {Math.round(totals.protein)} g · C {Math.round(totals.carbs)} g · F{" "}
              {Math.round(totals.fat)} g
            </p>
          </div>

          {analysis.assumptions.length > 0 && (
            <div className="rounded-xl border border-border p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-faint">
                What it assumed
              </p>
              <ul className="space-y-1 text-xs leading-relaxed text-muted">
                {analysis.assumptions.map((assumption, i) => (
                  <li key={i}>· {assumption}</li>
                ))}
              </ul>
            </div>
          )}

          <Button full onClick={() => setPhase("pick")}>
            Start over with a different photo
          </Button>
        </div>
      )}
    </Sheet>
  );
};

export const todayKey = (): string => toDateKey();
