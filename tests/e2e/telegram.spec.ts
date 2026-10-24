import { createHash, createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

const BOT_TOKEN = "123456:e2e-telegram-token";

function initData(
  user: Record<string, unknown>,
  authDate = Math.floor(Date.now() / 1000),
): string {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("user", JSON.stringify(user));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();
  const hash = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function widgetParams(
  user: Record<string, string>,
  authDate = Math.floor(Date.now() / 1000),
): Record<string, string> {
  const params: Record<string, string> = {
    ...user,
    auth_date: String(authDate),
  };
  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHash("sha256").update(BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");
  return { ...params, hash };
}

test("telegram mini app login accepts allowlisted users", async ({ page }) => {
  const response = await page.request.post("/api/auth/telegram", {
    data: {
      initData: initData({
        id: 900000001,
        first_name: "E2E",
        username: "e2e_telegram",
      }),
    },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding/);
});

test("telegram mini app rejects users outside the allowlist", async ({
  request,
}) => {
  const response = await request.post("/api/auth/telegram", {
    data: {
      initData: initData({
        id: 900000002,
        first_name: "Blocked",
        username: "blocked_user",
      }),
    },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe("TELEGRAM_NOT_ALLOWED");
});

test("telegram mini app rejects stale initData", async ({ request }) => {
  const response = await request.post("/api/auth/telegram", {
    data: {
      initData: initData(
        { id: 900000004, first_name: "Stale", username: "e2e_telegram" },
        Math.floor(Date.now() / 1000) - 90_000,
      ),
    },
  });
  expect(response.status()).toBe(401);
});

test("telegram login widget accepts a valid payload", async ({ request }) => {
  const response = await request.post("/api/auth/telegram/widget", {
    data: {
      params: widgetParams({
        id: "900000003",
        first_name: "Widget",
        username: "widget_user",
      }),
    },
  });
  expect(response.ok()).toBeTruthy();
});

test("telegram login widget rejects a forged hash", async ({ request }) => {
  const params = widgetParams({
    id: "900000005",
    first_name: "Forged",
    username: "allowed_user",
  });
  params.hash = "0".repeat(64);
  const response = await request.post("/api/auth/telegram/widget", {
    data: { params },
  });
  expect(response.status()).toBe(401);
});
