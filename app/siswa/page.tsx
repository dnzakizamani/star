// Beranda siswa: kelas yang diikuti beserta sisa jam, plus katalog untuk
// mendaftar sendiri.
//
// Dua sumber data yang berbeda aturan RLS:
//   - enrollments  : hanya baris milik sendiri (RLS), kelas terlihat setelah
//                    invoice lunas
//   - v_classes_public : katalog publik (nama, tutor, harga, kursi) supaya
//                    siswa bisa memilih sebelum membayar apa pun

import Link from 'next/link';
import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatJamPelajaran, formatTanggal, formatRupiah } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import { FormAksi } from '@/components/FormAksi';
import { daftarKelasSendiri } from './aksi';
import type { Kelas, Pendaftaran, Invoice } from '@/lib/types';

type BarisPendaftaran = Pendaftaran & {
  kelas: Kelas | null;
  invoice: Invoice | Invoice[] | null;
};

type KelasKatalog = {
  id: string;
  name: string;
  tutor_name: string;
  student_rate: number;
  capacity: number;
  seats_taken: number;
  is_open: boolean;
};

// Paket jam yang ditawarkan. Angka yang sama divalidasi di aksi siswa.
const PAKET_JAM_PILIHAN = [6, 12, 24];

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

  // Katalog untuk pendaftaran mandiri. Terlihat apa pun status pembayaran.
  const { data: katalog } = await supabase
    .from('v_classes_public')
    .select('*')
    .order('name');

  const kelasKatalog = (katalog ?? []) as unknown as KelasKatalog[];

  // Kelas yang sudah diikuti siswa tidak ditawarkan lagi di katalog.
  const kelasSudahDiikuti = new Set(daftarPendaftaran.map((p) => p.class_id));
  const kelasTersedia = kelasKatalog.filter((k) => !kelasSudahDiikuti.has(k.id));

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-navy">Kelas Saya</h1>

      <div className="grid gap-5">
        <Kartu judul="Pendaftaran" keterangan={`${daftarPendaftaran.length} kelas`}>
          {daftarPendaftaran.length === 0 ? (
            <p className="text-sm text-cloud-strong">
              Anda belum terdaftar di kelas mana pun. Pilih kelas di bagian
              bawah halaman ini.
            </p>
          ) : (
            <ul className="divide-y divide-cloud">
              {daftarPendaftaran.map((p) => {
                const invoice = Array.isArray(p.invoice) ? p.invoice[0] : p.invoice;
                const saldoSiswa = saldoPerPendaftaran.get(p.id);
                const lunas = invoice?.status === 'paid';

                return (
                  <li key={p.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-navy">
                          {p.kelas?.name ?? 'Kelas'}
                        </p>
                        <p className="text-xs text-cloud-strong">
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
                      <p className="mt-2 rounded border border-gold/50 bg-gold-soft px-3 py-2 text-xs text-[#8A6D00]">
                        {invoice ? (
                          <>
                            Menunggu pembayaran. Akses kelas terbuka otomatis
                            setelah admin mengonfirmasi invoice{' '}
                            {invoice.invoice_number}.
                          </>
                        ) : (
                          'Menunggu konfirmasi admin.'
                        )}
                      </p>
                    )}

                    {lunas && saldoSiswa && (
                      <p className="mt-2 text-xs text-cloud-strong">
                        Sisa jam:{' '}
                        <span className="font-medium text-navy">
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
            <p className="text-sm text-cloud-strong">Belum ada jadwal les.</p>
          ) : (
            <ul className="divide-y divide-cloud">
              {jadwal.map((l) => (
                <li key={l.id} className="py-2.5">
                  <p className="text-sm text-navy">{l.kelas?.name ?? 'Kelas'}</p>
                  <p className="text-xs text-cloud-strong">{formatTanggal(l.starts_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Kartu>

        <Kartu
          judul="Katalog kelas"
          keterangan="pilih kelas, pilih paket jam, lalu invoice dibuat otomatis"
        >
          {kelasTersedia.length === 0 ? (
            <p className="text-sm text-cloud-strong">
              Belum ada kelas yang bisa didaftar. Semua kelas sudah Anda ikuti
              atau katalog masih kosong.
            </p>
          ) : (
            <ul className="divide-y divide-cloud">
              {kelasTersedia.map((k) => {
                const penuh = !k.is_open;

                return (
                  <li key={k.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-navy">{k.name}</p>
                        <p className="text-xs text-cloud-strong">
                          Tutor {k.tutor_name} · {formatRupiah(k.student_rate)}
                          /jam · kursi {k.capacity - k.seats_taken} dari{' '}
                          {k.capacity} tersisa
                        </p>
                      </div>

                      {penuh ? (
                        <BadgeStatus status="archived" />
                      ) : (
                        <FormAksi
                          action={daftarKelasSendiri}
                          labelTombol="Daftar"
                          varianTombol="utama"
                        >
                          <input type="hidden" name="kelas_id" value={k.id} />
                          <label
                            htmlFor={`paket-${k.id}`}
                            className="mr-2 text-xs text-cloud-strong"
                          >
                            Paket
                          </label>
                          <select
                            id={`paket-${k.id}`}
                            name="paket_jam"
                            defaultValue="12"
                            className="mr-2 rounded border border-cloud px-2 py-1 text-sm focus:border-gold focus:outline-none"
                          >
                            {PAKET_JAM_PILIHAN.map((jam) => (
                              <option key={jam} value={jam}>
                                {jam} jam
                              </option>
                            ))}
                          </select>
                        </FormAksi>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Kartu>

        <Kartu judul="Akses cepat">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/siswa/tagihan"
              className="rounded border border-cloud px-3 py-1.5 text-sm text-navy hover:bg-cloud/30"
            >
              Lihat tagihan
            </Link>
            <Link
              href="/siswa/logbook"
              className="rounded border border-cloud px-3 py-1.5 text-sm text-navy hover:bg-cloud/30"
            >
              Lihat logbook
            </Link>
          </div>
        </Kartu>
      </div>
    </KerangkaHalaman>
  );
}
