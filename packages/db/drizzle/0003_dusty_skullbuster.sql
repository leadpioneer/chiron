CREATE TABLE "coach_mentees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_user_id" uuid NOT NULL,
	"mentee_user_id" uuid NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"permissions" text DEFAULT 'WRITE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "coach_mentees" ADD CONSTRAINT "coach_mentees_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_mentees" ADD CONSTRAINT "coach_mentees_mentee_user_id_users_id_fk" FOREIGN KEY ("mentee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_mentees_pair_idx" ON "coach_mentees" USING btree ("coach_user_id","mentee_user_id");--> statement-breakpoint
CREATE INDEX "coach_mentees_coach_idx" ON "coach_mentees" USING btree ("coach_user_id","status");--> statement-breakpoint
CREATE INDEX "coach_mentees_mentee_idx" ON "coach_mentees" USING btree ("mentee_user_id");--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;