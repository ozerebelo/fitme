import { NextResponse } from "next/server";
import {
  hashPassword,
  isPlausibleEmail,
  newSessionToken,
  normaliseEmail,
  passwordProblem,
} from "@/lib/auth";
import { createUser, isAuthConfigured, startSession, throttle } from "@/lib/db";
import { clientAddress, unconfigured, unreachable, withSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAuthConfigured()) return unconfigured();

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Could not read that." },
      { status: 400 },
    );
  }

  const email = normaliseEmail(body.email ?? "");
  const password = body.password ?? "";

  if (!isPlausibleEmail(email)) {
    return NextResponse.json(
      { error: "bad_email", message: "That does not look like an email address." },
      { status: 400 },
    );
  }
  const problem = passwordProblem(password);
  if (problem) {
    return NextResponse.json({ error: "weak_password", message: problem }, { status: 400 });
  }

  try {
    // Sign-up is the cheapest endpoint to abuse — it runs a slow hash and
    // creates a row — so it is capped per address.
    if (await throttle(`register:${clientAddress(request)}`, 5)) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many attempts. Try again in a few minutes." },
        { status: 429 },
      );
    }

    const user = await createUser(email, await hashPassword(password));
    if (!user) {
      return NextResponse.json(
        {
          error: "taken",
          message: "There is already an account with that address. Sign in instead.",
        },
        { status: 409 },
      );
    }

    const token = newSessionToken();
    await startSession(user.id, token);
    return withSession(NextResponse.json({ user: { id: user.id, email: user.email } }), token);
  } catch {
    return unreachable();
  }
}
