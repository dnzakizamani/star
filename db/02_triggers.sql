-- 02_triggers.sql
-- Every rule that cannot be expressed as a single-table constraint lives here.
-- All of them raise exceptions, so the application cannot bypass them by calling
-- the REST API directly.

-- ===========================================================================
-- 1. Enrollment capacity
-- The class row is locked before counting, otherwise two concurrent enrollments
-- could both read 1 free slot and both succeed.
-- ===========================================================================
-- SECURITY DEFINER wajib: trigger berjalan dengan hak pemanggil, dan siswa
-- yang belum membayar justru TIDAK punya policy SELECT di classes. Tanpa
-- definer, select di bawah selalu kosong untuk mereka dan insert pending
-- ditolak dengan "Class does not exist" padahal kelasnya ada.
create or replace function fn_enrollments_check_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_capacity integer;
    v_active   integer;
    v_status   text;
begin
    if new.status <> 'active' then
        return new;
    end if;

    select capacity, status into v_capacity, v_status
    from classes
    where id = new.class_id
    for update;

    if not found then
        raise exception 'Class % does not exist', new.class_id
            using errcode = 'foreign_key_violation';
    end if;

    if v_status <> 'active' then
        raise exception 'Class is archived and accepts no new enrollments'
            using errcode = 'check_violation';
    end if;

    -- Kursi terpakai = pending + active. Pendaftaran yang menunggu pembayaran
    -- tetap mengunci kursi, kalau tidak dua siswa bisa memperebutkan slot yang
    -- sama dan keduanya lolos.
    select count(*) into v_active
    from enrollments
    where class_id = new.class_id
      and status in ('pending', 'active')
      and id is distinct from new.id;

    if v_active >= v_capacity then
        raise exception 'Class is full: capacity %, active enrollments %', v_capacity, v_active
            using errcode = 'check_violation';
    end if;

    return new;
end;
$$;

create trigger trg_enrollments_check_capacity
before insert or update of status, class_id on enrollments
for each row execute function fn_enrollments_check_capacity();

-- ===========================================================================
-- 1b. Student-created enrollments are pending until the admin confirms payment
-- The enrollment row is the source of truth: active only after its invoice is
-- paid. Admin-created enrollments keep the old behaviour (active at once).
-- ===========================================================================
create or replace function fn_enrollments_default_pending_for_students()
returns trigger
language plpgsql
as $$
begin
    -- auth.uid() null = sesi server (seed, psql, migrasi): tidak disentuh.
    -- Siswa lewat API: wajib pending.
    if new.status = 'active' and auth.uid() is not null
       and auth_is_student() and new.student_id = auth.uid() then
        raise exception
            'Student enrollment must start as pending until the invoice is paid'
            using errcode = 'check_violation';
    end if;

    return new;
end;
$$;

create trigger trg_enrollments_student_pending
before insert on enrollments
for each row execute function fn_enrollments_default_pending_for_students();

-- ===========================================================================
-- 1c. Paying the invoice activates the pending enrollment (admin = approver)
-- ===========================================================================
create or replace function fn_invoices_activate_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status = 'paid' and old.status is distinct from 'paid' then
        update enrollments
           set status = 'active'
         where id = new.enrollment_id
           and status = 'pending';

        if not found then
            -- Sudah active (top-up) atau void: tidak ada yang perlu diaktifkan.
            -- Bukan error, supaya alur tandai-lunas tetap mulus.
            raise notice 'No pending enrollment for invoice %, nothing to activate', new.id;
        end if;
    end if;
    return new;
end;
$$;

create trigger trg_invoices_activate_enrollment
after update of status on invoices
for each row execute function fn_invoices_activate_enrollment();

