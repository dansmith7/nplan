CREATE TABLE IF NOT EXISTS "idea_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"icon" varchar(64) DEFAULT 'Lightbulb' NOT NULL,
	"color" varchar(7) DEFAULT '#6366F1' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "idea_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"promoted_task_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "idea_boards" ADD CONSTRAINT "idea_boards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "idea_columns" ADD CONSTRAINT "idea_columns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "idea_columns" ADD CONSTRAINT "idea_columns_board_id_idea_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."idea_boards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ideas" ADD CONSTRAINT "ideas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ideas" ADD CONSTRAINT "ideas_board_id_idea_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."idea_boards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ideas" ADD CONSTRAINT "ideas_column_id_idea_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."idea_columns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ideas" ADD CONSTRAINT "ideas_promoted_task_id_tasks_id_fk" FOREIGN KEY ("promoted_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idea_boards_user_idx" ON "idea_boards" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idea_columns_board_idx" ON "idea_columns" USING btree ("board_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idea_columns_user_idx" ON "idea_columns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ideas_column_idx" ON "ideas" USING btree ("column_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ideas_board_idx" ON "ideas" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ideas_user_idx" ON "ideas" USING btree ("user_id");