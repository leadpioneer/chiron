import { describe, expect, it } from "vitest";
import { buildPlan } from "./build-plan";
import { V1_TEMPLATE } from "./templates";
import type { VariantInfo } from "./build-plan";

const variants: Record<string, VariantInfo> = {
  assisted_pull_up: {
    id: "v-assisted",
    slug: "assisted_pull_up",
    name: "Подтягивания в гравитроне",
    exerciseName: "Подтягивания",
    loadMode: "ASSISTED",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  lat_pulldown: {
    id: "v-lat",
    slug: "lat_pulldown",
    name: "Верхний блок",
    exerciseName: "Верхний блок",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  barbell_rdl: {
    id: "v-hinge",
    slug: "barbell_rdl",
    name: "Румынская тяга",
    exerciseName: "Румынская тяга",
    loadMode: "EXTERNAL",
    incrementKg: 5,
    pair: false,
    sides: 1,
  },
  barbell_glute_bridge: {
    id: "v-glute-bridge",
    slug: "barbell_glute_bridge",
    name: "Ягодичный мост со штангой",
    exerciseName: "Ягодичный мостик",
    loadMode: "EXTERNAL",
    incrementKg: 5,
    pair: false,
    sides: 1,
  },
  dumbbell_rdl: {
    id: "v-db-rdl",
    slug: "dumbbell_rdl",
    name: "Румынская тяга с гантелями",
    exerciseName: "Румынская тяга",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: true,
    sides: 1,
  },
  front_squat: {
    id: "v-front",
    slug: "front_squat",
    name: "Фронтальный присед",
    exerciseName: "Фронтальный присед",
    loadMode: "EXTERNAL",
    incrementKg: 5,
    pair: false,
    sides: 1,
  },
  hack_squat: {
    id: "v-hack",
    slug: "hack_squat",
    name: "Гакк-присед",
    exerciseName: "Гакк-присед",
    loadMode: "EXTERNAL",
    incrementKg: 5,
    pair: false,
    sides: 1,
  },
  barbell_bench: {
    id: "v-bench",
    slug: "barbell_bench",
    name: "Жим штанги лёжа",
    exerciseName: "Жим лёжа",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  dumbbell_bench: {
    id: "v-db-bench",
    slug: "dumbbell_bench",
    name: "Жим гантелей лёжа",
    exerciseName: "Жим гантелей",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: true,
    sides: 1,
  },
  seated_cable_row: {
    id: "v-row",
    slug: "seated_cable_row",
    name: "Горизонтальная тяга",
    exerciseName: "Горизонтальная тяга",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  dumbbell_pullover: {
    id: "v-pullover",
    slug: "dumbbell_pullover",
    name: "Пуловер",
    exerciseName: "Пуловер",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: true,
    sides: 1,
  },
  leg_extension: {
    id: "v-leg-ext",
    slug: "leg_extension",
    name: "Разгибание голени",
    exerciseName: "Разгибание голени",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  pec_deck: {
    id: "v-pec",
    slug: "pec_deck",
    name: "Бабочка",
    exerciseName: "Бабочка",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  biceps_curl: {
    id: "v-biceps",
    slug: "biceps_curl",
    name: "Бицепс",
    exerciseName: "Бицепс",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: true,
    sides: 1,
  },
  triceps_pushdown: {
    id: "v-triceps",
    slug: "triceps_pushdown",
    name: "Трицепс",
    exerciseName: "Трицепс",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  lateral_raise: {
    id: "v-lateral",
    slug: "lateral_raise",
    name: "Махи",
    exerciseName: "Средняя дельта",
    loadMode: "EXTERNAL",
    incrementKg: 2,
    pair: true,
    sides: 1,
  },
};

const selections = {
  variants: {
    verticalPull: "assisted_pull_up",
    hinge: "barbell_rdl",
    squat: "front_squat",
    press: "barbell_bench",
  },
  accessories: {
    row: true,
    pullover: false,
    legExtension: true,
    pecDeck: true,
  },
  aesthetic: ["biceps_curl"],
  startingLoads: {
    verticalPull: 30,
    hinge: 100,
    squat: 80,
    press: 60,
  },
  breakWeeks: 10,
  bodyweightKg: 80,
};

describe("buildPlan", () => {
  it("builds two sessions with independent primaries and selected accessories", () => {
    const plan = buildPlan(V1_TEMPLATE, variants, selections);
    expect(plan.sessions).toHaveLength(2);
    const pull = plan.sessions[0]!;
    const push = plan.sessions[1]!;
    expect(pull.blocks.map((block) => block.key)).toEqual([
      "vertical_pull",
      "posterior_chain",
      "aesthetic",
    ]);
    expect(push.blocks.map((block) => block.key)).toEqual([
      "squat",
      "press",
      "aesthetic",
    ]);

    const pullPrimaries = pull.prescriptions.filter(
      (item) => item.role === "PRIMARY",
    );
    expect(pullPrimaries).toHaveLength(2);
    expect(pullPrimaries.map((item) => item.key)).toEqual([
      "vertical_pull_primary",
      "hinge_primary",
    ]);

    expect(
      pull.prescriptions.some((item) => item.key === "row_accessory"),
    ).toBe(true);
    expect(
      pull.prescriptions.some((item) => item.key === "pullover_accessory"),
    ).toBe(false);
    expect(
      pull.prescriptions.some((item) => item.key === "biceps_curl"),
    ).toBe(true);
    const bridge = pull.prescriptions.find((item) => item.key === "bridge");
    expect(bridge).toBeDefined();
    expect(bridge?.variantSlug).toBe("barbell_glute_bridge");
    expect(bridge?.supportsKey).toBe("hinge_primary");
    expect(bridge?.optional).toBe(false);
  });

  it("applies the return multiplier to starting loads", () => {
    const plan = buildPlan(V1_TEMPLATE, variants, selections);
    const vertical = plan.sessions[0]!.prescriptions.find(
      (item) => item.key === "vertical_pull_primary",
    )!;
    const hinge = plan.sessions[0]!.prescriptions.find(
      (item) => item.key === "hinge_primary",
    )!;
    expect(vertical.assistanceKg).toBe(40);
    expect(hinge.weightKg).toBe(80);
  });

  it("leaves loads empty after a very long break for calibration", () => {
    const plan = buildPlan(V1_TEMPLATE, variants, {
      ...selections,
      breakWeeks: 30,
    });
    const bench = plan.sessions[1]!.prescriptions.find(
      (item) => item.key === "press_primary",
    )!;
    expect(bench.weightKg).toBeNull();
  });

  it("keeps accessory links to their primary", () => {
    const plan = buildPlan(V1_TEMPLATE, variants, selections);
    const row = plan.sessions[0]!.prescriptions.find(
      (item) => item.key === "row_accessory",
    )!;
    expect(row.supportsKey).toBe("vertical_pull_primary");
    expect(row.role).toBe("ACCESSORY");
  });
});
