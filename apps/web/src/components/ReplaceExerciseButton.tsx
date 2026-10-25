"use client";

import { useMemo, useState } from "react";

interface ExerciseOption {
  variantId: string;
  variantSlug: string;
  variantName: string;
  exerciseName: string;
  blockKey: string;
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
  const [error, setError] = useState<string | null>(null);

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
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/prescriptions/${prescriptionId}/replace`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variantId: selected }),
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
              нового упражнения начнётся заново.
            </p>

            {loading ? (
              <p className="small muted">Загружаю базу упражнений…</p>
            ) : (
              <label className="field" style={{ marginTop: 12 }}>
                <span className="label">Новое упражнение</span>
                <select
                  className="input"
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
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
                Для этого блока в базе нет других подходящих упражнений.
              </p>
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
                disabled={saving || loading || !selected}
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
