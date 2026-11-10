SELECT jsonb_build_object(
 'columns', (SELECT jsonb_agg(x ORDER BY x::text COLLATE "C") FROM (
 SELECT c.relname, a.attname, format_type(a.atttypid,a.atttypmod) AS type,
 a.attnotnull, a.attgenerated, pg_get_expr(d.adbin,d.adrelid) AS expression
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
 ) x),
 'constraints', (SELECT jsonb_agg(x ORDER BY x::text COLLATE "C") FROM (
 SELECT c.relname, k.conname, pg_get_constraintdef(k.oid) AS definition
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') x),
 'indexes', (SELECT jsonb_agg(x ORDER BY x::text COLLATE "C") FROM (
 SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public') x),
 'enums', (SELECT jsonb_agg(x ORDER BY x::text COLLATE "C") FROM (
 SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
 JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') x),
 'functions', (SELECT jsonb_agg(x ORDER BY x::text COLLATE "C") FROM (
 SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('immutable_unaccent','translit_cyr_lat','to_or_tsquery')) x)
) AS catalog;
