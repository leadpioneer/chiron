"use client";

import { useMemo, useState } from "react";
import type {
  Experience,
  Goal,
  OnboardingInput,
  TrainingScheme,
} from "@chiron/contracts";
import type { TemplateDefinition } from "@chiron/core";

const EXPERIENCE_LABELS: Record<Experience, string> = {
  BEGINNER: "Начинаю",
  RETURNING: "Возвращаюсь",
  INTERMEDIATE: "Уже тренируюсь",
};

const GOAL_LABELS: Record<Goal, string> = {
  STRENGTH: "Сила",
  AESTHETIC: "Эстетика",
  BOTH: "Сила и эстетика",
};

const SCHEME_LABELS: Record<TrainingScheme, string> = {
  EVERY_OTHER_DAY: "Через день",
  FIVE_DAY_CYCLE: "5-дневный цикл",
};

const SCHEME_SESSIONS: Record<TrainingScheme, number> = {
  EVERY_OTHER_DAY: 28,
  FIVE_DAY_CYCLE: 23,
};

const VARIANT_LABELS: Record<string, string> = {
  assisted_pull_up: "Гравитрон",
  lat_pulldown: "Верхний блок",
  barbell_rdl: "Штанга",
  dumbbell_rdl: "Гантели",
  front_squat: "Фронтальный присед",
  hack_squat: "Гакк-присед",
  barbell_bench: "Штанга",
  dumbbell_bench: "Гантели",
};

const AESTHETIC_LABELS: Record<string, string> = {
  biceps_curl: "Бицепс",
  triceps_pushdown: "Трицепс",
  lateral_raise: "Средняя дельта",
};

