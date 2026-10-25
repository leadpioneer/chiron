export interface ExerciseBlockRule {
  blockKey: string;
  primaryEligible: boolean;
}

const VARIANT_RULES: Record<string, ExerciseBlockRule> = {
  assisted_pull_up: { blockKey: "vertical_pull", primaryEligible: true },
  lat_pulldown: { blockKey: "vertical_pull", primaryEligible: true },
  seated_cable_row: { blockKey: "vertical_pull", primaryEligible: false },
  dumbbell_pullover: { blockKey: "vertical_pull", primaryEligible: false },
  barbell_rdl: { blockKey: "posterior_chain", primaryEligible: true },
  dumbbell_rdl: { blockKey: "posterior_chain", primaryEligible: true },
  barbell_glute_bridge: {
    blockKey: "posterior_chain",
    primaryEligible: false,
  },
  front_squat: { blockKey: "squat", primaryEligible: true },
  hack_squat: { blockKey: "squat", primaryEligible: true },
  leg_extension: { blockKey: "squat", primaryEligible: false },
  barbell_bench: { blockKey: "press", primaryEligible: true },
  dumbbell_bench: { blockKey: "press", primaryEligible: true },
  pec_deck: { blockKey: "press", primaryEligible: false },
  biceps_curl: { blockKey: "aesthetic", primaryEligible: false },
  triceps_pushdown: { blockKey: "aesthetic", primaryEligible: false },
  lateral_raise: { blockKey: "aesthetic", primaryEligible: false },
};

export function exerciseBlockRule(
  variantSlug: string,
): ExerciseBlockRule | null {
  return VARIANT_RULES[variantSlug] ?? null;
}
