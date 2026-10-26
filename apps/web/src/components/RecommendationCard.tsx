"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PrescriptionSnapshot } from "@chiron/core";
import { formatWeight } from "@/src/lib/dates";

export interface RecommendationItemView {
  prescriptionId: string;
  exerciseName: string;
  variantName: string;
  role: string;
  blockName: string;
  before: PrescriptionSnapshot;
  after: PrescriptionSnapshot;
}

export interface RecommendationClientView {
  id: string;
  sessionId: string | null;
  action: string;
  scopeType: string;
  scopeId: string;
  status: string;
  explanation: string;
  reasons: string[];
  ruleIds: string[];
  safety: {
    label: string;
    reasons: string[];
    blockProgression: boolean;
    pause: boolean;
    escalate: boolean;
  };
  changes: unknown[];
  items: RecommendationItemView[];
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  PROGRESS: "Повышение",
  HOLD: "Удержание",
  LOCAL_REDUCE: "Локальное снижение",
  DELOAD: "Разгрузка",
  SUBSTITUTE: "Замена варианта",
  REBUILD: "Пересборка цикла",
  PAUSE: "Пауза",
  ESCALATE: "Внешняя оценка",
};

const SCOPE_LABELS: Record<string, string> = {
  EXERCISE: "упражнение",
  TARGET_BLOCK: "целевой блок",
  SESSION: "тренировка",
  CYCLE: "цикл",
};

const REASONS = [
  ["DISAGREE", "не согласен с методикой"],
  ["TOO_HARD", "слишком тяжело"],
  ["TOO_EASY", "слишком легко"],
  ["NO_TIME", "нет времени"],
  ["EQUIPMENT", "нет оборудования"],
  ["PAIN", "боль или дискомфорт"],
  ["OTHER", "другое"],
] as const;

function loadLabel(item: PrescriptionSnapshot): string {
  if (item.loadMode === "ASSISTED") {
    return `${formatWeight(item.assistanceKg, { unit: "кг" })} помощи`;
  }
  if (item.loadMode === "BODYWEIGHT_PLUS") {
    return `+${formatWeight(item.addedKg, { unit: "кг" })}`;
  }
  if (item.loadMode === "BODYWEIGHT") return "свой вес";
  return formatWeight(item.weightKg, { unit: "кг" });
}

function diffText(before: PrescriptionSnapshot, after: PrescriptionSnapshot): {
  before: string;
  after: string;
} {
  const partsBefore: string[] = [];
  const partsAfter: string[] = [];

  const loadChanged =
    before.weightKg !== after.weightKg ||
    before.assistanceKg !== after.assistanceKg ||
    before.addedKg !== after.addedKg;
  if (loadChanged) {
    partsBefore.push(loadLabel(before));
    partsAfter.push(loadLabel(after));
  }
  if (before.targetReps !== after.targetReps) {
    partsBefore.push(`цель ${before.targetReps}`);
    partsAfter.push(`цель ${after.targetReps}`);
  }
  if (before.sets !== after.sets) {
    partsBefore.push(`${before.sets} подх.`);
    partsAfter.push(`${after.sets} подх.`);
  }
  if (partsBefore.length === 0) {
    return { before: "без изменений", after: "без изменений" };
  }
  return {
    before: partsBefore.join(" · "),
    after: partsAfter.join(" · "),
  };
}

interface Draft {
  load: string;
  targetReps: string;
  sets: string;
}

