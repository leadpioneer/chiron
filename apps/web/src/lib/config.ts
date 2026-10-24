export type EmailProvider = "resend" | "webhook" | "console" | "none";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function authDevModeEnabled(): boolean {
  if (isProduction()) return false;
  return (
    process.env.AUTH_DEV_MODE === "1" || process.env.NODE_ENV !== "production"
  );
}

export function emailProvider(): EmailProvider {
  const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (
    explicit === "resend" ||
    explicit === "webhook" ||
    explicit === "console" ||
    explicit === "none"
  ) {
    return explicit;
  }
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.EMAIL_WEBHOOK_URL) return "webhook";
  return authDevModeEnabled() ? "console" : "none";
}

export function allowedOrigins(): string[] {
  const values = new Set<string>();
  const add = (value: string | undefined): void => {
    if (!value) return;
    try {
      values.add(new URL(value).origin);
    } catch {
      // Ignore malformed configuration; startup validation reports APP_URL.
    }
  };
  add(process.env.APP_URL);
  for (const item of (process.env.ALLOWED_ORIGINS ?? "").split(",")) {
    add(item.trim());
  }
  return [...values];
}

export function telegramAllowlist(): string[] {
  return (process.env.TELEGRAM_ALLOWLIST ?? "")
    .split(",")
    .map((item) => item.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);
}

export function alphaEmailAllowlist(): string[] {
  return (process.env.ALPHA_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function emailAllowedForSignup(email: string): boolean {
  const allowlist = alphaEmailAllowlist();
  if (allowlist.length === 0) return true;
  const normalized = email.trim().toLowerCase();
  if (allowlist.includes(normalized)) return true;
  const domain = normalized.split("@")[1];
  return domain ? allowlist.includes(`*@${domain}`) : false;
}

export function llmEnabled(): boolean {
  return process.env.LLM_ENABLED !== "0";
}

export function llmModel(): string {
  return process.env.LLM_MODEL ?? "gemini-2.5-flash";
}

export interface RuntimeConfigReport {
  production: boolean;
  warnings: string[];
}

export function validateRuntimeConfig(): RuntimeConfigReport {
  const warnings: string[] = [];
  if (!isProduction()) {
    if (!process.env.AUTH_SECRET) {
      warnings.push("AUTH_SECRET is not set; development fallback is used");
    }
    if (alphaEmailAllowlist().length === 0) {
      warnings.push(
        "ALPHA_EMAIL_ALLOWLIST is empty; any email can request a magic link",
      );
    }
    return { production: false, warnings };
  }

  const errors: string[] = [];
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) {
    errors.push("AUTH_SECRET must be at least 32 characters");
  }
  if (process.env.AUTH_DEV_MODE === "1") {
    errors.push("AUTH_DEV_MODE must not be enabled in production");
  }
  const appUrl = process.env.APP_URL ?? "";
  try {
    if (new URL(appUrl).protocol !== "https:") {
      errors.push("APP_URL must use https in production");
    }
  } catch {
    errors.push("APP_URL must be a valid absolute URL");
  }
  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required");
  }
  if (alphaEmailAllowlist().length === 0) {
    errors.push(
      "ALPHA_EMAIL_ALLOWLIST must be set: public email registration is disabled in alpha",
    );
  }
  if (emailProvider() === "none" || emailProvider() === "console") {
    errors.push(
      "Email delivery is not configured: set EMAIL_PROVIDER=resend or webhook",
    );
  }
  if (emailProvider() === "resend") {
    if (!process.env.RESEND_API_KEY) {
      errors.push("RESEND_API_KEY is required for EMAIL_PROVIDER=resend");
    }
    if (!process.env.EMAIL_FROM) {
      errors.push("EMAIL_FROM is required for EMAIL_PROVIDER=resend");
    }
  }
  if (emailProvider() === "webhook" && !process.env.EMAIL_WEBHOOK_URL) {
    errors.push("EMAIL_WEBHOOK_URL is required for EMAIL_PROVIDER=webhook");
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    warnings.push("TELEGRAM_BOT_TOKEN is not set; Telegram login is disabled");
  }
  if (llmEnabled() && !process.env.GEMINI_API_KEY) {
    warnings.push("GEMINI_API_KEY is not set; LLM uses the local parser");
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid production configuration:\n- ${errors.join("\n- ")}`,
    );
  }

  return { production: true, warnings };
}
