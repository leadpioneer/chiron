"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  LlmResponse,
  LoadMode,
  SetType,
  Technique,
} from "@chiron/contracts";
import { RED_FLAG_TEXT } from "@chiron/core";
import { formatDate, formatRange, formatWeight } from "@/src/lib/dates";

interface LastSet {
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
  reps: number;
  rir: number | null;
  technique: string;
}

interface ClientPrescription {
  id: string;
  exerciseName: string;
  variantName: string;
  role: string;
  targetBlockKey: string;
  targetBlockName: string;
  supportsPrimaryId: string | null;
  optional: boolean;
  sets: number;
  repMin: number;
  repMax: number;
  targetReps: number;
  targetRir: number;
  loadMode: LoadMode;
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
  incrementKg: number;
  pair: boolean;
  sides: number;
  lastSets: LastSet[];
  technique: {
    nameRu: string | null;
    instructions: string[];
    equipmentRu: string | null;
    images: string[];
  } | null;
}

interface SavedSet {
  clientSetId: string;
  prescriptionId: string;
  actualOrder: number;
  setType: string;
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
  reps: number;
  rir: number | null;
  technique: string;
  pain: boolean;
  completed: boolean;
}

interface ClientBlock {
  id: string;
  key: string;
  name: string;
  goal: string;
  prescriptions: ClientPrescription[];
}

interface ClientView {
  session: {
    id: string;
    sessionKey: string;
    plannedDate: string;
    status: string;
    isReturn: boolean;
  };
  blocks: ClientBlock[];
  sets: SavedSet[];
}

type ParsedSet = LlmResponse["parsedFacts"]["sets"][number];

interface Row {
  clientSetId: string;
  weight: string;
  assistance: string;
  added: string;
  reps: string;
  rir: number | null;
  technique: Technique;
  pain: boolean;
  saved: boolean;
  saving: boolean;
  error: string | null;
  setType: SetType;
}

function numberText(value: number | null): string {
  return value === null ? "" : String(value);
}

function parseNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function buildInitialRows(view: ClientView): Record<string, Row[]> {
  const result: Record<string, Row[]> = {};
  for (const block of view.blocks) {
    for (const prescription of block.prescriptions) {
      const saved = view.sets
        .filter((set) => set.prescriptionId === prescription.id)
        .sort((a, b) => a.actualOrder - b.actualOrder);
      const rows: Row[] = [];
      for (let index = 0; index < prescription.sets; index += 1) {
        const savedSet = saved.find((set) => set.actualOrder === index);
        const last =
          prescription.lastSets[index] ??
          prescription.lastSets[prescription.lastSets.length - 1];
        rows.push({
          clientSetId: savedSet?.clientSetId ?? crypto.randomUUID(),
          weight: numberText(
            savedSet?.weightKg ?? last?.weightKg ?? prescription.weightKg,
          ),
          assistance: numberText(
            savedSet?.assistanceKg ??
              last?.assistanceKg ??
              prescription.assistanceKg,
          ),
          added: numberText(
            savedSet?.addedKg ?? last?.addedKg ?? prescription.addedKg,
          ),
          reps: String(savedSet?.reps ?? last?.reps ?? prescription.targetReps),
          rir: savedSet?.rir ?? last?.rir ?? null,
          technique:
            (savedSet?.technique as Technique | undefined) ??
            (last?.technique as Technique | undefined) ??
            "NORMAL",
          pain: savedSet?.pain ?? false,
          saved: savedSet?.completed ?? false,
          saving: false,
          error: null,
          setType: (savedSet?.setType as SetType | undefined) ?? "WORKING",
        });
      }
      result[prescription.id] = rows;
    }
  }
  return result;
}

function calibrationHint(prescription: ClientPrescription): string | null {
  if (prescription.loadMode === "EXTERNAL" && prescription.weightKg === null) {
    return "Калибровка: введите рабочий вес. Он станет базой для следующих сессий.";
  }
  if (
    prescription.loadMode === "ASSISTED" &&
    prescription.assistanceKg === null
  ) {
    return "Калибровка: введите помощь гравитрона. Она станет базой для следующих сессий.";
  }
  if (
    prescription.loadMode === "BODYWEIGHT_PLUS" &&
    prescription.addedKg === null
  ) {
    return "Калибровка: введите добавленный вес. Он станет базой для следующих сессий.";
  }
  return null;
}

