import type { Action, SetType } from "@chiron/contracts";
import {
  incrementLoad,
  normalizeNumber,
  percentReduction,
  roundDownToIncrement,
} from "./metrics";
import type {
  Exposure,
  PrescriptionSnapshot,
  ProposalChange,
  RecommendationDraft,
  SafetyAssessment,
  SessionRecommendationInput,
  SetRecord,
} from "./types";

const WORKING_TYPES: ReadonlySet<SetType> = new Set([
  "WORKING",
  "BACKOFF",
  "AMRAP",
]);

export function isWorkingSet(set: SetRecord): boolean {
  return WORKING_TYPES.has(set.setType) && set.reps > 0;
}

export function completedWorkingSets(exposure: Exposure): SetRecord[] {
  return exposure.sets.filter((set) => isWorkingSet(set) && set.completed);
}

function minRir(sets: SetRecord[]): number | null {
  let result: number | null = null;
  for (const set of sets) {
    if (set.rir === null) return null;
    if (result === null || set.rir < result) result = set.rir;
  }
  return result;
}

function allAtLeast(sets: SetRecord[], reps: number): boolean {
  return sets.length > 0 && sets.every((set) => set.reps >= reps);
}

function totalReps(exposure: Exposure): number {
  return completedWorkingSets(exposure).reduce((sum, set) => sum + set.reps, 0);
}

function loadValue(prescription: PrescriptionSnapshot, set: SetRecord): number {
  switch (prescription.loadMode) {
    case "EXTERNAL":
      return set.weightKg ?? 0;
    case "ASSISTED":
      return -(set.assistanceKg ?? 0);
    case "BODYWEIGHT_PLUS":
      return set.addedKg ?? 0;
    case "BODYWEIGHT":
      return 0;
  }
}

function bestLoad(exposure: Exposure, prescription: PrescriptionSnapshot): number | null {
  const sets = completedWorkingSets(exposure);
  if (sets.length === 0) return null;
  return sets.reduce(
    (best, set) => Math.max(best, loadValue(prescription, set)),
    Number.NEGATIVE_INFINITY,
  );
}

export function isDeclining(exposures: Exposure[]): boolean {
  const usable = exposures.filter(
    (exposure) => completedWorkingSets(exposure).length > 0,
  );
  if (usable.length < 2) return false;
  const latest = usable[0];
  if (!latest) return false;

  const scoped = usable.filter(
    (exposure) =>
      Boolean(exposure.duringReturn) === Boolean(latest.duringReturn),
  );
  const sameTarget = scoped.filter(
    (exposure) => exposure.targetReps === latest.targetReps,
  );
  if (sameTarget.length < 2) return false;

  const [current, previous] = sameTarget;
  if (!current || !previous) return false;
  return totalReps(current) < totalReps(previous);
}

function topRangeExposure(
  exposure: Exposure,
  prescription: PrescriptionSnapshot,
): boolean {
  const sets = completedWorkingSets(exposure);
  const rir = minRir(sets);
  return (
    sets.length >= prescription.sets &&
    allAtLeast(sets, prescription.repMax) &&
    rir !== null &&
    rir >= prescription.targetRir
  );
}

function makeDraft(input: {
  action: Action;
  prescription: PrescriptionSnapshot;
  changes?: ProposalChange[];
  reasons: string[];
  ruleIds: string[];
  safety: SafetyAssessment;
  explanation?: string;
  scopeType?: RecommendationDraft["scopeType"];
  scopeId?: string;
}): RecommendationDraft {
  const actionText: Record<Action, string> = {
    PROGRESS: "Повышаю задание на один шаг.",
    HOLD: "Оставляю задание без изменений.",
    LOCAL_REDUCE: "Снижаю нагрузку в этом упражнении на один шаг.",
    SUBSTITUTE: "Предлагаю заменить вариант упражнения.",
    DELOAD: "Предлагаю разгрузочную неделю.",
    REBUILD: "Предлагаю пересобрать цикл.",
    PAUSE: "Приостанавливаю тренировочные рекомендации.",
    ESCALATE: "Рекомендую внешнюю оценку.",
  };

  return {
    action: input.action,
    scopeType: input.scopeType ?? "EXERCISE",
    scopeId: input.scopeId ?? input.prescription.id,
    changes: input.changes ?? [],
    reasons: input.reasons,
    ruleIds: input.ruleIds,
    safety: input.safety,
    explanation:
      input.explanation ??
      `${actionText[input.action]} ${input.reasons.join(" ")}`.trim(),
  };
}

