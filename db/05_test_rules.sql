-- 05_test_rules.sql
-- Negative + positive tests for every business rule. Run after 04_seed.sql.
-- Each block prints PASS or raises. The script fails loudly if a rule does not hold.

\set ON_ERROR_STOP on
set client_min_messages to notice;

-- ===========================================================================
create or replace function test_assert(p_label text, p_condition boolean)
returns void language plpgsql as $$
begin
    if p_condition then
        raise notice 'PASS  %', p_label;
    else
        raise exception 'FAIL  %', p_label;
    end if;
end $$;

create or replace function test_expect_error(p_label text, p_sql text)
returns void language plpgsql as $$
begin
    begin
        execute p_sql;
        raise exception 'FAIL  %  (expected rejection, but statement succeeded)', p_label;
    exception
        when check_violation or unique_violation or exclusion_violation
             or foreign_key_violation or raise_exception then
            raise notice 'PASS  %  (rejected: %)', p_label, sqlerrm;
    end;
end $$;

-- ===========================================================================
-- Shape of the seed
-- ===========================================================================
do $$
begin
    perform test_assert('seed: 6 profiles', (select count(*) from profiles) = 6);
    perform test_assert('seed: 1 admin, 2 tutors, 3 students',
        (select count(*) from profiles where role = 'admin') = 1
        and (select count(*) from profiles where role = 'tutor') = 2
        and (select count(*) from profiles where role = 'student') = 3);
    perform test_assert('seed: 1 class capacity 2', (select count(*) from classes) = 1
        and (select capacity from classes limit 1) = 2);
    perform test_assert('seed: 2 enrollments', (select count(*) from enrollments) = 2);
    perform test_assert('seed: exactly 1 paid invoice', (select count(*) from invoices where status = 'paid') = 1);
    perform test_assert('seed: 1 unpaid invoice', (select count(*) from invoices where status = 'unpaid') = 1);
    perform test_assert('seed: 2 completed lessons', (select count(*) from lessons where status = 'completed') = 2);
    perform test_assert('seed: 1 draft logbook with 2 entries',
        (select count(*) from logbooks where status = 'draft') = 1
        and (select count(*) from logbook_entries) = 2);
    perform test_assert('seed: no earnings yet', (select count(*) from earnings_ledger) = 0);
end $$;

-- ===========================================================================
-- Rule: invoice amount is package x locked rate
-- ===========================================================================
do $$
declare v_amount numeric;
begin
    select amount into v_amount from invoices i
    join enrollments e on e.id = i.enrollment_id
    where e.package_hours = 12
    limit 1;
    perform test_assert('invoice: 12h x 100000 = 1200000', v_amount = 1200000);
end $$;

-- ===========================================================================
-- Rule: duplicate enrollment rejected
-- ===========================================================================
select test_expect_error(
    'enroll: duplicate student in same class rejected',
    $$ insert into enrollments (class_id, student_id, package_hours, rate_at_purchase)
       select class_id, student_id, 12, 100000 from enrollments limit 1 $$
);

-- ===========================================================================
-- Rule: capacity cannot be exceeded
-- Student 3 tries to take the last seat, but the class is already full (2/2).
-- ===========================================================================
select test_expect_error(
    'enroll: third student rejected on capacity 2',
    $$ insert into enrollments (class_id, student_id, package_hours, rate_at_purchase)
       values ('77777777-7777-7777-7777-777777777777',
               '66666666-6666-6666-6666-666666666666', 12, 100000) $$
);

-- ===========================================================================
-- Rule: lesson time order and WIB overlap for the same tutor
-- ===========================================================================
select test_expect_error(
    'lesson: end before start rejected',
    $$ insert into lessons (class_id, tutor_id, starts_at, ends_at)
       values ('77777777-7777-7777-7777-777777777777',
               '22222222-2222-2222-2222-222222222222',
               now() + interval '2 days',
               now() + interval '1 day') $$
);

select test_expect_error(
    'lesson: overlapping lesson for same tutor rejected',
    $$ insert into lessons (class_id, tutor_id, starts_at, ends_at)
       select class_id, tutor_id,
              starts_at + interval '30 minutes',
              ends_at   + interval '30 minutes'
       from lessons where status = 'completed' limit 1 $$
);

do $$
begin
    perform test_assert(
        'lesson: non-overlapping lesson accepted',
        true
    );
    insert into lessons (class_id, tutor_id, starts_at, ends_at)
    select class_id, tutor_id,
           ends_at + interval '2 days',
           ends_at + interval '2 days 90 minutes'
    from lessons where status = 'completed' order by starts_at limit 1;
    raise notice 'PASS  lesson: non-overlapping lesson accepted';
exception when others then
    raise exception 'FAIL  lesson: non-overlapping lesson should be accepted (%)', sqlerrm;
end $$;

