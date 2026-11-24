-- 01_schema.sql
-- Core schema for Group Class Enrollment & Billing.
-- Design principle: every rule that can be expressed declaratively lives in the
-- database. Application code is the second line of defence, never the only one.

-- ---------------------------------------------------------------------------
-- profiles
-- Mirrors auth.users. Kept as its own table so role + display name are queryable
-- and referenceable by foreign keys (Supabase auth.users is not meant for that).
-- ---------------------------------------------------------------------------
create table profiles (
    id          uuid primary key,
    email       text not null unique,
    full_name   text not null,
    role        text not null check (role in ('admin', 'tutor', 'student')),
    is_active   boolean not null default true,
    created_at  timestamptz not null default now()
);

comment on table profiles is 'Application user. id mirrors Supabase auth.users.id.';

-- ---------------------------------------------------------------------------
-- classes
-- Rate changes apply to future enrollments only: enrollments snapshot the rate.
-- ---------------------------------------------------------------------------
create table classes (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    student_rate  numeric(12, 2) not null check (student_rate > 0),
    tutor_rate    numeric(12, 2) not null check (tutor_rate > 0),
    capacity      integer not null check (capacity > 0),
    tutor_id      uuid not null references profiles (id),
    status        text not null default 'active' check (status in ('active', 'archived')),
    created_at    timestamptz not null default now()
);

comment on column classes.student_rate is 'Price per hour billed to students. Never exposed to tutors.';
comment on column classes.tutor_rate is 'Price per hour paid to the tutor, independent of student count.';

create index classes_tutor_idx on classes (tutor_id);

-- ---------------------------------------------------------------------------
-- enrollments
-- One active enrollment per (class, student). Completed/dropped rows are kept so
-- a student can buy a top-up package later without losing history.
-- ---------------------------------------------------------------------------
create table enrollments (
    id                uuid primary key default gen_random_uuid(),
    class_id          uuid not null references classes (id) on delete cascade,
    student_id        uuid not null references profiles (id),
    package_hours     numeric(6, 2) not null check (package_hours > 0),
    rate_at_purchase  numeric(12, 2) not null check (rate_at_purchase > 0),
    status            text not null default 'active'
                      check (status in ('pending', 'active', 'completed', 'dropped')),
    created_at        timestamptz not null default now()
);

comment on column enrollments.status is
    'pending = student self-enrolled and has not paid. Flips to active when the invoice is paid.';
comment on column enrollments.rate_at_purchase is
    'Student rate locked at purchase time. Later class rate changes never rewrite this.';

create unique index enrollments_one_per_student
    on enrollments (class_id, student_id)
    where status in ('pending', 'active');

create index enrollments_class_idx on enrollments (class_id);
create index enrollments_student_idx on enrollments (student_id);

-- ---------------------------------------------------------------------------
-- invoices
-- Created automatically by trigger when an enrollment is inserted.
-- Payment is simulated: an admin flips the status.
-- ---------------------------------------------------------------------------
create sequence invoice_number_seq;

create table invoices (
    id             uuid primary key default gen_random_uuid(),
    enrollment_id  uuid not null unique references enrollments (id) on delete cascade,
    invoice_number text not null unique,
    amount         numeric(12, 2) not null check (amount >= 0),
    status         text not null default 'unpaid' check (status in ('unpaid', 'paid', 'void')),
    paid_at        timestamptz,
    paid_by        uuid references profiles (id),
    created_at     timestamptz not null default now(),
    constraint invoices_paid_consistency check (
        (status = 'paid' and paid_at is not null and paid_by is not null)
        or (status <> 'paid')
    )
);

comment on constraint invoices_paid_consistency on invoices is
    'A paid invoice must record when and by whom it was marked paid.';

create index invoices_status_idx on invoices (status);

