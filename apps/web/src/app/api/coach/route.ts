import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

/**
 * Coach Q&A.
 *
 * The deterministic coach in `@fitme/core` does the analysis; this endpoint
 * exists so the user can *ask about it* in their own words. The client sends a
 * briefing built from the user's real logged data, so answers are grounded in
 * what actually happened rather than in generic advice.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BRIEFING_CHARS = 12_000;
const MAX_MESSAGES = 24;

const SYSTEM_PROMPT = `You are the coach inside FitMe, a training and nutrition app. You act as both a strength coach and a nutritionist for one specific person, whose real logged data is given below.

How to answer:
- Ground every answer in their data. Cite their actual numbers — their trend weight, their average intake, their sets per muscle, their lifts. Generic advice they could have got from a search engine is a failure.
- Lead with the answer. One or two sentences of direct response, then the reasoning, then the concrete change to make. No preamble.
- Be specific and actionable. "Add 20 g of protein at breakfast" beats "increase protein". Give numbers, weights, and portions.
- Explain the mechanism briefly when it helps them make the next decision themselves. Do not lecture.
- Be honest about uncertainty. If their logging is patchy, say the data cannot support a confident answer and say what to log.
- Push back when they ask for something counterproductive — crash deficits, training through a stalled lift, cutting protein. Say why, then offer the version that works.
- Keep it short. A few short paragraphs at most. This is read on a phone, often between sets.

Boundaries:
- You are not a doctor. For pain beyond ordinary muscle soreness, disordered eating, pregnancy, or managing a medical condition, say plainly that this needs a professional and stop giving programming advice on it.
- Do not invent data you were not given. If you need a number they have not logged, ask for it.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Asking the coach questions needs an Anthropic API key. Set ANTHROPIC_API_KEY and restart. The insights and programme on this page are computed locally and work without it.",
      },
      { status: 503 },
    );
  }

  let body: { messages?: ChatMessage[]; briefing?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Could not read the request." },
      { status: 400 },
    );
  }

  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content?.trim())
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return NextResponse.json(
      { error: "bad_request", message: "No question was asked." },
      { status: 400 },
    );
  }

  const briefing = (body.briefing ?? "").slice(0, MAX_BRIEFING_CHARS);
  const client = new Anthropic();

  try {
    const stream = client.messages.stream({
      model: "claude-opus-5",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: [
        // The persona is stable across every request, so it sits in front of
        // the volatile briefing and can be cached.
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        {
          type: "text",
          text: `Here is this person's current data.\n\n${briefing}`,
        },
      ],
      messages,
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          const final = await stream.finalMessage();
          if (final.stop_reason === "refusal") {
            controller.enqueue(
              encoder.encode(
                "\n\nI can't help with that one. If it's about pain, disordered eating, or a medical condition, please speak to a doctor.",
              ),
            );
          }
          controller.close();
        } catch {
          controller.enqueue(
            encoder.encode("\n\n(The answer was cut short — try asking again.)"),
          );
          controller.close();
        }
      },
      cancel() {
        stream.abort();
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "auth", message: "The Anthropic API key was rejected." },
        { status: 502 },
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "rate_limited", message: "Rate limited. Try again shortly." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "unknown", message: "The coach could not be reached." },
      { status: 502 },
    );
  }
}
