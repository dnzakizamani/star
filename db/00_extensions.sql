-- 00_extensions.sql
-- Extensions required before the schema is created.
-- btree_gist : GiST operator classes for uuid/equality, needed by the
--              tutor no-overlap EXCLUDE constraint on lessons.
-- pgcrypto   : gen_random_uuid() for primary keys.
--
-- Supabase ships pgcrypto already and keeps extensions in a dedicated
-- `extensions` schema. On a plain PostgreSQL the schema does not exist, so it is
-- created here and used only when present.

do $$
begin
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
        execute 'create extension if not exists btree_gist with schema extensions';
        execute 'create extension if not exists pgcrypto with schema extensions';
    else
        execute 'create extension if not exists btree_gist';
        execute 'create extension if not exists pgcrypto';
    end if;
end $$;

-- Supabase puts extensions on the search_path of its roles already. Repeating it
-- is harmless locally and keeps gen_random_uuid() resolvable in column defaults.
alter database postgres set search_path to "$user", public, extensions;
