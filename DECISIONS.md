# Keputusan Desain

Catatan keputusan yang punya alternatif masuk akal. Formatnya: konteks ->
keputusan -> alternatif yang ditolak -> konsekuensi. Tujuannya supaya reviewer
tidak perlu menebak alasan sebuah pilihan, dan supaya pilihan itu bisa dibantah
dengan argumen, bukan selera.

---

## Bagian A — Lima keputusan terbuka dari PRD

PRD bagian 8 menyisakan lima pertanyaan dengan "arah awal". Berikut keputusan
finalnya.

### A1. Kalkulasi invoice dan jam terpakai

**Keputusan.** Invoice = `package_hours x rate_at_purchase`, dihitung database
saat enrollment dibuat. Jam terpakai = durasi les berstatus `completed` **yang
sudah punya entri logbook**. Sisa jam = `package_hours - jam terpakai`. Hanya
enrollment dengan invoice `paid` yang dihitung sama sekali.

**Alternatif yang ditolak.**
- Menghitung jam terpakai dari semua les `completed`, termasuk yang belum
  dicatat. Ditolak karena tutor yang lupa mengisi logbook akan memotong kuota
  siswa secara diam-diam. Siswa dirugikan oleh kelalaian administratif.
- Menghitung dari les `scheduled`. Ditolak karena les yang belum terjadi bukan
  pemakaian.

**Konsekuensi.** Sisa jam baru berkurang setelah tutor mengisi logbook. Ini
sedikit menguntungkan siswa dan membuat angka di UI selalu bisa ditelusuri ke
baris logbook tertentu. Efek sampingnya: les yang selesai tapi tidak pernah
dicatat tidak memotong kuota dan juga tidak menghasilkan earnings — konsisten,
karena tidak ada bukti les itu terjadi.

### A2. Efek perubahan rate, kapasitas, dan tutor

**Keputusan.**
- **Rate**: `enrollments.rate_at_purchase` mengunci harga. Perubahan rate kelas
  hanya berlaku untuk enrollment baru.
- **Kapasitas**: hanya berlaku untuk enrollment baru. Tidak ada siswa aktif yang
  dikeluarkan saat kapasitas diturunkan. Kelas yang sudah terisi di atas
  kapasitas baru tetap berjalan; trigger hanya menolak penambahan berikutnya.
- **Tutor**: re-assign mengubah `classes.tutor_id`. Karena `lessons.tutor_id`
  adalah snapshot, les yang sudah terjadwal tetap dipegang tutor lama.

**Alternatif yang ditolak.** Menyimpan rate hanya di `classes` dan menghitung
invoice ulang tiap tampil. Ditolak karena invoice yang sudah dibayar akan
berubah retroaktif — masalah pembukuan, bukan masalah teknis.

**Konsekuensi.** Ada dua sumber rate: `classes.student_rate` (berlaku sekarang)
dan `enrollments.rate_at_purchase` (berlaku saat pembelian). UI harus memilih
dengan sadar. Saat ini detail kelas hanya menampilkan rate kelas di kartu
Pengaturan; `rate_at_purchase` sudah tersimpan dan dipakai untuk menghitung
invoice, tetapi belum ditampilkan per baris di tabel siswa.

### A3. Siswa kehabisan jam, dan les yang dibatalkan

**Keputusan.**
- Jam habis: pembuatan les **tidak** diblokir, tetapi pencatatan logbook
  diblokir jika ada siswa lunas yang sisa jamnya kurang dari durasi les
  (`fn_logbook_entries_guard`). Admin menambah paket dengan enrollment baru,
  yang otomatis membuat invoice baru.
- Les dibatalkan: tidak memotong jam (tidak pernah masuk logbook), tidak bisa
  dibatalkan kalau sudah punya entri (`fn_lessons_block_cancel_logged`), dan
  tidak menghasilkan earnings karena earnings hanya dibuat dari entri logbook
  pada logbook yang approved.
- Les `cancelled` keluar dari EXCLUDE constraint, jadi slot jamnya bisa dipakai
  lagi.

**Alternatif yang ditolak.** Memblokir penjadwalan saat jam tidak cukup.
Ditolak karena les bisa dijadwalkan sebelum top-up dibayar, dan memblokir di
titik jadwal memaksa admin menyelesaikan urusan uang lebih dulu daripada
urusan kalender. Titik paksa yang benar adalah saat les dicatat sebagai
pemakaian.

