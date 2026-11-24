# Star Generation — Group Class Enrollment & Billing

Aplikasi role-based untuk mengelola kelas les grup: enrollment, invoice, jadwal,
logbook bulanan, dan pendapatan tutor. Dibuat sebagai take home test Full Stack
Developer PT. Generasi Bintang Cemerlang.

Stack: TypeScript, Next.js 15 (App Router, Server Actions), Tailwind CSS,
Supabase (Auth + PostgreSQL), Docker.

Aturan intinya satu: **semua aturan bisnis ditegakkan di PostgreSQL**, bukan di
UI. Aplikasi Next.js hanya membaca dan menampilkan. Karena itu, menembak REST
API Supabase langsung dengan token user tetap kena aturan yang sama.

---

## 1. Menjalankan

### 1.1 Yang dibutuhkan

- Node.js 20 atau lebih baru
- Docker (dipakai untuk runner psql; tidak perlu install psql di host)
- Project Supabase (Auth + Postgres)

### 1.2 Environment

Dua file environment, dan keduanya **tidak masuk git**:

`.env` — dibaca aplikasi Next.js. Isinya publishable, aman masuk bundle browser.

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

`.env.db` — dipakai `db/supabase.sh` untuk koneksi psql. Jangan pernah memakai
service role key atau password di sini untuk keperluan aplikasi; file ini hanya
untuk migrasi dari mesin developer.

```
SUPABASE_DB_HOST=aws-0-ap-southeast-2.pooler.supabase.com
SUPABASE_DB_PORT=5432
SUPABASE_DB_USER=postgres.<project-ref>
SUPABASE_DB_NAME=postgres
SUPABASE_DB_PASSWORD=<database password>
```

Catatan: host langsung `db.<project-ref>.supabase.co` hanya IPv6 dan tidak
terjangkau dari banyak jaringan. Pakai session pooler seperti di atas.

### 1.3 Menyiapkan database

Urutan file penting. Semua dijalankan lewat `db/supabase.sh`, yang membungkus
psql di dalam container `postgres:17` supaya tidak perlu psql di host.

```bash
# 1. Extensions (btree_gist untuk EXCLUDE constraint, pgcrypto untuk uuid)
bash db/supabase.sh -f /sql/00_extensions.sql

# 2. Schema: tabel, constraint, view
bash db/supabase.sh -f /sql/01_schema.sql

# 3. Trigger: semua aturan yang tidak bisa deklaratif
bash db/supabase.sh -f /sql/02_triggers.sql

# 4. RLS + grants
bash db/supabase.sh -f /sql/03_rls.sql

# 5. Seed data demo
bash db/supabase.sh -f /sql/04_seed.sql

# 6. Glue Supabase: profiles.id -> auth.users, trigger signup
bash db/supabase.sh -f /sql/06_auth_sync.sql

# 7. Supabase saja: password + identity untuk akun demo
bash db/supabase.sh -f /sql/08_seed_passwords.sql
bash db/supabase.sh -f /sql/09_seed_auth_identities.sql
bash db/supabase.sh -f /sql/10_fix_auth_user_metadata.sql
bash db/supabase.sh -f /sql/11_fix_auth_nullable_text.sql
```

`db/supabase.sh` memasang folder `db/` ke `/sql` di dalam container, jadi path
yang diberikan ke psql harus `/sql/<nama file>`. Tanpa itu psql akan mencari
file di working directory container, bukan di host.

Langkah 8-11 hanya untuk Supabase. Ketiganya memperbaiki kolom `auth.users`
yang harus terisi supaya GoTrue bisa membaca user hasil seed. Kalau dilewat,
login gagal dengan pesan menyesatkan `Database error querying schema`.

### 1.4 Menjalankan aplikasi

```bash
npm ci
npm run dev          # http://localhost:3000
```

Produksi:

```bash
npm run build
npm start            # http://localhost:3000
```

Docker:

```bash
# NEXT_PUBLIC_* dibaca saat BUILD, bukan runtime. Kalau nilainya berubah,
# image harus di-build ulang.
docker compose up -d --build
```

Container bernama `star-generation`, listen di port `5027`, healthcheck memukul
`/login`.

---

## 2. Akun demo

Semua akun memakai password yang sama: `Password123!`

