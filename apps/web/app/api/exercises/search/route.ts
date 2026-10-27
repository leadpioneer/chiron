import { NextResponse } from "next/server";
import { asc, ilike, or, sql } from "drizzle-orm";
import { exerciseLibrary, getDb } from "@chiron/db";
import { getCurrentUser } from "@/src/lib/auth";
import { apiError } from "@/src/lib/api";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError("UNAUTHORIZED", "Требуется вход", 401);

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json(
      { results: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }
  const term = `%${query}%`;
  const rows = await getDb()
    .select({
      id: exerciseLibrary.id,
      name: exerciseLibrary.name,
      nameRu: exerciseLibrary.nameRu,
      equipment: exerciseLibrary.equipment,
      equipmentRu: exerciseLibrary.equipmentRu,
      mechanic: exerciseLibrary.mechanic,
      level: exerciseLibrary.level,
      category: exerciseLibrary.category,
      categoryRu: exerciseLibrary.categoryRu,
      primaryMusclesRu: exerciseLibrary.primaryMusclesRu,
    })
    .from(exerciseLibrary)
    .where(
      or(
        ilike(exerciseLibrary.nameRu, term),
        ilike(exerciseLibrary.name, term),
        sql`${exerciseLibrary.aliasesRu}::text ILIKE ${term}`,
      ),
    )
    .orderBy(asc(exerciseLibrary.nameRu), asc(exerciseLibrary.name))
    .limit(20);

  return NextResponse.json(
    {
      results: rows.map((row) => ({
        ...row,
        primaryEligible:
          row.mechanic === "compound" &&
          row.category !== "stretching" &&
          row.category !== "cardio",
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
