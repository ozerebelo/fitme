import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS } from "./auth";
import { type SessionUser, userForToken } from "./db";

/**
 * Reading and setting the session cookie.
 *
 * The cookie is HttpOnly so a cross-site script cannot read it, SameSite=Lax so
 * it does not ride along on cross-site form posts, and Secure everywhere except
 * a local HTTP dev server, where Secure would stop it working at all.
 */

export const readToken = async (): Promise<string> => {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? "";
};

export const currentUser = async (): Promise<SessionUser | null> =>
  userForToken(await readToken());

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export const withSession = (response: NextResponse, token: string): NextResponse => {
  response.cookies.set(SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return response;
};

export const withoutSession = (response: NextResponse): NextResponse => {
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return response;
};

export const unconfigured = (): NextResponse =>
  NextResponse.json(
    {
      error: "not_configured",
      message:
        "Accounts are not set up on this deployment. They need DATABASE_URL; without it everything still works, but only on this device.",
    },
    { status: 503 },
  );

export const unreachable = (): NextResponse =>
  NextResponse.json(
    { error: "unreachable", message: "Could not reach the account database." },
    { status: 502 },
  );

/**
 * The address a request came from, for throttling.
 *
 * Behind Vercel's proxy the socket address is the proxy's, so the first entry
 * of x-forwarded-for is the real client. It is client-controlled and therefore
 * spoofable — which is why it only ever *adds* a limit alongside the per-account
 * one, and never relaxes anything.
 */
export const clientAddress = (request: Request): string =>
  (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
