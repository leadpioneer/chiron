import path from "node:path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const {
  GOLDEN_PARSER_CASES,
  LLM_SYSTEM_PROMPT,
  callOpenAiCompatible,
  parseWorkoutText,
} = await import("@chiron/core");
const { llmResponseSchema } = await import("@chiron/contracts");
type LlmResponse = import("@chiron/contracts").LlmResponse;
type GoldenParserCase = import("@chiron/core").GoldenParserCase;

interface Prediction {
  response: LlmResponse | null;
  raw: string | null;
  invalidJson: boolean;
  error: string | null;
  latencyMs: number;
  costUsd: number;
}

interface Metrics {
  predictor: string;
  cases: number;
  exerciseAccuracy: number;
  setCountAccuracy: number;
  numericExpected: number;
  numericMatched: number;
  numericAccuracy: number;
  redExpected: number;
  redMatched: number;
  redRecall: number;
  yellowExpected: number;
  yellowMatched: number;
  yellowRecall: number;
  greenExpected: number;
  greenFalsePositives: number;
  invalidJson: number;
  invalidJsonRate: number;
  scopeViolations: number;
  errors: Array<{ id: string; error: string }>;
  failedCases: Array<{ id: string; reasons: string[] }>;
  totalCostUsd: number;
  totalLatencyMs: number;
}

const NUMERIC_FIELDS = [
  "weightKg",
  "assistanceKg",
  "addedKg",
  "reps",
  "rir",
] as const;

function localPredictor(text: string): Promise<Prediction> {
  const started = Date.now();
  return Promise.resolve({
    response: parseWorkoutText(text),
    raw: null,
    invalidJson: false,
    error: null,
    latencyMs: Date.now() - started,
    costUsd: 0,
  });
}

async function livePredictor(text: string): Promise<Prediction> {
  const explicit = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  const provider =
    explicit === "none" || explicit === "disabled"
      ? "none"
      : explicit === "gemini"
        ? "gemini"
        : explicit
          ? "openai"
          : process.env.LLM_API_KEY && process.env.LLM_BASE_URL
            ? "openai"
            : "gemini";
  const model =
    process.env.LLM_MODEL ??
    (provider === "gemini" ? "gemini-2.5-flash" : "");
  const started = Date.now();

  try {
    let raw: string;
    if (provider === "openai") {
      const apiKey = process.env.LLM_API_KEY;
      const baseUrl = process.env.LLM_BASE_URL;
      if (!apiKey || !baseUrl || !model) {
        return {
          response: null,
          raw: null,
          invalidJson: false,
          error: "LLM_API_KEY, LLM_BASE_URL and LLM_MODEL are required",
          latencyMs: 0,
          costUsd: 0,
        };
      }
      raw = (
        await callOpenAiCompatible({
          baseUrl,
          apiKey,
          model,
          text,
          timeoutMs: 20_000,
          jsonMode: process.env.LLM_JSON_MODE !== "0",
        })
      ).raw;
    } else if (provider === "gemini") {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return {
          response: null,
          raw: null,
          invalidJson: false,
          error: "GEMINI_API_KEY is not set",
          latencyMs: 0,
          costUsd: 0,
        };
      }
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: AbortSignal.timeout(20_000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: LLM_SYSTEM_PROMPT }] },
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
        return {
          response: null,
          raw: null,
          invalidJson: false,
          error: `LLM HTTP ${response.status}`,
          latencyMs: Date.now() - started,
          costUsd: 0,
        };
      }
      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      raw = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } else {
      return {
        response: null,
        raw: null,
        invalidJson: false,
        error: "LLM provider is disabled",
        latencyMs: 0,
        costUsd: 0,
      };
    }

    const inputTokens = Math.ceil(
      (LLM_SYSTEM_PROMPT.length + text.length) / 4,
    );
    const outputTokens = Math.ceil(raw.length / 4);
    const inputRate = Number(process.env.LLM_INPUT_USD_PER_1M ?? "0.1");
    const outputRate = Number(process.env.LLM_OUTPUT_USD_PER_1M ?? "0.4");
    const costUsd =
      Math.round(
        (((inputTokens * inputRate + outputTokens * outputRate) /
          1_000_000) *
          1_000_000),
      ) / 1_000_000;
    if (!raw) {
      return {
        response: null,
        raw: null,
        invalidJson: false,
        error: "LLM returned no text",
        latencyMs: Date.now() - started,
        costUsd,
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        response: null,
        raw,
        invalidJson: true,
        error: "Invalid JSON",
        latencyMs: Date.now() - started,
        costUsd,
      };
    }
    const validated = llmResponseSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        response: null,
        raw,
        invalidJson: true,
        error: "Schema rejected",
        latencyMs: Date.now() - started,
        costUsd,
      };
    }
    return {
      response: validated.data,
      raw,
      invalidJson: false,
      error: null,
      latencyMs: Date.now() - started,
      costUsd,
    };
  } catch (error) {
    return {
      response: null,
      raw: null,
      invalidJson: false,
      error: error instanceof Error ? error.message : "Unknown error",
      latencyMs: Date.now() - started,
      costUsd: 0,
    };
  }
}

