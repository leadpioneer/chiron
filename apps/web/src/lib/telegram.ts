import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export interface TelegramUser {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
}

export interface TelegramVerification {
  ok: boolean;
  user: TelegramUser | null;
  reason: string | null;
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): TelegramVerification {
  if (!botToken) {
    return { ok: false, user: null, reason: "TELEGRAM_BOT_TOKEN is not set" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, user: null, reason: "Missing hash" };
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(hash, "hex");
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return { ok: false, user: null, reason: "Invalid hash" };
  }

  const authDate = Number(params.get("auth_date") ?? "0");
  if (!Number.isFinite(authDate) || nowSeconds - authDate > 86_400) {
    return { ok: false, user: null, reason: "Stale initData" };
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    return { ok: false, user: null, reason: "Missing user" };
  }

  try {
    const parsed = JSON.parse(rawUser) as {
      id?: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    if (!parsed.id || !parsed.first_name) {
      return { ok: false, user: null, reason: "Malformed user" };
    }
    return {
      ok: true,
      user: {
        id: String(parsed.id),
        firstName: parsed.first_name,
        lastName: parsed.last_name ?? null,
        username: parsed.username ?? null,
        languageCode: parsed.language_code ?? null,
      },
      reason: null,
    };
  } catch {
    return { ok: false, user: null, reason: "Malformed user JSON" };
  }
}

export function verifyTelegramLogin(
  params: Record<string, string>,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): TelegramVerification {
  if (!botToken) {
    return { ok: false, user: null, reason: "TELEGRAM_BOT_TOKEN is not set" };
  }

  const hash = params.hash;
  if (!hash) {
    return { ok: false, user: null, reason: "Missing hash" };
  }

  const dataCheckString = Object.entries(params)
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest();
  const provided = Buffer.from(hash, "hex");
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return { ok: false, user: null, reason: "Invalid hash" };
  }

  const authDate = Number(params.auth_date ?? "0");
  if (!Number.isFinite(authDate) || nowSeconds - authDate > 86_400) {
    return { ok: false, user: null, reason: "Stale login data" };
  }

  const id = params.id;
  const firstName = params.first_name;
  if (!id || !firstName) {
    return { ok: false, user: null, reason: "Malformed user" };
  }

  return {
    ok: true,
    user: {
      id,
      firstName,
      lastName: params.last_name ?? null,
      username: params.username ?? null,
      languageCode: params.language_code ?? null,
    },
    reason: null,
  };
}
