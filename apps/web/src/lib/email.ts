import { emailProvider, type EmailProvider } from "./config";

export interface EmailResult {
  ok: boolean;
  provider: EmailProvider;
  code?: "EMAIL_NOT_CONFIGURED" | "EMAIL_FAILED" | "EMAIL_REJECTED";
  message?: string;
}

function appName(): string {
  return process.env.EMAIL_APP_NAME?.trim() || "Chiron";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function magicLinkEmail(url: string): {
  subject: string;
  text: string;
  html: string;
} {
  const name = appName();
  const safeUrl = escapeHtml(url);
  return {
    subject: `${name}: ссылка для входа`,
    text: [
      `Вход в ${name}`,
      "",
      "Откройте ссылку, чтобы войти. Ссылка действует 15 минут и работает один раз.",
      url,
      "",
      "Если вы не запрашивали вход, просто игнорируйте письмо.",
      "Это письмо отправлено автоматически, отвечать на него не нужно.",
    ].join("\n"),
    html: `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#171512;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fffdf8;border:1px solid #ded7c9;border-radius:18px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#7a6f5d;">${escapeHtml(name)}</p>
                <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;">Вход по ссылке</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#3d372e;">Ссылка действует 15 минут и работает один раз.</p>
                <p style="margin:0 0 24px;">
                  <a href="${safeUrl}" style="display:inline-block;background:#c4552d;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:12px;">Войти в ${escapeHtml(name)}</a>
                </p>
                <p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#5d5548;">Если кнопка не работает, скопируйте ссылку:<br><span style="word-break:break-all;">${safeUrl}</span></p>
                <p style="margin:0;font-size:13px;line-height:1.5;color:#7a6f5d;">Если вы не запрашивали вход, просто игнорируйте письмо.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
  };
}

async function sendViaResend(
  to: string,
  url: string,
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      ok: false,
      provider: "resend",
      code: "EMAIL_NOT_CONFIGURED",
      message: "RESEND_API_KEY and EMAIL_FROM are required",
    };
  }

  const message = magicLinkEmail(url);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(process.env.EMAIL_REPLY_TO
          ? { reply_to: process.env.EMAIL_REPLY_TO }
          : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error(
        JSON.stringify({
          event: "email_failed",
          provider: "resend",
          status: response.status,
        }),
      );
      return {
        ok: false,
        provider: "resend",
        code: response.status >= 400 && response.status < 500 ? "EMAIL_REJECTED" : "EMAIL_FAILED",
        message: `Resend HTTP ${response.status}`,
      };
    }
    return { ok: true, provider: "resend" };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "email_failed",
        provider: "resend",
        reason: error instanceof Error ? error.name : "unknown",
      }),
    );
    return {
      ok: false,
      provider: "resend",
      code: "EMAIL_FAILED",
      message: "Resend request failed",
    };
  }
}

async function sendViaWebhook(
  to: string,
  url: string,
): Promise<EmailResult> {
  const webhook = process.env.EMAIL_WEBHOOK_URL;
  if (!webhook) {
    return {
      ok: false,
      provider: "webhook",
      code: "EMAIL_NOT_CONFIGURED",
      message: "EMAIL_WEBHOOK_URL is required",
    };
  }
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to, url }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error(
        JSON.stringify({
          event: "email_failed",
          provider: "webhook",
          status: response.status,
        }),
      );
      return {
        ok: false,
        provider: "webhook",
        code: "EMAIL_FAILED",
        message: `Webhook HTTP ${response.status}`,
      };
    }
    return { ok: true, provider: "webhook" };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "email_failed",
        provider: "webhook",
        reason: error instanceof Error ? error.name : "unknown",
      }),
    );
    return {
      ok: false,
      provider: "webhook",
      code: "EMAIL_FAILED",
      message: "Webhook request failed",
    };
  }
}

export async function sendMagicLinkEmail(
  to: string,
  url: string,
): Promise<EmailResult> {
  const provider = emailProvider();
  if (provider === "console") {
    return { ok: true, provider };
  }
  if (provider === "none") {
    return {
      ok: false,
      provider,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Email delivery is not configured",
    };
  }
  if (provider === "resend") {
    return sendViaResend(to, url);
  }
  return sendViaWebhook(to, url);
}