-- ---------------------------------------------------------------------------
-- lessons
-- tutor_id is a deliberate snapshot of the class tutor at scheduling time.
-- That makes the no-overlap EXCLUDE constraint possible (it needs the column
-- locally) and makes tutor reassignment affect only lessons not yet taught.
-- ---------------------------------------------------------------------------
create table lessons (
    id          uuid primary key default gen_random_uuid(),
    class_id    uuid not null references classes (id) on delete cascade,
    tutor_id    uuid not null references profiles (id),
    starts_at   timestamptz not null,
    ends_at     timestamptz not null,
    status      text not null default 'scheduled'
                check (status in ('scheduled', 'completed', 'cancelled')),
    created_at  timestamptz not null default now(),
    constraint lessons_time_order check (ends_at > starts_at),
    constraint lessons_max_duration check (ends_at <= starts_at + interval '8 hours')
);

comment on column lessons.tutor_id is
    'Snapshot of the tutor teaching this lesson. Drives the no-overlap constraint.';

create index lessons_class_idx on lessons (class_id, starts_at desc);
create index lessons_tutor_idx on lessons (tutor_id, starts_at desc);

-- A tutor cannot be in two places at once. Cancelled lessons leave the timeline.
alter table lessons
    add constraint lessons_no_tutor_overlap
    exclude using gist (
        tutor_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status <> 'cancelled');

-- ---------------------------------------------------------------------------
-- logbooks
-- Exactly one per (class, month). Lifecycle: draft -> submitted -> approved,
-- with submitted -> returned -> submitted as the correction loop.
-- ---------------------------------------------------------------------------
create table logbooks (
    id            uuid primary key default gen_random_uuid(),
    class_id      uuid not null references classes (id) on delete cascade,
    period_year   integer not null check (period_year between 2000 and 2100),
    period_month  integer not null check (period_month between 1 and 12),
    status        text not null default 'draft'
                  check (status in ('draft', 'submitted', 'returned', 'approved')),
    admin_note    text,
    submitted_at  timestamptz,
    approved_at   timestamptz,
    approved_by   uuid references profiles (id),
    created_at    timestamptz not null default now(),
    unique (class_id, period_year, period_month),
    constraint logbooks_returned_needs_note
        check (status <> 'returned' or admin_note is not null),
    constraint logbooks_approved_consistency
        check (status <> 'approved' or (approved_at is not null and approved_by is not null))
);

create index logbooks_status_idx on logbooks (status);

-- ---------------------------------------------------------------------------
-- logbook_entries
-- One entry per lesson, enforced by UNIQUE(lesson_id).
-- ---------------------------------------------------------------------------
create table logbook_entries (
    id                  uuid primary key default gen_random_uuid(),
    logbook_id          uuid not null references logbooks (id) on delete cascade,
    lesson_id           uuid not null unique references lessons (id),
    topic               text not null,
    activities          text not null,
    tutor_observation   text not null,
    next_recommendation text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz
);

create index logbook_entries_logbook_idx on logbook_entries (logbook_id);

-- ---------------------------------------------------------------------------
-- earnings_ledger
-- Source of truth for tutor pay. UNIQUE(lesson_id) makes "approving twice adds
-- earnings" structurally impossible instead of defended by application logic.
-- amount is generated, so hours and rate can never disagree with the payout.
-- ---------------------------------------------------------------------------
create table earnings_ledger (
    id          uuid primary key default gen_random_uuid(),
    lesson_id   uuid not null unique references lessons (id),
    logbook_id  uuid not null references logbooks (id) on delete cascade,
    tutor_id    uuid not null references profiles (id),
    hours       numeric(6, 4) not null check (hours > 0),
    tutor_rate  numeric(12, 2) not null check (tutor_rate > 0),
    amount      numeric(12, 2) generated always as (round(hours * tutor_rate, 2)) stored,
    created_at  timestamptz not null default now()
);

create index earnings_ledger_tutor_idx on earnings_ledger (tutor_id);

-- ---------------------------------------------------------------------------
-- Helper: lesson duration in hours
-- ---------------------------------------------------------------------------
create or replace function fn_lesson_hours(p_starts_at timestamptz, p_ends_at timestamptz)
returns numeric
language sql
immutable
as $$
    select round(extract(epoch from (p_ends_at - p_starts_at)) / 3600.0, 4);
$$;

