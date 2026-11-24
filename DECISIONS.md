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
dan `enrollments.rate_at_purchase` (berlaku saat pembelian). UI memilih dengan
sadar: tabel siswa menampilkan `rate_at_purchase` per baris, kartu Pengaturan
menampilkan rate kelas sekarang.

Terkait penjadwalan: brief meminta tutor menjadwalkan les untuk kelasnya.
Form "Jadwalkan les" ada di beranda tutor (`/tutor`) dan panggil Server Action
yang sama dengan admin (`buatLes`). Aturan yang ditegakkan tetap dari
database: tutor hanya bisa untuk kelasnya sendiri (policy
`lessons_write_tutor` memeriksa `tutor_id = auth.uid()`), dan overlap jadwal
ditolak constraint eksklusif. Admin tetap bisa menjadwalkan dari detail kelas.

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
`supabase.auth.getClaims()`). Aturannya: istilah yang muncul di skema database
tidak diterjemahkan, sisanya Indonesia.

### B9. Tema

**Keputusan.** Token visual theme dari PRD dipakai penuh: Navy `#2F3F5F`
(teks utama, header, tombol utama), Gold `#F1C019` (aksen: logo, tab aktif,
border fokus, badge peringatan lembut), Surface `#FAFDFF`, Cloud `#E0E2E7` /
`#6E7585`, status `#0AB848` / `#FF2819`, font DM Sans, radius 6px.

