// Beranda siswa: kelas yang diikuti beserta sisa jam.
//
// Siswa hanya melihat kelas yang invoice-nya sudah lunas. Itu bukan filter di
// halaman ini: RLS di database yang menolak, jadi data tidak pernah dikirim ke
// browser sama sekali.

import Link from 'next/link';
import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatJamPelajaran, formatTanggal } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import type { Kelas, Pendaftaran, Invoice } from '@/lib/types';

type BarisPendaftaran = Pendaftaran & {
  kelas: Kelas | null;
  invoice: Invoice | Invoice[] | null;
};

export default async function BerandaSiswa() {
  const profil = await wajibPeran('student');
  const supabase = await buatClientServer();

  // Pendaftaran milik siswa ini. RLS membatasi ke baris miliknya sendiri.
  const { data: pendaftaran } = await supabase
    .from('enrollments')
    .select('*, kelas:classes(*), invoice:invoices(*)')
    .eq('student_id', profil.id)
    .order('created_at', { ascending: false });

  const daftarPendaftaran = (pendaftaran ?? []) as unknown as BarisPendaftaran[];

  // Saldo jam dari view yang menghitung pemakaian.
  const { data: saldo } = await supabase
    .from('v_enrollment_balance')
    .select('*')
    .eq('student_id', profil.id);

  const saldoPerPendaftaran = new Map(
    (saldo ?? []).map((s) => [s.enrollment_id, s])
  );

  // Les mendatang hanya untuk kelas yang invoice-nya sudah lunas.
  const kelasLunas = daftarPendaftaran
    .filter((p) => {
      const invoice = Array.isArray(p.invoice) ? p.invoice[0] : p.invoice;
      return p.status === 'active' && invoice?.status === 'paid';
    })
    .map((p) => p.class_id);

  const { data: les } = kelasLunas.length
    ? await supabase
        .from('lessons')
        .select('*, kelas:classes(name)')
        .in('class_id', kelasLunas)
        .eq('status', 'scheduled')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at')
    : { data: [] };

  const jadwal = (les ?? []) as unknown as {
    id: string;
    starts_at: string;
    kelas: { name: string } | null;
  }[];

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-ink">Kelas Saya</h1>

      <div className="grid gap-5">
        <Kartu judul="Pendaftaran" keterangan={`${daftarPendaftaran.length} kelas`}>
          {daftarPendaftaran.length === 0 ? (
            <p className="text-sm text-muted">
              Anda belum terdaftar di kelas mana pun. Hubungi admin.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {daftarPendaftaran.map((p) => {
                const invoice = Array.isArray(p.invoice) ? p.invoice[0] : p.invoice;
                const saldoSiswa = saldoPerPendaftaran.get(p.id);
                const lunas = invoice?.status === 'paid';

                return (
                  <li key={p.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {p.kelas?.name ?? 'Kelas'}
                        </p>
                        <p className="text-xs text-muted">
                          Paket {formatJamPelajaran(p.package_hours)} · terdaftar{' '}
                          {formatTanggal(p.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <BadgeStatus status={p.status} />
                        {invoice && <BadgeStatus status={invoice.status} />}
                      </div>
                    </div>

                    {!lunas && (
                      <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Akses kelas terbuka setelah invoice dibayar. Hubungi admin
                        untuk konfirmasi pembayaran.
                      </p>
                    )}

                    {lunas && saldoSiswa && (
                      <p className="mt-2 text-xs text-muted">
                        Sisa jam:{' '}
                        <span className="font-medium text-ink">
                          {formatJamPelajaran(saldoSiswa.hours_remaining)}
                        </span>{' '}
                        dari {formatJamPelajaran(saldoSiswa.package_hours)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Kartu>

        <Kartu judul="Jadwal mendatang">
          {jadwal.length === 0 ? (
            <p className="text-sm text-muted">Belum ada jadwal les.</p>
          ) : (
            <ul className="divide-y divide-line">
              {jadwal.map((l) => (
                <li key={l.id} className="py-2.5">
                  <p className="text-sm text-ink">{l.kelas?.name ?? 'Kelas'}</p>
                  <p className="text-xs text-muted">{formatTanggal(l.starts_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Kartu>

        <Kartu judul="Akses cepat">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/siswa/tagihan"
              className="rounded border border-line px-3 py-1.5 text-sm text-ink hover:bg-stone-50"
            >
              Lihat tagihan
            </Link>
            <Link
              href="/siswa/logbook"
              className="rounded border border-line px-3 py-1.5 text-sm text-ink hover:bg-stone-50"
            >
              Lihat logbook
            </Link>
          </div>
        </Kartu>
      </div>
    </KerangkaHalaman>
  );
}
