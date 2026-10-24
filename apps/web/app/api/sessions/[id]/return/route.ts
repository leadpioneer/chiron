import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError } from "@/src/lib/api";
import { prepareReturn, ReturnError } from "@/src/lib/return-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  const { id } = await context.params;

  try {
    const result = await prepareReturn(user.id, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ReturnError) {
      return apiError(error.code, error.message, error.status);
    }
    console.error(error);
    return apiError("RETURN_FAILED", "Не удалось подготовить возвращение", 500);
  }
}