-- ===========================================================================
-- Rule: logbook is one per class per month
-- ===========================================================================
select test_expect_error(
    'logbook: duplicate class+month rejected',
    $$ insert into logbooks (class_id, period_year, period_month)
       select class_id, period_year, period_month from logbooks limit 1 $$
);

-- ===========================================================================
-- Rule: entry only for a completed lesson, inside the period
-- ===========================================================================
select test_expect_error(
    'entry: cannot log a scheduled lesson',
    $$ insert into logbook_entries (logbook_id, lesson_id, topic, activities, tutor_observation)
       select lb.id, l.id, 'x', 'x', 'x'
       from logbooks lb, lessons l
       where lb.status = 'draft' and l.status = 'scheduled' limit 1 $$
);

select test_expect_error(
    'entry: duplicate entry for same lesson rejected',
    $$ insert into logbook_entries (logbook_id, lesson_id, topic, activities, tutor_observation)
       select logbook_id, lesson_id, 'x', 'x', 'x' from logbook_entries limit 1 $$
);

-- ===========================================================================
-- Rule: submit requires at least one entry, and locks editing
-- ===========================================================================
do $$
declare v_lb uuid;
begin
    insert into logbooks (class_id, period_year, period_month)
    values ('77777777-7777-7777-7777-777777777777', 2020, 1)
    returning id into v_lb;

    begin
        update logbooks set status = 'submitted' where id = v_lb;
        raise exception 'FAIL  submit: empty logbook should be rejected';
    exception when check_violation then
        raise notice 'PASS  submit: empty logbook rejected (%)', sqlerrm;
    end;

    delete from logbooks where id = v_lb;
end $$;

do $$
declare v_lb uuid;
begin
    select id into v_lb from logbooks where status = 'draft' limit 1;
    update logbooks set status = 'submitted' where id = v_lb;
    perform test_assert('submit: logbook moved to submitted',
        (select status from logbooks where id = v_lb) = 'submitted');

    begin
        insert into logbook_entries (logbook_id, lesson_id, topic, activities, tutor_observation)
        select v_lb, id, 'x', 'x', 'x' from lessons where status = 'scheduled' limit 1;
        raise exception 'FAIL  submit: entry added to submitted logbook should be rejected';
    exception when check_violation then
        raise notice 'PASS  submit: entries locked after submit (%)', sqlerrm;
    end;

    update logbooks set status = 'returned', admin_note = 'Perbaiki observasi les 2.' where id = v_lb;
    perform test_assert('return: submitted logbook can be returned with a note',
        (select status from logbooks where id = v_lb) = 'returned'
        and (select admin_note from logbooks where id = v_lb) is not null);

    update logbooks set status = 'submitted' where id = v_lb;
    perform test_assert('resubmit: returned logbook can be resubmitted',
        (select status from logbooks where id = v_lb) = 'submitted');
end $$;

select test_expect_error(
    'return: return without a note rejected',
    $$ update logbooks set status = 'returned' where status = 'submitted' $$
);

-- ===========================================================================
-- Rule: approval generates earnings exactly once, at tutor_rate x hours
-- Two 90 minute lessons at 60000/hour = 90000 each, 180000 total.
-- ===========================================================================
do $$
declare
    v_lb      uuid;
    v_count   integer;
    v_total   numeric;
begin
    select id into v_lb from logbooks where status = 'submitted' limit 1;
    update logbooks set status = 'approved', approved_by = '11111111-1111-1111-1111-111111111111'
    where id = v_lb;

    select count(*), coalesce(sum(amount), 0) into v_count, v_total
    from earnings_ledger where logbook_id = v_lb;

    perform test_assert('earnings: 2 ledger rows created', v_count = 2);
    perform test_assert('earnings: 90min at 60000/h = 90000 per lesson, total 180000',
        v_total = 180000);

    -- Approving again must be impossible (trigger blocks any status change on approved)
    begin
        update logbooks set status = 'approved' where id = v_lb;
        raise exception 'FAIL  earnings: re-approve should be blocked';
    exception when check_violation then
        raise notice 'PASS  earnings: re-approve blocked (%)', sqlerrm;
    end;

    select count(*), coalesce(sum(amount), 0) into v_count, v_total
    from earnings_ledger where logbook_id = v_lb;
    perform test_assert('earnings: still 2 rows, still 180000 after re-approve attempt',
        v_count = 2 and v_total = 180000);
end $$;

-- ===========================================================================
-- Rule: approved logbook is immutable
-- ===========================================================================
select test_expect_error(
    'approved: header cannot be updated',
    $$ update logbooks set admin_note = 'edit after approval' where status = 'approved' $$
);

select test_expect_error(
    'approved: entries cannot be edited',
    $$ update logbook_entries set topic = 'edited after approval'
       where logbook_id in (select id from logbooks where status = 'approved') $$
);

select test_expect_error(
    'approved: entries cannot be deleted',
    $$ delete from logbook_entries
       where logbook_id in (select id from logbooks where status = 'approved') $$
);

