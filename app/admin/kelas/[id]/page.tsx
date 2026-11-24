// Detail satu kelas: siswa terdaftar, jadwal les, keuangan, dan pengaturan.
//
// Empat kartu dalam satu halaman, bukan empat tab. Semua yang perlu diketahui
// admin tentang satu kelas ada di satu tempat dan bisa di-scroll.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatRupiah, formatTanggalJam, formatJamPelajaran, formatJam } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import { BadgeStatus } from '@/components/BadgeStatus';
import { FormAksi } from '@/components/FormAksi';
import { TombolLink } from '@/components/Tombol';
import { ubahRateKelas, arsipkanKelas, tambahSiswa, buatLes } from '../../aksi';
import type { Kelas, Pendaftaran, Invoice, Les, Profil } from '@/lib/types';

type BarisPendaftaran = Pendaftaran & {
  siswa: { full_name: string; email: string } | null;
  invoice: Invoice | Invoice[] | null;
};

export default async function DetailKelas({
  params,
}: {
  // Di Next 15, params adalah Promise dan harus di-await.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profil = await wajibPeran('admin');
  const supabase = await buatClientServer();

  // Data kelas. Kalau tidak ada, tampilkan 404 (bukan halaman kosong).
  const { data: kelas } = await supabase
    .from('v_classes_safe')
    .select('*')
    .eq('id', id)
    .single();

  if (!kelas) {
    notFound();
  }

  const dataKelas = kelas as Kelas;

  // Siswa terdaftar beserta invoice-nya.
  // Bentuk invoice bisa objek atau array tergantung relasi; dinormalkan di bawah.
  const { data: pendaftaran } = await supabase
    .from('enrollments')
    .select('*, siswa:profiles!enrollments_student_id_fkey(full_name, email), invoice:invoices(*)')
    .eq('class_id', id)
    .order('created_at');

  const daftarPendaftaran = (pendaftaran ?? []) as unknown as BarisPendaftaran[];

  // Saldo jam per siswa, dari view yang menghitung pemakaian.
  const { data: saldo } = await supabase
    .from('v_enrollment_balance')
    .select('*')
    .eq('class_id', id);

  const saldoPerPendaftaran = new Map(
    (saldo ?? []).map((s) => [s.enrollment_id, s])
  );

  // Jadwal les.
  const { data: les } = await supabase
    .from('lessons')
    .select('*')
    .eq('class_id', id)
    .order('starts_at', { ascending: false })
    .limit(20);

  const daftarLes = (les ?? []) as Les[];

  // Siswa yang belum terdaftar di kelas ini, untuk pilihan di form tambah siswa.
  const siswaSudahAda = daftarPendaftaran
    .filter((p) => p.status === 'active')
    .map((p) => p.student_id);

  const { data: semuaSiswa } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'student')
    .order('full_name');

  const siswaTersedia = ((semuaSiswa ?? []) as Profil[]).filter(
    (s) => !siswaSudahAda.includes(s.id)
  );

  const jumlahAktif = daftarPendaftaran.filter((p) => p.status === 'active').length;

  return (
    <KerangkaHalaman profil={profil}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/kelas" className="text-sm text-muted hover:text-ink">
            &larr; Kelas
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-lg font-semibold text-ink">{dataKelas.name}</h1>
            <BadgeStatus status={dataKelas.status} />
          </div>
        </div>
        <TombolLink href={`/admin/kelas/${id}/logbook`} varian="sekunder">
          Lihat logbook
        </TombolLink>
      </div>

      <div className="grid gap-5">
        <Kartu
          judul="Siswa"
          keterangan={`${jumlahAktif} dari ${dataKelas.capacity} kursi terisi`}
        >
          {daftarPendaftaran.length === 0 ? (
            <p className="text-sm text-muted">Belum ada siswa terdaftar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4 font-medium">Nama</th>
                    <th className="pb-2 pr-4 font-medium">Paket</th>
                    <th className="pb-2 pr-4 font-medium">Sisa jam</th>
                    <th className="pb-2 pr-4 font-medium">Invoice</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {daftarPendaftaran.map((p) => {
                    // Relasi satu-ke-satu kadang dikembalikan sebagai array.
                    const invoice = Array.isArray(p.invoice) ? p.invoice[0] : p.invoice;
                    const saldoSiswa = saldoPerPendaftaran.get(p.id);

                    return (
                      <tr key={p.id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-4">
                          <div className="font-medium text-ink">
                            {p.siswa?.full_name ?? '-'}
                          </div>
                          <div className="text-xs text-muted">{p.siswa?.email}</div>
                        </td>
                        <td className="py-2 pr-4 text-muted">
                          {formatJamPelajaran(p.package_hours)}
                        </td>
                        <td className="py-2 pr-4 text-muted">
                          {saldoSiswa
                            ? formatJamPelajaran(saldoSiswa.hours_remaining)
                            : '-'}
                        </td>
                        <td className="py-2 pr-4">
                          <div className="text-muted">{invoice?.invoice_number ?? '-'}</div>
                          <div className="text-xs">
                            {invoice ? (
                              <BadgeStatus status={invoice.status} />
                            ) : (
                              '-'
                            )}
                          </div>
                        </td>
                        <td className="py-2">
                          <BadgeStatus status={p.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {jumlahAktif < dataKelas.capacity && siswaTersedia.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-sm font-medium text-ink">Tambah siswa</p>
              <FormAksi action={tambahSiswa} labelTombol="Daftarkan siswa">
                <input type="hidden" name="kelas_id" value={id} />

                <div>
                  <label htmlFor="student_id" className="mb-1 block text-sm font-medium text-ink">
                    Siswa
                  </label>
                  <select
                    id="student_id"
                    name="student_id"
                    required
                    className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  >
                    <option value="">Pilih siswa</option>
                    {siswaTersedia.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="paket_jam" className="mb-1 block text-sm font-medium text-ink">
                    Paket jam
                  </label>
                  <input
                    id="paket_jam"
                    name="paket_jam"
                    type="number"
                    step="0.5"
                    defaultValue="12"
                    required
                    className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </div>
              </FormAksi>
            </div>
          )}

          {jumlahAktif >= dataKelas.capacity && (
            <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Kelas penuh. Naikkan kapasitas dulu kalau ingin menambah siswa.
            </p>
          )}
        </Kartu>

        <Kartu judul="Jadwal les" keterangan="20 les terakhir">
          {daftarLes.length === 0 ? (
            <p className="text-sm text-muted">Belum ada jadwal.</p>
          ) : (
            <ul className="divide-y divide-line">
              {daftarLes.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <div className="text-sm text-ink">{formatTanggalJam(l.starts_at)}</div>
                    <div className="text-xs text-muted">
                      {formatJam(l.starts_at)} - {formatJam(l.ends_at)}
                    </div>
                  </div>
                  <BadgeStatus status={l.status} />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-sm font-medium text-ink">Jadwalkan les</p>
            <FormAksi action={buatLes} labelTombol="Simpan jadwal">
              <input type="hidden" name="kelas_id" value={id} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="mulai" className="mb-1 block text-sm font-medium text-ink">
                    Mulai
                  </label>
                  <input
                    id="mulai"
                    name="mulai"
                    type="datetime-local"
                    required
                    className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="selesai" className="mb-1 block text-sm font-medium text-ink">
                    Selesai
                  </label>
                  <input
                    id="selesai"
                    name="selesai"
                    type="datetime-local"
                    required
                    className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            </FormAksi>
          </div>
        </Kartu>

        <Kartu judul="Pengaturan">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium text-ink">Rate per jam</p>
              <p className="mb-3 text-xs text-muted">
                Rate siswa saat ini {formatRupiah(dataKelas.student_rate)}. Perubahan
                hanya berlaku untuk pendaftaran baru; invoice lama tidak berubah.
              </p>
              <FormAksi action={ubahRateKelas} labelTombol="Simpan rate">
                <input type="hidden" name="kelas_id" value={id} />
                <div>
                  <label htmlFor="rate_siswa" className="mb-1 block text-sm font-medium text-ink">
                    Rate siswa
                  </label>
                  <input
                    id="rate_siswa"
                    name="rate_siswa"
                    type="number"
                    defaultValue={dataKelas.student_rate ?? ''}
                    required
                    className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="rate_tutor" className="mb-1 block text-sm font-medium text-ink">
                    Rate tutor
                  </label>
                  <input
                    id="rate_tutor"
                    name="rate_tutor"
                    type="number"
                    defaultValue={dataKelas.tutor_rate ?? ''}
                    required
                    className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  />
                </div>
              </FormAksi>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-ink">Status kelas</p>
              <p className="mb-3 text-xs text-muted">
                Kelas yang diarsipkan tidak menerima siswa baru, tapi data lama tetap
                tersimpan.
              </p>
              <FormAksi
                action={arsipkanKelas}
                labelTombol={dataKelas.status === 'active' ? 'Arsipkan kelas' : 'Aktifkan kelas'}
                varianTombol={dataKelas.status === 'active' ? 'bahaya' : 'sekunder'}
              >
                <input type="hidden" name="kelas_id" value={id} />
                <input
                  type="hidden"
                  name="status"
                  value={dataKelas.status === 'active' ? 'archived' : 'active'}
                />
              </FormAksi>
            </div>
          </div>
        </Kartu>
      </div>
    </KerangkaHalaman>
  );
}
