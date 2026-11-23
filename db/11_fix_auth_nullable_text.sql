-- 11_fix_auth_nullable_text.sql
-- Two more columns GoTrue reads as Go strings (non-nullable), but which are
-- nullable in the auth schema: email_change and phone_change. A NULL there
-- makes every read of auth.users fail, including the password grant, with
-- "Database error querying schema" / "Database error loading user".
--
-- Rule of thumb for seeding auth.users by hand: every text column that GoTrue
-- maps to a plain Go string must be '' rather than NULL.
--
-- Supabase only. Do not run on plain PostgreSQL.

\set ON_ERROR_STOP on

update auth.users
   set email_change = coalesce(email_change, ''),
       phone_change = coalesce(phone_change, '')
 where email like '%@stargeneration.test';

do $$
declare
    v_buruk integer;
begin
    select count(*) into v_buruk
    from auth.users
    where email like '%@stargeneration.test'
      and (email_change is null or phone_change is null);

    if v_buruk > 0 then
        raise exception 'FAIL % demo users still have NULL text columns', v_buruk;
    end if;

    raise notice 'PASS auth.users text columns are all non-NULL';
end $$;
