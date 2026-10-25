import { expect, test } from "@playwright/test";
import { SignJWT, jwtVerify } from "jose";
import {
  createDb,
  getUserByEmail,
  login,
  uniqueEmail,
} from "./helpers";

const E2E_AUTH_SECRET = "e2e-secret-change-me-32-characters";

test("magic link requests are rate limited per email", async ({ request }) => {
  const email = uniqueEmail("rate-limit");
  const first = await request.post("/api/auth/request-link", { data: { email } });
  expect(first.status()).toBe(200);

  const second = await request.post("/api/auth/request-link", {
    data: { email },
  });
  expect(second.status()).toBe(429);
  expect(Number(second.headers()["retry-after"])).toBeGreaterThan(0);
});

test("email signup outside the alpha allowlist is rejected", async ({
  request,
}) => {
  const response = await request.post("/api/auth/request-link", {
    data: { email: "blocked@example.com" },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe("EMAIL_NOT_ALLOWED");
});

test("cross-origin mutation is rejected", async ({ request }) => {
  const response = await request.post("/api/auth/request-link", {
    headers: { origin: "https://evil.example" },
    data: { email: uniqueEmail("csrf") },
  });
  expect(response.status()).toBe(403);
  expect((await response.json()).code).toBe("CSRF_REJECTED");
});

test("deleted account is not resurrected by a magic link", async ({
  page,
}) => {
  const email = uniqueEmail("deleted");
  const sql = createDb();
  try {
    await login(page, email);
    await sql`delete from magic_links where email = ${email}`;
    await sql`
      update users
      set deleted_at = now()
      where email = ${email}
    `;

    const response = await page.request.post("/api/auth/request-link", {
      data: { email },
    });
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { devLink?: string };
    expect(body.devLink).toBeTruthy();

    await page.goto(body.devLink!);
    await expect(page).toHaveURL(/\/login\?error=account_deleted/);
    await expect(page.getByText(/аккаунт удалён/i)).toBeVisible();
  } finally {
    await sql.end();
  }
});

test("session cookie is rotated after seven days", async ({ page }) => {
  const email = uniqueEmail("rotation");
  const sql = createDb();
  try {
    await login(page, email);
    const user = await getUserByEmail(sql, email);

    const oldIssuedAt = Math.floor(Date.now() / 1000) - 8 * 24 * 60 * 60;
    const staleToken = await new SignJWT({ sub: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(oldIssuedAt)
      .setExpirationTime("30d")
      .sign(new TextEncoder().encode(E2E_AUTH_SECRET));

    await page.context().addCookies([
      {
        name: "chiron_session",
        value: staleToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.goto("/");
    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === "chiron_session");
    expect(session).toBeTruthy();
    expect(session!.value).not.toBe(staleToken);

    const { payload } = await jwtVerify(
      session!.value,
      new TextEncoder().encode(E2E_AUTH_SECRET),
    );
    const issuedAt = Number(payload.iat ?? 0);
    expect(Date.now() / 1000 - issuedAt).toBeLessThan(120);
  } finally {
    await sql.end();
  }
});

test("telegram webhook rejects requests without the secret", async ({
  request,
}) => {
  const response = await request.post("/api/telegram/webhook", {
    data: { update_id: 1 },
  });
  expect(response.status()).toBe(403);
});

test("security headers are present", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
});
