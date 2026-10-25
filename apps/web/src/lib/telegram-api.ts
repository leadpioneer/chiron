import http from "node:http";
import tls from "node:tls";

export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

interface RawResponse {
  status: number;
  body: string;
}

interface TelegramResponse {
  ok?: boolean;
  result?: unknown;
  description?: string;
}

function decodeChunked(body: string): string {
  let result = "";
  let index = 0;
  while (index < body.length) {
    const lineEnd = body.indexOf("\r\n", index);
    if (lineEnd < 0) break;
    const size = Number.parseInt(body.slice(index, lineEnd).trim(), 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const start = lineEnd + 2;
    result += body.slice(start, start + size);
    index = start + size + 2;
  }
  return result;
}

function requestViaProxy(
  url: string,
  body: string,
  proxyUrl: string,
  timeoutMs: number,
): Promise<RawResponse> {
  const target = new URL(url);
  const proxy = new URL(proxyUrl);
  const targetPort = target.port || "443";
  const proxyPort = Number(proxy.port || (proxy.protocol === "https:" ? 443 : 80));

  return new Promise((resolve, reject) => {
    const proxyHeaders: Record<string, string> = {
      host: `${target.hostname}:${targetPort}`,
    };
    if (proxy.username) {
      const credentials = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
      proxyHeaders["proxy-authorization"] =
        `Basic ${Buffer.from(credentials).toString("base64")}`;
    }

    const connect = http.request({
      host: proxy.hostname,
      port: proxyPort,
      method: "CONNECT",
      path: `${target.hostname}:${targetPort}`,
      headers: proxyHeaders,
      timeout: timeoutMs,
    });

    connect.on("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(
          new TelegramApiError(
            "CONNECT",
            response.statusCode ?? 0,
            `Proxy CONNECT ${response.statusCode ?? "failed"}`,
          ),
        );
        return;
      }

      const tlsSocket = tls.connect(
        {
          socket,
          servername: target.hostname,
          rejectUnauthorized: true,
          timeout: timeoutMs,
        },
        () => {
          const path = `${target.pathname}${target.search}`;
          const request = [
            `POST ${path} HTTP/1.1`,
            `Host: ${target.hostname}`,
            "Content-Type: application/json",
            `Content-Length: ${Buffer.byteLength(body)}`,
            "Accept-Encoding: identity",
            "Connection: close",
            "",
            body,
          ].join("\r\n");
          tlsSocket.write(request);
        },
      );

      const chunks: Buffer[] = [];
      tlsSocket.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      tlsSocket.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const headerEnd = raw.indexOf("\r\n\r\n");
        if (headerEnd < 0) {
          reject(new TelegramApiError("HTTP", 0, "Malformed proxy response"));
          return;
        }
        const headerLines = raw.slice(0, headerEnd).split("\r\n");
        const statusLine = headerLines.shift() ?? "";
        const match = /^HTTP\/\d\.\d\s+(\d{3})/.exec(statusLine);
        if (!match) {
          reject(new TelegramApiError("HTTP", 0, "Malformed status line"));
          return;
        }
        const headers = new Map<string, string>();
        for (const line of headerLines) {
          const separator = line.indexOf(":");
          if (separator < 0) continue;
          headers.set(
            line.slice(0, separator).trim().toLowerCase(),
            line.slice(separator + 1).trim().toLowerCase(),
          );
        }
        let responseBody = raw.slice(headerEnd + 4);
        if (headers.get("transfer-encoding")?.includes("chunked")) {
          responseBody = decodeChunked(responseBody);
        }
        resolve({ status: Number(match[1]), body: responseBody });
      });
      tlsSocket.on("timeout", () => {
        tlsSocket.destroy(
          new TelegramApiError("HTTP", 0, "Telegram request timed out"),
        );
      });
      tlsSocket.on("error", reject);
    });

    connect.on("timeout", () => {
      connect.destroy(
        new TelegramApiError("CONNECT", 0, "Proxy connection timed out"),
      );
    });
    connect.on("error", reject);
    connect.end();
  });
}

async function requestDirect(
  url: string,
  body: string,
  timeoutMs: number,
): Promise<RawResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, body: await response.text() };
}

export async function telegramApi<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new TelegramApiError(method, 0, "TELEGRAM_BOT_TOKEN is not set");
  }
  const base = process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org";
  const url = `${base}/bot${token}/${method}`;
  const body = JSON.stringify(payload);
  const proxy = process.env.TELEGRAM_PROXY_URL?.trim();
  const timeoutMs = Number(process.env.TELEGRAM_API_TIMEOUT_MS ?? "15000");

  const response = proxy
    ? await requestViaProxy(url, body, proxy, timeoutMs)
    : await requestDirect(url, body, timeoutMs);

  let parsed: TelegramResponse;
  try {
    parsed = JSON.parse(response.body) as TelegramResponse;
  } catch {
    throw new TelegramApiError(
      method,
      response.status,
      "Telegram returned invalid JSON",
    );
  }
  if (response.status < 200 || response.status >= 300 || parsed.ok !== true) {
    throw new TelegramApiError(
      method,
      response.status,
      parsed.description ?? `Telegram HTTP ${response.status}`,
    );
  }
  return parsed.result as T;
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options: {
    replyMarkup?: Record<string, unknown>;
    disableWebPagePreview?: boolean;
  } = {},
): Promise<{ message_id: number }> {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: options.disableWebPagePreview ?? true,
    ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });
}

export async function answerTelegramCallback(
  callbackQueryId: string,
  text: string,
): Promise<void> {
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: false,
  });
}

export async function deleteTelegramMessage(
  chatId: string | number,
  messageId: number,
): Promise<void> {
  await telegramApi("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}

export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  options: { replyMarkup?: Record<string, unknown> } = {},
): Promise<void> {
  await telegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });
}
