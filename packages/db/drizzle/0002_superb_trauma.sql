ALTER TABLE "sessions" ADD COLUMN "rescheduled_from" date;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "is_return" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "training_cycles" ADD COLUMN "return_phase_sessions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_cycles" ADD COLUMN "close_reason" text;