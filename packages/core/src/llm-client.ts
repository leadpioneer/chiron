import { LLM_SYSTEM_PROMPT } from "./llm-contract";

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  text: string;
  timeoutMs?: number;
  jsonMode?: boolean;
  reasoningEffort?: string;
}

export interface OpenAiCompatibleUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
}

export interface OpenAiCompatibleResult {
  raw: string;
  usage: OpenAiCompatibleUsage;
}

export class LlmProviderError extends Error {
  readonly status: number | null;
  readonly detail: string | null;

  constructor(message: string, status: number | null = null, detail: string | null = null) {
    super(message);
    this.name = "LlmProviderError";
    this.status = status;
    this.detail = detail;
  }
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      typeof part === "object" && part !== null && "text" in part
        ? String((part as { text?: unknown }).text ?? "")
        : "",
    )
    .join("");
}

export async function callOpenAiCompatible(
  options: OpenAiCompatibleOptions,
): Promise<OpenAiCompatibleResult> {
  const endpoint = `${options.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: options.model,
    messages: [
      { role: "system", content: LLM_SYSTEM_PROMPT },
      { role: "user", content: options.text },
    ],
    temperature: 0,
    max_tokens: 800,
  };
  if (options.jsonMode !== false) {
    body.response_format = { type: "json_object" };
  }
  if (options.reasoningEffort) {
    body.reasoning_effort = options.reasoningEffort;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch (error) {
    throw new LlmProviderError(
      error instanceof Error ? error.name : "LLM request failed",
    );
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new LlmProviderError(
      `LLM HTTP ${response.status}`,
      response.status,
      detail || null,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LlmProviderError("LLM response is not JSON");
  }

  const choices = (payload as { choices?: unknown }).choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message =
    typeof first === "object" && first !== null && "message" in first
      ? (first as { message?: unknown }).message
      : undefined;
  const content =
    typeof message === "object" && message !== null && "content" in message
      ? (message as { content?: unknown }).content
      : undefined;
  const raw = contentToText(content).trim();
  if (!raw) {
    throw new LlmProviderError("LLM returned no text");
  }
  const usage = (payload as { usage?: Record<string, unknown> }).usage ?? {};
  const asNumber = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    raw,
    usage: {
      promptTokens: asNumber(usage.prompt_tokens),
      completionTokens: asNumber(usage.completion_tokens),
      costUsd: asNumber(usage.cost ?? usage.total_cost),
    },
  };
}
