"use client";

import { useMemo, useRef, useState } from "react";
import type { CoachContext, Insight } from "@fitme/core";
import {
  SPLIT_LABELS,
  buildCoachBriefing,
  generateProgram,
  sessionMinutes,
  toDateKey,
} from "@fitme/core";
import { useApp } from "@/lib/state";
import { RequireProfile } from "@/components/Guard";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  TextInput,
} from "@/components/ui";
import { SparkIcon } from "@/components/icons";

type Tab = "insights" | "plan" | "ask";

const SEVERITY_TONE: Record<Insight["severity"], "danger" | "warn" | "info" | "brand"> = {
  critical: "danger",
  warning: "warn",
  info: "info",
  success: "brand",
};

const SEVERITY_BORDER: Record<Insight["severity"], string> = {
  critical: "border-l-danger",
  warning: "border-l-warn",
  info: "border-l-info",
  success: "border-l-brand",
};

function Coach() {
  const { data, coach, targets, currentWeightKg, exerciseMap, setProgram } = useApp();
  const profile = data.profile!;
  const [tab, setTab] = useState<Tab>("insights");

  const briefing = useMemo(() => {
    const context: CoachContext = {
      profile,
      currentWeightKg: currentWeightKg ?? 75,
      targets,
      metrics: data.metrics,
      entries: data.entries,
      sessions: data.sessions,
      program: data.program ?? undefined,
      asOf: toDateKey(),
    };
    return buildCoachBriefing(coach, context);
  }, [profile, currentWeightKg, targets, data, coach]);

  return (
    <div>
      <PageHeader title="Coach" subtitle={coach.headline} />

      <div className="space-y-4 px-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "insights", label: "Insights" },
            { value: "plan", label: "Plan" },
            { value: "ask", label: "Ask" },
          ]}
        />

        {tab === "insights" && (
          <div className="space-y-3">
            {coach.insights.length === 0 ? (
              <EmptyState
                title="Nothing to flag"
                detail="Once you have a week or two of food and training logged, this page fills up with things worth acting on."
              />
            ) : (
              coach.insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} />
              ))
            )}
          </div>
        )}

        {tab === "plan" && (
          <div className="space-y-4">
            {data.program ? (
              <>
                <Card>
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-semibold">{data.program.name}</h2>
                    <Badge>{SPLIT_LABELS[data.program.split]}</Badge>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                    {data.program.rationale.map((line, i) => (
                      <li key={i}>· {line}</li>
                    ))}
                  </ul>
                </Card>

                {data.program.days.map((day) => (
                  <Card key={day.id}>
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-semibold">{day.name}</h3>
                      <span className="text-xs text-faint">
                        ~{sessionMinutes(day.blocks)} min
                      </span>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {day.blocks.map((block) => (
                        <li
                          key={block.exerciseId}
                          className="flex items-baseline justify-between gap-2 text-sm"
                        >
                          <span className="truncate">
                            {exerciseMap.get(block.exerciseId)?.name ?? block.exerciseId}
                          </span>
                          <span className="tabular shrink-0 text-muted">
                            {block.sets} × {block.repMin}–{block.repMax} @ RPE {block.rpe}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {day.conditioningMinutes && (
                      <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                        Finish with {day.conditioningMinutes} minutes of steady cardio.
                      </p>
                    )}
                  </Card>
                ))}

                <Button
                  full
                  onClick={() => setProgram(generateProgram(profile))}
                >
                  Rebuild the plan
                </Button>
                <p className="text-center text-xs leading-relaxed text-faint">
                  Rebuilding picks fresh exercise choices for your current goal, equipment
                  and schedule. Your logged history is untouched.
                </p>
              </>
            ) : (
              <EmptyState
                title="No plan yet"
                detail="Generate a training plan built around your goal, schedule and equipment."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setProgram(generateProgram(profile))}
                  >
                    Build my plan
                  </Button>
                }
              />
            )}
          </div>
        )}

        {tab === "ask" && <AskCoach briefing={briefing} />}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const InsightCard = ({ insight }: { insight: Insight }) => {
  const [showEvidence, setShowEvidence] = useState(false);
  const evidence = insight.evidence ? Object.entries(insight.evidence) : [];

  return (
    <Card className={`border-l-4 ${SEVERITY_BORDER[insight.severity]}`}>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[insight.severity]}>{insight.domain}</Badge>
      </div>
      <h3 className="font-semibold">{insight.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{insight.detail}</p>
      {insight.action && (
        <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm leading-relaxed">
          <span className="font-medium">Do this: </span>
          {insight.action}
        </p>
      )}
      {evidence.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            aria-expanded={showEvidence}
            className="mt-3 text-xs font-medium text-faint hover:text-muted"
          >
            {showEvidence ? "Hide" : "Show"} the numbers
          </button>
          {showEvidence && (
            <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2 text-xs">
              {evidence.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-faint">{humanise(key)}</dt>
                  <dd className="tabular font-medium">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </Card>
  );
};

const humanise = (key: string): string =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/Pct/g, "%")
    .trim();

/* -------------------------------------------------------------------------- */

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Why has my weight stalled?",
  "What should I eat to hit my protein target?",
  "Is my training volume right?",
  "Should I deload this week?",
];

const AskCoach = ({ briefing }: { briefing: string }) => {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = async (question: string): Promise<void> => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;

    const nextTurns: ChatTurn[] = [...turns, { role: "user", content: trimmed }];
    setTurns([...nextTurns, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextTurns, briefing }),
      });

      if (!response.ok || !response.body) {
        const json = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(json?.message ?? "The coach could not be reached.");
        setTurns(nextTurns);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setTurns([...nextTurns, { role: "assistant", content: answer }]);
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    } catch {
      setError("Lost the connection. Try again.");
      setTurns(nextTurns);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {turns.length === 0 && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <SparkIcon className="h-5 w-5 text-brand" />
            <h2 className="font-semibold">Ask about your own numbers</h2>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            The coach sees your logged food, weight trend, sessions and targets. Ask it
            anything about your training or diet and it will answer from your data rather
            than in generalities.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void send(suggestion)}
                className="rounded-full border border-border bg-surface-2 px-3 py-2 text-left text-sm text-muted hover:border-faint hover:text-text"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </Card>
      )}

      {turns.map((turn, i) => (
        <div
          key={i}
          className={
            turn.role === "user"
              ? "ml-8 rounded-[16px] rounded-br-sm bg-brand/15 p-3.5 text-[15px]"
              : "mr-4 rounded-[16px] rounded-bl-sm border border-border bg-surface p-4"
          }
        >
          {turn.role === "assistant" && turn.content === "" ? (
            <span className="flex gap-1" aria-label="Thinking">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint"
                  style={{ animationDelay: `${d * 150}ms` }}
                />
              ))}
            </span>
          ) : (
            <div className="space-y-2.5 whitespace-pre-wrap text-[15px] leading-relaxed">
              {turn.content}
            </div>
          )}
        </div>
      ))}

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
        className="sticky bottom-2 flex gap-2"
      >
        <TextInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your coach…"
          enterKeyHint="send"
          disabled={busy}
        />
        <Button type="submit" variant="primary" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
};

export default function CoachPage() {
  return (
    <RequireProfile>
      <Coach />
    </RequireProfile>
  );
}
