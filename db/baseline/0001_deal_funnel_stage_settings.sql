-- Manual migration after 0000_baseline.sql.
-- Adds the columns required by the merged deal-stage settings UI.
-- Existing stages keep their names, remain visible and are not pre-pipeline.
-- No rows, search objects or existing constraints are removed or recreated.
--
-- Run against the intended database with psql -v ON_ERROR_STOP=1 -f <file>.
-- IF NOT EXISTS allows a repeat run; it does not repair an existing column
-- whose type, nullability or default differs from the definitions below.

BEGIN;

-- Fail promptly instead of waiting indefinitely for the ALTER TABLE lock.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.deal_funnel_stage
    ADD COLUMN IF NOT EXISTS is_pre_pipeline boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS display_name text,
    ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

COMMIT;
