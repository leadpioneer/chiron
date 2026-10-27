"use client";

import { useEffect, useState } from "react";

interface BlockOption {
  key: string;
  name: string;
}

interface LibraryResult {
  id: string;
  name: string;
  nameRu: string | null;
  equipment: string | null;
  equipmentRu: string | null;
  categoryRu: string | null;
}

export function AddExerciseButton({
  sessionId,
  blocks,
}: {
  sessionId: string;
  blocks: BlockOption[];
}) {
  const [open, setOpen] = useState(false);
  const [blockKey, setBlockKey] = useState(blocks[0]?.key ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibraryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
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

  async function addExercise(): Promise<void> {
    if (!selectedLibraryId || !blockKey) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}/exercises`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          libraryId: selectedLibraryId,
          blockKey,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Не удалось добавить упражнение.");
        setSaving(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Сеть недоступна. Попробуйте ещё раз.");
      setSaving(false);
    }
  }

  if (blocks.length === 0) return null;

  return (
    <>
      <button
        className="btn btn-ghost btn-sm"
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
        }}
      >
        ＋ Добавить упражнение
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
            aria-label="Добавить упражнение"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="card-title" style={{ fontSize: 22 }}>
              Добавить упражнение
            </h2>
            <p className="small muted">
              Новое упражнение появится в этой тренировке и в будущих днях
              того же типа. Нагрузка обнулится для калибровки.
            </p>

            <label className="field" style={{ marginTop: 12 }}>
              <span className="label">Блок</span>
              <select
                className="input"
                value={blockKey}
                onChange={(event) => setBlockKey(event.target.value)}
              >
                {blocks.map((block) => (
                  <option value={block.key} key={block.key}>
                    {block.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field" style={{ marginTop: 12 }}>
              <span className="label">Поиск по базе</span>
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Например, приседания"
                autoComplete="off"
              />
            </label>

            {searching ? <p className="small muted">Ищу…</p> : null}
            {results.length > 0 ? (
              <div
                className="stack"
                style={{ maxHeight: 240, overflowY: "auto" }}
              >
                {results.map((item) => (
                  <button
                    key={item.id}
                    className={`btn${
                      selectedLibraryId === item.id ? " btn-primary" : ""
                    }`}
                    type="button"
                    onClick={() => setSelectedLibraryId(item.id)}
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
                onClick={addExercise}
                disabled={saving || !selectedLibraryId || !blockKey}
              >
                {saving ? "Добавляю…" : "Добавить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
