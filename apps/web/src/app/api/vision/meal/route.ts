import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { FOODS, matchFoodByName, nutrientsFor } from "@fitme/core";

/**
 * Photo meal analysis.
 *
 * The model is used for what it is uniquely good at — recognising what is on
 * the plate and estimating how much of it there is — and *not* trusted for
 * nutrition composition. Every identified item is matched against the food
 * catalog first; when it matches, the macros come from real composition data
 * scaled to the estimated portion. The model's own macro estimate is only used
 * for items the catalog does not know about.
 *
 * That split matters: portion size is a judgement call a vision model can make
 * from a picture, while "how much protein is in 100 g of chicken breast" is a
 * lookup that should never be a guess.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

/** ~8 MB of base64 ≈ a 6 MB image. The client downsizes well below this. */
const MAX_BASE64_LENGTH = 8_000_000;

const MealItemSchema = z.object({
  name: z
    .string()
    .describe(
      "Common name of the food, as generic as possible so it can be matched against a food database — e.g. 'chicken breast', not 'Nando's peri-peri chicken'.",
    ),
  description: z
    .string()
    .describe("What you can see that identifies this item and its portion size."),
  estimatedGrams: z
    .number()
    .describe("Estimated edible weight in grams, using visible references for scale."),
  confidence: z
    .number()
    .describe("0 to 1. How confident you are in the identification and the portion."),
  kcal: z.number().describe("Estimated calories for the whole portion."),
  protein: z.number().describe("Estimated grams of protein for the whole portion."),
  carbs: z.number().describe("Estimated grams of carbohydrate for the whole portion."),
  fat: z.number().describe("Estimated grams of fat for the whole portion."),
});

const MealAnalysisSchema = z.object({
  isFood: z.boolean().describe("False if the image does not show food."),
  mealDescription: z.string().describe("One short sentence describing the meal."),
  items: z.array(MealItemSchema),
  assumptions: z
    .array(z.string())
    .describe(
      "Anything you had to assume — cooking method, hidden oil, sauces, what is under the visible layer.",
    ),
  overallConfidence: z.number().describe("0 to 1 for the estimate as a whole."),
});

const SYSTEM_PROMPT = `You are estimating the nutritional content of a meal from a photograph, for someone tracking their intake.

How to approach it:
- Identify each distinct food component separately. A burger and chips is two items, not one.
- Name each item in generic supermarket terms so it can be matched to a food database. Prefer "chicken breast" over "grilled chicken supreme".
- Estimate the edible portion weight in grams. Use whatever is in frame for scale: cutlery, plate diameter (a dinner plate is typically 26-28 cm), hands, cans, standard glassware.
- Account for what you cannot see. Cooking oil, butter, dressings and sauces are the single largest source of underestimation in food photos — if a dish looks fried, sautéed or dressed, include that fat and say so in your assumptions.
- Do not forget drinks in frame if they carry calories.
- Be honest in your confidence scores. A clearly lit, single-item plate deserves high confidence; a mixed stew in a bowl does not, because the composition is hidden.
- Where a portion is genuinely ambiguous, estimate the middle of the plausible range rather than the flattering end.

If the image does not show food, set isFood to false and return no items.`;

interface ResolvedItem {
  name: string;
  description: string;
  grams: number;
  confidence: number;
  nutrients: { kcal: number; protein: number; carbs: number; fat: number; fiber?: number };
  /** Where the macros came from — shown in the UI so estimates are labelled. */
  basis: "catalog" | "estimate";
  matchedFoodId?: string;
  matchedFoodName?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Photo logging needs an Anthropic API key. Add ANTHROPIC_API_KEY to your environment and restart the server. Everything else in FitMe works without it.",
      },
      { status: 503 },
    );
  }

  let body: { imageBase64?: string; mediaType?: string; hint?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Could not read the request." },
      { status: 400 },
    );
  }

  const { imageBase64, mediaType, hint } = body;
  if (!imageBase64) {
    return NextResponse.json(
      { error: "bad_request", message: "No image was supplied." },
      { status: 400 },
    );
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json(
      { error: "too_large", message: "That image is too large. Try again with a smaller photo." },
      { status: 413 },
    );
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
  type AllowedType = (typeof allowedTypes)[number];
  const resolvedType: AllowedType = allowedTypes.includes(mediaType as AllowedType)
    ? (mediaType as AllowedType)
    : "image/jpeg";

  const client = new Anthropic();

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(MealAnalysisSchema),
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: resolvedType, data: imageBase64 },
            },
            {
              type: "text",
              text: hint?.trim()
                ? `Analyse this meal. The person adds: "${hint.trim()}"`
                : "Analyse this meal.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        {
          error: "declined",
          message: "That image could not be analysed. You can still log the meal manually.",
        },
        { status: 422 },
      );
    }

    const analysis = response.parsed_output;
    if (!analysis) {
      return NextResponse.json(
        {
          error: "unparseable",
          message: "The analysis came back in an unexpected shape. Try another photo.",
        },
        { status: 502 },
      );
    }

    if (!analysis.isFood || analysis.items.length === 0) {
      return NextResponse.json(
        {
          error: "no_food",
          message:
            analysis.mealDescription ||
            "No food was recognised in that photo. Try a clearer shot from above.",
        },
        { status: 422 },
      );
    }

    // Ground every item against the catalog. A match replaces the model's macro
    // guess with real composition data at the estimated portion size.
    const items: ResolvedItem[] = analysis.items.map((item) => {
      const grams = Math.max(1, Math.round(item.estimatedGrams));
      const match = matchFoodByName(FOODS, item.name);

      if (match) {
        return {
          name: match.name,
          description: item.description,
          grams,
          confidence: clamp01(item.confidence),
          nutrients: nutrientsFor(match, grams),
          basis: "catalog",
          matchedFoodId: match.id,
          matchedFoodName: match.name,
        };
      }

      return {
        name: item.name,
        description: item.description,
        grams,
        confidence: clamp01(item.confidence) * 0.85, // unverified composition
        nutrients: {
          kcal: Math.round(item.kcal),
          protein: round1(item.protein),
          carbs: round1(item.carbs),
          fat: round1(item.fat),
        },
        basis: "estimate",
      };
    });

    return NextResponse.json({
      mealDescription: analysis.mealDescription,
      items,
      assumptions: analysis.assumptions,
      overallConfidence: clamp01(analysis.overallConfidence),
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
        { error: "rate_limited", message: "Rate limited. Give it a moment and try again." },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "upstream", message: `Analysis failed (${error.status}).` },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: "unknown", message: "Analysis failed. You can still log the meal manually." },
      { status: 500 },
    );
  }
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;

const round1 = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
