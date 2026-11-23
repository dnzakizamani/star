-- 08_seed_passwords.sql
-- Sets a real password on the six demo accounts so the login page works.
--
-- Supabase's auth.users.encrypted_password holds a bcrypt hash. Writing it
-- directly with pgcrypto's crypt() produces exactly the format GoTrue expects,
-- which is why this works without going through the signup endpoint.
--
-- Password for every demo account: Password123!
-- Supabase only. Do not run on plain PostgreSQL.

\set ON_ERROR_STOP on

do $$
declare
    v_hash text;
begin
    -- bcrypt cost 10. PENTING: gen_salt('bf') tanpa argumen memakai cost 6,
    -- dan GoTrue menolak hash dengan cost serendah itu (login gagal dengan
    -- pesan "Database error querying schema" yang menyesatkan).
    v_hash := crypt('Password123!', gen_salt('bf', 10));

    update auth.users
       set encrypted_password    = v_hash,
           email_confirmed_at    = coalesce(email_confirmed_at, now()),
           aud                   = coalesce(aud, 'authenticated'),
           role                  = coalesce(role, 'authenticated'),
           instance_id           = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'),
           confirmation_token    = coalesce(confirmation_token, ''),
           recovery_token        = coalesce(recovery_token, ''),
           email_change_token_new = coalesce(email_change_token_new, ''),
           email_change_token_current = coalesce(email_change_token_current, ''),
           reauthentication_token = coalesce(reauthentication_token, ''),
           updated_at            = now()
     where email in (
        'admin@stargeneration.test',
        'tutor1@stargeneration.test',
        'tutor2@stargeneration.test',
        'student1@stargeneration.test',
        'student2@stargeneration.test',
        'student3@stargeneration.test'
     );

    raise notice 'Passwords set for demo accounts. Login with Password123!';
end $$;

-- Verifikasi: hash harus berformat bcrypt ($2a$/$2b$) dan cocok dengan password.
do $$
declare
    v_email  text;
    v_hash   text;
    v_jumlah integer;
begin
    select count(*) into v_jumlah
    from auth.users
    where encrypted_password like '$2%'
      and email like '%@stargeneration.test';

    if v_jumlah <> 6 then
        raise exception 'FAIL expected 6 bcrypt hashes, found %', v_jumlah;
    end if;

    select email, encrypted_password into v_email, v_hash
    from auth.users where email = 'admin@stargeneration.test';

    if v_hash <> crypt('Password123!', v_hash) then
        raise exception 'FAIL password hash does not verify for %', v_email;
    end if;

    raise notice 'PASS 6 demo accounts have working bcrypt passwords';
    raise notice 'PASS admin hash verifies against Password123!';
end $$;
