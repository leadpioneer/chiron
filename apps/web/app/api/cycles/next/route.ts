import { NextResponse } from "next/server";
import { subjectContextForApi, readOnlyResponse } from "@/src/lib/subject";
import { apiError } from "@/src/lib/api";
import {
  advanceCycle,
  CycleNotFinishedError,
  NoActiveCycleError,
} from "@/src/lib/plan-service";

export async function POST(): Promise<NextResponse> {
  const context = await subjectContextForApi();
  if (context instanceof NextResponse) return context;
  const readOnly = readOnlyResponse(context);
  if (readOnly) return readOnly;

  try {
    const cycleId = await advanceCycle(
      context.subject.id,
      { actorUserId: context.viewer.id },
    );
    return NextResponse.json({ ok: true, cycleId });
  } catch (error) {
    if (error instanceof CycleNotFinishedError) {
      return apiError(
        "CYCLE_NOT_FINISHED",
        "В текущем цикле ещё есть запланированные тренировки",
        409,
      );
    }
    if (error instanceof NoActiveCycleError) {
      return apiError("NO_ACTIVE_CYCLE", "Активный цикл не найден", 404);
    }
    console.error(error);
    return apiError("NEXT_CYCLE_FAILED", "Не удалось начать новый цикл", 500);
  }
}
