-- 99_local_auth_stub.sql
-- LOCAL DEVELOPMENT / TEST ONLY. Never run this against Supabase.
--
-- Supabase provisions the `auth` schema and `auth.uid()` for you. This stub
-- recreates the minimum surface so the schema, triggers and RLS policies can be
-- verified on a plain PostgreSQL instance before they are deployed.
--
-- Usage in a psql session:
--     select set_current_user_id('44444444-4444-4444-4444-444444444444');
--     set role authenticated;   -- makes RLS apply
--     select * from invoices;

create schema if not exists auth;

create table if not exists auth.users (
    id          uuid primary key,
    email       text,
    created_at  timestamptz not null default now()
);

-- Mirrors Supabase: reads the current request's JWT subject from a GUC.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
    select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

create or replace function set_current_user_id(p_id uuid)
returns void
language plpgsql
as $$
begin
    perform set_config('request.jwt.claim.sub', p_id::text, false);
    perform set_config('request.jwt.claim.role', 'authenticated', false);
end;
$$;

-- Roles that RLS policies apply to.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
    end if;
end $$;

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
