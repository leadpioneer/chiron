import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  auditEvents,
  coachMentees,
  getDb,
  identities,
  sessions,
  trainingCycles,
  users,
} from "@chiron/db";
import { telegramAllowlist } from "./config";

export class MenteeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "MenteeError";
  }
}

export interface MenteeSummary {
  id: string;
  displayName: string;
  status: string;
  permissions: string;
  hasLogin: boolean;
  cycleStart: string | null;
  cycleEnd: string | null;
  lastCompletedDate: string | null;
}

export async function listMentees(
  coachUserId: string,
): Promise<MenteeSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      status: coachMentees.status,
      permissions: coachMentees.permissions,
    })
    .from(coachMentees)
    .innerJoin(users, eq(users.id, coachMentees.menteeUserId))
    .where(
      and(
        eq(coachMentees.coachUserId, coachUserId),
        eq(coachMentees.status, "ACTIVE"),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(users.displayName));

  const result: MenteeSummary[] = [];
  for (const row of rows) {
    const cycleRows = await db
      .select({
        id: trainingCycles.id,
        startDate: trainingCycles.startDate,
        endDate: trainingCycles.endDate,
      })
      .from(trainingCycles)
      .where(
        and(
          eq(trainingCycles.userId, row.id),
          eq(trainingCycles.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(trainingCycles.createdAt))
      .limit(1);
    const cycle = cycleRows[0];
    let lastCompletedDate: string | null = null;
    if (cycle) {
      const lastRows = await db
        .select({ actualDate: sessions.actualDate })
        .from(sessions)
        .where(
          and(
            eq(sessions.cycleId, cycle.id),
            eq(sessions.status, "COMPLETED"),
          ),
        )
        .orderBy(desc(sessions.actualDate))
        .limit(1);
      lastCompletedDate = lastRows[0]?.actualDate ?? null;
    }
    const identityRows = await db
      .select({ id: identities.id })
      .from(identities)
      .where(eq(identities.userId, row.id))
      .limit(1);
    result.push({
      ...row,
      hasLogin: identityRows.length > 0,
      cycleStart: cycle?.startDate ?? null,
      cycleEnd: cycle?.endDate ?? null,
      lastCompletedDate,
    });
  }
  return result;
}

export async function createManagedMentee(
  coachUserId: string,
  displayName: string,
  telegramId?: string | null,
): Promise<{ id: string; displayName: string }> {
  const name = displayName.trim().slice(0, 60);
  if (name.length === 0) {
    throw new MenteeError("NAME_REQUIRED", "Укажите имя подопечного", 422);
  }
  const normalizedTelegramId = telegramId?.trim() || null;
  if (
    normalizedTelegramId &&
    !/^\d{1,20}$/.test(normalizedTelegramId)
  ) {
    throw new MenteeError(
      "TELEGRAM_ID_INVALID",
      "Telegram ID должен состоять из цифр",
      422,
    );
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const created = await tx
      .insert(users)
      .values({ displayName: name, locale: "ru" })
      .returning({ id: users.id, displayName: users.displayName });
    const mentee = created[0];
    if (!mentee) {
      throw new MenteeError(
        "CREATE_FAILED",
        "Не удалось создать профиль",
        500,
      );
    }
    await tx.insert(coachMentees).values({
      coachUserId,
      menteeUserId: mentee.id,
      status: "ACTIVE",
      permissions: "WRITE",
    });
    if (normalizedTelegramId) {
      const identityRows = await tx
        .insert(identities)
        .values({
          userId: mentee.id,
          provider: "telegram",
          providerUserId: normalizedTelegramId,
        })
        .onConflictDoNothing()
        .returning({ id: identities.id });
      if (identityRows.length === 0) {
        throw new MenteeError(
          "TELEGRAM_ALREADY_LINKED",
          "Этот Telegram уже привязан к другому профилю",
          409,
        );
      }
    }
    await tx.insert(auditEvents).values({
      userId: mentee.id,
      actorUserId: coachUserId,
      entity: "user",
      entityId: mentee.id,
      eventType: "MENTEE_CREATED",
      payload: { coachUserId, hasTelegram: Boolean(normalizedTelegramId) },
      versions: { rules: "1.0.0" },
    });
    return mentee;
  });
}

export async function listUnlinkedTelegramIds(): Promise<string[]> {
  const numeric = telegramAllowlist().filter((entry) => /^\d+$/.test(entry));
  if (numeric.length === 0) return [];
  const rows = await getDb()
    .select({ providerUserId: identities.providerUserId })
    .from(identities)
    .where(
      and(
        eq(identities.provider, "telegram"),
        inArray(identities.providerUserId, numeric),
      ),
    );
  const linked = new Set(rows.map((row) => row.providerUserId));
  return numeric.filter((id) => !linked.has(id));
}

export async function linkExistingMenteeByTelegramId(
  coachUserId: string,
  telegramId: string,
): Promise<{ id: string; displayName: string }> {
  const normalized = telegramId.trim();
  if (!/^\d{1,20}$/.test(normalized)) {
    throw new MenteeError(
      "TELEGRAM_ID_INVALID",
      "Telegram ID должен состоять из цифр",
      422,
    );
  }
  const db = getDb();
  const rows = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      deletedAt: users.deletedAt,
    })
    .from(identities)
    .innerJoin(users, eq(users.id, identities.userId))
    .where(
      and(
        eq(identities.provider, "telegram"),
        eq(identities.providerUserId, normalized),
      ),
    )
    .limit(1);
  const mentee = rows[0];
  if (!mentee || mentee.deletedAt) {
    throw new MenteeError(
      "NOT_FOUND",
      "Пользователь с таким Telegram ID не найден",
      404,
    );
  }
  if (mentee.userId === coachUserId) {
    throw new MenteeError(
      "CANNOT_LINK_SELF",
      "Нельзя связать тренера с самим собой",
      422,
    );
  }

  const activeLinks = await db
    .select({
      coachUserId: coachMentees.coachUserId,
      status: coachMentees.status,
    })
    .from(coachMentees)
    .where(
      and(
        eq(coachMentees.menteeUserId, mentee.userId),
        eq(coachMentees.status, "ACTIVE"),
      ),
    );
  if (activeLinks.some((link) => link.coachUserId !== coachUserId)) {
    throw new MenteeError(
      "ALREADY_HAS_COACH",
      "У пользователя уже есть активный тренер",
      409,
    );
  }

  return db.transaction(async (tx) => {
    const relationRows = await tx
      .insert(coachMentees)
      .values({
        coachUserId,
        menteeUserId: mentee.userId,
        status: "ACTIVE",
        permissions: "WRITE",
      })
      .onConflictDoUpdate({
        target: [coachMentees.coachUserId, coachMentees.menteeUserId],
        set: { status: "ACTIVE", permissions: "WRITE", updatedAt: new Date() },
      })
      .returning({ id: coachMentees.id });
    const relation = relationRows[0];
    if (!relation) {
      throw new MenteeError(
        "LINK_FAILED",
        "Не удалось связать профиль",
        500,
      );
    }
    await tx.insert(auditEvents).values({
      userId: mentee.userId,
      actorUserId: coachUserId,
      entity: "coach_mentee",
      entityId: relation.id,
      eventType: "MENTEE_LINKED",
      payload: { source: "existing_telegram" },
      versions: { rules: "1.0.0" },
    });
    return { id: mentee.userId, displayName: mentee.displayName };
  });
}

export async function revokeMentee(
  coachUserId: string,
  menteeUserId: string,
): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(coachMentees)
      .set({ status: "REVOKED", updatedAt: new Date() })
      .where(
        and(
          eq(coachMentees.coachUserId, coachUserId),
          eq(coachMentees.menteeUserId, menteeUserId),
          eq(coachMentees.status, "ACTIVE"),
        ),
      )
      .returning({ id: coachMentees.id });
    if (rows.length === 0) {
      throw new MenteeError(
        "NOT_FOUND",
        "Активная связь с подопечным не найдена",
        404,
      );
    }
    await tx.insert(auditEvents).values({
      userId: menteeUserId,
      actorUserId: coachUserId,
      entity: "coach_mentee",
      entityId: rows[0]!.id,
      eventType: "MENTEE_REVOKED",
      payload: { coachUserId },
      versions: { rules: "1.0.0" },
    });
  });
}
