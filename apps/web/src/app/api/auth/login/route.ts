import { NextResponse } from "next/server";
import { newSessionToken, normaliseEmail, verifyPassword } from "@/lib/auth";
import {
  clearThrottle,
  findUserByEmail,
  isAuthConfigured,
  startSession,
  throttle,
} from "@/lib/db";
import { clientAddress, unconfigured, unreachable, withSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One message for every kind of failure.
 *
 * "No account with that address" is a free membership oracle: it lets anyone
 * test whether a particular person uses this app. An unknown address and a
 * wrong password are answered identically.
 */
const DENIED = {
  error: "denied",
  message: "That email and password do not match an account.",
};

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
  if (!email || !password) return NextResponse.json(DENIED, { status: 401 });

  const byAddress = `login-ip:${clientAddress(request)}`;
  const byAccount = `login-user:${email}`;

  try {
    // Both limits apply. The per-account one stops a targeted guessing run
    // spread across many addresses; the per-address one stops one machine
    // working through a list of accounts.
    const blocked = (await throttle(byAddress, 30)) || (await throttle(byAccount, 10));
    if (blocked) {
      return NextResponse.json(
        { error: "rate_limited", message: "Too many attempts. Try again in a few minutes." },
        { status: 429 },
      );
    }

    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(DENIED, { status: 401 });
    }

    await clearThrottle([byAddress, byAccount]);
    const token = newSessionToken();
    await startSession(user.id, token);
    return withSession(NextResponse.json({ user: { id: user.id, email: user.email } }), token);
  } catch {
    return unreachable();
  }
}
