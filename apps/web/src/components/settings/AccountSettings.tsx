"use client";

import { useState } from "react";
import { useApp } from "@/lib/state";
import type { DataSummary } from "@/lib/sync";
import { Badge, Button, Card, Field, TextInput } from "@/components/ui";

/**
 * Signing in.
 *
 * Optional by design. Everything works signed out — the device holds the data
 * and always has. An account is what makes it *yours* rather than this
 * browser's: the same history on your phone, and a way back if you drop it.
 */
/**
 * Email and password, on its own so the setup screen can offer it too.
 *
 * Someone installing this on a second device should not have to answer five
 * questions about their height before they can reach the data that already
 * answers them.
 */
export const CredentialsForm = ({
  startWith = "in",
  onDone,
}: {
  startWith?: "in" | "up";
  onDone?: () => void;
}) => {
  const { signIn, signUp } = useApp();
  const [mode, setMode] = useState<"in" | "up">(startWith);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await (mode === "in" ? signIn : signUp)(email.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "That did not work.");
      return;
    }
    setPassword("");
    onDone?.();
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <Field label="Email">
        <TextInput
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          enterKeyHint="next"
          required
        />
      </Field>
      <Field label="Password" hint={mode === "up" ? "At least 10 characters." : undefined}>
        <TextInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete={mode === "up" ? "new-password" : "current-password"}
          enterKeyHint="go"
          required
        />
      </Field>

      {error && (
        <p className="rounded-lg bg-danger/10 p-3 text-sm leading-relaxed text-danger">{error}</p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "…" : mode === "in" ? "Sign in" : "Create account"}
        </Button>
        <Button
          type="button"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setError("");
          }}
        >
          {mode === "in" ? "Create one instead" : "I already have one"}
        </Button>
      </div>

      <p className="text-xs leading-relaxed text-faint">
        There is no password reset yet — losing the password means losing the account&apos;s
        copy, though the device keeps its own. Export a backup from &ldquo;Your data&rdquo; if
        that matters to you.
      </p>
    </form>
  );
};

export const AccountSettings = () => {
  const { account, sync, signOut, syncNow, resolveSyncChoice } = useApp();

  if (!account.available && account.known) {
    return (
      <Card>
        <h2 className="font-semibold">Account</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          This deployment has no database set up, so there are no accounts. Everything works
          and stays on this device. Set <code className="text-fg">DATABASE_URL</code> to turn
          accounts on.
        </p>
      </Card>
    );
  }

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
          <h2 className="font-semibold">Account</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {account.user
              ? "Your data is kept with your account, so it is on every device you sign in to."
              : "Sign in and your data follows you — the same history on your phone and your laptop, and a way back if you lose the device."}
          </p>
        </div>
        {account.user && (
          <Badge tone={tone}>
            {sync.state === "syncing" ? "Saving" : sync.state === "idle" ? "Synced" : sync.state}
          </Badge>
        )}
      </div>

      {sync.state === "choose" && sync.choice ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-lg bg-warn/10 p-3 text-sm leading-relaxed text-warn">
            This device and your account both have data in them. One has to replace the other
            — there is no merge. Pick the one you want to keep.
          </p>

          <div className="grid gap-2">
            <ChoiceCard
              title="Keep the account's copy"
              summary={sync.choice.remote}
              detail="Replaces everything on this device."
              onClick={() => void resolveSyncChoice("remote")}
            />
            <ChoiceCard
              title="Keep this device"
              summary={sync.choice.local}
              detail="Replaces what your account is holding."
              onClick={() => void resolveSyncChoice("local")}
            />
          </div>

          <p className="text-xs leading-relaxed text-faint">
            Not sure? Export a backup from &ldquo;Your data&rdquo; below first — then
            whichever you pick, nothing is gone for good.
          </p>
        </div>
      ) : account.user ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">
            Signed in as <span className="font-medium text-fg">{account.user.email}</span>
            {sync.lastSyncedAt && (
              <>
                {" · "}last saved {new Date(sync.lastSyncedAt).toLocaleTimeString()}
              </>
            )}
          </p>
          {sync.message && (
            <p className="rounded-lg bg-danger/10 p-3 text-sm leading-relaxed text-danger">
              {sync.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void syncNow()} disabled={sync.state === "syncing"}>
              Sync now
            </Button>
            <Button onClick={() => void signOut()}>Sign out</Button>
          </div>
          <p className="text-xs leading-relaxed text-faint">
            Signing out stops syncing. It does not erase anything from this device.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <CredentialsForm />
        </div>
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
    className="rounded-xl border border-border p-3 text-left transition-colors hover:border-faint active:bg-surface-2"
  >
    <span className="block font-medium">{title}</span>
    <span className="tabular mt-1 block text-sm text-muted">
      {summary.entries} food entries · {summary.sessions} workouts · {summary.metrics} weigh-ins
    </span>
    <span className="mt-0.5 block text-xs text-faint">
      {summary.updatedAt
        ? `Last changed ${new Date(summary.updatedAt).toLocaleString()}`
        : "Never changed"}
      {" · "}
      {detail}
    </span>
  </button>
);