**Alasan.** Ini instruksi eksplisit brief ("Use the Star Generation theme so
the project feels like part of our product"), bukan preferensi rasa. Pemakaian
warna tetap mengikuti prinsip keterbacaan: Navy untuk teks dan tombol utama
(putih di atas Navy lolos kontras; putih di atas Gold tidak, jadi Gold tidak
pernah dipakai sebagai warna tombol), Gold hanya sebagai aksen kecil. Tabel
padat tetap mudah dipindai karena kontras teks-tabel berasal dari Cloud.

**Konsekuensi.** Semua warna lewat token Tailwind di `tailwind.config.js`
(`navy`, `gold`, `surface`, `cloud`, `success`, `danger`). Mengganti brand
berarti mengedit satu file. Font DM Sans dimuat lewat `next/font` di
`app/layout.tsx` sehingga tidak ada layout shift saat font tiba.

### B10. Verifikasi sesi tanpa round-trip, dan `router.refresh()` setelah aksi

**Keputusan.** Halaman memakai `getClaims()` (verifikasi JWT lokal), bukan
`getUser()`. Setiap Server Action yang sukses diikuti `router.refresh()` di
`FormAksi`.

**Alasan.** Keduanya berasal dari pengukuran, bukan dugaan. Sebelum perbaikan,
TTFB median halaman admin: `/admin` 1,476 s, `/admin/kelas` 0,985 s,
`/admin/invoice` 0,709 s, `/admin/logbook` 0,852 s. Penyebabnya dua hal yang
saling menumpuk:

1. Setiap request memanggil Supabase Auth dua kali — sekali di middleware,
   sekali di `ambilProfilSekarang()`. Server aplikasi berada di jaringan yang
   jauh dari project Supabase (ap-southeast-2), jadi satu round-trip saja
   terukur 250-700 ms.
2. Query di halaman ditulis berurutan. Tiga query berarti tiga round-trip
   dijumlah, padahal ketiganya tidak saling bergantung.

Setelah `getClaims()`, `Promise.all`, dan `router.refresh()`: `/admin` 0,263 s,
`/admin/kelas` 0,240 s, `/admin/invoice` 0,213 s, `/admin/logbook` 0,215 s.
Navigasi antar halaman 291 ms dan stabil.

**Kenapa `router.refresh()` bukan `revalidatePath` saja.** `revalidatePath`
hanya menandai cache basi. Ketika Server Action dipanggil sebagai fungsi biasa
(pola `FormAksi`), Next.js tidak mengirim ulang hasil render halaman. Itu akar
keluhan "tombol harus diklik dua kali": pesan sukses muncul, badge belum
berubah. Terbukti setelah diperbaiki: submit logbook dan approve selesai dalam
satu klik, badge langsung berubah.

**Alternatif yang ditolak.** Memindahkan identitas lewat header (`x-user-id`)
dari middleware ke Server Component: lebih hemat satu query, tapi header request
bisa hilang saat Supabase menulis cookie di respons, dan itu membuat kegagalannya
sulit dilacak. `getClaims()` memberi hasil yang sama tanpa jalur rapuh itu.

**Konsekuensi.** Keuntungan latensi ini bergantung pada signing key asimetris.
Kalau project pindah ke HS256, `getClaims()` kembali jadi panggilan jaringan dan
angka di atas tidak berlaku lagi. `getUser()` di middleware tetap ada dan tetap
satu round-trip per request; itu memang harga untuk refresh token. `loading.tsx`
per peran juga ditambahkan supaya transisi tidak terasa diam, dan kerangkanya
memakai menu asli — bukan kotak abu-abu — agar navigasi tidak hilang saat
menunggu.

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

Status akhir: dua dari tiga selesai dan teruji.

1. **Billing health panel** — selesai. Halaman `/admin/billing` menampilkan
   empat angka ringkas (invoice belum dibayar + nominalnya, invoice tua
   > 7 hari, siswa dengan sisa jam < 3 jam, total margin) plus tiga tabel
   detail. Sumber datanya view yang sudah ada; tidak ada logika bisnis baru,
   hanya penyaringan dan tampilan. Teruji di browser sebagai admin.
2. **Export CSV earnings tutor** — selesai. Route handler
   `/tutor/pendapatan/unduh`. RLS tetap menentukan baris yang diunduh: tutor
   hanya mendapat miliknya, admin mendapat rekap semua. Ada proteksi formula
   injection (prefiks `'` untuk sel yang diawali `=+-@`). Teruji di browser
   sebagai tutor dan admin.
3. **Validasi jadwal real-time** — sengaja tidak dibangun. Database sudah
   menolak overlap dengan pesan berbahasa Indonesia; menambah penghitungan
   klien hanya menyalin aturan yang sudah ditegakkan di tempat yang benar.

---

## Bagian D — Yang akan diubah kalau ada waktu lagi

Ditulis supaya jelas mana yang keputusan dan mana yang utang.

0. **Sudah diperbaiki pada commit ini.** Sempat masuk daftar utang, sekarang
   beres dan dicatat di sini sebagai jejak:

   - **Jam seed 7 jam lebih malam.** `db/04_seed.sql` menulis
     `date_trunc('month', now() at time zone 'Asia/Jakarta') + interval '7 days
     16 hours'`, bertipe `timestamp` tanpa zona, lalu masuk ke kolom
     `timestamptz` dan ditafsirkan UTC. Les tampil 23.00 WIB, bukan 16.00. Kini
     ditutup dengan `at time zone 'Asia/Jakarta'` di akhir ekspresi. Terbukti di
     DB: `starts_at` tersimpan `09:00+00`, tampil `16:00` WIB.
   - **Tombol harus diklik dua kali.** Akar dan perbaikannya ada di B10.
   - **Navigasi dan CRUD terasa lambat.** Angka sebelum/sesudah ada di B10.

1. **`npm run db:setup` menunjuk ke file yang tidak ada.** Script-nya
   `bash db/deploy_supabase.sh`, padahal file itu tidak pernah dibuat; urutan
   migrasi masih dijalankan manual seperti di README bagian 1.3. Selama belum
   ada script-nya, entri `db:setup` di `package.json` sebaiknya dihapus supaya
   tidak menyesatkan.
2. **Top-up paket** belum punya alur yang benar. Karena
   `enrollments_one_active_per_student` hanya mengizinkan satu enrollment aktif
   per siswa per kelas, paket kedua ditolak selama yang pertama masih aktif
   (sudah diuji: `duplicate key value violates unique constraint`). Alur yang
   tersedia sekarang menandai enrollment lama `completed` lebih dulu, dan itu
   membuat siswa kehilangan akses sampai invoice baru lunas. Perbaikan yang
   benar: izinkan beberapa enrollment aktif, lalu kelompokkan
   `v_enrollment_balance` per `(class_id, student_id)` dan jumlahkan sisa
   jamnya.
3. **Tidak ada audit log** untuk perubahan rate dan status invoice. `paid_at` /
   `paid_by` cukup untuk satu admin, tidak cukup kalau ada beberapa.
4. **Test UI belum ada.** Pengujian berhenti di batas database + REST. Untuk
   aplikasi ini itu lapisan yang paling mahal kalau salah, tapi bukan berarti
   lapisan lain aman.
5. **Les susulan di bulan yang logbook-nya sudah `approved` jadi buntu.** Logbook
   unik per `(class_id, period_year, period_month)`, jadi tidak ada logbook kedua
   untuk bulan yang sama. Kalau tutor menandai selesai sebuah les di bulan itu
   setelah logbooknya di-approve, entrinya tidak punya tempat. Diuji langsung dan
   gagal seperti ini:
   `ERROR: Logbook is approved and no longer accepts entries`
   (`fn_logbook_entries_guard`, db/02_triggers.sql). Klik "Tandai selesai" tetap
   berhasil, jadi tutor baru sadar saat mengisi entri, dan pendapatan les itu
   tidak pernah tercatat. Ini bukan bug sepele: approve di awal bulan lalu ada
   les susulan adalah hal yang wajar. Perbaikannya perlu keputusan produk, bukan
   tambal trigger — misalnya logbook koreksi terpisah, atau izinkan `returned`
   atas permintaan tutor dengan catatan. Karena itu sengaja tidak saya ubah
   sendiri.
6. **UI menuntut semua les terisi, database tidak.** Teks di halaman tutor
   berbunyi "Isi semua les di atas, lalu kirim ke admin", tapi
   `fn_logbooks_guard_transition` hanya mewajibkan **minimal satu** entri. Tutor
   bisa submit dengan sebagian les kosong dan tetap lolos. Kalau yang diinginkan
   adalah semua les wajib terisi, itu butuh trigger tambahan yang menghitung
   `lessons completed` di periode itu dan membandingkannya dengan jumlah entri.


