import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type { LlmResponse } from "@chiron/contracts";
import { llmResponseSchema } from "@chiron/contracts";
import { parseWorkoutText } from "@chiron/core";
import { getDb, llmCalls } from "@chiron/db";

const PROMPT_VERSION = "parse-v1";
const SCHEMA_VERSION = "1.0";
const RULES_VERSION = "1.0.0";

const SYSTEM_PROMPT = `Ты — парсер дневника силовых тренировок. Твоя единственная задача — извлечь факты из текста пользователя и вернуть строгий JSON.
Правила:
- Не назначай нагрузки, не выбирай упражнения и не давай медицинских советов.
- Не придумывай числа. Если значения нет, верни null.
- Не меняй роли упражнений, связи и идентификаторы.
- Если неоднозначно, задай короткий уточняющий вопрос в ambiguities.
- Верни только JSON без markdown.
Формат: {"schemaVersion":"1.0","parsedFacts":{"exerciseAlias":string|null,"exerciseVariantId":null,"targetBlockId":null,"role":null,"sets":[{"weightKg":number|null,"assistanceKg":number|null,"addedKg":number|null,"reps":number|null,"rir":number|null,"setType":"WORKING"|null,"sourceSpan":string|null}],"sleepHours":number|null,"symptoms":string[]},"missingFields":string[],"ambiguities":[{"field":string,"question":string}],"safetyObservations":[{"code":"GREEN"|"YELLOW_PAIN"|"YELLOW_SYSTEMIC"|"YELLOW_ILLNESS"|"RED","quote":string}],"selectedActionId":null,"explanation":string,"confidence":number}`;

interface ParseResult {
  response: LlmResponse;
  provider: string;
  model: string;
  validation: string;
  latencyMs: number;
  costUsd: number;
}

function estimateCost(text: string, output: string): number {
  const inputTokens = Math.ceil((SYSTEM_PROMPT.length + text.length) / 4);
  const outputTokens = Math.ceil(output.length / 4);
  const inputRate = Number(process.env.LLM_INPUT_USD_PER_1M ?? "0.1");
  const outputRate = Number(process.env.LLM_OUTPUT_USD_PER_1M ?? "0.4");
  const cost =
    (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

function hashInput(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function numbersSupported(response: LlmResponse, text: string): boolean {
  const normalized = text.replaceAll(",", ".");
  const numbers: Array<number | null> = [];
  for (const set of response.parsedFacts.sets) {
    numbers.push(
      set.weightKg,
      set.assistanceKg,
      set.addedKg,
      set.reps,
      set.rir,
    );
  }
  numbers.push(response.parsedFacts.sleepHours);
  for (const value of numbers) {
    if (value === null) continue;
    if (!normalized.includes(String(value))) return false;
  }
  return true;
}

async function recordCall(input: {
  userId: string;
  result: ParseResult;
  text: string;
}): Promise<void> {
  try {
    await getDb().insert(llmCalls).values({
      userId: input.userId,
      purpose: "parse_workout_text",
      provider: input.result.provider,
      model: input.result.model,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      rulesVersion: RULES_VERSION,
      inputHash: hashInput(input.text),
      output: input.result.response,
      validation: input.result.validation,
      latencyMs: input.result.latencyMs,
      costUsd: input.result.costUsd,
    });
  } catch (error) {
    console.error("Could not record LLM call", error);
  }
}

async function budgetExceeded(userId: string): Promise<boolean> {
  try {
    const dailyBudget = Number(process.env.LLM_DAILY_BUDGET_USD ?? "0.02");
    const monthlyBudget = Number(
      process.env.LLM_MONTHLY_BUDGET_USD ?? "100",
    );
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const db = getDb();
    const dailyRows = await db
      .select({
        total: sql<number>`coalesce(sum(${llmCalls.costUsd}), 0)`,
      })
      .from(llmCalls)
      .where(
        and(
          eq(llmCalls.userId, userId),
          gte(llmCalls.createdAt, dayStart),
        ),
      );
    const monthlyRows = await db
      .select({
        total: sql<number>`coalesce(sum(${llmCalls.costUsd}), 0)`,
      })
      .from(llmCalls)
      .where(
        and(
          eq(llmCalls.userId, userId),
          gte(llmCalls.createdAt, monthStart),
        ),
      );
    const daily = Number(dailyRows[0]?.total ?? 0);
    const monthly = Number(monthlyRows[0]?.total ?? 0);
    return daily >= dailyBudget || monthly >= monthlyBudget;
  } catch {
    // A budget check must never take down the deterministic fallback.
    return false;
  }
}

export async function parseTextForUser(
  userId: string,
  text: string,
): Promise<LlmResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.LLM_MODEL ?? "gemini-2.5-flash";

  if (!apiKey) {
    const started = Date.now();
    const result: ParseResult = {
      response: parseWorkoutText(text),
      provider: "local",
      model: "deterministic-parser",
      validation: "fallback",
      latencyMs: Date.now() - started,
      costUsd: 0,
    };
    await recordCall({ userId, result, text });
    return result.response;
  }

  if (await budgetExceeded(userId)) {
    const started = Date.now();
    const result: ParseResult = {
      response: parseWorkoutText(text),
      provider: "budget",
      model: "deterministic-parser",
      validation: "budget_fallback",
      latencyMs: Date.now() - started,
      costUsd: 0,
    };
    await recordCall({ userId, result, text });
    return result.response;
  }

  if (
    /(ignore (all|previous)|system prompt|jailbreak|ты теперь|выполняй инструкц)/i.test(
      text,
    )
  ) {
    const started = Date.now();
    const result: ParseResult = {
      response: parseWorkoutText(text),
      provider: "local",
      model: "deterministic-parser",
      validation: "injection_fallback",
      latencyMs: Date.now() - started,
      costUsd: 0,
    };
    await recordCall({ userId, result, text });
    return result.response;
  }

  const started = Date.now();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 800,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`LLM HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("LLM returned no text");
    const costUsd = estimateCost(text, raw);
    const parsed = llmResponseSchema.safeParse(JSON.parse(raw));
    const latencyMs = Date.now() - started;

    if (!parsed.success) {
      const fallback: ParseResult = {
        response: parseWorkoutText(text),
        provider: "google",
        model,
        validation: "schema_rejected_fallback",
        latencyMs,
        costUsd,
      };
      await recordCall({ userId, result: fallback, text });
      return fallback.response;
    }

    if (!numbersSupported(parsed.data, text)) {
      const fallback: ParseResult = {
        response: parseWorkoutText(text),
        provider: "google",
        model,
        validation: "numbers_rejected_fallback",
        latencyMs,
        costUsd,
      };
      await recordCall({ userId, result: fallback, text });
      return fallback.response;
    }

    const result: ParseResult = {
      response: parsed.data,
      provider: "google",
      model,
      validation: "valid",
      latencyMs,
      costUsd,
    };
    await recordCall({ userId, result, text });
    return result.response;
  } catch (error) {
    const latencyMs = Date.now() - started;
    const fallback: ParseResult = {
      response: parseWorkoutText(text),
      provider: "google",
      model,
      validation: "error_fallback",
      latencyMs,
      costUsd: 0,
    };
    console.error("LLM parse failed, using local parser", error);
    await recordCall({ userId, result: fallback, text });
    return fallback.response;
  }
}
