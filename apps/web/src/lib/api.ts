import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export function apiError(
  code: string,
  message: string,
  status = 400,
): NextResponse {
  return NextResponse.json({ error: message, code }, { status });
}

export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: apiError("INVALID_JSON", "Некорректный JSON", 400),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(
        "VALIDATION_ERROR",
        "Проверьте заполненные поля",
        422,
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

export function idempotencyKey(request: Request): string | null {
  const key = request.headers.get("idempotency-key");
  return key && key.length <= 200 ? key : null;
}
