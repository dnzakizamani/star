// Halaman pendapatan tutor.
//
// Angka di halaman ini berasal dari tabel earnings_ledger, yang hanya terisi
// saat admin menyetujui logbook. Jadi tutor melihat pendapatan yang benar-benar
// sudah disetujui, bukan perkiraan.

import { wajibPeran } from '@/lib/session';
import { buatClientServer } from '@/lib/supabase/server';
import { formatRupiah, formatTanggal, formatJamPelajaran, namaBulan } from '@/lib/format';
import { KerangkaHalaman } from '@/components/KerangkaHalaman';
import { Kartu } from '@/components/Kartu';
import type { PendapatanTutor } from '@/lib/types';

type BarisPendapatan = PendapatanTutor & {
  les: { class_id: string; starts_at: string } | null;
  logbook: { period_year: number; period_month: number; status: string } | null;
};

export default async function HalamanPendapatan() {
  const profil = await wajibPeran('tutor');
  const supabase = await buatClientServer();

  const { data: pendapatan } = await supabase
    .from('earnings_ledger')
    .select(
      '*, les:lessons(class_id, starts_at), logbook:logbooks(period_year, period_month, status)'
    )
    .eq('tutor_id', profil.id)
    .order('created_at', { ascending: false });

  const daftarPendapatan = (pendapatan ?? []) as unknown as BarisPendapatan[];

  const totalPendapatan = daftarPendapatan.reduce(
    (jumlah, baris) => jumlah + Number(baris.amount),
    0
  );
  const totalJam = daftarPendapatan.reduce(
    (jumlah, baris) => jumlah + Number(baris.hours),
    0
  );

  // Kelompokkan per bulan untuk ringkasan di atas tabel.
  const perBulan = new Map<string, { jam: number; nominal: number }>();

  for (const baris of daftarPendapatan) {
    if (!baris.logbook) continue;

    const kunci = `${baris.logbook.period_year}-${baris.logbook.period_month}`;
    const sekarang = perBulan.get(kunci) ?? { jam: 0, nominal: 0 };

    perBulan.set(kunci, {
      jam: sekarang.jam + Number(baris.hours),
      nominal: sekarang.nominal + Number(baris.amount),
    });
  }

  return (
    <KerangkaHalaman profil={profil}>
      <h1 className="mb-5 text-lg font-semibold text-ink">Pendapatan</h1>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-muted">Total pendapatan</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatRupiah(totalPendapatan)}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-muted">Total jam mengajar</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatJamPelajaran(totalJam)}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-surface px-5 py-4">
          <p className="text-xs uppercase tracking-wide text-muted">Les tercatat</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {daftarPendapatan.length}
          </p>
        </div>
      </div>

      <div className="grid gap-5">
        <Kartu judul="Ringkasan per bulan">
          {perBulan.size === 0 ? (
            <p className="text-sm text-muted">
              Belum ada pendapatan. Angka muncul setelah admin menyetujui logbook.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {Array.from(perBulan.entries()).map(([kunci, nilai]) => {
                const [tahun, bulan] = kunci.split('-').map(Number);

                return (
                  <li key={kunci} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm text-ink">
                        {namaBulan(bulan)} {tahun}
                      </p>
                      <p className="text-xs text-muted">
                        {formatJamPelajaran(nilai.jam)}
                      </p>
                    </div>
                    <p className="text-sm font-medium text-ink">
                      {formatRupiah(nilai.nominal)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Kartu>

        <Kartu judul="Rincian per les">
          {daftarPendapatan.length === 0 ? (
            <p className="text-sm text-muted">Belum ada data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-4 font-medium">Tanggal les</th>
                    <th className="pb-2 pr-4 font-medium">Durasi</th>
                    <th className="pb-2 pr-4 font-medium">Rate</th>
                    <th className="pb-2 pr-4 font-medium">Nominal</th>
                    <th className="pb-2 font-medium">Dicatat</th>
                  </tr>
                </thead>
                <tbody>
                  {daftarPendapatan.map((baris) => (
                    <tr key={baris.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 text-muted">
                        {baris.les ? formatTanggal(baris.les.starts_at) : '-'}
                      </td>
                      <td className="py-2 pr-4 text-muted">
                        {formatJamPelajaran(Number(baris.hours))}
                      </td>
                      <td className="py-2 pr-4 text-muted">
                        {formatRupiah(Number(baris.tutor_rate))}
                      </td>
                      <td className="py-2 pr-4 font-medium text-ink">
                        {formatRupiah(Number(baris.amount))}
                      </td>
                      <td className="py-2 text-xs text-muted">
                        {formatTanggal(baris.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Kartu>
      </div>
    </KerangkaHalaman>
  );
}