-- ---------------------------------------------------------------------------
-- ===========================================================================
-- View: remaining package hours per enrollment
-- Hours are consumed by completed lessons that made it into a logbook, so an
-- unlogged lesson never silently eats a student's package. Only paid enrollments
-- count at all: an unpaid student never had access, so nothing is consumed.
-- security_invoker: RLS pemanggil berlaku, jadi siswa tidak bisa membaca
-- balance enrollment orang lain lewat view ini.
-- ---------------------------------------------------------------------------
drop view if exists v_enrollment_balance, v_class_finance, v_logbook_summary;
create view v_enrollment_balance
with (security_invoker = true) as
select
    e.id                                             as enrollment_id,
    e.class_id,
    e.student_id,
    e.status                                         as enrollment_status,
    e.package_hours,
    e.rate_at_purchase,
    coalesce(u.hours_used, 0)                        as hours_used,
    e.package_hours - coalesce(u.hours_used, 0)      as hours_remaining
from enrollments e
left join (
    select
        en.id                                              as enrollment_id,
        sum(fn_lesson_hours(l.starts_at, l.ends_at))        as hours_used
    from enrollments en
    join invoices i
        on i.enrollment_id = en.id
       and i.status = 'paid'
    join lessons l
        on l.class_id = en.class_id
       and l.status = 'completed'
    join logbook_entries le
        on le.lesson_id = l.id
    group by en.id
) u on u.enrollment_id = e.id;

-- ---------------------------------------------------------------------------
-- View: class economics
-- Revenue counts paid invoices only. Tutor cost counts approved ledger rows only.
-- security_invoker + filter kolom: siswa/tutor tidak boleh membaca margin
-- bisnis lewat view ini; angka uang hanya untuk admin.
-- ---------------------------------------------------------------------------
create view v_class_finance
with (security_invoker = true) as
select
    c.id                                              as class_id,
    c.name,
    c.capacity,
    c.student_rate,
    c.tutor_rate,
    (select count(*) from enrollments e
      where e.class_id = c.id and e.status = 'active') as active_students,
    case when auth_is_admin() then coalesce(rev.amount, 0) end as revenue_paid,
    case when auth_is_admin() then coalesce(cost.amount, 0) end as tutor_cost_approved,
    case when auth_is_admin() then
        coalesce(rev.amount, 0) - coalesce(cost.amount, 0)
    end as margin
from classes c
left join (
    select e.class_id, sum(i.amount) as amount
    from invoices i
    join enrollments e on e.id = i.enrollment_id
    where i.status = 'paid'
    group by e.class_id
) rev on rev.class_id = c.id
left join (
    select l.class_id, sum(el.amount) as amount
    from earnings_ledger el
    join lessons l on l.id = el.lesson_id
    group by l.class_id
) cost on cost.class_id = c.id;

-- ---------------------------------------------------------------------------
-- View: logbook with entry count and projected payout (preview before approve)
-- security_invoker: tutor hanya melihat logbook kelasnya (RLS logbooks), siswa
-- hanya yang approved + lunas. Angka payout difilter peran via helper.
-- ---------------------------------------------------------------------------
create view v_logbook_summary
with (security_invoker = true) as
select
    lb.id                        as logbook_id,
    lb.class_id,
    lb.period_year,
    lb.period_month,
    lb.status,
    c.name                       as class_name,
    c.tutor_id,
    c.tutor_rate,
    count(le.id)                 as entry_count,
    coalesce(sum(fn_lesson_hours(l.starts_at, l.ends_at)), 0) as total_hours,
    case when auth_is_admin() or auth_tutor_teaches(lb.class_id) then
        coalesce(sum(round(fn_lesson_hours(l.starts_at, l.ends_at) * c.tutor_rate, 2)), 0)
    end as projected_payout,
    coalesce((
        select sum(el.amount) from earnings_ledger el where el.logbook_id = lb.id
    ), 0)                        as ledgered_payout
from logbooks lb
join classes c on c.id = lb.class_id
left join logbook_entries le on le.logbook_id = lb.id
left join lessons l on l.id = le.lesson_id
group by lb.id, lb.class_id, lb.period_year, lb.period_month, lb.status,
         c.name, c.tutor_id, c.tutor_rate;