**Konsekuensi.** Les bisa terjadwal lalu gagal dicatat. Di level database pesan
errornya menyebut nama siswa dan sisa jamnya (`Student % only has % hours left,
lesson needs %`), tapi `app/tutor/aksi.ts` sengaja menerjemahkannya jadi pesan
umum ("Siswa tidak punya sisa jam yang cukup untuk les ini. Hubungi admin.")
karena tutor tidak boleh tahu detail keuangan siswa. Jadi yang tahu siswa mana
adalah admin, lewat sisa jam di detail kelas. Ini disengaja: lebih baik gagal
dengan pesan jelas daripada les berjalan tanpa tercatat.

### A4. Logbook yang bermasalah

**Keputusan.** Admin mengembalikan dengan `status = returned` dan
`admin_note` **wajib** (CHECK constraint, bukan validasi form). Tutor mengedit
entri di status `returned`, lalu submit ulang. Logbook `approved` immutable:
header dan entri tidak bisa diubah maupun dihapus, ditegakkan trigger.

**Alternatif yang ditolak.**
- Mengizinkan admin mengedit langsung entri tutor. Ditolak karena merusak
  atribusi: siapa yang menulis apa menjadi kabur, padahal logbook dipakai
  sebagai bukti ke orang tua.
- `returned -> draft` supaya tutor "mulai bersih". Ditolak karena akan
  menghapus jejak bahwa logbook pernah ditolak.

**Konsekuensi.** Koreksi setelah approved hanya lewat les atau entri baru.
Riwayatnya tidak bisa dirapikan, dan itu memang tujuannya: audit trail yang
tidak bisa dibengkokkan.

### A5. Invoice jadi lunas, siapa, dan bisakah di-undo

**Keputusan.** Hanya admin (`invoices_update_admin`). Tombol "Tandai lunas"
menyimulasikan transfer. `paid_at` diisi trigger, `paid_by` dari
`auth.uid()` di application layer dan dijaga CHECK
`invoices_paid_consistency`. Undo ke `unpaid` hanya boleh selama
`hours_used = 0`; setelah ada jam terpakai, revert ditolak. Invoice `paid` tidak
bisa dihapus, hanya bisa `void`.

**Alternatif yang ditolak.** Mengizinkan student membayar sendiri lewat
endpoint khusus. Ditolak karena PRD menyatakan payment gateway di luar scope;
menambah endpoint bayar tanpa gateway hanya menambah permukaan serang tanpa
nilai demo.

**Konsekuensi.** Tidak ada audit log terpisah — `paid_at` dan `paid_by` adalah
jejaknya. Untuk aplikasi satu admin ini cukup; kalau nanti ada beberapa admin,
tabel `invoice_events` menjadi tambahan yang wajar.

---

## Bagian B — Keputusan teknis

### B1. Aturan bisnis di database, bukan di aplikasi

**Keputusan.** Kapasitas, anti-overlap, lifecycle logbook, earnings idempoten,
dan visibilitas data ditegakkan PostgreSQL (constraint, trigger, RLS). Aplikasi
hanya memvalidasi untuk kenyamanan.

**Alasan.** PRD memintanya secara eksplisit, tapi ada alasan yang lebih kuat:
Supabase mengekspos REST API ke publik dengan hanya anon key. Siapa pun yang
punya token user yang sah bisa memanggil `/rest/v1/enrollments` langsung. Kalau
kapasitas hanya dicek di Server Action, satu `curl` cukup untuk melewatinya.
`db/uji_alur.sh` dan `db/uji_rls.sh` membuktikan aturan tetap berlaku di jalur
itu.

**Konsekuensi.** Error database harus diterjemahkan ke bahasa manusia. Itu
dilakukan satu fungsi `terjemahkanErrorDatabase` per area (admin, tutor) dengan
pencocokan kata kunci pesan. Rapuh terhadap perubahan teks pesan, jadi setiap
pesan exception di trigger sengaja ditulis stabil dan spesifik.

### B2. Earnings sebagai ledger append-only, bukan kolom "sudah dibayar"

**Keputusan.** `earnings_ledger` dengan `UNIQUE(lesson_id)` dan
`amount` sebagai kolom generated.

**Alternatif yang ditolak.** Kolom `lessons.tutor_paid boolean` atau menghitung
earnings saat render dari les approved. Yang pertama kehilangan riwayat
(bagaimana kalau rate berubah?), yang kedua membuat laporan tutor berubah
diam-diam ketika rate kelas diubah.

**Konsekuensi.** Ledger adalah sumber kebenaran tunggal. `amount` tidak bisa
diedit siapa pun karena generated. Approve berulang adalah no-op struktural,
bukan hasil pengecekan `if`.

### B3. Dua Supabase client

**Keputusan.** `lib/supabase/server.ts` dan `lib/supabase/browser.ts` terpisah.