function safetyDraft(
  prescription: PrescriptionSnapshot,
  safety: SafetyAssessment,
): RecommendationDraft {
  if (safety.label === "RED") {
    return makeDraft({
      action: "PAUSE",
      prescription,
      reasons: [...safety.reasons, "Тренировка останавливается."],
      ruleIds: ["SAFETY_RED"],
      safety,
      explanation:
        "Есть сигнал, при котором тренировка останавливается. Приложение не оценивает причину симптома.",
    });
  }

  return makeDraft({
    action: "HOLD",
    prescription,
    reasons: safety.reasons,
    ruleIds: ["SAFETY_YELLOW"],
    safety,
    explanation:
      "Повышение нагрузки приостановлено. Нужно уточнить состояние и повторить задание.",
  });
}

function localPainDraft(
  prescription: PrescriptionSnapshot,
  sets: SetRecord[],
  safety: SafetyAssessment,
): RecommendationDraft {
  const painWeights = sets
    .filter((set) => set.pain && set.weightKg !== null)
    .map((set) => set.weightKg as number);
  const painFreeWeights = sets
    .filter((set) => !set.pain && set.weightKg !== null)
    .map((set) => set.weightKg as number);
  const painFreeAssistance = sets
    .filter((set) => !set.pain && set.assistanceKg !== null)
    .map((set) => set.assistanceKg as number);
  const painAssistance = sets
    .filter((set) => set.pain && set.assistanceKg !== null)
    .map((set) => set.assistanceKg as number);
  const painFreeAdded = sets
    .filter((set) => !set.pain && set.addedKg !== null)
    .map((set) => set.addedKg as number);
  const painAdded = sets
    .filter((set) => set.pain && set.addedKg !== null)
    .map((set) => set.addedKg as number);

  const makeReduce = (
    change: ProposalChange,
    targetText: string,
  ): RecommendationDraft => {
    return makeDraft({
      action: "LOCAL_REDUCE",
      prescription,
      changes: [change],
      reasons: [
        "В этом упражнении был болезненный подход.",
        targetText,
      ],
      ruleIds: ["SAFETY_YELLOW", "LOCAL_PAIN_REDUCE"],
      safety,
      explanation: `Болезненный подход не повышаю. ${targetText} Остальные упражнения без изменений.`,
    });
  };

  if (prescription.loadMode === "EXTERNAL") {
    const target =
      painFreeWeights.length > 0
        ? Math.min(...painFreeWeights)
        : painWeights.length > 0
          ? Math.max(0, Math.min(...painWeights) - prescription.incrementKg)
          : null;
    if (target !== null && target !== prescription.weightKg) {
      return makeReduce(
        { prescriptionId: prescription.id, weightKg: normalizeNumber(target) },
        `Возвращаю вес к ${normalizeNumber(target)} кг.`,
      );
    }
  } else if (prescription.loadMode === "ASSISTED") {
    const target =
      painFreeAssistance.length > 0
        ? Math.max(...painFreeAssistance)
        : painAssistance.length > 0
          ? Math.min(...painAssistance) + prescription.incrementKg
          : prescription.assistanceKg !== null
            ? prescription.assistanceKg + prescription.incrementKg
            : null;
    if (target !== null && target !== prescription.assistanceKg) {
      return makeReduce(
        {
          prescriptionId: prescription.id,
          assistanceKg: normalizeNumber(target),
        },
        `Увеличиваю помощь до ${normalizeNumber(target)} кг.`,
      );
    }
  } else if (prescription.loadMode === "BODYWEIGHT_PLUS") {
    const target =
      painFreeAdded.length > 0
        ? Math.min(...painFreeAdded)
        : painAdded.length > 0
          ? Math.max(0, Math.min(...painAdded) - prescription.incrementKg)
          : prescription.addedKg !== null
            ? Math.max(0, prescription.addedKg - prescription.incrementKg)
            : null;
    if (target !== null && target !== prescription.addedKg) {
      return makeReduce(
        { prescriptionId: prescription.id, addedKg: normalizeNumber(target) },
        `Снижаю добавленный вес до ${normalizeNumber(target)} кг.`,
      );
    }
  }

  if (prescription.sets > 2) {
    return makeReduce(
      { prescriptionId: prescription.id, sets: prescription.sets - 1 },
      "Убираю один подход.",
    );
  }
  if (prescription.targetReps > prescription.repMin) {
    return makeReduce(
      { prescriptionId: prescription.id, targetReps: prescription.targetReps - 1 },
      "Снижаю целевую цель на одно повторение.",
    );
  }

  return makeDraft({
    action: "HOLD",
    prescription,
    reasons: [
      "В этом упражнении был болезненный подход.",
      "Нагрузку не повышаю; остальные упражнения оцениваются отдельно.",
    ],
    ruleIds: ["SAFETY_YELLOW", "LOCAL_PAIN_HOLD"],
    safety,
    explanation:
      "Болезненный подход не повышаю. Если боль повторится, нужна замена варианта или пересмотр цикла.",
  });
}

