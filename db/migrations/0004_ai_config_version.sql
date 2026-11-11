-- AI routing configuration in the database (docs/ai/config-in-db-spec.md,
-- stage 2). Replaces the JSON file mounted from ConfigMap crm-ai-config.
--
-- Expand-only: one NEW table, its index, one trigger function + triggers on
-- the new table. Nothing existing is altered. No data: the operator loads the
-- first version with `node tools/ai/run.mjs seed` (docs/ai/config-in-db-spec.md).
-- While the table has no active version, the application keeps reading the
-- JSON file from ConfigMap crm-ai-config (AI_CONFIG_PATH), so AI stays on.
-- The previous application version never reads this table.
--
--   ai_config_version  one row per saved version of the configuration
--                      document (schema version 2; no secrets). Exactly one
--                      row is active.
--
-- Locks: only on the new, empty table; the FK takes a short SHARE ROW
-- EXCLUSIVE lock on "user" (no rows to validate).
--
-- Every name is schema-qualified: 0000_baseline.sql sets search_path to ''
-- for the whole runner session.

CREATE TABLE "public"."ai_config_version" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "public"."ai_config_version_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"config" jsonb NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	"is_active" boolean DEFAULT false NOT NULL
);

ALTER TABLE "public"."ai_config_version" ADD CONSTRAINT "ai_config_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;

-- At most one active version.
CREATE UNIQUE INDEX "ai_config_version_one_active_uidx" ON "public"."ai_config_version" USING btree ("is_active") WHERE "is_active";

-- Versions are history: the document of a saved version never changes (only
-- the is_active flag moves), and the active version cannot be deleted, not
-- even by hand-written SQL. Deleting old inactive versions stays possible.
-- created_by is not guarded: deleting a user sets it to NULL (FK ON DELETE
-- SET NULL), and that must not fail.
CREATE FUNCTION "public"."ai_config_version_guard"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."is_active" THEN
      RAISE EXCEPTION 'ai_config_version: the active version cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."config" IS DISTINCT FROM OLD."config"
     OR NEW."comment" IS DISTINCT FROM OLD."comment"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'ai_config_version: a saved version cannot be changed; save a new version';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER "ai_config_version_guard_delete" BEFORE DELETE ON "public"."ai_config_version"
  FOR EACH ROW EXECUTE FUNCTION "public"."ai_config_version_guard"();
CREATE TRIGGER "ai_config_version_guard_update" BEFORE UPDATE ON "public"."ai_config_version"
  FOR EACH ROW EXECUTE FUNCTION "public"."ai_config_version_guard"();
