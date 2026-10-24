import { NextResponse } from "next/server";
import { onboardingSchema } from "@chiron/contracts";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError, readJson } from "@/src/lib/api";
import {
  createCycleForUser,
  CycleAlreadyActiveError,
} from "@/src/lib/plan-service";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);

  const parsed = await readJson(request, onboardingSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const cycleId = await createCycleForUser(user.id, parsed.data);
    return NextResponse.json({ ok: true, cycleId });
  } catch (error) {
    if (error instanceof CycleAlreadyActiveError) {
      return apiError("CYCLE_ACTIVE", "У вас уже есть активный цикл", 409);
    }
    console.error(error);
    return apiError(
      "CYCLE_CREATE_FAILED",
      "Не удалось создать цикл. Проверьте, что база заполнена.",
      500,
    );
  }
}