function reduceDraft(
  prescription: PrescriptionSnapshot,
  safety: SafetyAssessment,
  reasons: string[],
): RecommendationDraft {
  const change: ProposalChange = { prescriptionId: prescription.id };
  const ruleIds = ["DECLINE_REDUCE"];

  if (prescription.loadMode === "EXTERNAL" && prescription.weightKg !== null) {
    change.weightKg = Math.max(
      0,
      normalizeNumber(prescription.weightKg - prescription.incrementKg),
    );
  } else if (
    prescription.loadMode === "ASSISTED" &&
    prescription.assistanceKg !== null
  ) {
    change.assistanceKg = normalizeNumber(
      prescription.assistanceKg + prescription.incrementKg,
    );
  } else if (
    prescription.loadMode === "BODYWEIGHT_PLUS" &&
    prescription.addedKg !== null
  ) {
    change.addedKg = Math.max(
      0,
      normalizeNumber(prescription.addedKg - prescription.incrementKg),
    );
  } else if (prescription.sets > 2) {
    change.sets = prescription.sets - 1;
    ruleIds.push("REDUCE_SET");
  } else if (prescription.targetReps > prescription.repMin) {
    change.targetReps = prescription.targetReps - 1;
    ruleIds.push("REDUCE_REPS");
  } else {
    return makeDraft({
      action: "PAUSE",
      prescription,
      reasons: [...reasons, "Дальнейшее снижение невозможно."],
      ruleIds: [...ruleIds, "REDUCE_FLOOR"],
      safety,
      explanation:
        "Задание уже на нижней границе. Нужна замена варианта или внешняя оценка.",
    });
  }

  return makeDraft({
    action: "LOCAL_REDUCE",
    prescription,
    changes: [change],
    reasons,
    ruleIds,
    safety,
    explanation:
      "Две сопоставимые экспозиции ниже предыдущего уровня. Снижаю нагрузку на один шаг и оставляю остальные упражнения без изменений.",
  });
}

