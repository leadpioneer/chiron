import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type { LlmResponse } from "@chiron/contracts";
import { llmResponseSchema } from "@chiron/contracts";
import {
  LLM_PROMPT_VERSION,
  LLM_RULES_VERSION,
  LLM_SCHEMA_VERSION,
  LLM_SYSTEM_PROMPT,
  parseWorkoutText,
} from "@chiron/core";
import { getDb, llmCalls } from "@chiron/db";
import { llmEnabled, llmModel } from "./config";

interface ParseResult {
  response: LlmResponse;
  provider: string;
  model: string;
  validation: string;
  latencyMs: number;
  costUsd: number;
}

function estimateCost(text: string, output: string): number {
  const inputTokens = Math.ceil((LLM_SYSTEM_PROMPT.length + text.length) / 4);
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
      promptVersion: LLM_PROMPT_VERSION,
      schemaVersion: LLM_SCHEMA_VERSION,
      rulesVersion: LLM_RULES_VERSION,
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

interface BudgetState {
  exceeded: boolean;
  reason: "daily" | "monthly" | "global" | null;
}

function alertThreshold(): number {
  const configured = Number(process.env.LLM_BUDGET_ALERT_RATIO ?? "0.8");
  if (!Number.isFinite(configured) || configured <= 0 || configured >= 1) {
    return 0.8;
  }
  return configured;
}

function warnBudget(
  scope: "user_daily" | "user_monthly" | "global_monthly",
  spent: number,
  budget: number,
): void {
  if (budget <= 0) return;
  const ratio = spent / budget;
  if (ratio < alertThreshold() || ratio > 1.01) return;
  console.warn(
    JSON.stringify({
      event: "llm_budget_alert",
      scope,
      ratio: Math.round(ratio * 100) / 100,
      spentUsd: Math.round(spent * 1_000_000) / 1_000_000,
      budgetUsd: budget,
    }),
  );
}

async function budgetState(userId: string): Promise<BudgetState> {
  try {
    const dailyBudget = Number(process.env.LLM_DAILY_BUDGET_USD ?? "0.02");
    const monthlyBudget = Number(
      process.env.LLM_MONTHLY_BUDGET_USD ?? "100",
    );
    const globalBudget = Number(
      process.env.LLM_GLOBAL_MONTHLY_BUDGET_USD ?? "50",
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
    const globalRows = await db
      .select({
        total: sql<number>`coalesce(sum(${llmCalls.costUsd}), 0)`,
      })
      .from(llmCalls)
      .where(gte(llmCalls.createdAt, monthStart));

    const daily = Number(dailyRows[0]?.total ?? 0);
    const monthly = Number(monthlyRows[0]?.total ?? 0);
    const global = Number(globalRows[0]?.total ?? 0);
    warnBudget("user_daily", daily, dailyBudget);
    warnBudget("user_monthly", monthly, monthlyBudget);
    warnBudget("global_monthly", global, globalBudget);

    if (daily >= dailyBudget) {
      return { exceeded: true, reason: "daily" };
    }
    if (monthly >= monthlyBudget) {
      return { exceeded: true, reason: "monthly" };
    }
    if (global >= globalBudget) {
      return { exceeded: true, reason: "global" };
    }
    return { exceeded: false, reason: null };
  } catch {
    // A budget check must never take down the deterministic fallback.
    return { exceeded: false, reason: null };
  }
}

export function llmStatus(): {
  enabled: boolean;
  configured: boolean;
  model: string;
} {
  return {
    enabled: llmEnabled(),
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: llmModel(),
  };
}

function fallbackResult(
  text: string,
  provider: string,
  validation: string,
): ParseResult {
  const started = Date.now();
  return {
    response: parseWorkoutText(text),
    provider,
    model: "deterministic-parser",
    validation,
    latencyMs: Date.now() - started,
    costUsd: 0,
  };
}

export async function parseTextForUser(
  userId: string,
  text: string,
): Promise<LlmResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = llmModel();

  if (!llmEnabled()) {
    const result = fallbackResult(text, "disabled", "disabled_fallback");
    await recordCall({ userId, result, text });
    return result.response;
  }

  if (!apiKey) {
    const result = fallbackResult(text, "local", "fallback");
    await recordCall({ userId, result, text });
    return result.response;
  }

  const budget = await budgetState(userId);
  if (budget.exceeded) {
    const result = fallbackResult(
      text,
      budget.reason === "global" ? "global_budget" : "budget",
      budget.reason === "global"
        ? "global_budget_fallback"
        : "budget_fallback",
    );
    await recordCall({ userId, result, text });
    return result.response;
  }

  if (
    /(ignore (all|previous)|system prompt|jailbreak|ты теперь|выполняй инструкц)/i.test(
      text,
    )
  ) {
    const result = fallbackResult(text, "local", "injection_fallback");
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
            parts: [{ text: LLM_SYSTEM_PROMPT }],
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
