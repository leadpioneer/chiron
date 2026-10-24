CREATE TABLE "athlete_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"experience" text NOT NULL,
	"goal" text NOT NULL,
	"bodyweight_kg" double precision,
	"training_days" jsonb NOT NULL,
	"break_weeks" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"versions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"reason_category" text,
	"comment" text,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"equipment" text NOT NULL,
	"load_mode" text NOT NULL,
	"increment_kg" double precision DEFAULT 2.5 NOT NULL,
	"pair" boolean DEFAULT false NOT NULL,
	"sides" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "exercise_variants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"pattern" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "exercises_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"rules_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"output" jsonb,
	"validation" text NOT NULL,
	"latency_ms" integer,
	"cost_usd" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "magic_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "plan_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"definition" jsonb NOT NULL,
	"rules_version" text DEFAULT '1.0.0' NOT NULL,
	CONSTRAINT "plan_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"parent_version_id" uuid,
	"reason" text NOT NULL,
	"decision_id" uuid,
	"rules_version" text DEFAULT '1.0.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"target_block_id" uuid NOT NULL,
	"exercise_variant_id" uuid NOT NULL,
	"role" text NOT NULL,
	"supports_primary_id" uuid,
	"session_key" text NOT NULL,
	"planned_order" integer NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"sets" integer NOT NULL,
	"rep_min" integer NOT NULL,
	"rep_max" integer NOT NULL,
	"target_reps" integer NOT NULL,
	"target_rir" integer NOT NULL,
	"load_mode" text NOT NULL,
	"weight_kg" double precision,
	"assistance_kg" double precision,
	"added_kg" double precision,
	"increment_kg" double precision NOT NULL,
	"pair" boolean DEFAULT false NOT NULL,
	"sides" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"session_id" uuid,
	"action" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"explanation" text NOT NULL,
	"candidates" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"rules_version" text NOT NULL,
	"prompt_version" text,
	"model_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "safety_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"label" text NOT NULL,
	"severity" text NOT NULL,
	"source" text NOT NULL,
	"scope" text NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_performances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"session_rpe" text NOT NULL,
	"comment" text,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_performances_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"session_index" integer NOT NULL,
	"session_key" text NOT NULL,
	"planned_date" date NOT NULL,
	"actual_date" date,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_performances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"prescription_id" uuid NOT NULL,
	"client_set_id" uuid NOT NULL,
	"set_type" text NOT NULL,
	"weight_kg" double precision,
	"assistance_kg" double precision,
	"added_kg" double precision,
	"reps" integer NOT NULL,
	"rir" integer,
	"technique" text DEFAULT 'NORMAL' NOT NULL,
	"pain" boolean DEFAULT false NOT NULL,
	"completed" boolean DEFAULT true NOT NULL,
	"actual_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"session_key" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"goal" text NOT NULL,
	"primary_prescription_id" uuid,
	"progression_policy" text DEFAULT 'DOUBLE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"current_plan_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'ru' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wellness_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"recorded_at" date NOT NULL,
	"sleep_hours" double precision,
	"sleep_quality" integer,
	"fatigue" integer,
	"stress" integer,
	"motivation" integer,
	"soreness" text,
	"symptom" boolean,
	"symptom_text" text,
	"illness" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_variants" ADD CONSTRAINT "exercise_variants_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_cycle_id_training_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_target_block_id_target_blocks_id_fk" FOREIGN KEY ("target_block_id") REFERENCES "public"."target_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_exercise_variant_id_exercise_variants_id_fk" FOREIGN KEY ("exercise_variant_id") REFERENCES "public"."exercise_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_cycle_id_training_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_events" ADD CONSTRAINT "safety_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_performances" ADD CONSTRAINT "session_performances_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cycle_id_training_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."training_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_performances" ADD CONSTRAINT "set_performances_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_performances" ADD CONSTRAINT "set_performances_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_blocks" ADD CONSTRAINT "target_blocks_plan_version_id_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."plan_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycles" ADD CONSTRAINT "training_cycles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cycles" ADD CONSTRAINT "training_cycles_template_id_plan_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."plan_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_checks" ADD CONSTRAINT "wellness_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness_checks" ADD CONSTRAINT "wellness_checks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "variants_exercise_idx" ON "exercise_variants" USING btree ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_user_key_idx" ON "idempotency_keys" USING btree ("user_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "identities_provider_user_idx" ON "identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "identities_user_idx" ON "identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_versions_cycle_version_idx" ON "plan_versions" USING btree ("cycle_id","version");--> statement-breakpoint
CREATE INDEX "prescriptions_version_session_idx" ON "prescriptions" USING btree ("plan_version_id","session_key","planned_order");--> statement-breakpoint
CREATE INDEX "recommendations_cycle_status_idx" ON "recommendations" USING btree ("cycle_id","status");--> statement-breakpoint
CREATE INDEX "safety_events_user_idx" ON "safety_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_cycle_index_idx" ON "sessions" USING btree ("cycle_id","session_index");--> statement-breakpoint
CREATE INDEX "sessions_cycle_date_idx" ON "sessions" USING btree ("cycle_id","planned_date");--> statement-breakpoint
CREATE UNIQUE INDEX "set_performances_client_idx" ON "set_performances" USING btree ("session_id","client_set_id");--> statement-breakpoint
CREATE INDEX "set_performances_prescription_idx" ON "set_performances" USING btree ("prescription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "target_blocks_version_session_key_idx" ON "target_blocks" USING btree ("plan_version_id","session_key","key");--> statement-breakpoint
CREATE INDEX "cycles_user_idx" ON "training_cycles" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "wellness_user_date_idx" ON "wellness_checks" USING btree ("user_id","recorded_at");