| Peran | Email | Kondisi |
|---|---|---|
| Admin | `admin@stargeneration.test` | akses penuh |
| Tutor | `tutor1@stargeneration.test` | mengampu kelas seed |
| Tutor | `tutor2@stargeneration.test` | tidak mengampu kelas apa pun |
| Siswa | `student1@stargeneration.test` | invoice **lunas**, punya sisa jam |
| Siswa | `student2@stargeneration.test` | invoice **belum dibayar** |
| Siswa | `student3@stargeneration.test` | tidak terdaftar di kelas mana pun |

Akun-akun ini juga ditampilkan di halaman login, jadi penilai tidak perlu
mencari di dokumentasi.

Tutor2 dan student3 sengaja kosong: keduanya dipakai untuk mendemokan bahwa
tutor tidak bisa melihat kelas orang lain, dan bahwa kelas kapasitas 2 sudah
penuh sehingga siswa ketiga ditolak.

---

## 3. Skenario demo

Seed menghasilkan tepat kondisi ini:

- 1 kelas `Matematika SMA - Grup A`, kapasitas 2, rate siswa Rp100.000/jam,
  rate tutor Rp60.000/jam
- 2 enrollment mengisi kelas (kapasitas penuh)
- student1 lunas, student2 belum bayar
- 2 les selesai di bulan berjalan, masing-masing 1,5 jam
- 1 logbook **draft** dengan 2 entri
- earnings masih kosong

### Alur yang bisa didemokan

1. **Admin** login -> Kelas -> Grup A. Terlihat sisa jam student1 (9 jam),
   invoice student2 unpaid, dua les selesai.
2. **Admin** coba tambahkan student3 -> ditolak trigger kapasitas. Tombol
   memang tidak muncul saat kelas penuh, jadi untuk melihat penolakan aslinya
   pakai psql atau REST (lihat bagian 5).
3. **Tutor** login -> Logbook. Dua entri sudah ada. Klik submit.
4. **Tutor** coba tambah entri lagi -> ditolak, logbook sudah submitted.
5. **Admin** login -> Logbook -> Grup A. Ada tombol setujui dan kembalikan,
   plus preview payout. Setujui.
6. **Tutor** buka Pendapatan -> Rp180.000 (2 les x 1,5 jam x Rp60.000).
7. **Admin** klik setujui lagi -> ditolak dengan pesan "Approved logbook is
   read-only". Ledger tetap 2 baris, nominal tetap Rp180.000.
8. **Siswa** login sebagai student1 -> lihat jadwal dan logbook yang sudah
   approved.
9. **Siswa** login sebagai student2 -> tidak melihat kelas maupun logbook,
   karena invoicenya belum dibayar. Ini RLS, bukan filter UI.

---

## 4. Struktur repo

```
app/
  page.tsx                     redirect ke beranda sesuai peran
  login/page.tsx               form login + daftar akun demo
  tidak-berhak/page.tsx        role mismatch
  aksi-auth.ts                 server action login/logout
  admin/
    page.tsx                   ringkasan: kelas, invoice, logbook
    kelas/page.tsx             daftar + form tambah kelas
    kelas/[id]/page.tsx        detail kelas: siswa, sisa jam, jadwal, rate
    kelas/[id]/logbook/page.tsx  isi logbook satu kelas
    invoice/page.tsx           semua invoice, filter status, tandai lunas
    logbook/page.tsx           review: setujui / kembalikan
    aksi.ts                    server action admin
  tutor/
    page.tsx                   jadwal mendatang + kelas yang diampu
    logbook/page.tsx           isi entri, submit
    pendapatan/page.tsx        earnings per bulan dari earnings_ledger
    aksi.ts                    server action tutor
  siswa/
    page.tsx                   kelas yang diikuti + sisa jam + jadwal
    tagihan/page.tsx           invoice milik sendiri
    logbook/page.tsx           logbook approved saja
components/                    Kartu, Tombol, BadgeStatus, FormAksi, Pesan,
                               KerangkaHalaman
lib/
  session.ts                   wajibLogin / wajibPeran / berandaUntuk
  supabase/server.ts           client untuk Server Component & Action
  supabase/browser.ts          client untuk Client Component
  format.ts                    rupiah, tanggal, jam WIB
  types.ts                     tipe yang mencerminkan kolom database
db/
  00_extensions.sql            btree_gist, pgcrypto
  01_schema.sql                tabel, constraint, view
  02_triggers.sql              kapasitas, lifecycle logbook, earnings, invoice
  03_rls.sql                   policy per peran, view v_classes_safe
  04_seed.sql                  seed deterministik
  05_test_rules.sql            51 assertion aturan bisnis
  06_auth_sync.sql             Supabase: profiles.id -> auth.users, signup
  07_test_auth_sync.sql        10 assertion untuk auth sync
  08_seed_passwords.sql        bcrypt untuk akun demo (Supabase)
  09_seed_auth_identities.sql  auth.identities (Supabase)
  10_fix_auth_user_metadata.sql  kolom NOT NULL yang dibaca GoTrue
  11_fix_auth_nullable_text.sql  idem untuk kolom text
  99_local_auth_stub.sql       auth.users + auth.uid() untuk Postgres biasa
  run_tests.sh                 rebuild DB lokal + semua assertion
  supabase.sh                  psql wrapper ke Supabase
  uji_alur.sh                  uji alur bisnis via REST + JWT asli
  uji_rls.sh                   uji kebocoran data via REST + JWT asli
```