function loadProgressChange(
  prescription: PrescriptionSnapshot,
): ProposalChange | null {
  const change: ProposalChange = {
    prescriptionId: prescription.id,
    targetReps: prescription.repMin,
  };

  switch (prescription.loadMode) {
    case "EXTERNAL":
      if (prescription.weightKg === null) return null;
      change.weightKg = incrementLoad(
        prescription.weightKg,
        prescription.incrementKg,
      );
      return change;
    case "ASSISTED":
      if (prescription.assistanceKg === null) return null;
      if (prescription.assistanceKg <= prescription.incrementKg) return null;
      change.assistanceKg = normalizeNumber(
        prescription.assistanceKg - prescription.incrementKg,
      );
      return change;
    case "BODYWEIGHT_PLUS":
      change.addedKg = incrementLoad(
        prescription.addedKg ?? 0,
        prescription.incrementKg,
      );
      return change;
    case "BODYWEIGHT":
      return null;
  }
}

function calibrationChange(
  prescription: PrescriptionSnapshot,
  sets: SetRecord[],
): ProposalChange | null {
  const base: ProposalChange = {
    prescriptionId: prescription.id,
    targetReps: prescription.repMin,
  };

  if (prescription.loadMode === "EXTERNAL") {
    if (prescription.weightKg !== null) return null;
    const weights = sets
      .map((set) => set.weightKg)
      .filter((value): value is number => value !== null);
    if (weights.length === 0) return null;
    return { ...base, weightKg: Math.max(...weights) };
  }

  if (prescription.loadMode === "ASSISTED") {
    if (prescription.assistanceKg !== null) return null;
    const assistance = sets
      .map((set) => set.assistanceKg)
      .filter((value): value is number => value !== null);
    if (assistance.length === 0) return null;
    return { ...base, assistanceKg: Math.min(...assistance) };
  }

  if (prescription.loadMode === "BODYWEIGHT_PLUS") {
    if (prescription.addedKg !== null) return null;
    const added = sets
      .map((set) => set.addedKg)
      .filter((value): value is number => value !== null);
    if (added.length === 0) return null;
    return { ...base, addedKg: Math.max(...added) };
  }

  return null;
}

function returnDraft(
  prescription: PrescriptionSnapshot,
  safety: SafetyAssessment,
): RecommendationDraft {
  return makeDraft({
    action: "HOLD",
    prescription,
    reasons: [
      "Это сессия возвращения после паузы. Прогрессия возобновится после возвратной фазы.",
    ],
    ruleIds: ["RETURN_PHASE"],
    safety,
    explanation:
      "Нагрузка уже снижена для возвращения. Сейчас задача — повторить её без повышения и восстановить переносимость.",
  });
}

