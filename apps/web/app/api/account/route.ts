import { NextResponse } from "next/server";
import { getCurrentUser, clearSession } from "@/src/lib/auth";
import { apiError } from "@/src/lib/api";
import { softDeleteAccount } from "@/src/lib/export-service";

export async function DELETE(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);

  await softDeleteAccount(user.id);
  await clearSession();
  return NextResponse.json({ ok: true });
}