-- ===========================================================================
-- Rule: cancelled lesson cannot keep a logbook entry
-- ===========================================================================
select test_expect_error(
    'cancel: lesson with a logbook entry cannot be cancelled',
    $$ update lessons set status = 'cancelled'
       where id in (select lesson_id from logbook_entries) $$
);

-- ===========================================================================
-- Rule: paid invoice cannot be reverted after hours were consumed
-- ===========================================================================
select test_expect_error(
    'invoice: revert paid invoice blocked once hours are used',
    $$ update invoices set status = 'unpaid'
       where status = 'paid'
         and enrollment_id in (select enrollment_id from v_enrollment_balance where hours_used > 0) $$
);

-- ===========================================================================
-- Rule: balance arithmetic
-- One paid student consumed two 90 minute lessons = 3 hours of 12.
-- ===========================================================================
do $$
declare r record;
begin
    select * into r from v_enrollment_balance
    where enrollment_id = (
        select e.id from enrollments e
        join invoices i on i.enrollment_id = e.id and i.status = 'paid' limit 1
    );
    perform test_assert('balance: 12 - 3 = 9 hours remaining', r.hours_remaining = 9);
    perform test_assert('balance: 3 hours used', r.hours_used = 3);

    select * into r from v_enrollment_balance
    where enrollment_id = (
        select e.id from enrollments e
        join invoices i on i.enrollment_id = e.id and i.status = 'unpaid' limit 1
    );
    perform test_assert('balance: unpaid enrollment consumes nothing', r.hours_used = 0);
end $$;

-- ===========================================================================
-- Rule: class economics
-- Revenue 1200000 (one paid package), tutor cost 180000, margin 1020000.
-- ===========================================================================
do $$
declare r record;
begin
    select * into r from v_class_finance limit 1;
    perform test_assert('finance: revenue_paid = 1200000', r.revenue_paid = 1200000);
    perform test_assert('finance: tutor_cost = 180000', r.tutor_cost_approved = 180000);
    perform test_assert('finance: margin = 1020000', r.margin = 1020000);
    perform test_assert('finance: 2 active students', r.active_students = 2);
end $$;

-- ===========================================================================
-- Rule: logbook preview matches the ledger after approval
-- ===========================================================================
do $$
declare r record;
begin
    select * into r from v_logbook_summary where status = 'approved' limit 1;
    perform test_assert('preview: projected payout equals ledgered payout',
        r.projected_payout = r.ledgered_payout);
    perform test_assert('preview: 2 entries, 3 hours', r.entry_count = 2 and r.total_hours = 3);
end $$;

-- ===========================================================================
-- RLS: students never see unapproved logbooks or other students' data
-- ===========================================================================
do $$
declare
    v_student uuid := '44444444-4444-4444-4444-444444444444';
    v_count   integer;
begin
    -- Created as the superuser/owner first, so the draft genuinely exists and we
    -- are testing visibility rather than insert permission.
    insert into logbooks (class_id, period_year, period_month)
    values ('77777777-7777-7777-7777-777777777777', 2021, 5)
    on conflict do nothing;

    perform set_current_user_id(v_student);
    set local role authenticated;

    select count(*) into v_count from logbooks where period_year = 2021 and period_month = 5;
    perform test_assert('rls: student cannot see a draft logbook', v_count = 0);

    select count(*) into v_count from logbooks where status = 'approved';
    perform test_assert('rls: student can see the approved logbook', v_count = 1);

    select count(*) into v_count from invoices;
    perform test_assert('rls: student sees only their own invoice', v_count = 1);

    reset role;
end $$;

do $$
declare
    v_count integer;
begin
    -- The unpaid student must not see the class at all.
    perform set_current_user_id('55555555-5555-5555-5555-555555555555');
    set local role authenticated;

    select count(*) into v_count from classes;
    perform test_assert('rls: unpaid student sees no class', v_count = 0);

    select count(*) into v_count from lessons;
    perform test_assert('rls: unpaid student sees no lessons', v_count = 0);

    reset role;
end $$;

do $$
declare
    v_count integer;
begin
    -- A tutor must not read student rates through the safe view.
    perform set_current_user_id('22222222-2222-2222-2222-222222222222');
    set local role authenticated;

    select count(*) into v_count from v_classes_safe where student_rate is not null;
    perform test_assert('rls: tutor cannot read student_rate', v_count = 0);

    select count(*) into v_count from earnings_ledger;
    perform test_assert('rls: tutor sees only own earnings', v_count = 2);

    reset role;
end $$;

do $$
declare
    v_count integer;
begin
    -- The other tutor sees no earnings at all.
    perform set_current_user_id('33333333-3333-3333-3333-333333333333');
    set local role authenticated;

    select count(*) into v_count from earnings_ledger;
    perform test_assert('rls: unrelated tutor sees no earnings', v_count = 0);

    reset role;
end $$;

do $$
begin
    raise notice '----------------------------------------';
    raise notice 'ALL TESTS PASSED';
    raise notice '----------------------------------------';
end $$;
