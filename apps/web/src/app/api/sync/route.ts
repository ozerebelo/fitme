import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isSyncConfigured, readDocument, writeDocument } from "@/lib/db";

/**
 * Cross-device sync.
 *
 * Authentication is a single shared secret, which is the right size of solution
 * for a personal app with one user and two devices: anyone holding the secret
 * has full access, and that is the whole security model. It is stated plainly
 * in the UI. Multi-user would need real accounts, and nothing here forecloses
 * that — the row is already keyed by user.
 */

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const authorised = (request: Request): boolean => {
  const expected = process.env.FITME_SYNC_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided) return false;

  // Compare over fixed-length digests so the check does not leak the secret's
  // length, and so timingSafeEqual never throws on a mismatched size.
  const a = Buffer.from(provided.padEnd(64, "\0").slice(0, 64));
  const b = Buffer.from(expected.padEnd(64, "\0").slice(0, 64));
  return timingSafeEqual(a, b) && provided.length === expected.length;
};

const unconfigured = (): NextResponse =>
  NextResponse.json(
    {
      error: "not_configured",
      message:
        "Sync is not set up on this deployment. It needs DATABASE_URL and FITME_SYNC_SECRET; without them everything still works, but only on this device.",
    },
    { status: 503 },
  );

const denied = (): NextResponse =>
  NextResponse.json(
    { error: "unauthorised", message: "That sync key is not right." },
    { status: 401 },
  );

export async function GET(request: Request): Promise<NextResponse> {
  if (!isSyncConfigured()) return unconfigured();
  if (!authorised(request)) return denied();

  try {
    const stored = await readDocument();
    return NextResponse.json(stored ?? { document: null, updatedAt: null });
  } catch {
    return NextResponse.json(
      { error: "unreachable", message: "Could not reach the sync database." },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  if (!isSyncConfigured()) return unconfigured();
  if (!authorised(request)) return denied();

  let body: { document?: { updatedAt?: string } };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Could not read the document." },
      { status: 400 },
    );
  }

  const document = body.document;
  const updatedAt = document?.updatedAt;
  if (!document || typeof updatedAt !== "string" || Number.isNaN(Date.parse(updatedAt))) {
    return NextResponse.json(
      { error: "bad_request", message: "The document is missing a valid updatedAt." },
      { status: 400 },
    );
  }

  try {
    const outcome = await writeDocument(document, updatedAt);
    if (outcome.status === "stale") {
      // Another device has newer data. Hand it back rather than clobbering it.
      return NextResponse.json(
        {
          error: "stale",
          message: "Another device has newer data.",
          stored: outcome.stored,
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ updatedAt: outcome.updatedAt });
  } catch {
    return NextResponse.json(
      { error: "unreachable", message: "Could not reach the sync database." },
      { status: 502 },
    );
  }
}
