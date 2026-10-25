import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { V1_TEMPLATE } from "@chiron/core";
import { closeDb, getDb } from "./client";
import {
  exerciseLibrary,
  exerciseVariants,
  exercises,
  planTemplates,
} from "./schema";

const exerciseRows = [
  {
    slug: "pull_up",
    name: "Подтягивания",
    pattern: "VERTICAL_PULL",
    aliases: ["подтягивания", "подтягивание", "гравитрон"],
  },
  {
    slug: "horizontal_row",
    name: "Горизонтальная тяга",
    pattern: "HORIZONTAL_PULL",
    aliases: ["тяга", "горизонтальная тяга", "row"],
  },
  {
    slug: "pullover",
    name: "Пуловер",
    pattern: "VERTICAL_PULL",
    aliases: ["пуловер", "pullover"],
  },
  {
    slug: "hinge",
    name: "Румынская тяга",
    pattern: "HINGE",
    aliases: ["румынская тяга", "румынка", "rdl"],
  },
  {
    slug: "glute_bridge",
    name: "Ягодичный мостик",
    pattern: "HINGE",
    aliases: ["ягодичный мостик", "ягодичный мост", "glute bridge"],
  },
  {
    slug: "squat",
    name: "Присед",
    pattern: "SQUAT",
    aliases: ["присед", "приседания", "squat"],
  },
  {
    slug: "knee_extension",
    name: "Разгибание голени",
    pattern: "KNEE_EXTENSION",
    aliases: ["разгибание голени", "leg extension"],
  },
  {
    slug: "horizontal_push",
    name: "Жим лёжа",
    pattern: "HORIZONTAL_PUSH",
    aliases: ["жим", "жим лёжа", "bench"],
  },
  {
    slug: "chest_isolation",
    name: "Бабочка",
    pattern: "CHEST_ISOLATION",
    aliases: ["бабочка", "пек-дек", "pec deck"],
  },
  {
    slug: "biceps",
    name: "Бицепс",
    pattern: "ELBOW_FLEXION",
    aliases: ["бицепс", "curl"],
  },
  {
    slug: "triceps",
    name: "Трицепс",
    pattern: "ELBOW_EXTENSION",
    aliases: ["трицепс", "pushdown"],
  },
  {
    slug: "lateral_delts",
    name: "Средняя дельта",
    pattern: "ABDUCTION",
    aliases: ["средняя дельта", "махи", "lateral raise"],
  },
];

const variantRows = [
  {
    exercise: "pull_up",
    slug: "assisted_pull_up",
    name: "Подтягивания в гравитроне",
    equipment: "GRAVITRON",
    loadMode: "ASSISTED",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "pull_up",
    slug: "lat_pulldown",
    name: "Верхний блок",
    equipment: "CABLE",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "horizontal_row",
    slug: "seated_cable_row",
    name: "Горизонтальная тяга",
    equipment: "CABLE",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "horizontal_row",
    slug: "chest_supported_row",
    name: "Тяга с упором в грудь",
    equipment: "MACHINE",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "pullover",
    slug: "dumbbell_pullover",
    name: "Пуловер с гантелью",
    equipment: "DUMBBELL",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "hinge",
    slug: "barbell_rdl",
    name: "Румынская тяга со штангой",
    equipment: "BARBELL",
    loadMode: "EXTERNAL",
    incrementKg: 5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "hinge",
    slug: "dumbbell_rdl",
    name: "Румынская тяга с гантелями",
    equipment: "DUMBBELL",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: true,
    sides: 1,
  },
  {
    exercise: "glute_bridge",
    slug: "barbell_glute_bridge",
    name: "Ягодичный мост со штангой",
    equipment: "BARBELL",
    loadMode: "EXTERNAL",
    incrementKg: 5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "squat",
    slug: "front_squat",
    name: "Фронтальный присед",
    equipment: "BARBELL",
    loadMode: "EXTERNAL",
    incrementKg: 5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "squat",
    slug: "hack_squat",
    name: "Гакк-присед",
    equipment: "MACHINE",
    loadMode: "EXTERNAL",
    incrementKg: 5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "knee_extension",
    slug: "leg_extension",
    name: "Разгибание голени",
    equipment: "MACHINE",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "horizontal_push",
    slug: "barbell_bench",
    name: "Жим штанги лёжа",
    equipment: "BARBELL",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "horizontal_push",
    slug: "dumbbell_bench",
    name: "Жим гантелей лёжа",
    equipment: "DUMBBELL",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: true,
    sides: 1,
  },
  {
    exercise: "chest_isolation",
    slug: "pec_deck",
    name: "Бабочка",
    equipment: "MACHINE",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "biceps",
    slug: "biceps_curl",
    name: "Подъём на бицепс",
    equipment: "DUMBBELL",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: true,
    sides: 1,
  },
  {
    exercise: "triceps",
    slug: "triceps_pushdown",
    name: "Разгибание на трицепс",
    equipment: "CABLE",
    loadMode: "EXTERNAL",
    incrementKg: 2.5,
    pair: false,
    sides: 1,
  },
  {
    exercise: "lateral_delts",
    slug: "lateral_raise",
    name: "Махи в стороны",
    equipment: "DUMBBELL",
    loadMode: "EXTERNAL",
    incrementKg: 2,
    pair: true,
    sides: 1,
  },
];

