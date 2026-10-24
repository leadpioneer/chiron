import { afterEach, describe, expect, it, vi } from "vitest";
import { callOpenAiCompatible, LlmProviderError } from "./llm-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("callOpenAiCompatible", () => {
  it("sends a JSON-mode chat request and returns message content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"schemaVersion":"1.0"}' } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    globalThis.fetch = fetchMock;

    const result = await callOpenAiCompatible({
      baseUrl: "https://routerai.ru/api/v1/",
      apiKey: "test-key",
      model: "~deepseek/deepseek-v4-flash-latest",
      text: "жим 70 на 8",
    });

    expect(result.raw).toBe('{"schemaVersion":"1.0"}');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://routerai.ru/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer test-key",
      "content-type": "application/json",
    });
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format: { type: string };
    };
    expect(body.model).toBe("~deepseek/deepseek-v4-flash-latest");
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[1]).toMatchObject({
      role: "user",
      content: "жим 70 на 8",
    });
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("can disable JSON mode for providers without response_format", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
        status: 200,
      }),
    );
    globalThis.fetch = fetchMock;

    await callOpenAiCompatible({
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
      model: "test-model",
      text: "test",
      jsonMode: false,
    });

    const body = JSON.parse(
      String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body),
    ) as Record<string, unknown>;
    expect(body.response_format).toBeUndefined();
  });

  it("raises a typed error with provider status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("rate limited", { status: 429 }),
    );

    await expect(
      callOpenAiCompatible({
        baseUrl: "https://routerai.ru/api/v1",
        apiKey: "test-key",
        model: "test-model",
        text: "test",
      }),
    ).rejects.toMatchObject<Partial<LlmProviderError>>({
      name: "LlmProviderError",
      message: "LLM HTTP 429",
      status: 429,
    });
  });

  it("rejects an empty message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: " " } }] }), {
        status: 200,
      }),
    );

    await expect(
      callOpenAiCompatible({
        baseUrl: "https://routerai.ru/api/v1",
        apiKey: "test-key",
        model: "test-model",
        text: "test",
      }),
    ).rejects.toBeInstanceOf(LlmProviderError);
  });
});