-- ===========================================================================
-- 2. Invoice auto-creation
-- Amount is derived from the locked rate, never passed in by the client.
-- ===========================================================================
-- SECURITY DEFINER wajib: trigger ini menyisipkan invoice turunan saat admin
-- mendaftarkan siswa lewat API. Tanpa definer, insert invoice berjalan dengan
-- hak admin yang tidak punya policy INSERT di invoices (siswa penerima tagihan
-- memang tidak boleh membuat invoice), dan enrollment gagal 403.
create or replace function fn_enrollments_create_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_number text;
begin
    v_number := 'INV-' || to_char(now() at time zone 'Asia/Jakarta', 'YYYYMM')
                || '-' || lpad(nextval('invoice_number_seq')::text, 4, '0');

    insert into invoices (enrollment_id, invoice_number, amount)
    values (new.id, v_number, round(new.package_hours * new.rate_at_purchase, 2));

    return new;
end;
$$;

create trigger trg_enrollments_create_invoice
after insert on enrollments
for each row execute function fn_enrollments_create_invoice();

-- ===========================================================================
-- 3. Logbook lifecycle
-- draft / returned  -> editable
-- submitted         -> locked for the tutor, waiting for the admin
-- approved          -> locked forever
-- ===========================================================================
create or replace function fn_logbooks_guard_transition()
returns trigger
language plpgsql
as $$
declare
    v_entries integer;
begin
    if tg_op = 'UPDATE' then
        if old.status = 'approved' then
            raise exception 'Approved logbook is read-only and cannot change status'
                using errcode = 'check_violation';
        end if;

        if new.status = 'submitted' and old.status not in ('draft', 'returned') then
            raise exception 'Only a draft or returned logbook can be submitted'
                using errcode = 'check_violation';
        end if;

        if new.status = 'approved' and old.status <> 'submitted' then
            raise exception 'Only a submitted logbook can be approved'
                using errcode = 'check_violation';
        end if;

        if new.status = 'returned' and old.status <> 'submitted' then
            raise exception 'Only a submitted logbook can be returned'
                using errcode = 'check_violation';
        end if;
    end if;

    if new.status in ('submitted', 'approved') then
        select count(*) into v_entries from logbook_entries where logbook_id = new.id;
        if v_entries = 0 then
            raise exception 'Logbook needs at least one entry before it can be %', new.status
                using errcode = 'check_violation';
        end if;
    end if;

    if new.status = 'submitted' then
        new.submitted_at := now();
        new.admin_note := null;
    end if;

    if new.status = 'approved' then
        new.approved_at := now();
        -- approved_by is required by the logbooks_approved_consistency CHECK
        -- constraint. Without this line every approval fails with 23514.
        --
        -- coalesce, not a bare assignment: auth.uid() is NULL outside a JWT
        -- context (psql, seed scripts, tests). A bare assignment would then
        -- clobber the value the caller passed and break the check constraint.
        -- In API traffic auth.uid() is always set, so it still wins over
        -- anything the client claims.
        new.approved_by := coalesce(auth.uid(), new.approved_by);
    end if;

    return new;
end;
$$;

create trigger trg_logbooks_guard_transition
before update on logbooks
for each row execute function fn_logbooks_guard_transition();

-- ===========================================================================
-- 4. Approved logbook immutability (header row)
-- ===========================================================================
create or replace function fn_logbooks_block_mutation()
returns trigger
language plpgsql
as $$
begin
    if old.status = 'approved' then
        raise exception 'Approved logbook % is immutable', old.id
            using errcode = 'check_violation';
    end if;
    return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger trg_logbooks_block_update
before update on logbooks
for each row execute function fn_logbooks_block_mutation();

create trigger trg_logbooks_block_delete
before delete on logbooks
for each row execute function fn_logbooks_block_mutation();

-- ===========================================================================
-- 5. Logbook entry guards
-- An entry may only reference a completed lesson of the same class, inside the
-- logbook period (WIB), while the logbook is still editable, and only when every
-- paid student still has enough hours left to cover that lesson.
-- ===========================================================================
create or replace function fn_logbook_entries_guard()
returns trigger
language plpgsql
as $$
declare
    v_logbook      logbooks%rowtype;
    v_lesson       lessons%rowtype;
    v_lesson_hours numeric;
    v_period_start timestamptz;
    v_period_end   timestamptz;
    v_short        record;
