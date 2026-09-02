"use client";

import { useMemo, useState } from "react";
import type { MemoryFact, MemoryKind } from "@fitme/core";
import { createFact, matchFoodByName, normalizeTrigger } from "@fitme/core";
import { useApp } from "@/lib/state";
import {
  Badge,
  Button,
  Card,
  Field,
  NumberInput,
  Segmented,
  Sheet,
  TextInput,
} from "@/components/ui";
import { PlusIcon, TrashIcon } from "@/components/icons";

/**
 * What the app has learned.
 *
 * A memory the user cannot inspect or correct is a liability: a wrong fact
 * silently distorts every future entry, and they would have no way to find out
 * why their numbers drifted. So everything taught is listed here in plain
 * language, editable and deletable.
 */

const KIND_LABEL: Record<MemoryKind, string> = {
  alias: "What your words mean",
  routine: "Your usual meals",
  preference: "Standing facts",
};

const KIND_ORDER: MemoryKind[] = ["alias", "routine", "preference"];

export const MemoryPanel = () => {
  const { data, foods, updateFact, forgetFact, rememberFacts } = useApp();
  const [editing, setEditing] = useState<MemoryFact | null>(null);
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => {
    const out = new Map<MemoryKind, MemoryFact[]>();
    for (const kind of KIND_ORDER) {
      const facts = data.memory
        .filter((f) => f.kind === kind)
        .sort((a, b) => b.usageCount - a.usageCount);
      if (facts.length) out.set(kind, facts);
    }
    return out;
  }, [data.memory]);

  const foodName = (id?: string): string | undefined =>
    id ? foods.find((f) => f.id === id)?.name : undefined;

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">What FitMe remembers</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Facts you have taught it, applied every time you describe or photograph a
              meal. Teach it new ones just by saying so in the Describe box.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            aria-label="Add something to remember"
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>

        {data.memory.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
            Nothing yet. Try telling it{" "}
            <span className="text-text">“whenever I say milk, it&apos;s Oatly Barista”</span>{" "}
            in the Describe box.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {[...grouped.entries()].map(([kind, facts]) => (
              <div key={kind}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
                  {KIND_LABEL[kind]}
                </p>
                <ul className="divide-y divide-border">
                  {facts.map((fact) => (
                    <li key={fact.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(fact)}
                        className="w-full py-3 text-left"
                      >
                        <span className="block text-sm leading-relaxed">{fact.text}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          {fact.foodId ? (
                            <Badge tone="brand">{foodName(fact.foodId) ?? "Linked"}</Badge>
                          ) : fact.kind === "alias" ? (
                            <Badge tone="warn">Estimated — no food linked</Badge>
                          ) : null}
                          {fact.defaultGrams ? (
                            <span className="text-xs text-faint">
                              default {fact.defaultGrams} g
                            </span>
                          ) : null}
                          {fact.usageCount > 0 && (
                            <span className="text-xs text-faint">
                              used {fact.usageCount}×
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <FactSheet
        fact={editing}
        open={!!editing}
        onClose={() => setEditing(null)}
        onSave={(fact) => {
          updateFact(fact);
          setEditing(null);
        }}
        onDelete={(id) => {
          forgetFact(id);
          setEditing(null);
        }}
      />

      <FactSheet
        fact={null}
        open={adding}
        onClose={() => setAdding(false)}
        onSave={(fact) => {
          const linked = fact.foodId
            ? fact
            : { ...fact, foodId: matchFoodByName(foods, fact.text, 500)?.id };
          rememberFacts([linked]);
          setAdding(false);
        }}
      />
    </>
  );
};

const FactSheet = ({
  fact,
  open,
  onClose,
  onSave,
  onDelete,
}: {
  fact: MemoryFact | null;
  open: boolean;
  onClose: () => void;
  onSave: (fact: MemoryFact) => void;
  onDelete?: (id: string) => void;
}) => {
  const { foods } = useApp();
  const [kind, setKind] = useState<MemoryKind>(fact?.kind ?? "alias");
  const [trigger, setTrigger] = useState(fact?.trigger ?? "");
  const [text, setText] = useState(fact?.text ?? "");
  const [foodQuery, setFoodQuery] = useState("");
  const [foodId, setFoodId] = useState(fact?.foodId ?? "");
  const [defaultGrams, setDefaultGrams] = useState(fact?.defaultGrams ?? 0);
  const [trackedId, setTrackedId] = useState(fact?.id);

  // Reset the draft when a different fact is opened.
  if (open && fact && fact.id !== trackedId) {
    setTrackedId(fact.id);
    setKind(fact.kind);
    setTrigger(fact.trigger ?? "");
    setText(fact.text);
    setFoodId(fact.foodId ?? "");
    setDefaultGrams(fact.defaultGrams ?? 0);
    setFoodQuery("");
  }

  const matches = useMemo(() => {
    const q = foodQuery.trim();
    if (q.length < 2) return [];
    return foods
      .filter((f) => f.name.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 6);
  }, [foodQuery, foods]);

  const linked = foods.find((f) => f.id === foodId);

  const save = (): void => {
    const base = fact ?? createFact({ kind, text });
    onSave({
      ...base,
      kind,
      trigger: kind === "alias" ? normalizeTrigger(trigger) : undefined,
      text: text.trim(),
      foodId: foodId || undefined,
      defaultGrams: defaultGrams > 0 ? defaultGrams : undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={fact ? "Edit what it remembers" : "Teach it something"}
      footer={
        <div className={fact && onDelete ? "grid grid-cols-[auto_1fr] gap-2" : ""}>
          {fact && onDelete && (
            <Button variant="danger" onClick={() => onDelete(fact.id)} aria-label="Forget this">
              <TrashIcon className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="primary"
            full={!fact}
            disabled={!text.trim() || (kind === "alias" && !trigger.trim())}
            onClick={save}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Kind">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "alias", label: "Word" },
              { value: "routine", label: "Meal" },
              { value: "preference", label: "Fact" },
            ]}
          />
        </Field>

        {kind === "alias" && (
          <Field
            label="The word you use"
            hint="Matched as a whole word, so “milk” will not fire on “milkshake”."
          >
            <TextInput
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              placeholder="milk"
              autoComplete="off"
            />
          </Field>
        )}

        <Field
          label="What it means"
          hint="Written as a sentence — this is what the coach and the parser read."
        >
          <TextInput
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Milk means Oatly Barista, usually 250 ml"
          />
        </Field>

        <Field
          label="Link it to a food"
          hint={
            linked
              ? "Linked — entries will use this food's exact nutrition."
              : "Optional, but a linked food is the difference between exact numbers and an estimate."
          }
        >
          {linked ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2.5">
              <span className="truncate text-sm">{linked.name}</span>
              <button
                type="button"
                onClick={() => setFoodId("")}
                className="shrink-0 text-xs text-muted hover:text-text"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <TextInput
                value={foodQuery}
                onChange={(e) => setFoodQuery(e.target.value)}
                placeholder="Search your foods…"
                type="search"
                autoComplete="off"
              />
              {matches.length > 0 && (
                <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
                  {matches.map((food) => (
                    <li key={food.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setFoodId(food.id);
                          setFoodQuery("");
                        }}
                        className="w-full px-3 py-2.5 text-left text-sm"
                      >
                        {food.name}
                        {food.brand && (
                          <span className="ml-2 text-xs text-faint">{food.brand}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Field>

        <Field label="Usual portion (g / ml)" hint="Used when you don't give an amount. 0 for none.">
          <NumberInput
            value={defaultGrams}
            min={0}
            step={10}
            onChange={(e) => setDefaultGrams(Math.max(0, Number(e.target.value)))}
          />
        </Field>
      </div>
    </Sheet>
  );
};
