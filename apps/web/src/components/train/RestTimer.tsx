"use client";

import { useEffect, useRef, useState } from "react";
import { duration } from "@/lib/format";
import { CloseIcon, TimerIcon } from "@/components/icons";

/**
 * Rest timer.
 *
 * Deliberately wall-clock based rather than tick-counted: mobile browsers
 * throttle timers in background tabs, and a rest timer that pauses when you
 * put the phone in your pocket is worse than no timer at all.
 */
export const RestTimer = ({
  endsAt,
  onExtend,
  onDismiss,
  alert,
}: {
  endsAt: number | null;
  onExtend: (seconds: number) => void;
  onDismiss: () => void;
  alert: boolean;
}) => {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    if (endsAt == null) return;
    firedRef.current = false;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = endsAt != null ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  const done = endsAt != null && remaining === 0;

  useEffect(() => {
    if (!done || firedRef.current || !alert) return;
    firedRef.current = true;
    // Vibration is the signal that actually works in a loud gym; it is also
    // unsupported on iOS, hence the guard rather than a hard dependency.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([200, 100, 200]);
    }
  }, [done, alert]);

  if (endsAt == null) return null;

  return (
    <div
      className="fixed inset-x-0 z-30 px-4"
      style={{ bottom: "calc(72px + env(safe-area-inset-bottom) + 8px)" }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`mx-auto flex max-w-2xl items-center gap-3 rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur ${
          done ? "border-brand bg-brand/20" : "border-border bg-surface/95"
        }`}
      >
        <TimerIcon className={`h-5 w-5 shrink-0 ${done ? "text-brand" : "text-muted"}`} />
        <span className="tabular w-14 shrink-0 text-lg font-semibold">
          {done ? "Go" : duration(remaining)}
        </span>

        <div className="flex flex-1 gap-1.5">
          <button
            type="button"
            onClick={() => onExtend(-15)}
            className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-muted hover:text-text"
          >
            −15s
          </button>
          <button
            type="button"
            onClick={() => onExtend(15)}
            className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-muted hover:text-text"
          >
            +15s
          </button>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Skip rest"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