export function recommendProgression(input: {
  prescription: PrescriptionSnapshot;
  exposures: Exposure[];
  safety: SafetyAssessment;
  returnPhase?: boolean;
}): RecommendationDraft {
  const { prescription, exposures, safety, returnPhase = false } = input;
  const latest = exposures[0];
  const previous = exposures[1];

  if (safety.label === "RED") return safetyDraft(prescription, safety);
  if (safety.label === "YELLOW_ILLNESS" || safety.label === "YELLOW_SYSTEMIC") {
    return safetyDraft(prescription, safety);
  }

  if (returnPhase) return returnDraft(prescription, safety);

  if (!latest) {
    return makeDraft({
      action: "HOLD",
      prescription,
      reasons: ["Нет сопоставимой экспозиции для решения."],
      ruleIds: ["NO_COMPARABLE_DATA"],
      safety,
    });
  }

  const sets = completedWorkingSets(latest);
  if (sets.length === 0) {
    return makeDraft({
      action: "HOLD",
      prescription,
      reasons: ["Нет завершённых рабочих подходов."],
      ruleIds: ["NO_WORKING_SETS"],
      safety,
    });
  }

  if (safety.label === "YELLOW_PAIN") {
    if (sets.some((set) => set.pain)) {
      return localPainDraft(prescription, sets, safety);
    }
    if (isDeclining(exposures)) {
      return reduceDraft(prescription, safety, [
        "Есть боль или дискомфорт, и результативность снижается.",
      ]);
    }
    return safetyDraft(prescription, safety);
  }

  const calibration = calibrationChange(prescription, sets);
  if (calibration) {
    return makeDraft({
      action: "PROGRESS",
      prescription,
      changes: [calibration],
      reasons: [
        "Стартовая нагрузка не была задана. Фиксирую фактический результат как базу.",
      ],
      ruleIds: ["CALIBRATION_BASELINE"],
      safety,
      explanation:
        "Это не повышение, а калибровка: следующая сессия будет использовать фактический рабочий вес. Дальше прогрессия пойдёт по обычным правилам.",
    });
  }

  if (sets.length < prescription.sets) {
    return makeDraft({
      action: "HOLD",
      prescription,
      reasons: [
        `Выполнено ${sets.length} из ${prescription.sets} рабочих подходов.`,
      ],
      ruleIds: ["INCOMPLETE_SETS"],
      safety,
    });
  }

  if (sets.some((set) => set.technique === "LIMIT")) {
    return makeDraft({
      action: "HOLD",
      prescription,
      reasons: ["Техника отмечена как предельная."],
      ruleIds: ["TECHNIQUE_LIMIT"],
      safety,
    });
  }

  if (isDeclining(exposures)) {
    return reduceDraft(prescription, safety, [
      "Результативность двух сопоставимых экспозиций ниже предыдущей.",
    ]);
  }

  if (sets.some((set) => set.reps < prescription.targetReps)) {
    return makeDraft({
      action: "HOLD",
      prescription,
      reasons: [
        `Не все подходы дошли до цели ${prescription.targetReps} повторов.`,
      ],
      ruleIds: ["BELOW_TARGET_REPS"],
      safety,
    });
  }

  const rir = minRir(sets);
  if (rir === null) {
    if (allAtLeast(sets, prescription.repMax)) {
      return makeDraft({
        action: "HOLD",
        prescription,
        reasons: [
          "Достигнута верхняя граница повторов, но без RIR вес не повышается.",
        ],
        ruleIds: ["RIR_MISSING"],
        safety,
      });
    }
    if (prescription.targetReps < prescription.repMax) {
      return makeDraft({
        action: "PROGRESS",
        prescription,
        changes: [
          {
            prescriptionId: prescription.id,
            targetReps: prescription.targetReps + 1,
          },
        ],
        reasons: [
          "План выполнен, техника в норме. RIR не указан, поэтому повышаю только повторы, не вес.",
        ],
        ruleIds: ["REP_PROGRESS_NO_RIR"],
        safety,
      });
    }
    return makeDraft({
      action: "HOLD",
      prescription,
      reasons: [
        "Достигнута верхняя граница повторов, но без RIR вес не повышается.",
      ],
      ruleIds: ["RIR_MISSING"],
      safety,
    });
  }

  if (rir < prescription.targetRir) {
    return makeDraft({
      action: "HOLD",
      prescription,
      reasons: [
        `RIR ${rir} ниже цели ${prescription.targetRir}. Повторяю задание.`,
      ],
      ruleIds: ["RIR_BELOW_TARGET"],
      safety,
    });
  }

  if (allAtLeast(sets, prescription.repMax)) {
    if (
      prescription.role !== "PRIMARY" &&
      prescription.sets < 3 &&
      topRangeExposure(latest, prescription) &&
      previous !== undefined &&
      Boolean(previous.duringReturn) === Boolean(latest.duringReturn) &&
      topRangeExposure(previous, prescription) &&
      rir >= prescription.targetRir + 1
    ) {
      return makeDraft({
        action: "PROGRESS",
        prescription,
        changes: [
          {
            prescriptionId: prescription.id,
            sets: prescription.sets + 1,
          },
        ],
        reasons: [
          "Две экспозиции на верхней границе с запасом. Добавляю подход, не вес.",
        ],
        ruleIds: ["SET_PROGRESS"],
        safety,
      });
    }

    const loadChange = loadProgressChange(prescription);
    if (!loadChange) {
      return makeDraft({
        action: "HOLD",
        prescription,
        reasons: [
          "Верхняя граница повторов достигнута, но нагрузку этого варианта нельзя повысить шагом.",
        ],
        ruleIds: ["LOAD_CEILING"],
        safety,
      });
    }

    if (rir >= prescription.targetRir + 1) {
      return makeDraft({
        action: "PROGRESS",
        prescription,
        changes: [loadChange],
        reasons: [
          "Все подходы на верхней границе, RIR выше цели. Повышаю вес на один шаг.",
        ],
        ruleIds: ["LOAD_PROGRESS_RIR_3"],
        safety,
      });
    }

    if (
      previous !== undefined &&
      Boolean(previous.duringReturn) === Boolean(latest.duringReturn) &&
      topRangeExposure(previous, prescription) &&
      (minRir(completedWorkingSets(previous)) ?? -1) >= prescription.targetRir
    ) {
      return makeDraft({
        action: "PROGRESS",
        prescription,
        changes: [loadChange],
        reasons: [
          "Две экспозиции на верхней границе с целевым RIR. Повышаю вес на один шаг.",
        ],
        ruleIds: ["LOAD_PROGRESS_CONFIRMED"],
        safety,
      });
    }

    return makeDraft({
      action: "HOLD",
      prescription,
      reasons: [
        "Верхняя граница достигнута. Нужно подтверждение ещё одной экспозицией.",
      ],
      ruleIds: ["LOAD_CONFIRMATION_REQUIRED"],
      safety,
    });
  }

  if (prescription.targetReps < prescription.repMax) {
    return makeDraft({
      action: "PROGRESS",
      prescription,
      changes: [
        {
          prescriptionId: prescription.id,
          targetReps: prescription.targetReps + 1,
        },
      ],
      reasons: [
        `План выполнен с RIR ${rir}. Добавляю одно повторение к цели.`,
      ],
      ruleIds: ["REP_PROGRESS"],
      safety,
    });
  }

  return makeDraft({
    action: "HOLD",
    prescription,
    reasons: ["Условия для повышения не выполнены."],
    ruleIds: ["DEFAULT_HOLD"],
    safety,
  });
}

