"use client";

import { useEffect, useRef, useState } from "react";
import type { Food, MealType, MemoryFact, RawFoodItem, UnresolvedItem } from "@fitme/core";
import {
  createFact,
  groundItems,
  looksPortuguese,
  matchFoodByName,
  memoryBriefing,
  parseMeal,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import {
  ItemReview,
  type ReviewRow,
  reviewTotals,
  rowsToEntries,
  toReviewRows,
} from "./ItemReview";
import { Badge, Button, Sheet, TextInput } from "@/components/ui";
import { CustomFoodForm } from "./AddFoodSheet";
import { SparkIcon } from "@/components/icons";

/**
 * Logging by describing.
 *
 * Typing "two eggs, toast with butter and a coffee" is faster than four
 * searches, and it is how people actually think about a meal. What makes it
 * work over time is memory: teach it once what your words mean and the same
 * sentence resolves to exact foods rather than estimates.
 */

interface ProposedFact {
  kind: MemoryFact["kind"];
  trigger?: string;
  statement: string;
  foodName?: string;
  defaultGrams?: number;
}

interface ParseResult {
  intent: "log" | "remember" | "both" | "clarify" | "chat";
  reply: string;
  items: RawFoodItem[];
  facts: ProposedFact[];
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLES = [
  "Two scrambled eggs, two slices of toast with butter, and a coffee",
  "A chicken salad with olive oil, and an apple",
  "Whenever I say milk, it's Oatly Barista — usually 250 ml",
];

/**
 * The confirmation for a locally parsed message, in the language it was written
 * in. The model-backed path is told to do the same; this is the offline half of
 * the same promise.
 */
const localReply = (message: string, names: string[]): string => {
  const pt = looksPortuguese(message);
  if (names.length === 0) {
    return pt ? "Fica registado. Vou aplicar isso a partir de agora." : "Noted. I will apply that from now on.";
  }
  const list = names.join(", ");
  return pt
    ? `Registei — ${list}. Ajusta as porções abaixo se estiverem erradas.`
    : `Got it — ${list}. Adjust the portions below if they are off.`;
};

/** As above, for the half-understood case when the model was unreachable. */
const partialReply = (message: string, names: string[], unresolved: string[]): string =>
  looksPortuguese(message)
    ? `Consegui ${names.join(", ")} aqui no telemóvel. Não percebi ${unresolved.join(", ")}.`
    : `I worked out ${names.join(", ")} on this device. I could not place ${unresolved.join(", ")}.`;

export const ChatLogSheet = ({
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
  const { foods, data, addEntries, addCustomFood, rememberFacts, markFactsUsed } = useApp();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [learned, setLearned] = useState<MemoryFact[]>([]);
  const [localOnly, setLocalOnly] = useState(false);
  /** Fragments no database could place — each one offers to become a food. */
  const [unresolved, setUnresolved] = useState<UnresolvedItem[]>([]);
  const [creating, setCreating] = useState<UnresolvedItem | null>(null);
  /** Kept so adding a food can re-read the original sentence. */
  const [lastMessage, setLastMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setTurns([]);
    setInput("");
    setError("");
    setRows([]);
    setLearned([]);
    setUnresolved([]);
    setCreating(null);
    setLastMessage("");
  }, [open]);

  /**
   * A food was just created from something we could not place. Re-read the
   * original sentence with it in scope rather than asking them to retype it —
   * the portion they wrote ("20g") is in that sentence and should survive.
   */
  const adoptNewFood = (food: Food): void => {
    addCustomFood(food);
    setCreating(null);

    const reparsed = parseMeal(lastMessage, {
      foods: [...foods, food],
      memory: data.memory,
    });
    setRows(toReviewRows(reparsed.items));
    setUnresolved(reparsed.unresolved);
    setLocalOnly(true);
    setError("");
    setTurns((current) => [
      ...current,
      {
        role: "assistant",
        content: looksPortuguese(lastMessage)
          ? `Guardei ${food.name}. Da próxima vez fica logo reconhecido.`
          : `Saved ${food.name}. It will be recognised from now on.`,
      },
    ]);
  };

  const send = async (text: string): Promise<void> => {
    const message = text.trim();
    if (!message || busy) return;

    const next: Turn[] = [...turns, { role: "user", content: message }];
    setTurns(next);
    setInput("");
    setBusy(true);
    setError("");
    setLastMessage(message);
    setUnresolved([]);
    setCreating(null);

    /*
     * Try to understand it here first.
     *
     * "Two eggs, toast with butter and a coffee" is a quantity, a unit and a
     * food name three times over — no model required. Parsing that on the
     * device makes the common case free, instant and available with no network
     * at all; the model is only worth the round trip for what this cannot
     * resolve. It reads Portuguese as well as English.
     *
     * Only the opening message, though. A follow-up is a correction as often as
     * an addition — "na verdade era meio abacate" against "e um abacate" — and
     * telling those apart needs the conversation, which is what the model has
     * and this does not. Portions are editable in the review list below
     * regardless, so nothing depends on getting a follow-up through.
     */
    const local =
      turns.length === 0
        ? parseMeal(message, { foods, memory: data.memory })
        : null;
    if (local?.confident) {
      const facts = local.facts.map((fact) => {
        const match = fact.foodName ? matchFoodByName(foods, fact.foodName, 300) : null;
        return createFact({
          kind: fact.kind,
          trigger: fact.trigger,
          text: fact.statement,
          foodId: match?.id,
          defaultGrams: fact.defaultGrams,
        });
      });
      if (facts.length > 0) {
        rememberFacts(facts);
        setLearned((current) => [...current, ...facts]);
      }
      if (local.items.length > 0) {
        setRows(toReviewRows(local.items));
        markFactsUsed(local.items.map((i) => i.factId).filter((id): id is string => !!id));
      }
      setTurns([
        ...next,
        {
          role: "assistant",
          content: localReply(message, local.items.map((i) => i.name.toLowerCase())),
        },
      ]);
      setUnresolved([]);
      setLocalOnly(true);
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/chat/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, memory: memoryBriefing(data.memory) }),
      });
      const json = (await response.json()) as ParseResult & { message?: string };

      if (!response.ok) {
        // No model available: keep whatever was understood locally rather than
        // throwing the whole message away.
        if (local && local.items.length > 0) {
          setRows(toReviewRows(local.items));
          setTurns([
            ...next,
            {
              role: "assistant",
              content: partialReply(
                message,
                local.items.map((i) => i.name.toLowerCase()),
                local.unresolved.map((u) => u.fragment),
              ),
            },
          ]);
          setUnresolved(local.unresolved);
          setLocalOnly(true);
          return;
        }
        // Nothing was understood and the model is unreachable. The message is
        // still worth something: offer to turn what it named into a food, which
        // fixes this sentence and every future one containing it.
        if (local && local.unresolved.length > 0) setUnresolved(local.unresolved);
        setError(json.message ?? "That didn't go through.");
        return;
      }
      setLocalOnly(false);
      setUnresolved([]);

      setTurns([...next, { role: "assistant", content: json.reply }]);

      // Ground against the user's own data. The API deliberately does not do
      // this — their foods and their memory never leave the device.
      if (json.items.length > 0) {
        const grounded = groundItems(json.items, { foods, memory: data.memory });
        setRows(toReviewRows(grounded));
        markFactsUsed(grounded.map((g) => g.factId).filter((id): id is string => !!id));
      }

      // Anything they taught gets stored, with a link to a real food where the
      // name matches something they already have.
      if (json.facts.length > 0) {
        const facts = json.facts.map((fact) => {
          const match = fact.foodName ? matchFoodByName(foods, fact.foodName, 300) : null;
          return createFact({
            kind: fact.kind,
            trigger: fact.trigger,
            text: fact.statement,
            foodId: match?.id,
            defaultGrams: fact.defaultGrams,
          });
        });
        rememberFacts(facts);
        setLearned((current) => [...current, ...facts]);
      }
    } catch {
      setError("Lost the connection. Try again.");
    } finally {
      setBusy(false);
      requestAnimationFrame(() =>
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      );
    }
  };

  const totals = reviewTotals(rows);
  const includedCount = rows.filter((r) => r.include).length;

  const commit = (): void => {
    addEntries(rowsToEntries(rows, { meal, date, foods, source: "chat" }));
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Describe your meal"
      footer={
        rows.length > 0 ? (
          <Button variant="primary" size="lg" full disabled={includedCount === 0} onClick={commit}>
            Log {includedCount} {includedCount === 1 ? "item" : "items"} ·{" "}
            {Math.round(totals.kcal)} kcal
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {turns.length === 0 && (
          <div className="rounded-xl border border-border p-4">
            <div className="mb-2 flex items-center gap-2">
              <SparkIcon className="h-5 w-5 text-brand" />
              <h3 className="font-semibold">Just say what you ate</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              Type it the way you would tell a person. You can also teach it what your words
              mean, and it will apply that every time from then on.
            </p>
            <div className="mt-3 space-y-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void send(example)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-left text-sm text-muted hover:border-faint hover:text-text"
                >
                  “{example}”
                </button>
              ))}
            </div>
            {data.memory.length > 0 && (
              <p className="mt-3 border-t border-border pt-3 text-xs text-faint">
                It already remembers {data.memory.length}{" "}
                {data.memory.length === 1 ? "thing" : "things"} about how you eat.
              </p>
            )}
          </div>
        )}

        {turns.map((turn, i) => (
          <div
            key={i}
            className={
              turn.role === "user"
                ? "ml-8 rounded-[16px] rounded-br-sm bg-brand/15 p-3 text-[15px]"
                : "mr-4 rounded-[16px] rounded-bl-sm border border-border bg-surface p-3 text-[15px] leading-relaxed"
            }
          >
            {turn.content}
          </div>
        ))}

        {busy && (
          <div className="mr-4 flex gap-1 rounded-[16px] border border-border bg-surface p-4">
            {[0, 1, 2].map((d) => (
              <span
                key={d}
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint"
                style={{ animationDelay: `${d * 150}ms` }}
              />
            ))}
          </div>
        )}

        {learned.length > 0 && (
          <div className="rounded-xl border border-brand/40 bg-brand/10 p-3">
            <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand">
              Remembered
            </p>
            <ul className="space-y-1 text-sm leading-relaxed">
              {learned.map((fact) => (
                <li key={fact.id} className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">{fact.text}</span>
                  {!fact.foodId && fact.kind === "alias" && (
                    <Badge tone="warn">No food linked</Badge>
                  )}
                </li>
              ))}
            </ul>
            {learned.some((f) => f.kind === "alias" && !f.foodId) && (
              <p className="mt-2 text-xs leading-relaxed text-muted">
                That product isn&apos;t in your foods yet, so its macros will still be
                estimated. Add it once under &ldquo;New food&rdquo; and every future mention
                becomes exact.
              </p>
            )}
          </div>
        )}

        {creating ? (
          <div className="rounded-xl border border-border p-3">
            <p className="mb-3 text-sm leading-relaxed text-muted">
              Add <span className="font-medium text-fg">{creating.name}</span> once and it is
              yours from then on — recognised instantly, offline, with your numbers rather
              than an estimate. Copy them off the label.
            </p>
            <CustomFoodForm
              initialName={creating.name}
              onCancel={() => setCreating(null)}
              onCreate={adoptNewFood}
            />
          </div>
        ) : (
          unresolved.length > 0 && (
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-faint">
                Not in your foods yet
              </p>
              <ul className="mt-2 space-y-2">
                {unresolved.map((item) => (
                  <li key={item.fragment} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">{item.fragment}</span>
                    <Button size="sm" onClick={() => setCreating(item)}>
                      Add as a food
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )
        )}

        {rows.length > 0 && (
          <>
            {localOnly && (
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-faint">
                Worked out on this device — no network, no cost.
              </p>
            )}
            <ItemReview rows={rows} foods={foods} onChange={setRows} />
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted">Total</span>
                <span className="tabular text-xl font-semibold">
                  {Math.round(totals.kcal)} kcal
                </span>
              </div>
              <p className="tabular mt-1 text-xs text-faint">
                P {Math.round(totals.protein)} g · C {Math.round(totals.carbs)} g · F{" "}
                {Math.round(totals.fat)} g
              </p>
            </div>
          </>
        )}

        {error && (
          <p className="rounded-lg bg-danger/10 p-3 text-sm leading-relaxed text-danger">
            {error}
          </p>
        )}

        <div ref={bottomRef} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="sticky bottom-0 flex gap-2 bg-surface pt-1"
        >
          <TextInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              rows.length > 0 ? "Correct it, or add more…" : "What did you eat? / O que comeste?"
            }
            enterKeyHint="send"
            disabled={busy}
            autoComplete="off"
          />
          <Button type="submit" variant="primary" disabled={busy || !input.trim()}>
            Send
          </Button>
        </form>
      </div>
    </Sheet>
  );
};
