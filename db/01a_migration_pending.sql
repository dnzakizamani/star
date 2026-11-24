-- 01a_migration_pending.sql
-- Sekali-jalan: migrasi pending enrollment. Aman dijalankan ulang (idempotent).
--
-- Alur baru: siswa mendaftar sendiri dengan status 'pending' -> admin tandai
-- invoice lunas -> trigger aktifkan enrollment. Status 'active' tidak lagi
-- bisa dibuat langsung oleh siswa (dijaga RLS + trigger).

-- 1. Kolom status menerima 'pending'.
alter table enrollments drop constraint if exists enrollments_status_check;
alter table enrollments add constraint enrollments_status_check
    check (status in ('pending', 'active', 'completed', 'dropped'));

-- 2. Ganti partial unique index. Index lama hanya melarang dua baris active;
--    sekarang pending juga mengunci kursi, jadi siswa tidak bisa mendaftar
--    dua kali sementara menunggu persetujuan.
drop index if exists enrollments_one_active_per_student;
create unique index if not exists enrollments_one_per_student
    on enrollments (class_id, student_id)
    where status in ('pending', 'active');
