import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import {
  getDb,
  identities,
  magicLinks,
  users,
} from "@chiron/db";
import { createSession } from "@/src/lib/auth";

export async function GET(request: Request): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.url));
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const db = getDb();
  const rows = await db
    .select()
    .from(magicLinks)
    .where(
      and(
        eq(magicLinks.tokenHash, tokenHash),
        isNull(magicLinks.usedAt),
      ),
    )
    .limit(1);
  const magic = rows[0];
  if (!magic || magic.expiresAt.getTime() < Date.now()) {
    return NextResponse.redirect(
      new URL("/login?error=expired_token", request.url),
    );
  }

  await db
    .update(magicLinks)
    .set({ usedAt: new Date() })
    .where(eq(magicLinks.id, magic.id));

  const userRows = await db
    .insert(users)
    .values({
      email: magic.email,
      displayName: magic.email.split("@")[0] ?? "Атлет",
      deletedAt: null,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { deletedAt: null },
    })
    .returning();
  const user = userRows[0];
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=user", request.url));
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
  return NextResponse.redirect(new URL("/", request.url));
}