**Alasan.** Browser menyimpan sesi di cookie milik domain; server harus membaca
cookie dari request yang masuk. Satu client untuk keduanya membuat sesi hilang
di setiap render server. `setAll` di client server dibungkus try/catch karena
Server Component dilarang menulis cookie — biarkan middleware yang menyegarkan.

**Konsekuensi.** Dua file yang mirip. Dokumentasi di kepala masing-masing file
menjelaskan kenapa, supaya tidak ada yang "merapikan" keduanya jadi satu.

### B4. Server Actions, tanpa API route dan tanpa ORM

**Keputusan.** Mutasi lewat Server Action. Akses data lewat `supabase-js`
langsung di halaman.

**Alternatif yang ditolak.** Route handler `/api/*` plus `fetch` dari client:
menambah lapisan yang harus dijaga konsisten dengan RLS. Prisma/Drizzle: untuk
skema yang sudah punya constraint dan view, ORM menambah model kedua yang bisa
menyimpang dari yang sebenarnya berlaku di database.

**Konsekuensi.** Tipe ditulis manual di `lib/types.ts`, mencerminkan kolom apa
adanya. Kalau skema berubah, file itu harus ikut diubah — tidak ada generator
yang mengingatkan. Ini trade-off yang diterima untuk aplikasi seukuran ini.

### B5. Masking `student_rate` lewat view

**Keputusan.** `v_classes_safe` dengan `security_invoker = true`, kolom
`student_rate` di-`case` berdasarkan `auth_is_admin() or auth_student_has_paid()`.

**Alternatif yang ditolak.** Menyembunyikan kolom di UI, atau memakai policy
per-kolom. Yang pertama bukan keamanan. Yang kedua bisa dilakukan dengan
`GRANT SELECT (kolom)` tapi menyulitkan ketika aplikasi butuh `select('*')`.

**Konsekuensi.** Semua halaman yang butuh data kelas memakai view, bukan tabel.
Untuk tutor `student_rate` bernilai `null`, dan itu terlihat di tipe
(`number | null`) sehingga pemakaian yang salah ketahuan saat kompilasi.

### B6. Seed menulis `auth.users` langsung

**Keputusan.** Akun demo dibuat dengan insert langsung ke `auth.users` plus
bcrypt dari `pgcrypto`, ditambah baris `auth.identities`, lalu kolom yang dibaca
GoTrue dinormalkan ke `''` (file 08-11).

**Alternatif yang ditolak.** Membuat akun lewat endpoint signup. Ditolak karena
endpoint itu publik dan akan membuat seed bergantung pada jaringan serta rate
limit; juga karena `role` dari signup sengaja di-clamp, sehingga admin tidak
bisa dibuat lewat jalur itu.

**Konsekuensi.** Empat file tambahan yang isinya murni pengetahuan tentang
internal GoTrue. Tiga hal yang harus benar dan tidak jelas dari dokumentasi:
`gen_salt('bf')` tanpa argumen memakai cost 6 dan ditolak GoTrue (harus `10`);
setiap kolom text yang dipetakan ke Go string tidak boleh NULL; dan user tanpa
baris `auth.identities` tidak bisa password grant. Semua kegagalan itu muncul
sebagai pesan yang sama dan menyesatkan: `Database error querying schema`.

### B7. Docker tiga tahap

**Keputusan.** `deps -> builder -> runner` dengan `output: 'standalone'`.

**Alasan.** `node_modules` di mesin build sekitar 390MB; hasil standalone hanya
butuh server.js plus dependency yang benar-benar dipakai. Image akhir 71MB dan
tidak membawa `node_modules` penuh. Runner jalan sebagai `nextjs` (uid 1001).

**Konsekuensi.** `NEXT_PUBLIC_*` di-inline saat build, jadi build arg, bukan
runtime env. Mengubah URL atau key berarti build ulang. Ini ditulis di
Dockerfile dan README karena mudah terlupakan dan gejalanya membingungkan
(aplikasi jalan tapi memanggil project Supabase yang salah).

### B8. Bahasa dan penamaan

**Keputusan.** Komentar, pesan UI, dan nama fungsi domain berbahasa Indonesia;
nama kolom database dan istilah teknis tetap Inggris.

**Alasan.** Yang membaca kode dan yang memakai aplikasi adalah orang Indonesia.
Tapi `rate_at_purchase`, `earnings_ledger`, `logbook` adalah istilah yang lebih
tepat dalam Inggris dan sudah dipakai di PRD.

**Konsekuensi.** Ada campuran dalam satu file (`wajibPeran` memanggil
`supabase.auth.getUser()`). Aturannya: istilah yang muncul di skema database
tidak diterjemahkan, sisanya Indonesia.

### B9. Tema

**Keputusan.** Palet flat (ink, muted, line, surface, canvas, satu aksen teal),
radius 6px, base font 15px. Tanpa gradien, tanpa sidebar.

