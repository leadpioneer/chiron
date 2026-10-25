import { NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError } from "@/src/lib/api";
import { getExerciseOptions } from "@/src/lib/plan-edit-service";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);
  const options = await getExerciseOptions();
  return NextResponse.json(
    { options },
    { headers: { "cache-control": "no-store" } },
  );
}