function parseLoad(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function OnboardingWizard({
  template,
  userName,
}: {
  template: TemplateDefinition;
  userName: string;
}) {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(userName);
  const [experience, setExperience] = useState<Experience>("RETURNING");
  const [goal, setGoal] = useState<Goal>("BOTH");
  const [bodyweight, setBodyweight] = useState("");
  const [height, setHeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [breakWeeks, setBreakWeeks] = useState("");
  const [scheme, setScheme] = useState<TrainingScheme>("EVERY_OTHER_DAY");
  const [variants, setVariants] = useState({
    verticalPull: "assisted_pull_up",
    hinge: "barbell_rdl",
    squat: "front_squat",
    press: "barbell_bench",
  });
  const [accessories, setAccessories] = useState({
    row: true,
    pullover: false,
    legExtension: true,
    pecDeck: true,
  });
  const [aesthetic, setAesthetic] = useState<string[]>(["biceps_curl"]);
  const [loads, setLoads] = useState({
    verticalPull: "",
    hinge: "",
    squat: "",
    press: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadLabels = useMemo(
    () => ({
      verticalPull:
        variants.verticalPull === "assisted_pull_up"
          ? "Помощь гравитрона, кг"
          : "Рабочий вес, кг",
      hinge: "Рабочий вес, кг",
      squat: "Рабочий вес, кг",
      press: "Рабочий вес, кг",
    }),
    [variants.verticalPull],
  );

  function toggleAesthetic(key: string) {
    setAesthetic((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= 2) return current;
      return [...current, key];
    });
  }

  function next() {
    setError(null);
    if (step === 0) {
      if (!displayName.trim()) {
        setError("Укажите имя.");
        return;
      }
    }
    setStep((current) => Math.min(3, current + 1));
  }

  async function submit() {
    setLoading(true);
    setError(null);
    const parsedBreakWeeks =
      breakWeeks.trim() === "" ? null : Number(breakWeeks);
    if (
      parsedBreakWeeks !== null &&
      (!Number.isInteger(parsedBreakWeeks) ||
        parsedBreakWeeks < 0 ||
        parsedBreakWeeks > 520)
    ) {
      setError("Перерыв должен быть целым числом недель от 0 до 520.");
      setLoading(false);
      return;
    }
    const payload: OnboardingInput = {
      displayName: displayName.trim(),
      experience,
      goal,
      bodyweightKg: parseLoad(bodyweight),
      heightCm: parseLoad(height),
      bodyFatPercent: parseLoad(bodyFat),
      breakWeeks: parsedBreakWeeks,
      trainingScheme: scheme,
      variants: variants as OnboardingInput["variants"],
      accessories,
      aesthetic: aesthetic as OnboardingInput["aesthetic"],
      startingLoads: {
        verticalPull: parseLoad(loads.verticalPull),
        hinge: parseLoad(loads.hinge),
        squat: parseLoad(loads.squat),
        press: parseLoad(loads.press),
      },
    };

    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Не удалось создать цикл.");
        return;
      }
      window.location.href = "/today";
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">Первый цикл</p>
      <h1 className="page-title">Соберём базу</h1>
      <p className="subtitle">
        Один шаблон, два основных движения в каждой тренировке и необязательная
        подсобка. Нагрузку можно не знать: тогда первая сессия станет калибровкой.
      </p>

      <div className="wizard-steps" aria-hidden>
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className={`wizard-step${item <= step ? " active" : ""}`}
          />
        ))}
      </div>

      {step === 0 ? (
        <section className="card stack">
          <div className="card-head">
            <div>
              <h2 className="card-title">Профиль и график</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Эти данные нужны для стартовой нагрузки и календаря.
              </p>
            </div>
            <span className="badge">1 / 4</span>
          </div>

          <label className="field">
            <span className="label">Как к вам обращаться</span>
            <input
              className="input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
            />
          </label>

          <div className="field">
            <span className="label">Опыт</span>
            <div className="chip-row">
              {(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`chip${experience === key ? " active" : ""}`}
                  onClick={() => setExperience(key)}
                >
                  {EXPERIENCE_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="label">Цель</span>
            <div className="chip-row">
              {(Object.keys(GOAL_LABELS) as Goal[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`chip${goal === key ? " active" : ""}`}
                  onClick={() => setGoal(key)}
                >
                  {GOAL_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-2">
            <label className="field">
              <span className="label">Вес тела, кг</span>
              <input
                className="input"
                inputMode="decimal"
                placeholder="Необязательно"
                value={bodyweight}
                onChange={(event) => setBodyweight(event.target.value)}
              />
              <span className="hint">
                Нужен для отображения нагрузки в подтягиваниях и гравитроне.
              </span>
            </label>
            <label className="field">
              <span className="label">Рост, см</span>
              <input
                className="input"
                inputMode="decimal"
                placeholder="Необязательно"
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
              <span className="hint">Для ориентира по составу тела.</span>
            </label>
            <label className="field">
              <span className="label">Процент жира, % (примерно)</span>
              <input
                className="input"
                inputMode="decimal"
                placeholder="Необязательно"
                value={bodyFat}
                onChange={(event) => setBodyFat(event.target.value)}
              />
              <span className="hint">
                Оценка по замеру или калькулятору. Не влияет на нагрузку.
              </span>
            </label>
            <label className="field">
              <span className="label">Перерыв, недель</span>
              <input
                className="input"
                inputMode="numeric"
                placeholder="0"
                value={breakWeeks}
                onChange={(event) => setBreakWeeks(event.target.value)}
              />
              <span className="hint">
                Если перерыв больше 24 недель, старт будет калибровочным.
              </span>
            </label>
          </div>

          <div className="field">
            <span className="label">Тренировочная схема</span>
            <div className="grid grid-2">
              <button
                type="button"
                className={`scheme-option${
                  scheme === "EVERY_OTHER_DAY" ? " active" : ""
                }`}
                onClick={() => setScheme("EVERY_OTHER_DAY")}
              >
                <span className="scheme-title">Через день</span>
                <span className="tiny muted">
                  Тяни → отдых → Толкай → отдых. Дни недели не важны.
                  Примерно 28 тренировок за 8 недель.
                </span>
              </button>
              <button
                type="button"
                className={`scheme-option${
                  scheme === "FIVE_DAY_CYCLE" ? " active" : ""
                }`}
                onClick={() => setScheme("FIVE_DAY_CYCLE")}
              >
                <span className="scheme-title">Треня–отдых–треня–отдых–отдых</span>
                <span className="tiny muted">
                  5-дневный цикл. Примерно 23 тренировки за 8 недель.
                </span>
              </button>
            </div>
            <span className="hint">
              Для двухдневного сплита дни недели не фиксируются. Календарные
              дни недели понадобятся для сплита на 3 и более тренировок.
            </span>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="card stack">
          <div className="card-head">
            <div>
              <h2 className="card-title">Шаблон и подсобка</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Роли и связи фиксированы. Можно выбрать вариант и убрать
                необязательную работу.
              </p>
            </div>
            <span className="badge">2 / 4</span>
          </div>

          {template.sessions.map((session) => (
            <div className="block" key={session.key}>
              <div className="block-head">
                <div>
                  <div className="block-name">{session.name}</div>
                  <div className="tiny muted">
                    {session.blocks.length} целевых блока
                  </div>
                </div>
                <span className="badge badge-primary">{session.key}</span>
              </div>
              <div className="stack">
                {session.blocks.map((block) => {
                  const primary = block.exercises.find(
                    (item) => item.role === "PRIMARY",
                  );
                  const accessories = block.exercises.filter(
                    (item) => item.role === "ACCESSORY",
                  );
                  if (!primary) return null;
                  const field =
                    primary.startingLoadField as keyof typeof variants | null;
                  return (
                    <div key={block.key} className="exercise primary">
                      <div className="exercise-head">
                        <div>
                          <div className="exercise-name">{block.name}</div>
                          <div className="exercise-target">
                            основное:{" "}
                            {VARIANT_LABELS[
                              field
                                ? variants[field]
                                : primary.variantSlug
                            ] ?? primary.variantSlug}
                          </div>
                        </div>
                        <span className="badge badge-primary">PRIMARY</span>
                      </div>
                      {field ? (
                        <label className="field" style={{ marginTop: 10 }}>
                          <span className="label">Вариант</span>
                          <select
                            className="select"
                            value={variants[field]}
                            onChange={(event) =>
                              setVariants((current) => ({
                                ...current,
                                [field]: event.target.value,
                              }))
                            }
                          >
                            {primary.variantSlug === "assisted_pull_up" ? (
                              <>
                                <option value="assisted_pull_up">Гравитрон</option>
                                <option value="lat_pulldown">Верхний блок</option>
                              </>
                            ) : null}
                            {primary.variantSlug === "barbell_rdl" ? (
                              <>
                                <option value="barbell_rdl">Штанга</option>
                                <option value="dumbbell_rdl">Гантели</option>
                              </>
                            ) : null}
                            {primary.variantSlug === "front_squat" ? (
                              <>
                                <option value="front_squat">Фронтальный присед</option>
                                <option value="hack_squat">Гакк-присед</option>
                              </>
                            ) : null}
                            {primary.variantSlug === "barbell_bench" ? (
                              <>
                                <option value="barbell_bench">Штанга</option>
                                <option value="dumbbell_bench">Гантели</option>
                              </>
                            ) : null}
                          </select>
                        </label>
                      ) : null}
                      {accessories.length > 0 ? (
                        <div className="field" style={{ marginTop: 10 }}>
                          <span className="label">Подсобка (необязательно)</span>
                          <div className="chip-row">
                            {accessories.map((item) => {
                              const key =
                                item.key === "row_accessory"
                                  ? "row"
                                  : item.key === "pullover_accessory"
                                    ? "pullover"
                                    : item.key === "leg_extension_accessory"
                                      ? "legExtension"
                                      : "pecDeck";
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  className={`chip${
                                    accessories[key as keyof typeof accessories]
                                      ? " active"
                                      : ""
                                  }`}
                                  onClick={() =>
                                    setAccessories((current) => ({
                                      ...current,
                                      [key]: !current[key as keyof typeof current],
                                    }))
                                  }
                                >
                                  {VARIANT_LABELS[item.variantSlug] ??
                                    item.variantSlug}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="tiny muted" style={{ marginTop: 10 }}>
                          Подсобка не задана. Пустой слот — нормально.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="field">
            <span className="label">Эстетика (до двух)</span>
            <div className="chip-row">
              {template.aesthetic.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`chip${
                    aesthetic.includes(item.key) ? " active" : ""
                  }`}
                  onClick={() => toggleAesthetic(item.key)}
                >
                  {AESTHETIC_LABELS[item.key] ?? item.key}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="card stack">
          <div className="card-head">
            <div>
              <h2 className="card-title">Стартовые нагрузки</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                Введите рабочий вес, с которым вы делали 5–8 повторов не на
                пределе. Пустое поле означает калибровку на первой сессии.
              </p>
            </div>
            <span className="badge">3 / 4</span>
          </div>

          <div className="grid grid-2">
            {(
              [
                ["verticalPull", "Вертикальная тяга"],
                ["hinge", "Румынская тяга"],
                ["squat", "Присед"],
                ["press", "Жим"],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                <span className="label">{label}</span>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="Например, 60"
                  value={loads[key]}
                  onChange={(event) =>
                    setLoads((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
                <span className="hint">{loadLabels[key]}</span>
              </label>
            ))}
          </div>

          <div className="notice">
            Перерыв {breakWeeks || "0"} недель. При перерыве 3–6 недель старт
            будет снижен до 90%, 7–12 — до 80%, 13–24 — до 70%. После 24 недель
            назначается калибровка.
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="card stack">
          <div className="card-head">
            <div>
              <h2 className="card-title">Проверьте цикл</h2>
              <p className="small muted" style={{ margin: "4px 0 0" }}>
                8 недель, примерно {SCHEME_SESSIONS[scheme]} тренировок.
                Изменения программы — только после вашего подтверждения.
              </p>
            </div>
            <span className="badge">4 / 4</span>
          </div>

          <div className="grid grid-2">
            <div className="stat">
              <div className="stat-value">{displayName}</div>
              <div className="stat-label">Атлет</div>
            </div>
            <div className="stat">
              <div className="stat-value">{SCHEME_LABELS[scheme]}</div>
              <div className="stat-label">Схема</div>
            </div>
            <div className="stat">
              <div className="stat-value">8 недель</div>
              <div className="stat-label">Длина цикла</div>
            </div>
            <div className="stat">
              <div className="stat-value">{aesthetic.length}</div>
              <div className="stat-label">Эстетических упражнений</div>
            </div>
          </div>

          <div className="stack">
            {template.sessions.map((session) => (
              <div className="block" key={session.key}>
                <div className="block-name">{session.name}</div>
                {session.blocks.map((block) => {
                  const primary = block.exercises.find(
                    (item) => item.role === "PRIMARY",
                  );
                  if (!primary) return null;
                  const field =
                    primary.startingLoadField as keyof typeof variants | null;
                  return (
                    <div className="row-between" key={block.key} style={{ marginTop: 8 }}>
                      <span className="small muted">{block.name}</span>
                      <span className="small">
                        {field
                          ? VARIANT_LABELS[variants[field]] ?? variants[field]
                          : primary.variantSlug}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <p className="tiny muted" style={{ margin: 0 }}>
            Подтверждая, вы создаёте первую версию плана. Любое последующее
            изменение создаст новую версию и запись в audit.
          </p>
        </section>
      ) : null}

      {error ? <p className="error" style={{ marginTop: 12 }}>{error}</p> : null}

      <div className="row-between" style={{ marginTop: 16 }}>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0 || loading}
        >
          Назад
        </button>
        {step < 3 ? (
          <button className="btn btn-primary" type="button" onClick={next}>
            Далее
          </button>
        ) : (
          <button
            className="btn btn-primary"
            type="button"
            onClick={submit}
            disabled={loading}
          >
            {loading ? "Создаю цикл…" : "Создать цикл"}
          </button>
        )}
      </div>
    </div>
  );
}
