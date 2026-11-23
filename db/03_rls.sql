-- 03_rls.sql
-- Row Level Security for Supabase. This is where "students see only paid classes"
-- and "logbooks stay hidden until approved" are enforced for the API too, because
-- PostgREST runs every request through these policies.
--
-- Helper functions are SECURITY DEFINER so they can read profiles without
-- recursing into the profiles policy itself.

create or replace function auth_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role from profiles where id = auth.uid();
$$;

create or replace function auth_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select role = 'admin' from profiles where id = auth.uid()), false);
$$;

create or replace function auth_is_tutor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select role = 'tutor' from profiles where id = auth.uid()), false);
$$;

create or replace function auth_is_student()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((select role = 'student' from profiles where id = auth.uid()), false);
$$;

-- A student has access to a class only through a paid invoice on an active enrollment.
create or replace function auth_student_has_paid(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from enrollments e
        join invoices i on i.enrollment_id = e.id
        where e.class_id = p_class_id
          and e.student_id = auth.uid()
          and e.status = 'active'
          and i.status = 'paid'
    );
$$;

create or replace function auth_tutor_teaches(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from classes c
        where c.id = p_class_id and c.tutor_id = auth.uid()
    );
$$;

-- ===========================================================================
-- profiles
-- ===========================================================================
alter table profiles enable row level security;

create policy profiles_select_self_or_admin on profiles
    for select using (id = auth.uid() or auth_is_admin());

-- Tutors need to see the names of students in their own classes so their
-- logbook and schedule screens are usable, nothing else.
create policy profiles_select_students_in_my_classes on profiles
    for select using (
        auth_is_tutor()
        and role = 'student'
        and exists (
            select 1
            from enrollments e
            join classes c on c.id = e.class_id
            where e.student_id = profiles.id
              and c.tutor_id = auth.uid()
        )
    );

create policy profiles_update_self on profiles
    for update using (id = auth.uid())
    with check (id = auth.uid() and role = (select role from profiles p where p.id = auth.uid()));

-- ===========================================================================
-- classes
-- Tutors and paying students both need the class row, but the student_rate
-- column is masked by the view layer (see v_classes_safe) for tutors.
-- ===========================================================================
alter table classes enable row level security;

create policy classes_select_admin on classes
    for select using (auth_is_admin());

create policy classes_select_tutor on classes
    for select using (auth_tutor_teaches(id) or auth_is_tutor());

create policy classes_select_paid_student on classes
    for select using (auth_student_has_paid(id));

create policy classes_write_admin on classes
    for all using (auth_is_admin()) with check (auth_is_admin());

-- Safe projection for tutors: never reveals student_rate.
create or replace view v_classes_safe
with (security_invoker = true) as
select
    c.id,
    c.name,
    c.tutor_rate,
    c.capacity,
    c.tutor_id,
    c.status,
    c.created_at,
    case when auth_is_admin() or auth_student_has_paid(c.id) then c.student_rate end
        as student_rate
from classes c;

-- ===========================================================================
-- enrollments
-- ===========================================================================
alter table enrollments enable row level security;

create policy enrollments_select_admin on enrollments
    for select using (auth_is_admin());

create policy enrollments_select_own on enrollments
    for select using (student_id = auth.uid());

create policy enrollments_select_tutor on enrollments
    for select using (
        auth_is_tutor()
        and exists (
            select 1 from classes c
            where c.id = enrollments.class_id and c.tutor_id = auth.uid()
        )
    );

create policy enrollments_insert_own on enrollments
    for insert with check (student_id = auth.uid() or auth_is_admin());

create policy enrollments_write_admin on enrollments
    for update using (auth_is_admin()) with check (auth_is_admin());

-- ===========================================================================
-- invoices
-- ===========================================================================
alter table invoices enable row level security;

create policy invoices_select_admin on invoices
    for select using (auth_is_admin());

create policy invoices_select_own on invoices
    for select using (
        exists (
            select 1 from enrollments e
            where e.id = invoices.enrollment_id and e.student_id = auth.uid()
        )
    );

