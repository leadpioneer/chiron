import type { LoadMode, Role } from "@chiron/contracts";
import {
  roundDownToIncrement,
  roundUpToIncrement,
} from "./metrics";
import type {
  StartingLoadField,
  TemplateDefinition,
  TemplateExerciseDefinition,
} from "./types";

export interface VariantInfo {
  id: string;
  slug: string;
  name: string;
  exerciseName: string;
  loadMode: LoadMode;
  incrementKg: number;
  pair: boolean;
  sides: number;
}

export interface PlanSelections {
  variants: {
    verticalPull: string;
    hinge: string;
    squat: string;
    press: string;
  };
  accessories: {
    row: boolean;
    pullover: boolean;
    legExtension: boolean;
    pecDeck: boolean;
  };
  aesthetic: string[];
  startingLoads: StartingLoadField;
  breakWeeks: number | null;
  bodyweightKg: number | null;
}

export interface BuiltPrescription {
  key: string;
  sessionKey: "A" | "B";
  variantId: string;
  variantSlug: string;
  exerciseName: string;
  role: Role;
  targetBlockKey: string;
  targetBlockName: string;
  supportsKey: string | null;
  plannedOrder: number;
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
}

export interface BuiltBlock {
  key: string;
  sessionKey: "A" | "B";
  name: string;
  goal: string;
  primaryKey: string;
}

export interface BuiltSession {
  key: "A" | "B";
  name: string;
  blocks: BuiltBlock[];
  prescriptions: BuiltPrescription[];
}

export interface BuiltPlan {
  sessions: BuiltSession[];
}

export function returnMultiplier(breakWeeks: number | null): number | null {
  if (breakWeeks === null) return 1;
  if (breakWeeks <= 2) return 1;
  if (breakWeeks <= 6) return 0.9;
  if (breakWeeks <= 12) return 0.8;
  if (breakWeeks <= 24) return 0.7;
  return null;
}

export function adjustedStartingLoad(
  load: number | null,
  incrementKg: number,
  breakWeeks: number | null,
): number | null {
  if (load === null) return null;
  const multiplier = returnMultiplier(breakWeeks);
  if (multiplier === null) return null;
  return roundDownToIncrement(load * multiplier, incrementKg);
}

function variantSlugFor(
  exercise: TemplateExerciseDefinition,
  selections: PlanSelections,
): string {
  if (exercise.key === "vertical_pull_primary") {
    return selections.variants.verticalPull;
  }
  if (exercise.key === "hinge_primary") return selections.variants.hinge;
  if (exercise.key === "squat_primary") return selections.variants.squat;
  if (exercise.key === "press_primary") return selections.variants.press;
  return exercise.variantSlug;
}

function accessoryEnabled(
  key: string,
  selections: PlanSelections,
): boolean {
  if (key === "row_accessory") return selections.accessories.row;
  if (key === "pullover_accessory") return selections.accessories.pullover;
  if (key === "leg_extension_accessory") {
    return selections.accessories.legExtension;
  }
  if (key === "pec_deck_accessory") return selections.accessories.pecDeck;
  return true;
}

function loadFields(
  exercise: TemplateExerciseDefinition,
  variant: VariantInfo,
  selections: PlanSelections,
): { weightKg: number | null; assistanceKg: number | null; addedKg: number | null } {
  const field = exercise.startingLoadField;
  if (!field) {
    return { weightKg: null, assistanceKg: null, addedKg: null };
  }
  const raw = selections.startingLoads[field];
  if (raw === null) {
    return { weightKg: null, assistanceKg: null, addedKg: null };
  }

  if (variant.loadMode === "ASSISTED") {
    const multiplier = returnMultiplier(selections.breakWeeks);
    if (multiplier === null) {
      return { weightKg: null, assistanceKg: null, addedKg: null };
    }
    if (
      selections.breakWeeks !== null &&
      selections.breakWeeks > 2 &&
      selections.bodyweightKg === null
    ) {
      // Without bodyweight the effective load is unknown; calibrate instead.
      return { weightKg: null, assistanceKg: null, addedKg: null };
    }
    if (
      selections.bodyweightKg !== null &&
      selections.breakWeeks !== null &&
      selections.breakWeeks > 2
    ) {
      const effective = Math.max(0, selections.bodyweightKg - raw);
      const targetEffective = effective * multiplier;
      const assistance = Math.max(
        0,
        selections.bodyweightKg - targetEffective,
      );
      return {
        weightKg: null,
        assistanceKg: roundUpToIncrement(assistance, variant.incrementKg),
        addedKg: null,
      };
    }
    return { weightKg: null, assistanceKg: raw, addedKg: null };
  }

  const adjusted = adjustedStartingLoad(
    raw,
    variant.incrementKg,
    selections.breakWeeks,
  );
  if (adjusted === null) {
    return { weightKg: null, assistanceKg: null, addedKg: null };
  }
  switch (variant.loadMode) {
    case "EXTERNAL":
      return { weightKg: adjusted, assistanceKg: null, addedKg: null };
    case "BODYWEIGHT_PLUS":
      return { weightKg: null, assistanceKg: null, addedKg: adjusted };
    case "BODYWEIGHT":
      return { weightKg: null, assistanceKg: null, addedKg: null };
  }
}

