import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who the cookie belongs to. `available` says whether accounts exist at all. */
export async function GET(): Promise<NextResponse> {
  if (!isAuthConfigured()) return NextResponse.json({ available: false, user: null });
  try {
    return NextResponse.json({ available: true, user: await currentUser() });
  } catch {
    return NextResponse.json({ available: true, user: null, unreachable: true });
  }
}