---

## 5. Test

Empat lapis pengujian, dari yang paling murah.

### 5.1 Aturan bisnis (lokal, tanpa Supabase)

```bash
bash db/run_tests.sh
```

Membuat database `star_gen_test` dari nol di container `postgres`, menjalankan
seluruh schema + seed, lalu 51 assertion: kapasitas, anti-overlap, earnings
idempoten, guard transisi logbook, immutability setelah approved, sisa jam,
margin kelas, dan RLS. Berakhir dengan `All assertions passed.`

### 5.2 Auth sync (Supabase)

```bash
# 05 membuat helper test_assert / test_expect_error yang dipakai 07.
bash db/supabase.sh -f /sql/05_test_rules.sql
bash db/supabase.sh -f /sql/07_test_auth_sync.sql
```

Sepuluh assertion: signup membuat profil otomatis, metadata dipakai, dan
`role: admin` dari klien ditolak jadi `student`.

`07_test_auth_sync.sql` memanggil `test_assert` dan `test_expect_error`, yang
didefinisikan di `05_test_rules.sql`. Kalau 05 belum pernah dijalankan di
database itu, 07 gagal dengan
`function test_assert(text, boolean) does not exist`.

Catatan: `05_test_rules.sql` mengasumsikan data seed yang masih utuh dan
menulis status logbook (submit, return, resubmit, approve). Setelah menjalankan
05 di Supabase, jalankan ulang `04_seed.sql` untuk mengembalikan data demo ke
kondisi bersih.

### 5.3 Alur bisnis end-to-end lewat REST API

```bash
bash db/uji_alur.sh
```

Login sebagai user seed lewat `/auth/v1/token`, lalu menjalankan seluruh siklus
memakai JWT asli: tutor menyelesaikan les, mengisi entri, submit, admin approve,
earnings terbentuk, entri terkunci. Skrip ini membuktikan aturan tetap berlaku
ketika UI dilewati sepenuhnya.

### 5.4 Kebocoran data lewat REST API

```bash
bash db/uji_rls.sh
```

Sebelas assertion: tutor tidak bisa membaca `student_rate`, tutor2 tidak melihat
kelas tutor1, siswa1 tidak melihat invoice siswa2, dan anon tidak mendapat apa
pun.

---

## 6. Catatan operasional

- **Timezone**: `timestamptz` disimpan UTC, semua input dan output dikonversi
  ke `Asia/Jakarta` di `lib/format.ts`. `<input type="datetime-local">`
  menghasilkan waktu tanpa zona, jadi wajib lewat `new Date()` sebelum dikirim
  ke database.
- **`NEXT_PUBLIC_*` terkunci saat build**: nilainya di-inline ke bundle
  JavaScript. Mengubah URL atau key berarti build ulang image, bukan restart.
- **Jangan pakai `getSession()`** untuk memvalidasi login. Itu hanya membaca
  cookie tanpa memverifikasi apa pun. Yang dipakai: `getClaims()` di halaman
  (verifikasi tanda tangan JWT lokal, karena project ini ES256) dan `getUser()`
  di middleware (perlu karena harus menyegarkan token).
- **Middleware** menyegarkan token dan memasang header keamanan
  (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).
- **`npm run lint`** memakai ESLint 9 dengan flat config (`eslint.config.mjs`).
  `next lint` sudah deprecated di Next 15.5, jadi yang dipanggil `eslint` langsung.
  Gate CI: `npm run lint` + `npx tsc --noEmit` + `npm run build`.

Dokumen pendamping: [ARCHITECTURE.md](ARCHITECTURE.md) untuk alur data dan
alasan penempatan aturan, [DECISIONS.md](DECISIONS.md) untuk keputusan desain
dan trade-off, [PRD.md](PRD.md) untuk spesifikasi awal.