**Alasan.** Data di aplikasi ini padat (tabel siswa, invoice, logbook). Yang
membantu adalah kontras teks dan jarak, bukan dekorasi. Navigasi per peran
hanya 3-4 halaman, jadi tab di header cukup dan tidak memakan lebar layar
seperti sidebar.

**Konsekuensi.** Warna dari PRD (navy/gold) tidak dipakai. PRD bagian 10
mendaftarkan token tersebut, tapi brief utamanya adalah keterbacaan; palet netral
dengan satu aksen membuat status (`paid`, `approved`, `unpaid`, `returned`)
terbaca tanpa bersaing dengan warna merek.

---

## Bagian C — Improvement yang dipilih

PRD bagian 9 meminta memilih 2-3 improvement. Tiga kandidat itu diterima
sebagai arah, dengan urutan pengerjaan berikut dan alasan pemotongannya.

1. **Billing health panel** (prioritas 1). Fondasinya sudah ada:
   `v_class_finance` menghitung `revenue_paid`, `tutor_cost_approved`, dan
   `margin` per kelas, dan sudah diuji (margin = 1.020.000 pada data seed).
   Sisanya adalah halaman yang menyaring `v_enrollment_balance` untuk sisa jam
   rendah dan `invoices` untuk yang unpaid terlalu lama. Dikerjakan lebih dulu
   karena menjawab keluhan nomor satu di brief: "admin tidak bisa tahu".
2. **Export CSV earnings tutor** (prioritas 2). Datanya sudah lengkap di
   `earnings_ledger` dan halaman `/tutor/pendapatan` sudah mengelompokkan per
   bulan; yang kurang hanya serialisasi CSV dan tombol unduh.
3. **Validasi jadwal real-time** (prioritas 3). Nilainya paling kecil dari
   ketiganya karena database sudah menolak overlap dengan pesan yang sudah
   diterjemahkan ke bahasa Indonesia. Yang ditambahkan hanya lebih cepat tahu,
   bukan lebih benar.

Yang sengaja tidak dikerjakan: laporan PDF, kalender drag-and-drop. Keduanya
mahal untuk satu hari kerja dan tidak menambah kebenaran data.

Catatan jujur: pada commit terakhir, panel billing, export CSV, dan validasi
real-time **belum ada di UI**. Yang sudah jadi adalah bagian tersulitnya, yaitu
angka margin yang benar dan teruji di database. Lihat ARCHITECTURE.md bagian 7.

---

## Bagian D — Yang akan diubah kalau ada waktu lagi

Ditulis supaya jelas mana yang keputusan dan mana yang utang.

1. **`db/04_seed.sql` menulis jam les 7 jam lebih malam.** Nilai
   `date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '7 days
   16 hours'` bertipe `timestamp` tanpa zona, lalu masuk ke kolom `timestamptz`
   dan dianggap UTC. Hasilnya les tampil pukul **23.00 WIB**, bukan 16.00 seperti
   yang dimaksud. Perbaikannya satu tambahan cast:
   `... at time zone 'Asia/Jakarta'`. Data tetap valid (durasi, kuota, dan
   earnings tidak terpengaruh), jadi ini murni soal jam yang terlihat.
2. **`npm run db:setup` menunjuk ke file yang tidak ada.** Script-nya
   `bash db/deploy_supabase.sh`, padahal file itu tidak pernah dibuat; urutan
   migrasi masih dijalankan manual seperti di README bagian 1.3. Selama belum
   ada script-nya, entri `db:setup` di `package.json` sebaiknya dihapus supaya
   tidak menyesatkan.
3. **Top-up paket** belum punya alur yang benar. Karena
   `enrollments_one_active_per_student` hanya mengizinkan satu enrollment aktif
   per siswa per kelas, paket kedua ditolak selama yang pertama masih aktif
   (sudah diuji: `duplicate key value violates unique constraint`). Alur yang
   tersedia sekarang menandai enrollment lama `completed` lebih dulu, dan itu
   membuat siswa kehilangan akses sampai invoice baru lunas. Perbaikan yang
   benar: izinkan beberapa enrollment aktif, lalu kelompokkan
   `v_enrollment_balance` per `(class_id, student_id)` dan jumlahkan sisa
   jamnya.
4. **Tidak ada audit log** untuk perubahan rate dan status invoice. `paid_at` /
   `paid_by` cukup untuk satu admin, tidak cukup kalau ada beberapa.
5. **Test UI belum ada.** Pengujian berhenti di batas database + REST. Untuk
   aplikasi ini itu lapisan yang paling mahal kalau salah, tapi bukan berarti
   lapisan lain aman.


