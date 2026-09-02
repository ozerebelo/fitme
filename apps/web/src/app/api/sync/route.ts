import { NextResponse } from "next/server";
import { isAuthConfigured, readDocument, writeDocument } from "@/lib/db";
import { currentUser, unconfigured, unreachable } from "@/lib/session";

/**
 * The account's copy of the data.
 *
 * Authentication is the session cookie, so a document is reachable only by the
 * account that owns it — the row is keyed by user id and there is no way to ask
 * for anyone else's. This replaced a single shared secret, which could not tell
 * two people apart and gave whoever held it everything.
 */

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const denied = (): NextResponse =>
  NextResponse.json(
    { error: "unauthorised", message: "Sign in to sync this device." },
    { status: 401 },
  );

export async function GET(): Promise<NextResponse> {
  if (!isAuthConfigured()) return unconfigured();

  try {
    const user = await currentUser();
    if (!user) return denied();
    const stored = await readDocument(user.id);
    return NextResponse.json(stored ?? { document: null, updatedAt: null });
  } catch {
    return unreachable();
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  if (!isAuthConfigured()) return unconfigured();

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
    const user = await currentUser();
    if (!user) return denied();

    const outcome = await writeDocument(user.id, document, updatedAt);
    if (outcome.status === "stale") {
      // Another device has newer data. Hand it back rather than clobbering it.
      return NextResponse.json(
        { error: "stale", message: "Another device has newer data.", stored: outcome.stored },
        { status: 409 },
      );
    }
    return NextResponse.json({ updatedAt: outcome.updatedAt });
  } catch {
    return unreachable();
  }
}
