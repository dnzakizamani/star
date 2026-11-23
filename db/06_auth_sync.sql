-- 06_auth_sync.sql
-- Supabase-specific glue. NOT run on plain PostgreSQL.
--
-- GoTrue owns auth.users. Everything else in this schema keys off profiles, so a
-- signup must produce a profile row in the same transaction, otherwise the user
-- authenticates successfully and then cannot read a single row because every RLS
-- policy resolves auth_role() to null.
--
-- Role comes from the signup metadata: {"role": "tutor", "full_name": "..."}.
-- It is clamped to the allowed values and defaults to student, so a client cannot
-- self-assign admin by posting role=admin.

-- ---------------------------------------------------------------------------
-- Referential integrity: a profile cannot outlive its auth user.
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'profiles_id_fkey'
    ) then
        alter table profiles
            add constraint profiles_id_fkey
            foreign key (id) references auth.users (id) on delete cascade;
    end if;
end $$;

-- ---------------------------------------------------------------------------
-- Signup -> profile
-- ---------------------------------------------------------------------------
create or replace function fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role      text;
    v_full_name text;
begin
    v_role := coalesce(new.raw_user_meta_data ->> 'role', 'student');

    -- Signup may only ever choose between tutor and student. 'admin' is
    -- deliberately excluded: if it were in this list, any client could POST
    -- {"role":"admin"} to the signup endpoint and grant itself the admin role,
    -- which bypasses every RLS policy that trusts profiles.role.
    -- Admins are provisioned out-of-band (seed script or manual SQL).
    if v_role not in ('tutor', 'student') then
        v_role := 'student';
    end if;

    v_full_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
    if v_full_name is null then
        v_full_name := split_part(new.email, '@', 1);
    end if;

    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, v_full_name, v_role)
    on conflict (id) do nothing;

    return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;

create trigger trg_handle_new_user
after insert on auth.users
for each row execute function fn_handle_new_user();

-- ---------------------------------------------------------------------------
-- Keep the mirrored email in sync if the address changes in GoTrue.
-- ---------------------------------------------------------------------------
create or replace function fn_handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.email is distinct from old.email then
        update public.profiles set email = new.email where id = new.id;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_handle_user_email_change on auth.users;

create trigger trg_handle_user_email_change
after update of email on auth.users
for each row execute function fn_handle_user_email_change();
