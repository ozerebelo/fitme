"use client";

import { useEffect, useRef, useState } from "react";
import type { MealType, RawFoodItem } from "@fitme/core";
import { groundItems, memoryBriefing } from "@fitme/core";
import { useApp } from "@/lib/state";
import { prepareImage } from "@/lib/image";
import {
  ItemReview,
  type ReviewRow,
  reviewTotals,
  rowsToEntries,
  toReviewRows,
} from "./ItemReview";
import { Button, Sheet, Spinner, TextInput } from "@/components/ui";
import { CameraIcon } from "@/components/icons";

interface Analysis {
  mealDescription: string;
  items: RawFoodItem[];
  assumptions: string[];
  overallConfidence: number;
}

type Phase = "pick" | "preview" | "analysing" | "review" | "error";

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
  const { addEntries, foods, data, markFactsUsed } = useApp();
  const [phase, setPhase] = useState<Phase>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [payload, setPayload] = useState<{ base64: string; mediaType: string } | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState("");

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
          memory: memoryBriefing(data.memory),
        }),
      });
      const json = (await response.json()) as Analysis & { message?: string };

      if (!response.ok) {
        setError(json.message ?? "Analysis failed.");
        setPhase("error");
        return;
      }

      // Ground on the device, where the user's own foods and remembered facts
      // live — so a photo of "milk" resolves to their carton, not a generic one.
      const grounded = groundItems(json.items, { foods, memory: data.memory });
      markFactsUsed(grounded.map((g) => g.factId).filter((id): id is string => !!id));

      setAnalysis(json);
      setRows(toReviewRows(grounded));
      setPhase("review");
    } catch {
      setError("Could not reach the analysis service. Check your connection.");
      setPhase("error");
    }
  };

  const totals = reviewTotals(rows);
  const includedCount = rows.filter((r) => r.include).length;

  const commit = (): void => {
    addEntries(
      rowsToEntries(rows, {
        meal,
        date,
        foods,
        source: "photo",
        photoThumb: thumb ?? undefined,
      }),
    );
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log a meal from a photo"
      footer={
        phase === "review" ? (
          <Button variant="primary" size="lg" full disabled={includedCount === 0} onClick={commit}>
            Add {includedCount} {includedCount === 1 ? "item" : "items"} ·{" "}
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
            The photo is resized on your device before it is sent for analysis, and only a
            small thumbnail is kept in your diary.
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
            Identifying each component and estimating portion weights, then looking up real
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

          <ItemReview rows={rows} foods={foods} onChange={setRows} />

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
