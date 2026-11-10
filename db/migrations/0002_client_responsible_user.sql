-- «Ответственный» (responsible user) on client.
--
-- Expand-only: one nullable column + FK + index. NULL means "the creator"
-- (application reads COALESCE(responsible_user_id, user_id)), so no backfill
-- is needed and the previous application version (which never reads or
-- writes this column) keeps working during the rolling deploy.
--
-- Locks: ADD COLUMN without a default is a catalog-only change (brief ACCESS
-- EXCLUSIVE). The FK validation scans "client", but every value is NULL, so it
-- is fast. CREATE INDEX (non-concurrent, runner owns the transaction) blocks
-- writes to "client" only while it builds over a small table.
--
-- Every name is schema-qualified: 0000_baseline.sql sets search_path to ''
-- for the whole runner session, so on a fresh database an unqualified
-- "client" would not resolve (SQLSTATE 42P01).

ALTER TABLE "public"."client" ADD COLUMN "responsible_user_id" text;

ALTER TABLE "public"."client"
  ADD CONSTRAINT "client_responsible_user_id_user_id_fk"
  FOREIGN KEY ("responsible_user_id") REFERENCES "public"."user"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "client_responsibleUserId_idx"
  ON "public"."client" USING btree ("responsible_user_id");
