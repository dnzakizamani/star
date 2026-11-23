-- 10_fix_auth_user_metadata.sql
-- GoTrue scans auth.users rows into Go structs with non-nullable fields.
-- A NULL created_at or raw_app_meta_data makes the password grant fail with
-- the unhelpful "Database error querying schema", so these three columns must
-- always hold a value for seeded users.
--
-- Supabase only. Do not run on plain PostgreSQL.

\set ON_ERROR_STOP on

update auth.users
   set created_at         = coalesce(created_at, now()),
       updated_at         = coalesce(updated_at, now()),
       raw_app_meta_data  = coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
       raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
 where email like '%@stargeneration.test';

do $$
declare
    v_buruk integer;
begin
    select count(*) into v_buruk
    from auth.users
    where email like '%@stargeneration.test'
      and (created_at is null
           or raw_app_meta_data is null
           or raw_user_meta_data is null);

    if v_buruk > 0 then
        raise exception 'FAIL % demo users still have NULL auth columns', v_buruk;
    end if;

    raise notice 'PASS auth.users has no NULLs in the columns GoTrue scans';
end $$;
