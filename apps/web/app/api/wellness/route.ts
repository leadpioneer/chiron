import { NextResponse } from "next/server";
import { wellnessSchema } from "@chiron/contracts";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import { saveWeeklyWellness } from "@/src/lib/session-service";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);

  const parsed = await readJson(request, wellnessSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await saveWeeklyWellness(user.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return apiError("WELLNESS_FAILED", "Не удалось сохранить чек-ин", 500);
  }
}
