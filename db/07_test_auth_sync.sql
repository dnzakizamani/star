-- 07_test_auth_sync.sql
-- Verifies the Supabase-only glue: a signup in auth.users must produce a usable
-- profile row with the right role, and the role must be clamped to the allowed set.
-- Supabase only. Run after 06_auth_sync.sql.

\set ON_ERROR_STOP on
set client_min_messages to notice;

do $$
declare
    v_new_user uuid := gen_random_uuid();
    v_bad_role uuid := gen_random_uuid();
    v_no_name  uuid := gen_random_uuid();
    v_profile  profiles%rowtype;
begin
    -- 1. Normal signup with metadata
    insert into auth.users (id, email, raw_user_meta_data)
    values (
        v_new_user,
        'dewi.tutor@example.com',
        jsonb_build_object('role', 'tutor', 'full_name', 'Dewi Anggraini')
    );

    select * into v_profile from profiles where id = v_new_user;

    perform test_assert('signup: profile created automatically', v_profile.id is not null);
    perform test_assert('signup: full_name taken from metadata',
        v_profile.full_name = 'Dewi Anggraini');
    perform test_assert('signup: role taken from metadata', v_profile.role = 'tutor');
    perform test_assert('signup: email mirrored', v_profile.email = 'dewi.tutor@example.com');
    perform test_assert('signup: active by default', v_profile.is_active = true);

    -- 2. Client tries to self-assign admin -> must be clamped to student
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_bad_role, 'attacker@example.com', jsonb_build_object('role', 'admin'));

    select * into v_profile from profiles where id = v_bad_role;
    perform test_assert('signup: client cannot self-assign admin', v_profile.role = 'student');

    -- 3. No metadata at all -> student, name derived from email
    insert into auth.users (id, email)
    values (v_no_name, 'budi.setiawan@example.com');

    select * into v_profile from profiles where id = v_no_name;
    perform test_assert('signup: defaults to student', v_profile.role = 'student');
    perform test_assert('signup: name falls back to email local part',
        v_profile.full_name = 'budi.setiawan');

    -- 4. Email change propagates
    update auth.users set email = 'dewi.baru@example.com' where id = v_new_user;
    perform test_assert('signup: email change synced to profile',
        (select email from profiles where id = v_new_user) = 'dewi.baru@example.com');

    -- 5. Deleting the auth user cascades to the profile
    delete from profiles where id = v_no_name;
    delete from auth.users where id in (v_new_user, v_bad_role, v_no_name);
    perform test_assert('signup: deleting auth user removes profile',
        not exists (select 1 from profiles where id in (v_new_user, v_bad_role, v_no_name)));

    raise notice '----------------------------------------';
    raise notice 'AUTH SYNC TESTS PASSED';
    raise notice '----------------------------------------';
end $$;
