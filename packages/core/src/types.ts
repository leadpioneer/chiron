import type {
  Action,
  Experience,
  Goal,
  LoadMode,
  Role,
  SafetyLabel,
  ScopeType,
  SessionRpe,
  SetType,
  Technique,
} from "@chiron/contracts";

export interface PrescriptionSnapshot {
  id: string;
  exerciseVariantId: string;
  exerciseName: string;
  role: Role;
  targetBlockKey: string;
  targetBlockName: string;
  supportsPrimaryId: string | null;
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

export interface SetRecord {
  setType: SetType;
  weightKg: number | null;
  assistanceKg: number | null;
  addedKg: number | null;
  reps: number;
  rir: number | null;
  technique: Technique;
  pain?: boolean;
  completed: boolean;
  actualOrder: number;
}

export interface Exposure {
  id: string;
  date: string;
  sets: SetRecord[];
  plannedSets: number;
  plannedRepMin: number;
  plannedRepMax: number;
  targetReps: number;
  targetRir: number;
  duringReturn?: boolean;
}

export interface WellnessSnapshot {
  sleepHours: number | null;
  sleepQuality: number | null;
  fatigue: number | null;
  stress: number | null;
  motivation: number | null;
  soreness: "NONE" | "LOCAL" | "SEVERE" | null;
  symptom: boolean | null;
  symptomText: string | null;
  illness: "NONE" | "SIGNS" | "CONFIRMED" | null;
}

export interface SafetyAssessment {
  label: SafetyLabel;
  reasons: string[];
  blockProgression: boolean;
  pause: boolean;
  escalate: boolean;
}

export interface ProposalChange {
  prescriptionId: string;
  weightKg?: number | null;
  assistanceKg?: number | null;
  addedKg?: number | null;
  targetReps?: number | null;
  sets?: number | null;
}

export interface RecommendationDraft {
  action: Action;
  scopeType: ScopeType;
  scopeId: string;
  changes: ProposalChange[];
  reasons: string[];
  ruleIds: string[];
  safety: SafetyAssessment;
  explanation: string;
}

export interface SessionRecommendationInput {
  primaries: Array<{
    prescription: PrescriptionSnapshot;
    exposures: Exposure[];
    safety?: SafetyAssessment;
  }>;
  wellness: WellnessSnapshot | null;
  sessionRpe: SessionRpe | null;
  safety?: SafetyAssessment;
  returnPhase?: boolean;
}

export interface ProfileDraft {
  displayName: string;
  experience: Experience;
  goal: Goal;
  bodyweightKg: number | null;
  breakWeeks: number | null;
}

export interface StartingLoadField {
  verticalPull: number | null;
  hinge: number | null;
  squat: number | null;
  press: number | null;
}

export interface TemplateAestheticDefinition {
  key: string;
  variantSlug: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetReps: number;
  targetRir: number;
}

export interface TemplateExerciseDefinition {
  key: string;
  variantSlug: string;
  role: Role;
  optional: boolean;
  sets: number;
  repMin: number;
  repMax: number;
  targetReps: number;
  targetRir: number;
  supportsKey: string | null;
  startingLoadField: keyof StartingLoadField | null;
}

export interface TemplateBlockDefinition {
  key: string;
  name: string;
  goal: string;
  primaryKey: string;
  exercises: TemplateExerciseDefinition[];
}

export interface TemplateSessionDefinition {
  key: "A" | "B";
  name: string;
  blocks: TemplateBlockDefinition[];
}

export interface TemplateDefinition {
  slug: string;
  name: string;
  description: string;
  sessions: TemplateSessionDefinition[];
  aesthetic: TemplateAestheticDefinition[];
}
