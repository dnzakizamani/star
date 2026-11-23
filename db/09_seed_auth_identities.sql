-- 09_seed_auth_identities.sql
-- GoTrue requires one row in auth.identities per user per login provider.
-- Without it, the password grant fails with "Database error querying schema"
-- because GoTrue cannot resolve which identity the credentials belong to.
--
-- Supabase only. Do not run on plain PostgreSQL.

\set ON_ERROR_STOP on

insert into auth.identities (
    id,
    user_id,
    provider_id,
    provider,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
)
select
    gen_random_uuid(),
    u.id,
    u.id::text,
    'email',
    jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
    ),
    now(),
    now(),
    now()
from auth.users u
where u.email like '%@stargeneration.test'
  and not exists (
      select 1
      from auth.identities i
      where i.user_id = u.id
        and i.provider = 'email'
  );

-- Verifikasi: setiap user demo harus punya tepat satu identity email.
do $$
declare
    v_kurang integer;
begin
    select count(*) into v_kurang
    from auth.users u
    where u.email like '%@stargeneration.test'
      and not exists (
          select 1 from auth.identities i
          where i.user_id = u.id and i.provider = 'email'
      );

    if v_kurang > 0 then
        raise exception 'FAIL % demo users still have no email identity', v_kurang;
    end if;

    raise notice 'PASS all demo users have an email identity';
end $$;