export function buildPlan(
  template: TemplateDefinition,
  variantsBySlug: Record<string, VariantInfo>,
  selections: PlanSelections,
): BuiltPlan {
  const sessions: BuiltSession[] = template.sessions.map((session) => {
    const blocks: BuiltBlock[] = [];
    const prescriptions: BuiltPrescription[] = [];
    let order = 0;

    for (const block of session.blocks) {
      blocks.push({
        key: block.key,
        sessionKey: session.key,
        name: block.name,
        goal: block.goal,
        primaryKey: block.primaryKey,
      });

      for (const exercise of block.exercises) {
        if (exercise.role === "ACCESSORY" && !accessoryEnabled(exercise.key, selections)) {
          continue;
        }
        const slug = variantSlugFor(exercise, selections);
        const variant = variantsBySlug[slug];
        if (!variant) {
          throw new Error(`Unknown exercise variant: ${slug}`);
        }
        const load = loadFields(exercise, variant, selections);
        prescriptions.push({
          key: exercise.key,
          sessionKey: session.key,
          variantId: variant.id,
          variantSlug: variant.slug,
          exerciseName: variant.exerciseName,
          role: exercise.role,
          targetBlockKey: block.key,
          targetBlockName: block.name,
          supportsKey: exercise.supportsKey,
          plannedOrder: order++,
          optional: exercise.optional,
          sets: exercise.sets,
          repMin: exercise.repMin,
          repMax: exercise.repMax,
          targetReps: exercise.targetReps,
          targetRir: exercise.targetRir,
          loadMode: variant.loadMode,
          weightKg: load.weightKg,
          assistanceKg: load.assistanceKg,
          addedKg: load.addedKg,
          incrementKg: variant.incrementKg,
          pair: variant.pair,
          sides: variant.sides,
        });
      }
    }

    const selectedAesthetic = template.aesthetic.filter((item) =>
      selections.aesthetic.includes(item.key),
    );
    if (selectedAesthetic.length > 0) {
      blocks.push({
        key: "aesthetic",
        sessionKey: session.key,
        name: "Эстетика",
        goal: "Дополнительная работа по приоритетам",
        primaryKey: "",
      });
    }

    for (const aesthetic of selectedAesthetic) {
      const variant = variantsBySlug[aesthetic.variantSlug];
      if (!variant) {
        throw new Error(`Unknown aesthetic variant: ${aesthetic.variantSlug}`);
      }
      prescriptions.push({
        key: aesthetic.key,
        sessionKey: session.key,
        variantId: variant.id,
        variantSlug: variant.slug,
        exerciseName: variant.exerciseName,
        role: "AESTHETIC",
        targetBlockKey: "aesthetic",
        targetBlockName: "Эстетика",
        supportsKey: null,
        plannedOrder: order++,
        optional: true,
        sets: aesthetic.sets,
        repMin: aesthetic.repMin,
        repMax: aesthetic.repMax,
        targetReps: aesthetic.targetReps,
        targetRir: aesthetic.targetRir,
        loadMode: variant.loadMode,
        weightKg: null,
        assistanceKg: null,
        addedKg: null,
        incrementKg: variant.incrementKg,
        pair: variant.pair,
        sides: variant.sides,
      });
    }

    return {
      key: session.key,
      name: session.name,
      blocks,
      prescriptions,
    };
  });

  return { sessions };
}