function lastSetSummary(prescription: ClientPrescription): string {
  if (prescription.lastSets.length === 0) return "нет прошлой экспозиции";
  return prescription.lastSets
    .slice(0, 4)
    .map((set) => {
      if (prescription.loadMode === "ASSISTED") {
        return `${formatWeight(set.assistanceKg, { unit: "кг" })} помощи × ${set.reps}`;
      }
      if (prescription.loadMode === "BODYWEIGHT_PLUS") {
        return `+${formatWeight(set.addedKg, { unit: "кг" })} × ${set.reps}`;
      }
      if (prescription.loadMode === "BODYWEIGHT") {
        return `${set.reps} повторов`;
      }
      return `${formatWeight(set.weightKg, { unit: "кг" })} × ${set.reps}`;
    })
    .join(" · ");
}

export function SessionLogger({ view }: { view: ClientView }) {
  const [rows, setRows] = useState<Record<string, Row[]>>(() =>
    buildInitialRows(view),
  );
  const [sleep, setSleep] = useState("");
  const [fatigue, setFatigue] = useState<number | null>(null);
  const [pain, setPain] = useState(false);
  const [wellnessState, setWellnessState] = useState<string | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [sessionRpe, setSessionRpe] = useState("MODERATE");
  const [comment, setComment] = useState("");
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [parseBusy, setParseBusy] = useState(false);
  const [parseMessage, setParseMessage] = useState<string | null>(null);
  const [parseSafety, setParseSafety] = useState<string | null>(null);
  const [stopSession, setStopSession] = useState(false);
  const readOnly = view.session.status === "COMPLETED";

  const savedCount = useMemo(
    () =>
      Object.values(rows)
        .flat()
        .filter((row) => row.saved).length,
    [rows],
  );

  useEffect(() => {
    if (!restRunning) return;
    if (restSeconds <= 0) {
      setRestRunning(false);
      return;
    }
    const timer = window.setTimeout(
      () => setRestSeconds((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [restRunning, restSeconds]);

  function patchRow(
    prescriptionId: string,
    index: number,
    patch: Partial<Row>,
  ) {
    setRows((current) => ({
      ...current,
      [prescriptionId]: current[prescriptionId]!.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  async function saveSet(
    prescription: ClientPrescription,
    index: number,
  ) {
    const row = rows[prescription.id]?.[index];
    if (!row) return;
    if (stopSession) {
      patchRow(prescription.id, index, {
        error: "Тренировка остановлена. Завершите её, чтобы сохранить состояние.",
      });
      return;
    }
    const reps = parseNumber(row.reps);
    if (reps === null || reps < 1) {
      patchRow(prescription.id, index, { error: "Укажите повторы." });
      return;
    }

    let weightKg: number | null = null;
    let assistanceKg: number | null = null;
    let addedKg: number | null = null;

    if (prescription.loadMode === "EXTERNAL") {
      weightKg = parseNumber(row.weight);
      if (weightKg === null) {
        patchRow(prescription.id, index, { error: "Укажите вес." });
        return;
      }
    } else if (prescription.loadMode === "ASSISTED") {
      assistanceKg = parseNumber(row.assistance);
      if (assistanceKg === null) {
        patchRow(prescription.id, index, { error: "Укажите помощь." });
        return;
      }
    } else if (prescription.loadMode === "BODYWEIGHT_PLUS") {
      addedKg = parseNumber(row.added);
      if (addedKg === null) {
        patchRow(prescription.id, index, { error: "Укажите добавленный вес." });
        return;
      }
    }

    patchRow(prescription.id, index, { saving: true, error: null });
    try {
      const response = await fetch(`/api/sessions/${view.session.id}/sets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientSetId: row.clientSetId,
          prescriptionId: prescription.id,
          setType: row.setType,
          weightKg,
          assistanceKg,
          addedKg,
          reps,
          rir: row.rir,
          technique: row.technique,
          pain: row.pain,
          completed: true,
          actualOrder: index,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        patchRow(prescription.id, index, {
          saving: false,
          error: payload.error ?? "Не удалось сохранить подход.",
        });
        return;
      }
      patchRow(prescription.id, index, { saving: false, saved: true });
      setRestSeconds(prescription.role === "PRIMARY" ? 150 : 90);
      setRestRunning(true);
    } catch {
      patchRow(prescription.id, index, {
        saving: false,
        error: "Сеть недоступна.",
      });
    }
  }

  async function saveWellness() {
    setWellnessState(null);
    try {
      const response = await fetch(
        `/api/sessions/${view.session.id}/wellness`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sleepHours: parseNumber(sleep),
            sleepQuality: null,
            fatigue,
            stress: null,
            motivation: null,
            soreness: pain ? "LOCAL" : "NONE",
            symptom: pain,
            symptomText: null,
            illness: "NONE",
          }),
        },
      );
      if (!response.ok) {
        setWellnessState("Не удалось сохранить чек-ин.");
        return;
      }
      setWellnessState("Сохранено.");
    } catch {
      setWellnessState("Сеть недоступна.");
    }
  }

  async function parseQuickText() {
    if (quickText.trim() === "") return;
    setParseBusy(true);
    setParseMessage(null);
    setParseSafety(null);
    try {
      const response = await fetch(
        `/api/sessions/${view.session.id}/parse`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: quickText }),
        },
      );
      const payload = (await response.json()) as {
        parsed?: LlmResponse;
        safety?: { label: string; reasons: string[] };
        error?: string;
      };
      if (!response.ok || !payload.parsed) {
        setParseMessage(payload.error ?? "Не удалось разобрать текст.");
        return;
      }

      const parsed = payload.parsed;
      const label =
        payload.safety?.label ??
        parsed.safetyObservations[0]?.code ??
        null;
      setParseSafety(label);
      if (label === "RED") setStopSession(true);

      const alias = parsed.parsedFacts.exerciseAlias?.toLowerCase() ?? "";
      const allPrescriptions = view.blocks.flatMap(
        (block) => block.prescriptions,
      );
      const matches = alias
        ? allPrescriptions.filter(
            (item) =>
              item.exerciseName.toLowerCase().includes(alias) ||
              alias.includes(item.exerciseName.toLowerCase()),
          )
        : [];
      if (matches.length !== 1) {
        setParseMessage(
          matches.length === 0
            ? "В тексте не указано упражнение. Назовите его и повторите."
            : "Упражнение неоднозначно. Уточните название.",
        );
        return;
      }
      const target = matches[0]!;
      const parsedSets = parsed.parsedFacts.sets.filter(
        (set): set is ParsedSet & { reps: number } => set.reps !== null,
      );
      if (parsedSets.length === 0) {
        setParseMessage("Не удалось найти подходы. Укажите вес и повторы.");
        return;
      }

      setRows((current) => {
        const existing = current[target.id] ?? [];
        return {
          ...current,
          [target.id]: existing.map((row, index) => {
            const source = parsedSets[index];
            if (!source) return row;
            return {
              ...row,
              weight:
                source.weightKg !== null
                  ? String(source.weightKg)
                  : row.weight,
              assistance:
                source.assistanceKg !== null
                  ? String(source.assistanceKg)
                  : row.assistance,
              added:
                source.addedKg !== null ? String(source.addedKg) : row.added,
              reps: String(source.reps),
              rir: source.rir ?? row.rir,
              saved: false,
              error: null,
            };
          }),
        };
      });
      setParseMessage(
        `Заполнено ${Math.min(parsedSets.length, target.sets)} подходов для «${target.exerciseName}». Проверьте и сохраните.`,
      );
    } catch {
      setParseMessage("Сеть недоступна.");
    } finally {
      setParseBusy(false);
    }
  }

  async function completeSession() {
    setCompleting(true);
    setCompleteError(null);
    const safetyNote =
      parseSafety && parseSafety !== "GREEN" ? quickText.trim() : "";
    const combinedComment = [comment.trim(), safetyNote]
      .filter(Boolean)
      .join(" | ");
    try {
      const response = await fetch(
        `/api/sessions/${view.session.id}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionRpe,
            comment: combinedComment === "" ? null : combinedComment,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setCompleteError(payload.error ?? "Не удалось завершить тренировку.");
        return;
      }
      window.location.href = "/recommendations";
    } catch {
      setCompleteError("Сеть недоступна.");
    } finally {
      setCompleting(false);
    }
  }

  const step = (value: string, delta: number, min = 0): string => {
    const parsed = parseNumber(value);
    if (parsed === null) return String(min);
    return String(Math.max(min, Math.round((parsed + delta) * 100) / 100));
  };

  function adjustLoad(
    prescription: ClientPrescription,
    row: Row,
    index: number,
    delta: number,
  ) {
    if (prescription.loadMode === "ASSISTED") {
      patchRow(prescription.id, index, {
        assistance: step(row.assistance, delta, 0),
      });
      return;
    }
    if (prescription.loadMode === "BODYWEIGHT_PLUS") {
      patchRow(prescription.id, index, {
        added: step(row.added, delta, 0),
      });
      return;
    }
    patchRow(prescription.id, index, {
      weight: step(row.weight, delta, 0),
    });
  }

  return (
    <div>
      <div className="row-between wrap" style={{ marginBottom: 16 }}>
        <div>
          <p className="eyebrow">Тренировка</p>
          <h1 className="page-title">
            {view.session.sessionKey === "A" ? "Тяни" : "Толкай"}
          </h1>
          {view.session.isReturn ? (
            <span className="badge badge-primary">Возвращение</span>
          ) : null}
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {formatDate(view.session.plannedDate)} · сохранено подходов:{" "}
            {savedCount}
            {readOnly ? " · завершена" : ""}
          </p>
        </div>
        <Link className="btn btn-ghost btn-sm" href="/today">
          К сегодня
        </Link>
      </div>

      {view.session.isReturn ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          <strong>Возвращение после паузы.</strong> Нагрузка снижена, целевой RIR
          3–4. Прогрессия временно заблокирована: задача — повторить нагрузку и
          восстановить переносимость.
        </div>
      ) : null}

      {readOnly ? (
        <div className="notice" style={{ marginBottom: 14 }}>
          Тренировка уже завершена. Изменения подходов и новая рекомендация не
          создаются.
        </div>
      ) : null}

      {stopSession && !readOnly ? (
        <div className="notice notice-red" style={{ marginBottom: 14 }}>
          <strong>Тренировка остановлена.</strong> {RED_FLAG_TEXT}
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button
              className="btn btn-danger btn-sm"
              type="button"
              onClick={() => setCompleteOpen(true)}
            >
              Завершить и сохранить
            </button>
          </div>
        </div>
      ) : null}

      <section className="card">
        <div className="card-head">
          <div>
            <h2 className="card-title">Самочувствие</h2>
            <p className="small muted" style={{ margin: "4px 0 0" }}>
              Необязательно. Три ответа помогают не повышать нагрузку вслепую.
            </p>
          </div>
          {wellnessState ? (
            <span className="tiny success">{wellnessState}</span>
          ) : null}
        </div>
        <div className="grid grid-3">
          <label className="field">
            <span className="label">Сон, часов</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="7"
              value={sleep}
              onChange={(event) => setSleep(event.target.value)}
              disabled={readOnly}
            />
          </label>
          <div className="field">
            <span className="label">Усталость</span>
            <div className="chip-row">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`chip${fatigue === value ? " active" : ""}`}
                  onClick={() => setFatigue(value)}
                  disabled={readOnly}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">Боль или симптом</span>
            <button
              type="button"
              className={`chip${pain ? " active" : ""}`}
              onClick={() => setPain((value) => !value)}
              disabled={readOnly}
            >
              {pain ? "есть" : "нет"}
            </button>
          </div>
        </div>
        <button
          className="btn btn-sm"
          type="button"
          onClick={saveWellness}
          disabled={readOnly}
          style={{ marginTop: 12 }}
        >
          Сохранить чек-ин
        </button>
      </section>

      {!readOnly && !stopSession ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2 className="card-title">Быстрый ввод</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Опишите подходы обычным языком. Текст разберётся локально или
                через LLM, но план не изменится.
              </p>
            </div>
          </div>
          <textarea
            className="textarea"
            value={quickText}
            onChange={(event) => setQuickText(event.target.value)}
            placeholder="Например: жим 60 на 8, RIR 2; ещё 8 и 7"
            maxLength={2000}
            disabled={parseBusy}
          />
          <div className="row wrap" style={{ marginTop: 10 }}>
            <button
              className="btn btn-sm"
              type="button"
              onClick={parseQuickText}
              disabled={parseBusy || quickText.trim() === ""}
            >
              {parseBusy ? "Разбираю…" : "Разобрать"}
            </button>
            {parseMessage ? (
              <span className="tiny muted">{parseMessage}</span>
            ) : null}
          </div>
          {parseSafety && parseSafety !== "GREEN" ? (
            <div
              className={`notice${
                parseSafety === "RED" ? " notice-red" : ""
              }`}
              style={{ marginTop: 10 }}
            >
              {parseSafety === "RED"
                ? "В тексте есть красный флаг. Тренировка будет остановлена после завершения; причины не оцениваются."
                : "В тексте есть сигнал безопасности. Повышение нагрузки будет ограничено."}
            </div>
          ) : null}
        </section>
      ) : null}

      {view.blocks.map((block) => (
        <section className="card" key={block.id}>
          <div className="card-head">
            <div>
              <h2 className="card-title">{block.name}</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                {block.goal}
              </p>
            </div>
            <span className="badge">{block.key}</span>
          </div>

          {block.prescriptions.map((prescription) => {
            const prescriptionRows = rows[prescription.id] ?? [];
            return (
              <div
                className={`exercise${
                  prescription.role === "PRIMARY" ? " primary" : ""
                }`}
                key={prescription.id}
              >
                <div className="exercise-head">
                  <div>
                    <div className="exercise-name">
                      {prescription.exerciseName}
                    </div>
                    <div className="exercise-target">
                      {prescription.variantName} ·{" "}
                      {prescription.sets} ×{" "}
                      {formatRange(prescription.repMin, prescription.repMax)} ·
                      цель {prescription.targetReps} · RIR{" "}
                      {view.session.isReturn && prescription.targetRir < 3
                        ? "3–4"
                        : prescription.targetRir}
                    </div>
                  </div>
                  <span
                    className={
                      prescription.role === "PRIMARY"
                        ? "badge badge-primary"
                        : "badge badge-accessory"
                    }
                  >
                    {prescription.role === "PRIMARY"
                      ? "PRIMARY"
                      : prescription.role}
                  </span>
                </div>

                <div className="exercise-meta">
                  <span className="tiny muted">
                    прошлый раз: {lastSetSummary(prescription)}
                  </span>
                  {prescription.optional ? (
                    <span className="badge">необязательно</span>
                  ) : null}
                  {prescription.pair ? (
                    <span className="badge">вес одной гантели</span>
                  ) : null}
                </div>

                {calibrationHint(prescription) ? (
                  <p
                    className="tiny"
                    style={{ color: "var(--amber)", margin: "6px 0 0" }}
                  >
                    {calibrationHint(prescription)}
                  </p>
                ) : null}

                {prescription.technique &&
                prescription.technique.instructions.length > 0 ? (
                  <details className="technique">
                    <summary>
                      Техника
                      {prescription.technique.equipmentRu
                        ? ` · ${prescription.technique.equipmentRu}`
                        : ""}
                    </summary>
                    <ol>
                      {prescription.technique.instructions.map(
                        (instruction, index) => (
                          <li key={index}>{instruction}</li>
                        ),
                      )}
                    </ol>
                    {prescription.technique.nameRu ? (
                      <p className="tiny muted" style={{ margin: "8px 0 0" }}>
                        {prescription.technique.nameRu}. Справочное описание из
                        RU-free-exercise-db; не заменяет очную проверку техники.
                      </p>
                    ) : null}
                  </details>
                ) : null}

                <div className="set-list">
                  {prescriptionRows.map((row, index) => (
                    <div
                      className={`set-row${row.saved ? " saved" : ""}`}
                      key={row.clientSetId}
                    >
                      <div className="set-index">{index + 1}</div>
                      <div className="stack" style={{ gap: 4 }}>
                        <div className="stepper">
                          <button
                            type="button"
                            aria-label="Уменьшить вес"
                            onClick={() =>
                              adjustLoad(
                                prescription,
                                row,
                                index,
                                -prescription.incrementKg,
                              )
                            }
                            disabled={readOnly || prescription.loadMode === "BODYWEIGHT"}
                          >
                            −
                          </button>
                          <input
                            inputMode="decimal"
                            aria-label="Вес"
                            value={
                              prescription.loadMode === "EXTERNAL"
                                ? row.weight
                                : prescription.loadMode === "ASSISTED"
                                  ? row.assistance
                                  : prescription.loadMode === "BODYWEIGHT_PLUS"
                                    ? row.added
                                    : ""
                            }
                            placeholder={
                              prescription.loadMode === "EXTERNAL"
                                ? "кг"
                                : prescription.loadMode === "ASSISTED"
                                  ? "помощь"
                                  : prescription.loadMode === "BODYWEIGHT_PLUS"
                                    ? "+кг"
                                    : "свой вес"
                            }
                            onChange={(event) => {
                              const value = event.target.value;
                              if (prescription.loadMode === "EXTERNAL") {
                                patchRow(prescription.id, index, { weight: value });
                              } else if (prescription.loadMode === "ASSISTED") {
                                patchRow(prescription.id, index, {
                                  assistance: value,
                                });
                              } else if (
                                prescription.loadMode === "BODYWEIGHT_PLUS"
                              ) {
                                patchRow(prescription.id, index, { added: value });
                              }
                            }}
                            disabled={
                              readOnly || prescription.loadMode === "BODYWEIGHT"
                            }
                          />
                          <button
                            type="button"
                            aria-label="Увеличить вес"
                            onClick={() =>
                              adjustLoad(
                                prescription,
                                row,
                                index,
                                prescription.incrementKg,
                              )
                            }
                            disabled={readOnly || prescription.loadMode === "BODYWEIGHT"}
                          >
                            +
                          </button>
                        </div>
                        <span className="tiny muted" style={{ textAlign: "center" }}>
                          {prescription.loadMode === "ASSISTED"
                            ? "помощь, кг"
                            : prescription.loadMode === "BODYWEIGHT_PLUS"
                              ? "доп. вес, кг"
                              : prescription.loadMode === "BODYWEIGHT"
                                ? "без веса"
                                : "вес, кг"}
                        </span>
                      </div>
                      <div className="stepper">
                        <button
                          type="button"
                          aria-label="Уменьшить повторы"
                          onClick={() =>
                            patchRow(prescription.id, index, {
                              reps: step(row.reps, -1, 1),
                            })
                          }
                          disabled={readOnly}
                        >
                          −
                        </button>
                        <input
                          inputMode="numeric"
                          aria-label="Повторы"
                          value={row.reps}
                          onChange={(event) =>
                            patchRow(prescription.id, index, {
                              reps: event.target.value,
                            })
                          }
                          disabled={readOnly}
                        />
                        <button
                          type="button"
                          aria-label="Увеличить повторы"
                          onClick={() =>
                            patchRow(prescription.id, index, {
                              reps: step(row.reps, 1, 1),
                            })
                          }
                          disabled={readOnly}
                        >
                          +
                        </button>
                      </div>
                      <button
                        className={`set-done${row.saved ? " saved" : ""}`}
                        type="button"
                        onClick={() => saveSet(prescription, index)}
                        disabled={readOnly || row.saving}
                      >
                        {row.saving
                          ? "…"
                          : row.saved
                            ? "Обновить"
                            : "Готово"}
                      </button>

                      <div
                        className="rir-row"
                        style={{ gridColumn: "1 / -1" }}
                      >
                        <span className="rir-label">RIR</span>
                        {[4, 3, 2, 1, 0].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={`rir${row.rir === value ? " active" : ""}${
                              value === 0 ? " zero" : ""
                            }`}
                            onClick={() =>
                              patchRow(prescription.id, index, {
                                rir: row.rir === value ? null : value,
                              })
                            }
                            disabled={readOnly}
                          >
                            {value === 4 ? "4+" : value}
                          </button>
                        ))}
                        <span style={{ flex: 1 }} />
                        {(["NORMAL", "CHANGED", "LIMIT"] as Technique[]).map(
                          (value) => (
                            <button
                              key={value}
                              type="button"
                              className={`mini-toggle${
                                row.technique === value ? " active" : ""
                              }`}
                              onClick={() =>
                                patchRow(prescription.id, index, {
                                  technique: value,
                                })
                              }
                              disabled={readOnly}
                            >
                              {value === "NORMAL"
                                ? "норма"
                                : value === "CHANGED"
                                  ? "изменена"
                                  : "предел"}
                            </button>
                          ),
                        )}
                        <button
                          type="button"
                          className={`mini-toggle${row.pain ? " active" : ""}`}
                          onClick={() =>
                            patchRow(prescription.id, index, {
                              pain: !row.pain,
                            })
                          }
                          disabled={readOnly}
                        >
                          боль
                        </button>
                      </div>
                      {row.error ? (
                        <span
                          className="error"
                          style={{ gridColumn: "1 / -1" }}
                        >
                          {row.error}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}

      {!readOnly ? (
        <div className="card">
          <div className="row-between wrap">
            <div>
              <h2 className="card-title">Завершить тренировку</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                После завершения появятся предложения. Они не изменят план без
                подтверждения.
              </p>
            </div>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setCompleteOpen(true)}
            >
              Завершить
            </button>
          </div>
        </div>
      ) : null}

      {restRunning ? (
        <div
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 84,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            borderRadius: 14,
            border: "1px solid var(--line)",
            background: "rgba(20, 26, 22, 0.96)",
            boxShadow: "var(--shadow)",
          }}
        >
          <span className="small muted">Отдых</span>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {String(Math.floor(restSeconds / 60)).padStart(2, "0")}:
            {String(restSeconds % 60).padStart(2, "0")}
          </strong>
          <button
            className="btn btn-sm btn-ghost"
            type="button"
            onClick={() => {
              setRestRunning(false);
              setRestSeconds(0);
            }}
          >
            Пропустить
          </button>
        </div>
      ) : null}

      {completeOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Завершение тренировки"
          onClick={(event) => {
            if (event.target === event.currentTarget) setCompleteOpen(false);
          }}
        >
          <div className="modal">
            <h2 className="card-title" style={{ fontSize: 22 }}>
              Как прошла тренировка?
            </h2>
            <p className="small muted">
              Один вопрос о трудности всей сессии. RIR по подходам уже собран.
            </p>
            <div className="chip-row" style={{ marginTop: 14 }}>
              {[
                ["EASY", "легко"],
                ["MODERATE", "умеренно"],
                ["HARD", "тяжело"],
                ["MAX", "на пределе"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`chip${sessionRpe === value ? " active" : ""}`}
                  onClick={() => setSessionRpe(value!)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="field" style={{ marginTop: 14 }}>
              <span className="label">Комментарий</span>
              <textarea
                className="textarea"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Например: спал 5 часов, плечо не беспокоило"
                maxLength={1000}
              />
            </label>
            {completeError ? (
              <p className="error" style={{ marginTop: 10 }}>
                {completeError}
              </p>
            ) : null}
            <div className="row-between" style={{ marginTop: 18 }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setCompleteOpen(false)}
                disabled={completing}
              >
                Назад
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={completeSession}
                disabled={completing}
              >
                {completing ? "Завершаю…" : "Завершить и получить предложения"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
