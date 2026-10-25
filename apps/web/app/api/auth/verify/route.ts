import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, identities, magicLinks, users } from "@chiron/db";
import { createSession } from "@/src/lib/auth";
import { clearSubjectCookie } from "@/src/lib/subject";

function loginError(request: Request, code: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(code)}`, request.url),
    { headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return loginError(request, "missing_token");

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const db = getDb();
  const consumed = await db
    .update(magicLinks)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(magicLinks.tokenHash, tokenHash),
        isNull(magicLinks.usedAt),
        gt(magicLinks.expiresAt, new Date()),
      ),
    )
    .returning({ email: magicLinks.email });
  const magic = consumed[0];
  if (!magic) return loginError(request, "expired_token");

  const existingRows = await db
    .select()
    .from(users)
    .where(eq(users.email, magic.email))
    .limit(1);
  let user = existingRows[0];

  if (user?.deletedAt) {
    return loginError(request, "account_deleted");
  }

  if (!user) {
    const inserted = await db
      .insert(users)
      .values({
        email: magic.email,
        displayName: magic.email.split("@")[0] ?? "Атлет",
      })
      .onConflictDoNothing({ target: users.email })
      .returning();
    user = inserted[0];
    if (!user) {
      const raced = await db
        .select()
        .from(users)
        .where(eq(users.email, magic.email))
        .limit(1);
      user = raced[0];
    }
  }

  if (!user || user.deletedAt) {
    return loginError(request, "account_deleted");
  }

  await db
    .insert(identities)
    .values({
      userId: user.id,
      provider: "email",
      providerUserId: magic.email,
    })
    .onConflictDoNothing();

  await createSession(user.id);
  await clearSubjectCookie();
  return NextResponse.redirect(new URL("/", request.url), {
    headers: { "cache-control": "no-store" },
  });
}