export function recommendSession(
  input: SessionRecommendationInput & { sessionId: string },
): RecommendationDraft[] {
  const globalSafety = input.safety ?? assessSessionSafety(input);
  const firstPrimary = input.primaries.find(
    (item) => item.prescription.role === "PRIMARY",
  );

  if (globalSafety.label === "RED" && firstPrimary) {
    return [
      makeDraft({
        action: "PAUSE",
        prescription: firstPrimary.prescription,
        reasons: [...globalSafety.reasons, "Тренировка останавливается."],
        ruleIds: ["SAFETY_RED"],
        safety: globalSafety,
        scopeType: "SESSION",
        scopeId: input.sessionId,
        explanation:
          "Есть сигнал, при котором тренировка останавливается. Приложение не оценивает причину симптома.",
      }),
    ];
  }

  const decliningPrimaries = input.primaries.filter((item) => {
    if (item.prescription.role !== "PRIMARY") return false;
    if (!isDeclining(item.exposures)) return false;
    const label = (item.safety ?? globalSafety).label;
    return (
      label === "GREEN" ||
      label === "YELLOW_SYSTEMIC"
    );
  });

  const systemic =
    (input.wellness?.fatigue ?? 0) >= 4 ||
    (input.wellness?.sleepHours ?? 24) < 6 ||
    input.sessionRpe === "MAX";

  if (decliningPrimaries.length >= 2 && systemic && !input.returnPhase) {
    const changes: ProposalChange[] = decliningPrimaries.map((item) => {
      const p = item.prescription;
      const change: ProposalChange = {
        prescriptionId: p.id,
        sets: Math.max(2, p.sets - 1),
        targetReps: p.repMin,
      };
      if (p.loadMode === "EXTERNAL" && p.weightKg !== null) {
        change.weightKg = roundDownToIncrement(
          percentReduction(p.weightKg, 10, p.incrementKg),
          p.incrementKg,
        );
      } else if (p.loadMode === "ASSISTED" && p.assistanceKg !== null) {
        change.assistanceKg = normalizeNumber(
          p.assistanceKg + p.incrementKg,
        );
      } else if (p.loadMode === "BODYWEIGHT_PLUS") {
        change.addedKg = Math.max(0, (p.addedKg ?? 0) - p.incrementKg);
      }
      return change;
    });

    return [
      makeDraft({
        action: "DELOAD",
        prescription: decliningPrimaries[0]!.prescription,
        changes,
        reasons: [
          "Снижение в двух основных движениях совпало с системной усталостью.",
          "Одна разгрузочная неделя, затем возврат к прогрессии.",
        ],
        ruleIds: ["DELOAD_DECLINE_SYSTEMIC"],
        safety: globalSafety,
        scopeType: "SESSION",
        scopeId: input.sessionId,
        explanation:
          "Предлагаю разгрузочную неделю для затронутых основных движений: вес ниже, на один подход меньше, RIR с запасом. Подсобка оценивается отдельно.",
      }),
    ];
  }

  return input.primaries.map((item) => {
    const safety = item.safety ?? globalSafety;
    return recommendProgression({
      prescription: item.prescription,
      exposures: item.exposures,
      safety,
      returnPhase: input.returnPhase,
    });
  });
}