const libraryByVariantSlug: Record<string, string> = {
  assisted_pull_up: "Band_Assisted_Pull-Up",
  lat_pulldown: "Wide-Grip_Lat_Pulldown",
  seated_cable_row: "Seated_Cable_Rows",
  chest_supported_row: "Dumbbell_Incline_Row",
  dumbbell_pullover: "Bent-Arm_Dumbbell_Pullover",
  barbell_rdl: "Romanian_Deadlift",
  dumbbell_rdl: "Stiff-Legged_Dumbbell_Deadlift",
  barbell_glute_bridge: "Barbell_Glute_Bridge",
  front_squat: "Front_Barbell_Squat",
  hack_squat: "Hack_Squat",
  leg_extension: "Leg_Extensions",
  barbell_bench: "Barbell_Bench_Press_-_Medium_Grip",
  dumbbell_bench: "Dumbbell_Bench_Press",
  pec_deck: "Butterfly",
  biceps_curl: "Dumbbell_Bicep_Curl",
  triceps_pushdown: "Triceps_Pushdown",
  lateral_raise: "Side_Lateral_Raise",
};

interface LibraryRecord {
  id: string;
  name: string;
  name_ru?: string | null;
  aliases_ru?: string[] | null;
  force?: string | null;
  level?: string | null;
  mechanic?: string | null;
  equipment?: string | null;
  equipment_ru?: string | null;
  category?: string | null;
  category_ru?: string | null;
  primaryMuscles?: string[] | null;
  secondaryMuscles?: string[] | null;
  primaryMuscles_ru?: string[] | null;
  secondaryMuscles_ru?: string[] | null;
  instructions_ru?: string[] | null;
  images?: string[] | null;
  review_status?: string | null;
  instructions_status?: string | null;
}

function loadLibrary(): Array<typeof exerciseLibrary.$inferInsert> {
  const filePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../data/exercises.ru.json",
  );
  const raw = fs.readFileSync(filePath, "utf8");
  const records = JSON.parse(raw) as LibraryRecord[];
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    nameRu: record.name_ru ?? null,
    aliasesRu: record.aliases_ru ?? [],
    force: record.force ?? null,
    level: record.level ?? null,
    mechanic: record.mechanic ?? null,
    equipment: record.equipment ?? null,
    equipmentRu: record.equipment_ru ?? null,
    category: record.category ?? null,
    categoryRu: record.category_ru ?? null,
    primaryMuscles: record.primaryMuscles ?? [],
    secondaryMuscles: record.secondaryMuscles ?? [],
    primaryMusclesRu: record.primaryMuscles_ru ?? [],
    secondaryMusclesRu: record.secondaryMuscles_ru ?? [],
    instructionsRu: record.instructions_ru ?? [],
    images: record.images ?? [],
    reviewStatus: record.review_status ?? null,
    instructionsStatus: record.instructions_status ?? null,
    sourceUrl: `https://github.com/leadpioneer/RU-free-exercise-db#${record.id}`,
  }));
}

async function main(): Promise<void> {
  const db = getDb();
  const library = loadLibrary();
  for (let index = 0; index < library.length; index += 100) {
    await db
      .insert(exerciseLibrary)
      .values(library.slice(index, index + 100))
      .onConflictDoNothing();
  }

  for (const row of exerciseRows) {
    await db
      .insert(exercises)
      .values(row)
      .onConflictDoUpdate({
        target: exercises.slug,
        set: {
          name: row.name,
          pattern: row.pattern,
          aliases: row.aliases,
        },
      });
  }
  const exerciseRowsFromDb = await db.select().from(exercises);
  const exerciseIdBySlug = new Map(
    exerciseRowsFromDb.map((row) => [row.slug, row.id]),
  );

  const variantsToInsert = variantRows.map((row) => {
    const exerciseId = exerciseIdBySlug.get(row.exercise);
    if (!exerciseId) throw new Error(`Missing exercise: ${row.exercise}`);
    return {
      exerciseId,
      libraryId: libraryByVariantSlug[row.slug] ?? null,
      slug: row.slug,
      name: row.name,
      equipment: row.equipment,
      loadMode: row.loadMode,
      incrementKg: row.incrementKg,
      pair: row.pair,
      sides: row.sides,
    };
  });

  for (const row of variantsToInsert) {
    await db
      .insert(exerciseVariants)
      .values(row)
      .onConflictDoUpdate({
        target: exerciseVariants.slug,
        set: {
          exerciseId: row.exerciseId,
          libraryId: row.libraryId,
          name: row.name,
          equipment: row.equipment,
          loadMode: row.loadMode,
          incrementKg: row.incrementKg,
          pair: row.pair,
          sides: row.sides,
        },
      });
  }

  await db
    .insert(planTemplates)
    .values({
      slug: V1_TEMPLATE.slug,
      name: V1_TEMPLATE.name,
      description: V1_TEMPLATE.description,
      definition: V1_TEMPLATE,
      rulesVersion: "1.0.0",
    })
    .onConflictDoUpdate({
      target: planTemplates.slug,
      set: {
        name: V1_TEMPLATE.name,
        description: V1_TEMPLATE.description,
        definition: V1_TEMPLATE,
        rulesVersion: "1.0.0",
      },
    });

  const template = await db
    .select()
    .from(planTemplates)
    .where(eq(planTemplates.slug, V1_TEMPLATE.slug))
    .limit(1);

  console.log(
    `Seed complete: ${library.length} library exercises, ${exerciseRows.length} curated exercises, ${variantRows.length} variants, template ${template[0]?.slug ?? "missing"}.`,
  );
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
