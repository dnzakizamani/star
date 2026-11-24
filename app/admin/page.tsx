// Halaman beranda admin: angka ringkas + daftar kelas.
//
// Perhatikan pola yang dipakai di SEMUA halaman di aplikasi ini:
//   1. ambil profil (sekaligus cek login)
//   2. query data
//   3. render
//
// Query ditulis langsung di file halaman, bukan di layer terpisah. Alasannya:
// kalau ada angka yang salah, kamu cukup buka satu file ini dan urutannya
// terbaca dari atas ke bawah.

import Link from 'next/link';
import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatRupiah } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import type { Kelas } from '@/lib/types';

type BarisKelas = Kelas & {
  tutor: { full_name: string } | null;
  pendaftaran: { id: string; status: string }[];
};

export default async function BerandaAdmin() {
  const profil = await wajibPeran('admin');
  const supabase = await buatClientServer();

  // Ketiga query ini tidak saling bergantung, jadi dijalankan bersamaan.
  // Kalau ditulis berurutan seperti sebelumnya, total waktunya jadi jumlah
  // ketiganya (~1,2 s). Dengan Promise.all, totalnya jadi yang paling lambat
  // saja (~0,5 s).
  const [
    { data: kelas },
    { count: jumlahBelumBayar },
    { count: jumlahPerluReview },
  ] = await Promise.all([
    // Ambil kelas beserta tutor dan jumlah siswanya dalam satu query.
    // Supabase menerjemahkan bentuk ini menjadi join.
    supabase
      .from('v_classes_safe')
      .select('*, tutor:profiles!classes_tutor_id_fkey(full_name), pendaftaran:enrollments(id, status)')
      .order('created_at', { ascending: false }),

    // Invoice yang belum dibayar, untuk pengingat di beranda.
    supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'unpaid'),

    // Logbook yang menunggu review.
    supabase
      .from('logbooks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'submitted'),
  ]);

  const daftarKelas = (kelas ?? []) as unknown as BarisKelas[];
  const kelasAktif = daftarKelas.filter((k) => k.status === 'active');

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-ink">Ringkasan</h1>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <AngkaRingkas label="Kelas aktif" nilai={String(kelasAktif.length)} />
        <AngkaRingkas
          label="Invoice belum dibayar"
          nilai={String(jumlahBelumBayar ?? 0)}
          href="/admin/invoice"
        />
        <AngkaRingkas
          label="Logbook perlu review"
          nilai={String(jumlahPerluReview ?? 0)}
          href="/admin/logbook"
        />
      </div>

      <Kartu
        judul="Kelas"
        keterangan="Semua kelas yang terdaftar"
        aksi={
          <Link
            href="/admin/kelas#tambah-kelas"
            className="text-sm font-medium text-accent hover:underline"
          >
            Tambah kelas
          </Link>
        }
      >
        {daftarKelas.length === 0 ? (
          <p className="text-sm text-muted">Belum ada kelas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4 font-medium">Nama</th>
                  <th className="pb-2 pr-4 font-medium">Tutor</th>
                  <th className="pb-2 pr-4 font-medium">Siswa</th>
                  <th className="pb-2 pr-4 font-medium">Rate siswa</th>
                  <th className="pb-2 pr-4 font-medium">Rate tutor</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {daftarKelas.map((kelas) => {
                  const jumlahSiswa = kelas.pendaftaran.filter(
                    (p) => p.status === 'active'
                  ).length;

                  return (
                    <tr key={kelas.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/admin/kelas/${kelas.id}`}
                          className="font-medium text-ink hover:text-accent hover:underline"
                        >
                          {kelas.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-muted">
                        {kelas.tutor?.full_name ?? '-'}
                      </td>
                      <td className="py-2 pr-4 text-muted">
                        {jumlahSiswa}/{kelas.capacity}
                      </td>
                      <td className="py-2 pr-4 text-muted">
                        {formatRupiah(kelas.student_rate)}
                      </td>
                      <td className="py-2 pr-4 text-muted">
                        {formatRupiah(kelas.tutor_rate)}
                      </td>
                      <td className="py-2">
                        <BadgeStatus status={kelas.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Kartu>
    </KerangkaHalaman>
  );
}

// Komponen kecil khusus halaman ini. Tidak ditaruh di /components karena
// hanya dipakai di sini; kalau nanti dipakai di halaman lain, baru dipindah.
function AngkaRingkas({
  label,
  nilai,
  href,
}: {
  label: string;
  nilai: string;
  href?: string;
}) {
  const isi = (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{nilai}</p>
    </div>
  );

  if (!href) {
    return isi;
  }

  return (
    <Link href={href} className="block hover:border-stone-300">
      {isi}
    </Link>
  );
}
