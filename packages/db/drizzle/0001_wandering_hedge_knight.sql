CREATE TABLE "exercise_library" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ru" text,
	"aliases_ru" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"force" text,
	"level" text,
	"mechanic" text,
	"equipment" text,
	"equipment_ru" text,
	"category" text,
	"category_ru" text,
	"primary_muscles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secondary_muscles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_muscles_ru" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secondary_muscles_ru" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instructions_ru" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_status" text,
	"instructions_status" text,
	"source_url" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "athlete_profiles" ALTER COLUMN "training_days" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "athlete_profiles" ADD COLUMN "height_cm" double precision;--> statement-breakpoint
ALTER TABLE "athlete_profiles" ADD COLUMN "body_fat_percent" double precision;--> statement-breakpoint
ALTER TABLE "athlete_profiles" ADD COLUMN "training_scheme" text DEFAULT 'EVERY_OTHER_DAY' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercise_variants" ADD COLUMN "library_id" text;--> statement-breakpoint
CREATE INDEX "exercise_library_name_ru_idx" ON "exercise_library" USING btree ("name_ru");--> statement-breakpoint
ALTER TABLE "exercise_variants" ADD CONSTRAINT "exercise_variants_library_id_exercise_library_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."exercise_library"("id") ON DELETE set null ON UPDATE no action;