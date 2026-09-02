"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Food, MealType } from "@fitme/core";
import { isValidBarcode } from "@fitme/core";
import { useApp } from "@/lib/state";
import { PortionEditor } from "./AddFoodSheet";
import { Badge, Button, Field, Sheet, Spinner, TextInput } from "@/components/ui";
import { CameraIcon } from "@/components/icons";

/**
 * Barcode scanning.
 *
 * Uses the browser's native BarcodeDetector where it exists (Chrome, Android),
 * which needs no library and no download. Safari does not implement it, so
 * manual entry is a first-class path rather than an afterthought — the numbers
 * under the bars are short, and typing thirteen digits still beats reading a
 * nutrition label into a form.
 *
 * A scanned product is saved to the user's own foods, so the second scan of the
 * same item resolves instantly and works offline.
 */

type Phase = "scanning" | "manual" | "looking-up" | "found" | "error";

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const getDetectorCtor = (): BarcodeDetectorConstructor | null => {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor };
  return w.BarcodeDetector ?? null;
};

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

export const BarcodeScanner = ({
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
  const { addCustomFood, addEntries, foods } = useApp();
  const [phase, setPhase] = useState<Phase>("scanning");
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [food, setFood] = useState<Food | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  const stopCamera = useCallback(() => {
    stoppedRef.current = true;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const lookup = useCallback(
    async (barcode: string): Promise<void> => {
      stopCamera();
      setCode(barcode);
      setPhase("looking-up");
      try {
        const response = await fetch(
          `/api/foods/lookup?barcode=${encodeURIComponent(barcode)}`,
        );
        const json = (await response.json()) as { food?: Food; message?: string };
        if (!response.ok || !json.food) {
          setError(json.message ?? "That product could not be found.");
          setPhase("error");
          return;
        }
        setFood(json.food);
        setPhase("found");
      } catch {
        setError("Could not reach the food database.");
        setPhase("error");
      }
    },
    [stopCamera],
  );

  // Camera lifecycle. Tied to `open` so the light goes off the moment the sheet
  // closes — leaving a camera running in the background is not acceptable.
  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    setPhase("scanning");
    setError("");
    setCode("");
    setFood(null);
    stoppedRef.current = false;

    const Detector = getDetectorCtor();
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setPhase("manual");
      return;
    }

    let detector: BarcodeDetectorLike;
    try {
      detector = new Detector({ formats: FORMATS });
    } catch {
      setPhase("manual");
      return;
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stoppedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const scan = async (): Promise<void> => {
          if (stoppedRef.current || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            const hit = results.find((r) => isValidBarcode(r.rawValue));
            if (hit) {
              if (navigator.vibrate) navigator.vibrate(60);
              void lookup(hit.rawValue.trim());
              return;
            }
          } catch {
            // A single failed frame is normal; keep going.
          }
          rafRef.current = requestAnimationFrame(() => void scan());
        };
        rafRef.current = requestAnimationFrame(() => void scan());
      } catch {
        // Permission denied, or no camera. Typing the number still works.
        setPhase("manual");
      }
    })();

    return stopCamera;
  }, [open, stopCamera, lookup]);

  const commit = (entryFood: Food, grams: number): void => {
    // Keep the product so the next scan is instant and works offline.
    if (!foods.some((f) => f.barcode && f.barcode === entryFood.barcode)) {
      addCustomFood(entryFood);
    }
    addEntries([
      {
        ...buildEntry(entryFood, grams, meal, date),
      },
    ]);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Scan a barcode">
      {phase === "scanning" && (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              className="aspect-[4/3] w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-4/5 rounded-lg border-2 border-brand/80" />
            </div>
          </div>
          <p className="text-center text-sm text-muted">
            Hold the barcode inside the frame.
          </p>
          <Button full onClick={() => { stopCamera(); setPhase("manual"); }}>
            Type the number instead
          </Button>
        </div>
      )}

      {phase === "manual" && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (isValidBarcode(code)) void lookup(code.trim());
            else setError("A barcode is 8 to 14 digits.");
          }}
        >
          <div className="rounded-xl border border-dashed border-border px-5 py-6 text-center">
            <CameraIcon className="mx-auto mb-2 h-7 w-7 text-faint" />
            <p className="text-sm leading-relaxed text-muted">
              {getDetectorCtor()
                ? "Camera unavailable — type the digits printed under the barcode."
                : "This browser cannot scan barcodes directly. Type the digits printed under the barcode; it takes a moment and only has to be done once per product."}
            </p>
          </div>

          <Field label="Barcode" error={error || undefined}>
            <TextInput
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              inputMode="numeric"
              autoComplete="off"
              placeholder="7394376616037"
              autoFocus
            />
          </Field>

          <Button type="submit" variant="primary" full disabled={!isValidBarcode(code)}>
            Look it up
          </Button>
        </form>
      )}

      {phase === "looking-up" && <Spinner label="Looking up the product" />}

      {phase === "error" && (
        <div className="space-y-4 py-4 text-center">
          <p className="font-medium">Not found</p>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">{error}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => { setError(""); setCode(""); setPhase("manual"); }}>
              Try another
            </Button>
            <Button onClick={onClose}>Add manually</Button>
          </div>
        </div>
      )}

      {phase === "found" && food && (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{food.name}</span>
              <Badge tone="info">Open Food Facts</Badge>
            </div>
            {food.brand && <p className="mt-0.5 text-sm text-muted">{food.brand}</p>}
            <p className="tabular mt-1 text-xs text-faint">
              {Math.round(food.per100.kcal)} kcal · P {Math.round(food.per100.protein)} · C{" "}
              {Math.round(food.per100.carbs)} · F {Math.round(food.per100.fat)} per 100{" "}
              {food.basis} · barcode {code}
            </p>
          </div>

          <p className="rounded-lg bg-surface-2 p-3 text-xs leading-relaxed text-muted">
            This data is crowd-sourced, so check it against the label the first time. Once
            saved it becomes one of your own foods and works offline.
          </p>

          <PortionEditor
            food={food}
            meal={meal}
            date={date}
            onCancel={() => setPhase("manual")}
            onConfirm={(entry) => commit(food, entry.grams)}
            confirmLabel="Save & log"
          />
        </div>
      )}
    </Sheet>
  );
};

/** Built here rather than in PortionEditor so the saved food id is the one kept. */
const buildEntry = (food: Food, grams: number, meal: MealType, date: string) => {
  const factor = grams / 100;
  return {
    id: `${food.id}-${Date.now()}`,
    date,
    meal,
    foodId: food.id,
    name: food.name,
    brand: food.brand,
    grams,
    nutrients: {
      kcal: Math.round(food.per100.kcal * factor),
      protein: Math.round(food.per100.protein * factor * 10) / 10,
      carbs: Math.round(food.per100.carbs * factor * 10) / 10,
      fat: Math.round(food.per100.fat * factor * 10) / 10,
      fiber:
        food.per100.fiber != null
          ? Math.round(food.per100.fiber * factor * 10) / 10
          : undefined,
    },
    source: "catalog" as const,
    createdAt: new Date().toISOString(),
  };
};
