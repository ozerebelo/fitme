import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Reading a receipt.
 *
 * The same division of labour as the meal photo route: the model is used for
 * what it is genuinely good at — reading a crumpled thermal print in two
 * languages — and for nothing else. It returns what is printed on the paper;
 * the client is what turns that into a transaction, resolves the merchant to
 * one of your categories using your own rules, and shows you the whole thing
 * before anything is saved.
 *
 * Nothing here decides what a purchase means. The receipt says `CONT MODELO`
 * and the device knows that is where you buy groceries, because that is where
 * your rules live.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

/** ~8 MB of base64 ≈ a 6 MB image. The client downsizes well below this. */
const MAX_BASE64_LENGTH = 8_000_000;

const ReceiptItemSchema = z.object({
  name: z
    .string()
    .describe("The line as printed, tidied into a readable product name."),
  quantity: z.number().describe("Units bought. 1 when the line does not say."),
  unitPrice: z
    .number()
    .describe("Price per unit in the receipt's currency, as a decimal number."),
  total: z.number().describe("Line total in the receipt's currency."),
});

const ReceiptSchema = z.object({
  isReceipt: z.boolean().describe("False if the image is not a receipt or invoice."),
  merchant: z.string().describe("The shop's name, as printed. Empty if illegible."),
  date: z
    .string()
    .describe("The purchase date as YYYY-MM-DD. Empty string if it cannot be read."),
  currency: z
    .string()
    .describe("ISO 4217 code, e.g. EUR. Infer from the symbol or the country."),
  total: z.number().describe("The total actually paid, as printed."),
  items: z.array(ReceiptItemSchema),
  notes: z
    .array(z.string())
    .describe("Anything unreadable, ambiguous, or worth flagging about this receipt."),
  confidence: z.number().describe("0 to 1, for the reading as a whole."),
});

const SYSTEM_PROMPT = `You are reading a shopping receipt so it can be logged in someone's personal finance app.

How to approach it:
- Transcribe the line items as printed, one entry per product line. Tidy obvious abbreviations into readable names, but do not invent products.
- Where a line shows a quantity and a unit price (2 x 1,29), record both and the line total.
- Ignore anything that is not a purchased item: loyalty points, VAT summary lines, subtotals, change given, card details, "poupança" and discount summaries. Discounts applied to a specific item should reduce that item's total.
- The printed total is the truth. If your line items do not add up to it, keep the printed total and say so in the notes.
- Portuguese receipts are common: amounts use a comma as the decimal separator, dates are usually DD-MM-YYYY, and "TOTAL A PAGAR" is the amount paid. Return numbers as plain decimals with a dot, and the date as YYYY-MM-DD.
- Do not guess the date from today. If the date is not legible, return an empty string.
- Be honest in your confidence. A crisp supermarket receipt deserves a high score; a faded one photographed at an angle does not.

If the image is not a receipt or an invoice, set isReceipt to false and return no items.

Write any note in the language the receipt is in, defaulting to English.`;

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error: "not_configured",
        message:
          "Reading receipts needs an Anthropic API key. Add ANTHROPIC_API_KEY to your environment and restart the server. Every other way of adding a purchase works without it.",
      },
      { status: 503 },
    );
  }

  let body: { imageBase64?: string; mediaType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Could not read the request." },
      { status: 400 },
    );
  }

  const { imageBase64, mediaType } = body;
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
      model: process.env.FITME_RECEIPT_MODEL ?? process.env.FITME_VISION_MODEL ?? "claude-opus-5",
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(ReceiptSchema),
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
              text: "Read this receipt. Return the merchant, the date, the total actually paid and the line items.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        {
          error: "declined",
          message: "That image could not be read. You can still enter the purchase by hand.",
        },
        { status: 422 },
      );
    }

    const receipt = response.parsed_output;
    if (!receipt) {
      return NextResponse.json(
        {
          error: "unparseable",
          message: "The reading came back in an unexpected shape. Try another photo.",
        },
        { status: 502 },
      );
    }

    if (!receipt.isReceipt) {
      return NextResponse.json(
        {
          error: "not_a_receipt",
          message: "That does not look like a receipt. Try a flatter, better-lit photo.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      merchant: receipt.merchant.trim(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(receipt.date) ? receipt.date : null,
      currency: receipt.currency.trim().toUpperCase().slice(0, 3) || null,
      total: money(receipt.total),
      items: receipt.items.map((item) => ({
        name: item.name.trim(),
        quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
        unitPrice: money(item.unitPrice),
        total: money(item.total),
      })),
      notes: receipt.notes,
      confidence: clamp01(receipt.confidence),
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
        { error: "upstream", message: `Reading the receipt failed (${error.status}).` },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        error: "unknown",
        message: "Reading the receipt failed. You can still enter the purchase by hand.",
      },
      { status: 500 },
    );
  }
}

/** Two decimal places, and never NaN — the client turns these into minor units. */
const money = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
