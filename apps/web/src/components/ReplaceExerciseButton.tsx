"use client";

import { useEffect, useMemo, useState } from "react";

interface ExerciseOption {
  variantId: string;
  variantSlug: string;
  variantName: string;
  exerciseName: string;
  blockKey: string;
  primaryEligible: boolean;
}

interface LibraryResult {
  id: string;
  name: string;
  nameRu: string | null;
  equipment: string | null;
  equipmentRu: string | null;
  mechanic: string | null;
  category: string | null;
  categoryRu: string | null;
  primaryEligible: boolean;
}

export function ReplaceExerciseButton({
  prescriptionId,
  targetBlockKey,
  role,
  currentVariantId,
}: {
  prescriptionId: string;
  targetBlockKey: string;
  role: string;
  currentVariantId: string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ExerciseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/exercises/search?q=${encodeURIComponent(trimmed)}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) {
          setError("Не удалось загрузить базу упражнений.");
          return;
        }
        const payload = (await response.json()) as {
          results?: LibraryResult[];
        };
        setResults(payload.results ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setError("Сеть недоступна. Попробуйте ещё раз.");
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const grouped = useMemo(() => {
    const filtered = options.filter(
      (option) =>
        option.blockKey === targetBlockKey &&
        option.variantId !== currentVariantId &&
        (role !== "PRIMARY" || option.primaryEligible),
    );
    const groups = new Map<string, ExerciseOption[]>();
    for (const option of filtered) {
      const list = groups.get(option.exerciseName) ?? [];
      list.push(option);
      groups.set(option.exerciseName, list);
    }
    return [...groups.entries()];
  }, [options, targetBlockKey, role, currentVariantId]);

  const visibleResults = useMemo(
    () =>
      role === "PRIMARY"
        ? results.filter((item) => item.primaryEligible)
        : results,
    [results, role],
  );

  async function openPicker(): Promise<void> {
    setOpen(true);
    setError(null);
    if (options.length > 0) return;
    setLoading(true);
    try {
      const response = await fetch("/api/exercises", { cache: "no-store" });
      if (!response.ok) {
        setError("Не удалось загрузить базу упражнений.");
        return;
      }
      const payload = (await response.json()) as {
        options?: ExerciseOption[];
      };
      setOptions(payload.options ?? []);
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  async function replaceExercise(): Promise<void> {
    if (!selectedLibraryId && !selected) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/prescriptions/${prescriptionId}/replace`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            selectedLibraryId
              ? { libraryId: selectedLibraryId }
              : { variantId: selected },
          ),
        },
      );
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Не удалось заменить упражнение.");
        return;
      }
      window.location.reload();
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button className="btn btn-ghost btn-sm" type="button" onClick={openPicker}>
        Заменить
      </button>
      {open ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Заменить упражнение"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="card-title" style={{ fontSize: 22 }}>
              Заменить упражнение
            </h2>
            <p className="small muted">
              Это создаст новую версию плана. Нагрузка обнулится, история
              нового упражнения начнётся заново. Если по текущему упражнению уже
              есть подходы, замена недоступна.
            </p>

            {loading ? (
              <p className="small muted">Загружаю базу упражнений…</p>
            ) : (
              <label className="field" style={{ marginTop: 12 }}>
                <span className="label">Новое упражнение</span>
                <select
                  className="input"
                  value={selected}
                  onChange={(event) => {
                    setSelected(event.target.value);
                    setSelectedLibraryId(null);
                  }}
                >
                  <option value="">Выберите упражнение…</option>
                  {grouped.map(([exerciseName, items]) => (
                    <optgroup key={exerciseName} label={exerciseName}>
                      {items.map((option) => (
                        <option key={option.variantId} value={option.variantId}>
                          {option.variantName}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}

            {grouped.length === 0 && !loading ? (
              <p className="small muted">
                В коротком списке для этого блока нет других упражнений — ниже
                можно найти упражнение во всей базе.
              </p>
            ) : null}

            {!loading ? (
              <>
                <div className="divider" />
                <label className="field">
                  <span className="label">Найти в базе упражнений</span>
                  <input
                    className="input"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Например, приседания"
                    autoComplete="off"
                  />
                </label>
                {searching ? (
                  <p className="small muted">Ищу…</p>
                ) : null}
                {visibleResults.length > 0 ? (
                  <div
                    className="stack"
                    style={{ maxHeight: 240, overflowY: "auto" }}
                  >
                    {visibleResults.map((item) => (
                      <button
                        key={item.id}
                        className={`btn${
                          selectedLibraryId === item.id ? " btn-primary" : ""
                        }`}
                        type="button"
                        onClick={() => {
                          setSelectedLibraryId(item.id);
                          setSelected("");
                        }}
                        style={{ textAlign: "left" }}
                      >
                        <span>
                          {item.nameRu ?? item.name}
                          <span className="tiny muted">
                            {" "}
                            · {item.equipmentRu ?? item.equipment ?? "—"}
                            {item.categoryRu ? ` · ${item.categoryRu}` : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : query.trim().length >= 2 && !searching ? (
                  <p className="small muted">Ничего не найдено.</p>
                ) : null}
                {role === "PRIMARY" &&
                results.some((item) => !item.primaryEligible) ? (
                  <p className="tiny muted">
                    Для основного блока показываются только базовые
                    многосуставные упражнения.
                  </p>
                ) : null}
              </>
            ) : null}

            {error ? (
              <p className="small" style={{ color: "var(--red)" }}>
                {error}
              </p>
            ) : null}

            <div className="row-between" style={{ marginTop: 16 }}>
              <button
                className="btn"
                type="button"
                onClick={() => setOpen(false)}
              >
                Отмена
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={replaceExercise}
                disabled={
                  saving ||
                  loading ||
                  (!selectedLibraryId && !selected)
                }
              >
                {saving ? "Сохраняю…" : "Заменить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
