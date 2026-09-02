import { NextResponse } from "next/server";
import { endSession, isAuthConfigured } from "@/lib/db";
import { readToken, withoutSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  // Clear the cookie whatever happens. A sign-out that appears to fail because
  // the database is unreachable is worse than one that leaves a dead row behind.
  if (isAuthConfigured()) {
    try {
      await endSession(await readToken());
    } catch {
      /* the row expires on its own */
    }
  }
  return withoutSession(NextResponse.json({ ok: true }));
}
