import { NextResponse } from "next/server";
import { onboardingSchema } from "@chiron/contracts";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError, readJson } from "@/src/lib/api";
import {
  createCycleForUser,
  CycleAlreadyActiveError,
} from "@/src/lib/plan-service";

export async function POST(request: Request): Promise<NextResponse> {
  const context = await subjectContextForApi();
  if (context instanceof NextResponse) return context;
  const readOnly = readOnlyResponse(context);
  if (readOnly) return readOnly;

  const parsed = await readJson(request, onboardingSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const cycleId = await createCycleForUser(
      context.subject.id,
      parsed.data,
      { actorUserId: context.viewer.id },
    );
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