begin
    select * into v_logbook from logbooks where id = new.logbook_id;
    if not found then
        raise exception 'Logbook % does not exist', new.logbook_id;
    end if;

    if v_logbook.status not in ('draft', 'returned') then
        raise exception 'Logbook is % and no longer accepts entries', v_logbook.status
            using errcode = 'check_violation';
    end if;

    select * into v_lesson from lessons where id = new.lesson_id;
    if not found then
        raise exception 'Lesson % does not exist', new.lesson_id;
    end if;

    if v_lesson.class_id <> v_logbook.class_id then
        raise exception 'Lesson belongs to another class'
            using errcode = 'check_violation';
    end if;

    if v_lesson.status <> 'completed' then
        raise exception 'Only a completed lesson can be logged (lesson is %)', v_lesson.status
            using errcode = 'check_violation';
    end if;

    v_period_start := make_timestamptz(v_logbook.period_year, v_logbook.period_month, 1, 0, 0, 0, 'Asia/Jakarta');
    v_period_end   := v_period_start + interval '1 month';

    if v_lesson.starts_at < v_period_start or v_lesson.starts_at >= v_period_end then
        raise exception 'Lesson on % is outside the logbook period %-%',
            to_char(v_lesson.starts_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD'),
            v_logbook.period_year, v_logbook.period_month
            using errcode = 'check_violation';
    end if;

    v_lesson_hours := fn_lesson_hours(v_lesson.starts_at, v_lesson.ends_at);

    -- Every paid, active student must be able to cover this lesson.
    -- Balance counts lessons already logged, so this lesson is not yet counted.
    select p.full_name, b.hours_remaining
      into v_short
    from enrollments e
    join invoices i on i.enrollment_id = e.id and i.status = 'paid'
    join v_enrollment_balance b on b.enrollment_id = e.id
    join profiles p on p.id = e.student_id
    where e.class_id = v_logbook.class_id
      and e.status = 'active'
      and b.hours_remaining < v_lesson_hours
    limit 1;

    if found then
        raise exception 'Student % only has % hours left, lesson needs %',
            v_short.full_name, v_short.hours_remaining, v_lesson_hours
            using errcode = 'check_violation';
    end if;

    if tg_op = 'UPDATE' then
        new.updated_at := now();
    end if;

    return new;
end;
$$;

create trigger trg_logbook_entries_guard
before insert or update on logbook_entries
for each row execute function fn_logbook_entries_guard();

-- Entries of an approved logbook can never be edited or removed.
create or replace function fn_logbook_entries_block_mutation()
returns trigger
language plpgsql
as $$
declare
    v_status text;
begin
    select status into v_status from logbooks where id = old.logbook_id;
    if v_status in ('submitted', 'approved') then
        raise exception 'Logbook is % and its entries are locked', v_status
            using errcode = 'check_violation';
    end if;
    return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger trg_logbook_entries_block_update
before update on logbook_entries
for each row execute function fn_logbook_entries_block_mutation();

create trigger trg_logbook_entries_block_delete
before delete on logbook_entries
for each row execute function fn_logbook_entries_block_mutation();

-- ===========================================================================
-- 6. Earnings generation on approval
-- Idempotent by construction: ON CONFLICT (lesson_id) DO NOTHING plus the
-- unique index means re-approving can never duplicate a payout.
-- ===========================================================================
-- SECURITY DEFINER is required, not optional: this trigger inserts into
-- earnings_ledger on behalf of the admin who approved the logbook. With RLS
-- enabled on earnings_ledger and no INSERT policy for admins, the insert is
-- rejected (42501) and the approval fails. Running as the function owner makes
-- the ledger writable only through this controlled path.
create or replace function fn_logbooks_generate_earnings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.status = 'approved' and old.status is distinct from 'approved' then
        insert into earnings_ledger (lesson_id, logbook_id, tutor_id, hours, tutor_rate)
        select
            l.id,
            new.id,
            l.tutor_id,
            fn_lesson_hours(l.starts_at, l.ends_at),
            c.tutor_rate
        from logbook_entries le
        join lessons l on l.id = le.lesson_id
        join classes c on c.id = l.class_id
        where le.logbook_id = new.id
          and l.status = 'completed'
        on conflict (lesson_id) do nothing;
    end if;
    return new;
end;
$$;

create trigger trg_logbooks_generate_earnings
after update on logbooks
for each row execute function fn_logbooks_generate_earnings();

-- ===========================================================================
-- 7. Lessons: auto-open the month's logbook when a lesson is completed
-- ===========================================================================
create or replace function fn_lessons_open_logbook()
returns trigger
language plpgsql
as $$
declare
    v_year  integer;
    v_month integer;
begin
    if new.status = 'completed' and old.status is distinct from 'completed' then
        v_year  := extract(year  from new.starts_at at time zone 'Asia/Jakarta');
        v_month := extract(month from new.starts_at at time zone 'Asia/Jakarta');

        insert into logbooks (class_id, period_year, period_month)
        values (new.class_id, v_year, v_month)
        on conflict (class_id, period_year, period_month) do nothing;
    end if;
    return new;
end;
$$;

create trigger trg_lessons_open_logbook
after update of status on lessons
for each row execute function fn_lessons_open_logbook();

-- A cancelled lesson must not keep a logbook entry.
create or replace function fn_lessons_block_cancel_logged()
returns trigger
language plpgsql
as $$
begin
    if new.status = 'cancelled' and exists (
        select 1 from logbook_entries where lesson_id = new.id
    ) then
        raise exception 'Lesson % already has a logbook entry and cannot be cancelled', new.id
            using errcode = 'check_violation';
    end if;
    return new;
end;
$$;

create trigger trg_lessons_block_cancel_logged
before update of status on lessons
for each row execute function fn_lessons_block_cancel_logged();

-- ===========================================================================
-- 8. Invoices: paid invoices are final except for the void path
-- ===========================================================================
create or replace function fn_invoices_guard()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'UPDATE' then
        if old.status = 'void' then
            raise exception 'Void invoice cannot be modified'
                using errcode = 'check_violation';
        end if;

        if old.status = 'paid' and new.status = 'unpaid' then
            -- Undo is only allowed while no hours have been consumed yet.
            if exists (
                select 1
                from enrollments e
                join v_enrollment_balance b on b.enrollment_id = e.id
                where e.id = old.enrollment_id
                  and b.hours_used > 0
            ) then
                raise exception 'Cannot revert a paid invoice after lessons were logged'
                    using errcode = 'check_violation';
            end if;
        end if;

        if new.status = 'paid' and old.status <> 'paid' then
            new.paid_at := now();
        end if;

        if new.status <> 'paid' then
            new.paid_at := null;
            new.paid_by := null;
        end if;
    end if;

    if tg_op = 'DELETE' and old.status = 'paid' then
        raise exception 'Paid invoice cannot be deleted, void it instead'
            using errcode = 'check_violation';
    end if;

    return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger trg_invoices_guard
before update or delete on invoices
for each row execute function fn_invoices_guard();

-- ===========================================================================
-- 9. Convenience: get or create a logbook for a class and month
-- ===========================================================================
create or replace function fn_get_or_create_logbook(p_class_id uuid, p_year integer, p_month integer)
returns logbooks
language plpgsql
as $$
declare
    v_logbook logbooks;
begin
    select * into v_logbook from logbooks
    where class_id = p_class_id and period_year = p_year and period_month = p_month;

    if found then
        return v_logbook;
    end if;

    insert into logbooks (class_id, period_year, period_month)
    values (p_class_id, p_year, p_month)
    returning * into v_logbook;

    return v_logbook;
end;
$$;