function scopeViolations(response: LlmResponse): number {
  const facts = response.parsedFacts;
  let violations = 0;
  if (facts.exerciseVariantId !== null) violations += 1;
  if (facts.targetBlockId !== null) violations += 1;
  if (facts.role !== null) violations += 1;
  if (response.selectedActionId !== null) violations += 1;
  return violations;
}

function evaluate(
  predictor: (text: string) => Promise<Prediction>,
  predictorName: string,
  cases: GoldenParserCase[],
): Promise<Metrics> {
  return (async () => {
    let exerciseMatches = 0;
    let setCountMatches = 0;
    let numericExpected = 0;
    let numericMatched = 0;
    let redExpected = 0;
    let redMatched = 0;
    let yellowExpected = 0;
    let yellowMatched = 0;
    let greenExpected = 0;
    let greenFalsePositives = 0;
    let invalidJson = 0;
    let scope = 0;
    let totalCostUsd = 0;
    let totalLatencyMs = 0;
    const errors: Metrics["errors"] = [];
    const failedCases: Metrics["failedCases"] = [];

    for (const testCase of cases) {
      const prediction = await predictor(testCase.text);
      totalCostUsd += prediction.costUsd;
      totalLatencyMs += prediction.latencyMs;
      if (prediction.invalidJson) invalidJson += 1;
      if (prediction.error) {
        errors.push({ id: testCase.id, error: prediction.error });
      }
      const reasons: string[] = [];
      const response = prediction.response;
      if (!response) {
        reasons.push(prediction.error ?? "no response");
        failedCases.push({ id: testCase.id, reasons });
        continue;
      }

      scope += scopeViolations(response);
      const actualExercise = response.parsedFacts.exerciseAlias;
      if (actualExercise === testCase.exercise) {
        exerciseMatches += 1;
      } else {
        reasons.push(
          `exercise: expected ${String(testCase.exercise)}, got ${String(actualExercise)}`,
        );
      }

      const actualSets = response.parsedFacts.sets;
      if (actualSets.length === testCase.sets.length) {
        setCountMatches += 1;
      } else {
        reasons.push(
          `sets: expected ${testCase.sets.length}, got ${actualSets.length}`,
        );
      }

      testCase.sets.forEach((expected, index) => {
        const actual = actualSets[index];
        if (!actual) return;
        for (const field of NUMERIC_FIELDS) {
          const expectedValue = expected[field];
          if (expectedValue === undefined || expectedValue === null) continue;
          numericExpected += 1;
          if (actual[field] === expectedValue) {
            numericMatched += 1;
          } else {
            reasons.push(
              `set[${index}].${field}: expected ${String(expectedValue)}, got ${String(actual[field])}`,
            );
          }
        }
      });

      const observationCodes = response.safetyObservations.map(
        (item) => item.code,
      );
      const predictedSafety = observationCodes.includes("RED")
        ? "RED"
        : (observationCodes.find((code) => code.startsWith("YELLOW")) ??
          "GREEN");
      if (testCase.safety === "RED") {
        redExpected += 1;
        if (predictedSafety === "RED") redMatched += 1;
        else reasons.push(`safety: expected RED, got ${predictedSafety}`);
      } else if (testCase.safety.startsWith("YELLOW")) {
        yellowExpected += 1;
        if (predictedSafety === testCase.safety) yellowMatched += 1;
        else reasons.push(
          `safety: expected ${testCase.safety}, got ${predictedSafety}`,
        );
      } else {
        greenExpected += 1;
        if (predictedSafety !== "GREEN") {
          greenFalsePositives += 1;
          reasons.push(`safety: expected GREEN, got ${predictedSafety}`);
        }
      }

      if (reasons.length > 0) {
        failedCases.push({ id: testCase.id, reasons });
      }
    }

    const casesCount = cases.length;
    return {
      predictor: predictorName,
      cases: casesCount,
      exerciseAccuracy: casesCount ? exerciseMatches / casesCount : 0,
      setCountAccuracy: casesCount ? setCountMatches / casesCount : 0,
      numericExpected,
      numericMatched,
      numericAccuracy: numericExpected ? numericMatched / numericExpected : 1,
      redExpected,
      redMatched,
      redRecall: redExpected ? redMatched / redExpected : 1,
      yellowExpected,
      yellowMatched,
      yellowRecall: yellowExpected ? yellowMatched / yellowExpected : 1,
      greenExpected,
      greenFalsePositives,
      invalidJson,
      invalidJsonRate: casesCount ? invalidJson / casesCount : 0,
      scopeViolations: scope,
      errors,
      failedCases,
      totalCostUsd,
      totalLatencyMs,
    };
  })();
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function printReport(metrics: Metrics): void {
  console.info(`\nLLM eval: ${metrics.predictor}`);
  console.info(`  cases:            ${metrics.cases}`);
  console.info(`  exercise match:   ${pct(metrics.exerciseAccuracy)}`);
  console.info(`  set count match:  ${pct(metrics.setCountAccuracy)}`);
  console.info(
    `  numeric accuracy: ${pct(metrics.numericAccuracy)} (${metrics.numericMatched}/${metrics.numericExpected})`,
  );
  console.info(
    `  red recall:       ${pct(metrics.redRecall)} (${metrics.redMatched}/${metrics.redExpected})`,
  );
  console.info(
    `  yellow recall:    ${pct(metrics.yellowRecall)} (${metrics.yellowMatched}/${metrics.yellowExpected})`,
  );
  console.info(
    `  green false pos:  ${metrics.greenFalsePositives}/${metrics.greenExpected}`,
  );
  console.info(
    `  invalid JSON:     ${metrics.invalidJson} (${pct(metrics.invalidJsonRate)})`,
  );
  console.info(`  scope violations: ${metrics.scopeViolations}`);
  console.info(`  errors:           ${metrics.errors.length}`);
  console.info(`  cost:             $${metrics.totalCostUsd.toFixed(6)}`);
  console.info(`  latency:          ${metrics.totalLatencyMs} ms`);
  if (metrics.failedCases.length > 0) {
    console.info("  failed cases:");
    for (const failed of metrics.failedCases) {
      console.info(`   - ${failed.id}: ${failed.reasons.join("; ")}`);
    }
  }
}

function gatesPass(metrics: Metrics): boolean {
  return (
    metrics.redRecall === 1 &&
    metrics.yellowRecall >= 0.95 &&
    metrics.numericAccuracy >= 0.98 &&
    metrics.invalidJsonRate <= 0.005 &&
    metrics.scopeViolations === 0 &&
    metrics.errors.length === 0
  );
}

const explicitProvider = (process.env.LLM_PROVIDER ?? "")
  .trim()
  .toLowerCase();
const useGemini =
  explicitProvider === "gemini" ||
  (!explicitProvider &&
    !process.env.LLM_API_KEY &&
    Boolean(process.env.GEMINI_API_KEY));
const liveProvider =
  explicitProvider === "none" || explicitProvider === "disabled"
    ? "none"
    : useGemini
      ? "gemini"
      : "openai";
const liveConfigured =
  liveProvider === "gemini"
    ? Boolean(process.env.GEMINI_API_KEY)
    : liveProvider === "openai"
      ? Boolean(process.env.LLM_API_KEY && process.env.LLM_BASE_URL)
      : false;
const live = process.env.LLM_EVAL_LIVE === "1" && liveConfigured;
const predictor = live ? livePredictor : localPredictor;
const modelLabel =
  process.env.LLM_MODEL ??
  (liveProvider === "gemini" ? "gemini-2.5-flash" : "unknown");
const metrics = await evaluate(
  predictor,
  live ? `${liveProvider}:${modelLabel}` : "local",
  GOLDEN_PARSER_CASES,
);
printReport(metrics);

const outIndex = process.argv.indexOf("--out");
if (outIndex >= 0) {
  const outPath = process.argv[outIndex + 1];
  if (outPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
    console.info(`report written to ${outPath}`);
  }
}

if (!gatesPass(metrics)) {
  console.error("LLM eval gate failed");
  process.exit(1);
}
console.info(
  live
    ? "LLM eval gate passed (live provider)"
    : "LLM eval gate passed (local parser)",
);