-- Only the admin simulates payment.
create policy invoices_update_admin on invoices
    for update using (auth_is_admin()) with check (auth_is_admin());

-- ===========================================================================
-- lessons
-- ===========================================================================
alter table lessons enable row level security;

create policy lessons_select_admin on lessons
    for select using (auth_is_admin());

create policy lessons_select_tutor on lessons
    for select using (tutor_id = auth.uid());

create policy lessons_select_paid_student on lessons
    for select using (
        auth_is_student()
        and status <> 'cancelled'
        and auth_student_has_paid(class_id)
    );

create policy lessons_write_admin on lessons
    for all using (auth_is_admin()) with check (auth_is_admin());

create policy lessons_write_tutor on lessons
    for all
    using (tutor_id = auth.uid() and auth_tutor_teaches(class_id))
    with check (tutor_id = auth.uid() and auth_tutor_teaches(class_id));

-- ===========================================================================
-- logbooks
-- Hidden from students until approved. Hidden from tutors of other classes.
-- ===========================================================================
alter table logbooks enable row level security;

create policy logbooks_select_admin on logbooks
    for select using (auth_is_admin());

create policy logbooks_select_tutor on logbooks
    for select using (auth_tutor_teaches(class_id));

create policy logbooks_select_student_approved on logbooks
    for select using (
        status = 'approved'
        and auth_student_has_paid(class_id)
    );

create policy logbooks_insert_tutor on logbooks
    for insert with check (auth_tutor_teaches(class_id));

create policy logbooks_update_tutor on logbooks
    for update
    using (auth_tutor_teaches(class_id) and status in ('draft', 'returned'))
    with check (auth_tutor_teaches(class_id) and status in ('submitted', 'draft'));

create policy logbooks_update_admin on logbooks
    for update using (auth_is_admin()) with check (auth_is_admin());

-- ===========================================================================
-- logbook_entries
-- ===========================================================================
alter table logbook_entries enable row level security;

create policy logbook_entries_select_admin on logbook_entries
    for select using (auth_is_admin());

create policy logbook_entries_select_tutor on logbook_entries
    for select using (
        exists (
            select 1 from logbooks lb
            join classes c on c.id = lb.class_id
            where lb.id = logbook_entries.logbook_id and c.tutor_id = auth.uid()
        )
    );

create policy logbook_entries_select_student_approved on logbook_entries
    for select using (
        exists (
            select 1 from logbooks lb
            where lb.id = logbook_entries.logbook_id
              and lb.status = 'approved'
              and auth_student_has_paid(lb.class_id)
        )
    );

create policy logbook_entries_write_tutor on logbook_entries
    for all
    using (
        exists (
            select 1 from logbooks lb
            join classes c on c.id = lb.class_id
            where lb.id = logbook_entries.logbook_id
              and c.tutor_id = auth.uid()
              and lb.status in ('draft', 'returned')
        )
    )
    with check (
        exists (
            select 1 from logbooks lb
            join classes c on c.id = lb.class_id
            where lb.id = logbook_entries.logbook_id
              and c.tutor_id = auth.uid()
              and lb.status in ('draft', 'returned')
        )
    );

-- ===========================================================================
-- earnings_ledger
-- Admin sees everything. A tutor sees only their own rows. Nobody else.
-- ===========================================================================
alter table earnings_ledger enable row level security;

create policy earnings_ledger_select_admin on earnings_ledger
    for select using (auth_is_admin());

create policy earnings_ledger_select_own on earnings_ledger
    for select using (tutor_id = auth.uid());

-- ===========================================================================
-- Grants
-- RLS decides which rows a role may see. Grants decide whether the role may
-- touch the object at all. Views need their own grant: they are not covered by
-- "all tables in schema public" on older PostgreSQL versions, and Supabase
-- roles only receive what is granted explicitly.
-- ===========================================================================
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant select on v_classes_safe, v_enrollment_balance, v_class_finance, v_logbook_summary
    to authenticated;
