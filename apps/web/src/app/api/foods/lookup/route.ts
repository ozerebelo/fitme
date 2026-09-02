import { NextResponse } from "next/server";
import {
  type OffProduct,
  isValidBarcode,
  normalizeOffProduct,
} from "@fitme/core";

/**
 * Branded food lookup, backed by Open Food Facts.
 *
 * A curated catalog can cover ingredients; it can never cover the supermarket.
 * OFF is a free, crowd-sourced database of several million barcoded products,
 * which is exactly the gap. It needs no API key, but it does ask callers to
 * identify themselves, and its data quality varies enough that everything is
 * put through the normaliser in @fitme/core before it is allowed near a diary.
 *
 * The base URL is configurable so this can be pointed at a mirror — or at a
 * stub in tests.
 */

export const runtime = "nodejs";
export const maxDuration = 20;

const BASE = process.env.OPENFOODFACTS_BASE_URL ?? "https://world.openfoodfacts.org";
const USER_AGENT = process.env.OPENFOODFACTS_USER_AGENT ?? "FitMe/0.1 (self-hosted)";
const TIMEOUT_MS = 8000;

const FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "generic_name",
  "brands",
  "quantity",
  "serving_size",
  "serving_quantity",
  "nutriments",
  "categories_tags",
].join(",");

const fetchUpstream = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      // OFF data changes slowly; a shared cache keeps repeat scans instant.
      next: { revalidate: 86_400 },
    });
  } finally {
    clearTimeout(timer);
  }
};

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get("barcode")?.trim();
  const query = searchParams.get("q")?.trim();

  if (barcode) return lookupBarcode(barcode);
  if (query) return searchByName(query);

  return NextResponse.json(
    { error: "bad_request", message: "Pass a barcode or a search term." },
    { status: 400 },
  );
}

const lookupBarcode = async (barcode: string): Promise<NextResponse> => {
  if (!isValidBarcode(barcode)) {
    return NextResponse.json(
      { error: "bad_barcode", message: "That is not a valid barcode." },
      { status: 400 },
    );
  }

  try {
    const response = await fetchUpstream(
      `${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`,
    );

    if (response.status === 404) {
      return NextResponse.json(
        {
          error: "not_found",
          message:
            "That barcode isn't in Open Food Facts yet. Add it as a food from the label and it will be there next time.",
        },
        { status: 404 },
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: "upstream", message: "The food database is not responding." },
        { status: 502 },
      );
    }

    const json = (await response.json()) as { status?: number; product?: OffProduct };
    if (json.status !== 1 || !json.product) {
      return NextResponse.json(
        {
          error: "not_found",
          message:
            "That barcode isn't in Open Food Facts yet. Add it as a food from the label and it will be there next time.",
        },
        { status: 404 },
      );
    }

    const { food, reason } = normalizeOffProduct({ ...json.product, code: barcode });
    if (!food) {
      return NextResponse.json({ error: "incomplete", message: reason }, { status: 422 });
    }

    return NextResponse.json({ food });
  } catch {
    return NextResponse.json(
      { error: "unreachable", message: "Could not reach the food database. You can still add it manually." },
      { status: 502 },
    );
  }
};

const searchByName = async (query: string): Promise<NextResponse> => {
  try {
    const url =
      `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`;
    const response = await fetchUpstream(url);
    if (!response.ok) {
      return NextResponse.json({ foods: [] });
    }

    const json = (await response.json()) as { products?: OffProduct[] };
    const foods = (json.products ?? [])
      .map((product) => normalizeOffProduct(product).food)
      .filter((food): food is NonNullable<typeof food> => food !== null)
      // Products with no macros at all are noise in a search list.
      .filter((food) => food.per100.kcal > 0 || food.per100.protein > 0)
      .slice(0, 15);

    return NextResponse.json({ foods });
  } catch {
    // A failed branded search is not an error the user needs to see — the local
    // catalog results are already on screen.
    return NextResponse.json({ foods: [] });
  }
};
