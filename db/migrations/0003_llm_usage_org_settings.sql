-- Topics phase 0: LLM usage metering, model prices, per-org settings.
--
-- Expand-only: four NEW tables + one NEW enum. No existing table is altered,
-- so the previous application version (which never reads these tables) keeps
-- working during the rolling deploy. No backfill.
--
--   llm_usage             one row per model call (no prompt / output text)
--   llm_model_price       RUB price per 1k tokens per upstream model
--   organization_settings per-org: topics_mode flag, daily LLM cap override,
--                         system actor user (Q14)
--   platform_setting      platform key/value (e.g. llm.dailyCapRub)
--
-- Locks: CREATE TABLE / CREATE TYPE / CREATE INDEX on new, empty tables. The
-- FKs take a SHARE ROW EXCLUSIVE lock on "user" / "organization" for a moment
-- (no rows to validate). The new enum value set is used as a DEFAULT in the
-- same file; that is allowed because the type is created here (the rule is
-- only for ALTER TYPE ... ADD VALUE).
--
-- Every name is schema-qualified: 0000_baseline.sql sets search_path to ''
-- for the whole runner session.

CREATE TYPE "public"."topics_mode" AS ENUM('off', 'shadow', 'on');

CREATE TABLE "public"."llm_model_price" (
	"id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"input_rub_per_1k" numeric(12, 6) NOT NULL,
	"output_rub_per_1k" numeric(12, 6) NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);

CREATE TABLE "public"."llm_usage" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "public"."llm_usage_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organization_id" text,
	"task" text NOT NULL,
	"model_id" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_rub" numeric(14, 6),
	"latency_ms" integer NOT NULL,
	"ok" boolean NOT NULL,
	"error_class" text,
	"source_item_id" text
);

CREATE TABLE "public"."organization_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"topics_mode" "public"."topics_mode" DEFAULT 'off' NOT NULL,
	"llm_daily_cap_rub" numeric(12, 2),
	"system_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);

CREATE TABLE "public"."platform_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);

ALTER TABLE "public"."llm_model_price" ADD CONSTRAINT "llm_model_price_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "public"."llm_usage" ADD CONSTRAINT "llm_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "public"."organization_settings" ADD CONSTRAINT "organization_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "public"."organization_settings" ADD CONSTRAINT "organization_settings_system_user_id_user_id_fk" FOREIGN KEY ("system_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "public"."organization_settings" ADD CONSTRAINT "organization_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "public"."platform_setting" ADD CONSTRAINT "platform_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

CREATE UNIQUE INDEX "llm_model_price_model_valid_from_uidx" ON "public"."llm_model_price" USING btree ("model","valid_from");
CREATE INDEX "llm_usage_org_created_idx" ON "public"."llm_usage" USING btree ("organization_id","created_at");
CREATE INDEX "llm_usage_created_idx" ON "public"."llm_usage" USING btree ("created_at");