function assessSessionSafety(
  input: SessionRecommendationInput,
): SafetyAssessment {
  const labels = input.primaries
    .map((item) => item.exposures[0])
    .filter((exposure): exposure is Exposure => exposure !== undefined);
  const wellness = input.wellness;
  const reasons: string[] = [];
  let label: SafetyAssessment["label"] = "GREEN";

  if (
    wellness?.illness === "CONFIRMED" ||
    wellness?.illness === "SIGNS"
  ) {
    label = "YELLOW_ILLNESS";
    reasons.push("Есть признаки болезни.");
  } else if (
    wellness?.symptom === true ||
    wellness?.soreness === "LOCAL" ||
    wellness?.soreness === "SEVERE"
  ) {
    label = "YELLOW_PAIN";
    reasons.push("Есть боль или дискомфорт.");
  }

  if (
    (wellness?.sleepHours ?? 24) < 5 ||
    (wellness?.fatigue ?? 0) >= 5
  ) {
    label = "YELLOW_SYSTEMIC";
    reasons.push("Сон или восстановление ниже порога.");
  }

  if (labels.length === 0) {
    return {
      label: "GREEN",
      reasons: [],
      blockProgression: false,
      pause: false,
      escalate: false,
    };
  }

  // A red flag is supplied by the caller through the text-based assessment.
  return {
    label,
    reasons,
    blockProgression: label !== "GREEN",
    pause: false,
    escalate: false,
  };
}

export function applyChangeToPrescription(
  prescription: PrescriptionSnapshot,
  change: ProposalChange,
): PrescriptionSnapshot {
  return {
    ...prescription,
    weightKg:
      change.weightKg === undefined ? prescription.weightKg : change.weightKg,
    assistanceKg:
      change.assistanceKg === undefined
        ? prescription.assistanceKg
        : change.assistanceKg,
    addedKg:
      change.addedKg === undefined ? prescription.addedKg : change.addedKg,
    targetReps:
      change.targetReps === undefined || change.targetReps === null
        ? prescription.targetReps
        : change.targetReps,
    sets:
      change.sets === undefined || change.sets === null
        ? prescription.sets
        : change.sets,
  };
}
