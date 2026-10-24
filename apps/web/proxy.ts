import { NextResponse, type NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { crossOriginRejected } from "./src/lib/security";

const COOKIE_NAME = "chiron_session";
const SESSION_DAYS = 30;
const ROTATE_AFTER_SECONDS = 7 * 24 * 60 * 60;

function secretKey(): Uint8Array | null {
  const configured =
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV !== "production"
      ? "dev-secret-change-me-32-characters"
      : undefined);
  if (!configured || configured.length < 32) return null;
  return new TextEncoder().encode(configured);
}

async function rotateSession(token: string): Promise<string | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    if (typeof payload.sub !== "string") return null;
    const issuedAt = typeof payload.iat === "number" ? payload.iat : 0;
    const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
    if (issuedAt > 0 && ageSeconds < ROTATE_AFTER_SECONDS) return null;
    return await new SignJWT({ sub: payload.sub })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DAYS}d`)
      .sign(key);
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (crossOriginRejected(request)) {
    return NextResponse.json(
      {
        error: "Запрос с другого источника отклонён.",
        code: "CSRF_REJECTED",
      },
      {
        status: 403,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  const response = NextResponse.next();
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    const rotated = await rotateSession(token);
    if (rotated) {
      response.cookies.set(COOKIE_NAME, rotated, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_DAYS * 24 * 60 * 60,
      });
    }
  }

  response.headers.set(
    "content-security-policy",
    "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
  );
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|robots.txt|sitemap.xml).*)",
  ],
};
