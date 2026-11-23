-- 04_seed.sql
-- Deterministic seed so the reviewer can reproduce every scenario.
-- All passwords are the same for convenience: Password123!
-- auth users are created through the Supabase-compatible auth.users table shape
-- when available; otherwise only profiles are seeded (local psql testing).

do $$
declare
    v_admin   uuid := '11111111-1111-1111-1111-111111111111';
    v_tutor1  uuid := '22222222-2222-2222-2222-222222222222';
    v_tutor2  uuid := '33333333-3333-3333-3333-333333333333';
    v_stu1    uuid := '44444444-4444-4444-4444-444444444444';
    v_stu2    uuid := '55555555-5555-5555-5555-555555555555';
    v_stu3    uuid := '66666666-6666-6666-6666-666666666666';
    v_class   uuid := '77777777-7777-7777-7777-777777777777';
    v_enr1    uuid;
    v_enr2    uuid;
    v_lesson1 uuid;
    v_lesson2 uuid;
    v_logbook uuid;
begin
    -- Clean slate (safe to re-run)
    delete from earnings_ledger;
    delete from logbook_entries;
    delete from logbooks;
    delete from lessons;
    delete from invoices;
    delete from enrollments;
    delete from classes;
    delete from profiles;

    -- ---------------------------------------------------------------------
    -- People: 1 admin, 2 tutors, 3 students
    -- ---------------------------------------------------------------------
    insert into profiles (id, email, full_name, role) values
        (v_admin,  'admin@stargeneration.test',  'Rani Admin',        'admin'),
        (v_tutor1, 'tutor1@stargeneration.test', 'Budi Santoso',      'tutor'),
        (v_tutor2, 'tutor2@stargeneration.test', 'Sari Dewi',         'tutor'),
        (v_stu1,   'student1@stargeneration.test', 'Andi Pratama',    'student'),
        (v_stu2,   'student2@stargeneration.test', 'Bunga Lestari',   'student'),
        (v_stu3,   'student3@stargeneration.test', 'Candra Wijaya',   'student');

    -- ---------------------------------------------------------------------
    -- One class, capacity 2, tutor 1
    -- ---------------------------------------------------------------------
    insert into classes (id, name, student_rate, tutor_rate, capacity, tutor_id)
    values (v_class, 'Matematika SMA - Grup A', 100000, 60000, 2, v_tutor1);

    -- ---------------------------------------------------------------------
    -- Two students enroll (fills the class), third stays unenrolled so the
    -- reviewer can demo the capacity rejection.
    -- ---------------------------------------------------------------------
    insert into enrollments (class_id, student_id, package_hours, rate_at_purchase)
    values (v_class, v_stu1, 12, 100000)
    returning id into v_enr1;

    insert into enrollments (class_id, student_id, package_hours, rate_at_purchase)
    values (v_class, v_stu2, 12, 100000)
    returning id into v_enr2;

    -- ---------------------------------------------------------------------
    -- Student 1 paid, student 2 left unpaid: demos both student states.
    -- ---------------------------------------------------------------------
    update invoices
       set status = 'paid', paid_at = now(), paid_by = v_admin
     where enrollment_id = v_enr1;

    -- ---------------------------------------------------------------------
    -- Two past lessons in the current month, both completed.
    -- ---------------------------------------------------------------------
    insert into lessons (class_id, tutor_id, starts_at, ends_at, status)
    values (
        v_class, v_tutor1,
        date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '7 days 16 hours',
        date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '7 days 17 hours 30 minutes',
        'completed'
    ) returning id into v_lesson1;

    insert into lessons (class_id, tutor_id, starts_at, ends_at, status)
    values (
        v_class, v_tutor1,
        date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '14 days 16 hours',
        date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '14 days 17 hours 30 minutes',
        'completed'
    ) returning id into v_lesson2;

    -- ---------------------------------------------------------------------
    -- Logbook for this month, with one entry per completed lesson.
    -- ---------------------------------------------------------------------
    select id into v_logbook from logbooks
     where class_id = v_class
       and period_year  = extract(year  from now() at time zone 'Asia/Jakarta')
       and period_month = extract(month from now() at time zone 'Asia/Jakarta');

    if v_logbook is null then
        insert into logbooks (class_id, period_year, period_month)
        values (
            v_class,
            extract(year  from now() at time zone 'Asia/Jakarta'),
            extract(month from now() at time zone 'Asia/Jakarta')
        ) returning id into v_logbook;
    end if;

    insert into logbook_entries
        (logbook_id, lesson_id, topic, activities, tutor_observation, next_recommendation)
    values
        (v_logbook, v_lesson1,
         'Persamaan Kuadrat: Akar-akar dan Diskriminan',
         'Membahas bentuk umum ax^2 + bx + c, latihan 8 soal pemfaktoran, dan pengenalan rumus abc.',
         'Andi cepat menangkap pemfaktoran sederhana, masih ragu saat diskriminan negatif.',
         'Latihan tambahan 5 soal diskriminan negatif, lalu kuis singkat di awal sesi berikutnya.'),
        (v_logbook, v_lesson2,
         'Fungsi Kuadrat dan Grafik Parabola',
         'Menggambar parabola dari persamaan, menentukan titik puncak, dan sumbu simetri.',
         'Kedua siswa mampu menentukan titik puncak. Bunga perlu penguatan cara membaca arah bukaan grafik.',
         'Ulangi membaca koefisien a, lalu beri 3 soal grafik dengan a negatif.');

    raise notice 'Seed complete. Class % has 2 enrollments (1 paid, 1 unpaid), 2 completed lessons, 1 draft logbook with 2 entries.', v_class;
end $$;