function initialDraft(item: RecommendationItemView): Draft {
  const value =
    item.after.loadMode === "ASSISTED"
      ? item.after.assistanceKg
      : item.after.loadMode === "BODYWEIGHT_PLUS"
        ? item.after.addedKg
        : item.after.loadMode === "BODYWEIGHT"
          ? null
          : item.after.weightKg;
  return {
    load: value === null ? "" : String(value),
    targetReps: String(item.after.targetReps),
    sets: String(item.after.sets),
  };
}

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function RecommendationCard({
  recommendation,
}: {
  recommendation: RecommendationClientView;
}) {
  const router = useRouter();
  const items = recommendation.items;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.map((item) => item.prescriptionId)),
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      items.map((item) => [item.prescriptionId, initialDraft(item)]),
    ),
  );
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<string>("DISAGREE");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const changeIds = useMemo(
    () =>
      new Set(
        (recommendation.changes as Array<{ prescriptionId: string }>).map(
          (change) => change.prescriptionId,
        ),
      ),
    [recommendation.changes],
  );
  const canEdit = changeIds.size > 0;

  const changed = useMemo(() => {
    if (items.length !== selected.size) return true;
    return items.some((item) => {
      const draft = drafts[item.prescriptionId];
      if (!draft) return true;
      return (
        draft.load !== initialDraft(item).load ||
        draft.targetReps !== initialDraft(item).targetReps ||
        draft.sets !== initialDraft(item).sets
      );
    });
  }, [drafts, items, selected]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id]!, ...patch },
    }));
  }

  function buildEdits() {
    return items
      .filter(
        (item) =>
          selected.has(item.prescriptionId) &&
          changeIds.has(item.prescriptionId),
      )
      .map((item) => {
        const draft = drafts[item.prescriptionId] ?? initialDraft(item);
        const load = parseNumber(draft.load);
        return {
          prescriptionId: item.prescriptionId,
          weightKg: item.after.loadMode === "EXTERNAL" ? load : null,
          assistanceKg: item.after.loadMode === "ASSISTED" ? load : null,
          addedKg: item.after.loadMode === "BODYWEIGHT_PLUS" ? load : null,
          targetReps: parseNumber(draft.targetReps),
          sets: parseNumber(draft.sets),
        };
      });
  }

  async function decide(outcome: "ACCEPTED" | "EDITED" | "REJECTED") {
    setBusy(true);
    setError(null);
    if (outcome !== "REJECTED" && items.length > 0 && selected.size === 0) {
      setError("Выберите хотя бы одно упражнение.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/recommendations/${recommendation.id}/decision`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            outcome,
            reasonCategory: outcome === "REJECTED" ? reason : null,
            comment: comment.trim() === "" ? null : comment.trim(),
            edits: outcome === "REJECTED" ? [] : buildEdits(),
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось сохранить решение.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Сеть недоступна.");
    } finally {
      setBusy(false);
    }
  }

  const isSafety = ["PAUSE", "ESCALATE"].includes(recommendation.action);
  const multi = items.length > 1;

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span
              className={
                isSafety ? "badge badge-danger" : "badge badge-primary"
              }
            >
              {ACTION_LABELS[recommendation.action] ?? recommendation.action}
            </span>
            <span className="badge">
              {SCOPE_LABELS[recommendation.scopeType] ??
                recommendation.scopeType}
            </span>
          </div>
          <h2 className="card-title" style={{ marginTop: 10 }}>
            {recommendation.explanation}
          </h2>
        </div>
      </div>

      {recommendation.reasons.length > 0 ? (
        <ul className="small muted" style={{ margin: "0 0 12px", paddingLeft: 18 }}>
          {recommendation.reasons.map((reasonText) => (
            <li key={reasonText}>{reasonText}</li>
          ))}
        </ul>
      ) : null}

      {recommendation.safety.label !== "GREEN" ? (
        <div
          className={`notice${
            recommendation.safety.label === "RED" ? " notice-red" : ""
          }`}
          style={{ marginBottom: 12 }}
        >
          {recommendation.safety.reasons.join(" ") ||
            "Есть сигнал безопасности. Повышение ограничено."}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="stack">
          {items.map((item) => {
            const diff = diffText(item.before, item.after);
            const draft = drafts[item.prescriptionId] ?? initialDraft(item);
            return (
              <div key={item.prescriptionId} className="exercise">
                <div className="exercise-head">
                  <div>
                    <div className="exercise-name">
                      {item.exerciseName}
                      {multi ? (
                        <label
                          className="tiny muted"
                          style={{ marginLeft: 10, fontWeight: 500 }}
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(item.prescriptionId)}
                            onChange={() => toggleSelected(item.prescriptionId)}
                            disabled={busy}
                          />{" "}
                          применить
                        </label>
                      ) : null}
                    </div>
                    <div className="exercise-target">
                      {item.variantName} · {item.blockName} · {item.role}
                    </div>
                  </div>
                </div>
                <div className="diff">
                  <span className="diff-before">{diff.before}</span>
                  <span className="diff-arrow">→</span>
                  <span className="diff-after">{diff.after}</span>
                </div>

                {editing &&
                canEdit &&
                selected.has(item.prescriptionId) &&
                changeIds.has(item.prescriptionId) ? (
                  <div className="grid grid-3" style={{ marginTop: 8 }}>
                    <label className="field">
                      <span className="label">Нагрузка</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={draft.load}
                        onChange={(event) =>
                          setDraft(item.prescriptionId, {
                            load: event.target.value,
                          })
                        }
                        disabled={busy || item.after.loadMode === "BODYWEIGHT"}
                      />
                    </label>
                    <label className="field">
                      <span className="label">Цель повторов</span>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={draft.targetReps}
                        onChange={(event) =>
                          setDraft(item.prescriptionId, {
                            targetReps: event.target.value,
                          })
                        }
                        disabled={busy}
                      />
                    </label>
                    <label className="field">
                      <span className="label">Подходы</span>
                      <input
                        className="input"
                        inputMode="numeric"
                        value={draft.sets}
                        onChange={(event) =>
                          setDraft(item.prescriptionId, {
                            sets: event.target.value,
                          })
                        }
                        disabled={busy}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="small muted">
          {isSafety
            ? "План не меняется: решение ограничивает тренировочные рекомендации."
            : "План не меняется."}
        </p>
      )}

      {rejecting ? (
        <div className="stack" style={{ marginTop: 14 }}>
          <div className="field">
            <span className="label">Причина отказа</span>
            <select
              className="select"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
            >
              {REASONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <label className="field">
            <span className="label">Комментарий</span>
            <input
              className="input"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Необязательно"
              maxLength={1000}
              disabled={busy}
            />
          </label>
          <div className="row wrap">
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => decide("REJECTED")}
              disabled={busy}
            >
              Подтвердить отказ
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setRejecting(false)}
              disabled={busy}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="row wrap" style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => decide(changed ? "EDITED" : "ACCEPTED")}
            disabled={busy || done || (items.length > 0 && selected.size === 0)}
          >
            {busy ? "Сохраняю…" : done ? "Сохранено" : "Подтвердить"}
          </button>
          {items.length > 0 && canEdit ? (
            <button
              className="btn"
              type="button"
              onClick={() => setEditing((value) => !value)}
              disabled={busy || done}
            >
              {editing ? "Скрыть правку" : "Изменить"}
            </button>
          ) : null}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setRejecting(true)}
            disabled={busy || done}
          >
            Отклонить
          </button>
        </div>
      )}

      {error ? <p className="error" style={{ marginTop: 10 }}>{error}</p> : null}
      <p className="tiny muted" style={{ margin: "12px 0 0" }}>
        Правила: {recommendation.ruleIds.join(", ") || "—"} · решение сохранится
        в audit.
      </p>
    </article>
  );
}
