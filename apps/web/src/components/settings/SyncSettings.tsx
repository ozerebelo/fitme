"use client";

import { useState } from "react";
import type { DataSummary } from "@/lib/sync";
import { useApp } from "@/lib/state";
import { Badge, Button, Card, Field, TextInput } from "@/components/ui";

/**
 * Cross-device sync.
 *
 * Off by default and entirely optional — everything works on one device without
 * it. The security model is one shared key, which is the honest size of
 * solution for a personal app, and it is stated on screen rather than implied.
 */
export const SyncSettings = () => {
  const { sync, syncEnabled, enableSync, disableSync, syncNow, resolveSyncChoice } = useApp();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const connect = async (): Promise<void> => {
    setBusy(true);
    await enableSync(key.trim());
    setBusy(false);
  };

  const tone =
    sync.state === "idle"
      ? "brand"
      : sync.state === "error" || sync.state === "conflict"
        ? "danger"
        : "neutral";

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Sync across devices</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Optional. Without it everything stays on this device — which is fine until you
            want the same data on your phone and your laptop, or you lose the phone.
          </p>
        </div>
        {syncEnabled && (
          <Badge tone={tone}>
            {sync.state === "syncing" ? "Syncing" : sync.state === "idle" ? "On" : sync.state}
          </Badge>
        )}
      </div>

      {sync.state === "choose" && sync.choice ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-lg bg-warn/10 p-3 text-sm leading-relaxed text-warn">
            Both this device and the synced copy have data in them. One has to replace the
            other — there is no merge. Pick the one you want to keep.
          </p>

          <div className="grid gap-2">
            <ChoiceCard
              title="Keep the synced copy"
              summary={sync.choice.remote}
              detail="Replaces everything on this device."
              onClick={() => void resolveSyncChoice("remote")}
            />
            <ChoiceCard
              title="Keep this device"
              summary={sync.choice.local}
              detail="Replaces what is currently synced."
              onClick={() => void resolveSyncChoice("local")}
            />
          </div>

          <p className="text-xs leading-relaxed text-faint">
            Not sure? Export a backup from &ldquo;Your data&rdquo; below first — then
            whichever you pick, nothing is gone for good.
          </p>
        </div>
      ) : syncEnabled ? (
        <div className="mt-4 space-y-3">
          {sync.lastSyncedAt && (
            <p className="text-sm text-muted">
              Last synced {new Date(sync.lastSyncedAt).toLocaleString()}.
            </p>
          )}
          {sync.message && (
            <p
              className={`rounded-lg p-3 text-sm leading-relaxed ${
                sync.state === "conflict"
                  ? "bg-warn/10 text-warn"
                  : "bg-danger/10 text-danger"
              }`}
            >
              {sync.message}
              {sync.state === "conflict" &&
                " Sync again to pull it down — this device's unsynced changes since then would be lost, so check them first."}
            </p>
          )}
          <p className="text-xs leading-relaxed text-faint">
            Pulls when the app opens and pushes when you leave it. The newer copy wins, so
            edit on one device at a time.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void syncNow()} disabled={sync.state === "syncing"}>
              {sync.state === "syncing" ? "Syncing…" : "Sync now"}
            </Button>
            <Button variant="danger" onClick={disableSync}>
              Turn off
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <Field
            label="Sync key"
            hint="The key set on the server. Anyone with it can read and write your data, so treat it like a password."
            error={sync.state === "error" ? sync.message : undefined}
          >
            <TextInput
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste your sync key"
              autoComplete="off"
            />
          </Field>
          <Button type="submit" variant="primary" full disabled={!key.trim() || busy}>
            {busy ? "Connecting…" : "Turn on sync"}
          </Button>
        </form>
      )}
    </Card>
  );
};

const ChoiceCard = ({
  title,
  summary,
  detail,
  onClick,
}: {
  title: string;
  summary: DataSummary;
  detail: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="rounded-xl border border-border bg-surface-2 p-3 text-left transition-colors hover:border-brand"
  >
    <span className="block font-medium">{title}</span>
    <span className="tabular mt-1 block text-sm text-muted">
      {summary.entries} food entries · {summary.sessions} sessions · {summary.metrics}{" "}
      weigh-ins
    </span>
    <span className="mt-0.5 block text-xs text-faint">
      {summary.updatedAt
        ? `Last changed ${new Date(summary.updatedAt).toLocaleString()}. `
        : ""}
      {detail}
    </span>
  </button>
);
