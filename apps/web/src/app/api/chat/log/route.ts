import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Conversational meal logging.
 *
 * This endpoint does one job: turn a sentence into structured items. It
 * deliberately does *not* look up nutrition — the user's own foods and their
 * remembered facts live on the device, so grounding happens client-side where
 * all of it is available (see `grounding.ts` in @fitme/core).
 *
 * It also recognises when the user is teaching rather than logging. "Whenever I
 * say milk it's Oatly Barista" is not a meal; it is a fact that should make
 * every future message cheaper to write.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGES = 20;
const MAX_MEMORY_CHARS = 6000;

const ItemSchema = z.object({
  name: z
    .string()
    .describe(
      "Generic name of the food, suitable for a database lookup. If a remembered fact names a specific product, use that product's name.",
    ),
  description: z.string().describe("Short note on the portion and how it was prepared."),
  grams: z
    .number()
    .describe(
      "Edible weight in grams (millilitres for liquids). Convert household measures yourself.",
    ),
  confidence: z.number().describe("0 to 1."),
  kcal: z.number().describe("Estimated calories for the whole portion."),
  protein: z.number().describe("Grams of protein for the whole portion."),
  carbs: z.number().describe("Grams of carbohydrate for the whole portion."),
  fat: z.number().describe("Grams of fat for the whole portion."),
});

const FactSchema = z.object({
  kind: z
    .enum(["alias", "preference", "routine"])
    .describe(
      "alias: a word of theirs always means a specific food. routine: a recurring meal. preference: a standing dietary fact.",
    ),
  trigger: z
    .string()
    .describe("For an alias, the exact word or phrase they use. Empty otherwise."),
  statement: z
    .string()
    .describe("The fact in one plain sentence, written so it reads back naturally."),
  foodName: z
    .string()
    .describe("The specific food this refers to, if there is one. Empty otherwise."),
  defaultGrams: z
    .number()
    .describe("Portion to assume when they do not say. 0 if not implied."),
});

const ResultSchema = z.object({
  intent: z
    .enum(["log", "remember", "both", "clarify", "chat"])
    .describe("What the message was actually asking for."),
  reply: z
    .string()
    .describe("One or two short sentences back to them. Conversational, no preamble."),
  items: z.array(ItemSchema),
  facts: z.array(FactSchema),
});

const SYSTEM_PROMPT = `You turn what someone says about their food into structured entries for a nutrition tracker, and you remember the things they teach you.

Deciding what they meant:
- A description of something eaten -> intent "log", with one item per distinct food. "Chicken and rice" is two items.
- Teaching you something ("whenever I say X...", "my usual breakfast is...", "I don't eat X") -> intent "remember", with one fact per thing taught.
- Both at once -> "both".
- Genuinely ambiguous, where guessing would put a materially wrong number in their diary -> "clarify", with the question in your reply and no items.
- A question or a remark that is neither -> "chat".

Estimating portions:
- Convert everything to grams; use millilitres as grams for liquids.
- Household measures: a slice of bread ~38 g, a large egg ~50 g, a tablespoon of oil ~13 g, a mug of coffee ~240 ml, a pint ~568 ml, a handful of nuts ~28 g, a medium banana ~118 g, a chicken breast ~170 g.
- When they give no quantity, assume one ordinary serving and say so in the description. Do not refuse to estimate — a rough entry logged beats a missing one.
- Include cooking fat when a dish was fried or sautéed, and say so in the description. It is the most commonly missed source of calories.

Using what you remember:
- The facts below were taught by this person. Apply them silently — if they have told you "milk" means a specific oat drink, output that product's name, and use their usual portion when they do not give one.
- Only propose a new fact when they are actually teaching you something durable. Do not turn a one-off meal into a rule.

Follow-ups refer to the previous message: "make that two" doubles what you just returned; "actually it was semi-skimmed" corrects it. Re-output the full corrected item list.

Language: they may write in English or Portuguese, and may switch mid-sentence. Always reply in the language they used. Food names go in the "name" field in whichever language they said them — the app's database is indexed in both, so do not translate.

Keep your reply short — one or two sentences. Confirm what you logged in their own terms. No preamble, no bullet lists.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Describing meals in words needs an Anthropic API key. Set ANTHROPIC_API_KEY and restart. Search and manual entry work without it.",
      },
      { status: 503 },
    );
  }

  let body: { messages?: ChatMessage[]; memory?: string };
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
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));

  if (messages.length === 0 || messages[messages.length - 1]!.role !== "user") {
    return NextResponse.json(
      { error: "bad_request", message: "Nothing to log." },
      { status: 400 },
    );
  }

  const memory = (body.memory ?? "").slice(0, MAX_MEMORY_CHARS);
  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: process.env.FITME_PARSE_MODEL ?? "claude-opus-5",
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: {
        effort: (process.env.FITME_PARSE_EFFORT as "low" | "medium" | "high") ?? "low",
        format: zodOutputFormat(ResultSchema),
      },
      system: [
        // Stable across every message, so it can be cached ahead of the
        // volatile memory block.
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        {
          type: "text",
          text: memory
            ? `Things this person has taught you:\n${memory}`
            : "This person has not taught you anything yet.",
        },
      ],
      messages,
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "declined", message: "I couldn't process that one. Try logging it manually." },
        { status: 422 },
      );
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      return NextResponse.json(
        { error: "unparseable", message: "That came back in an unexpected shape. Try rephrasing." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      intent: parsed.intent,
      reply: parsed.reply,
      items: parsed.items.map((item) => ({
        ...item,
        grams: Math.max(0, Math.round(item.grams)),
        confidence: clamp01(item.confidence),
      })),
      // Strip the empty-string placeholders the schema requires.
      facts: parsed.facts.map((fact) => ({
        kind: fact.kind,
        trigger: fact.trigger?.trim() || undefined,
        statement: fact.statement,
        foodName: fact.foodName?.trim() || undefined,
        defaultGrams: fact.defaultGrams > 0 ? Math.round(fact.defaultGrams) : undefined,
      })),
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
        { error: "rate_limited", message: "Rate limited. Give it a moment." },
        { status: 429 },
      );
    }
    // A bare "it didn't work" costs a round of guessing to diagnose. Say which
    // of the handful of things it actually was, and log the rest for the
    // deployment's own logs.
    if (error instanceof Anthropic.NotFoundError) {
      return NextResponse.json(
        {
          error: "no_model",
          message: `The model "${process.env.FITME_PARSE_MODEL ?? "claude-opus-5"}" is not available to this API key. Set FITME_PARSE_MODEL to one that is.`,
        },
        { status: 502 },
      );
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
      return NextResponse.json(
        { error: "forbidden", message: "The API key does not have access to this model." },
        { status: 502 },
      );
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return NextResponse.json(
        { error: "unreachable", message: "Could not reach the Anthropic API. Check the connection and try again." },
        { status: 502 },
      );
    }
    console.error("chat/log failed", error);
    return NextResponse.json(
      {
        error: "unknown",
        message:
          error instanceof Anthropic.APIError
            ? `The model call failed (${error.status ?? "no status"}). You can still log it manually.`
            : "That didn't go through. You can still log it manually.",
      },
      { status: 502 },
    );
  }
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
